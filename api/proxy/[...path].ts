// api/proxy/[...path].ts - SIMPLE SECURE PROXY
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

// In-memory cache for URL mappings (encrypt actual URLs)
// In production, use Redis or similar
const urlMappings = new Map<string, string>();

/**
 * Simple encryption for URLs using XOR cipher
 */
function encryptUrl(url: string): string {
  const key = API_KEY.substring(0, 32);
  const encoder = new TextEncoder();
  const urlBytes = encoder.encode(url);
  const keyBytes = encoder.encode(key);
  
  const encrypted = new Uint8Array(urlBytes.length);
  for (let i = 0; i < urlBytes.length; i++) {
    encrypted[i] = urlBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return Buffer.from(encrypted).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decrypt URL
 */
function decryptUrl(encrypted: string): string {
  const key = API_KEY.substring(0, 32);
  const base64 = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(base64, 'base64');
  
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    decrypted[i] = decoded[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Generate clean path from URL
 */
function generatePath(url: string): string {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  
  // Use last few segments to create a "clean" looking path
  const cleanPath = pathParts.slice(-3).join('/');
  return cleanPath || 'stream.m3u8';
}

/**
 * Store URL mapping and return clean path
 */
function createProxyPath(originalUrl: string): string {
  const encrypted = encryptUrl(originalUrl);
  const cleanPath = generatePath(originalUrl);
  
  // Store both mappings
  urlMappings.set(encrypted, originalUrl);
  urlMappings.set(cleanPath, encrypted);
  
  return cleanPath;
}

/**
 * Retrieve original URL from path
 */
function resolveUrl(path: string): string | null {
  // Try direct lookup first
  const encrypted = urlMappings.get(path);
  if (encrypted && urlMappings.has(encrypted)) {
    return urlMappings.get(encrypted) || null;
  }
  
  // Try decryption
  try {
    return decryptUrl(path);
  } catch {
    return null;
  }
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Range',
    // SECURITY: Prevent URL leakage
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export default async function handler(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // Extract path (everything after /api/proxy/)
  const pathMatch = url.pathname.match(/\/api\/proxy\/(.+)/);
  if (!pathMatch) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  const path = decodeURIComponent(pathMatch[1]);
  console.log('🔍 Proxy request for path:', path);

  // Resolve original URL
  const targetUrl = resolveUrl(path);
  
  if (!targetUrl) {
    console.error('❌ Could not resolve URL for path:', path);
    return new Response(JSON.stringify({ error: 'Stream not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  console.log(`✅ Resolved to: ${targetUrl.substring(0, 50)}...`);

  try {
    // Extract referer if present
    const targetUrlObj = new URL(targetUrl);
    const refererParam = targetUrlObj.searchParams.get('__referer');
    
    // Build fetch headers
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    
    if (refererParam) {
      fetchHeaders['Referer'] = decodeURIComponent(refererParam);
      fetchHeaders['Origin'] = new URL(refererParam).origin;
      targetUrlObj.searchParams.delete('__referer');
    } else {
      fetchHeaders['Referer'] = new URL(targetUrl).origin;
    }
    
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }
    
    const cleanTargetUrl = refererParam ? targetUrlObj.toString() : targetUrl;
    console.log(`📡 Fetching: ${cleanTargetUrl.substring(0, 100)}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cleanTargetUrl, {
      headers: fetchHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`❌ Upstream error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Upstream error: ${response.status}` }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          },
        }
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle M3U8 playlists - rewrite URLs
    if (contentType.includes('mpegurl') || contentType.includes('m3u') || targetUrl.includes('.m3u8')) {
      console.log(`📺 Processing M3U8 playlist`);
      
      const text = await response.text();
      const baseUrl = new URL(cleanTargetUrl);
      
      const lines = text.split('\n');
      const rewrittenLines: string[] = [];
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          rewrittenLines.push(line);
          continue;
        }
        
        let absoluteUrl: string;
        if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
          absoluteUrl = trimmedLine;
        } else if (trimmedLine.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${trimmedLine}`;
        } else {
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${trimmedLine}`;
        }
        
        if (refererParam) {
          absoluteUrl += (absoluteUrl.includes('?') ? '&' : '?') + `__referer=${encodeURIComponent(refererParam)}`;
        }
        
        // Create new proxy path
        const proxyPath = createProxyPath(absoluteUrl);
        const proxiedUrl = `${url.origin}/api/proxy/${encodeURIComponent(proxyPath)}`;
        rewrittenLines.push(proxiedUrl);
      }

      console.log(`✅ M3U8 processed: ${rewrittenLines.length} lines`);

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=10, s-maxage=10',
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through other content
    console.log(`📦 Passing through: ${contentType}`);
    
    const headers = new Headers(getCorsHeaders(origin));
    if (contentType) headers.set('Content-Type', contentType);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    const contentRange = response.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);
    
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    
    headers.set('Cache-Control', 'public, max-age=3600, immutable');

    return new Response(response.body, {
      status: response.status,
      headers,
    });

  } catch (error: any) {
    console.error('❌ Proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Proxy failed' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        }
      }
    );
  }
}

// Export helper function for creating proxy URLs (for use in other API routes)
export { createProxyPath, encryptUrl };
