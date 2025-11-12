// api/m3u8-proxy.ts - OPTIMIZED VERSION WITH TOKEN AUTH
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

// Simple XOR cipher for token generation
function generateToken(url: string): string {
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  let encoded = '';
  for (let i = 0; i < data.length; i++) {
    encoded += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  
  return Buffer.from(encoded).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function verifyToken(token: string, url: string): boolean {
  try {
    const key = API_KEY.substring(0, 16);
    const decoded = Buffer.from(
      token.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString();
    
    let original = '';
    for (let i = 0; i < decoded.length; i++) {
      original += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    
    const [tokenUrl, tokenTime] = original.split(':');
    const currentTime = Math.floor(Date.now() / 60000);
    
    // Token valid for 5 minutes
    return tokenUrl === url && Math.abs(currentTime - parseInt(tokenTime)) <= 5;
  } catch {
    return false;
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

  // Get token and target URL
  const token = url.searchParams.get('token');
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  // Verify token
  if (!token || !verifyToken(token, targetUrl)) {
    console.warn(`🚫 Invalid token for ${targetUrl.substring(0, 50)}...`);
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  try {
    // Extract referer if present
    const targetUrlObj = new URL(targetUrl);
    const refererParam = targetUrlObj.searchParams.get('__referer');
    
    // Build fetch headers
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    
    // Add referer if specified
    if (refererParam) {
      fetchHeaders['Referer'] = decodeURIComponent(refererParam);
      fetchHeaders['Origin'] = new URL(refererParam).origin;
      targetUrlObj.searchParams.delete('__referer');
    } else {
      fetchHeaders['Referer'] = new URL(targetUrl).origin;
    }
    
    // Support range requests for video segments
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }
    
    const cleanTargetUrl = refererParam ? targetUrlObj.toString() : targetUrl;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cleanTargetUrl, {
      headers: fetchHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`❌ Fetch failed: ${response.status} for ${cleanTargetUrl.substring(0, 50)}...`);
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

    // Handle M3U8 playlists - OPTIMIZED
    if (contentType.includes('mpegurl') || contentType.includes('m3u') || targetUrl.includes('.m3u8')) {
      const text = await response.text();
      const baseUrl = new URL(cleanTargetUrl);
      
      // Process playlist line by line (faster than split/map/join)
      const lines = text.split('\n');
      const rewrittenLines: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip comments and empty lines
        if (!line || line.startsWith('#')) {
          rewrittenLines.push(line);
          continue;
        }
        
        // Rewrite segment/playlist URLs
        let absoluteUrl: string;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          absoluteUrl = line;
        } else if (line.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${line}`;
        } else {
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${line}`;
        }
        
        // Preserve referer in proxied URLs
        if (refererParam) {
          absoluteUrl += (absoluteUrl.includes('?') ? '&' : '?') + `__referer=${encodeURIComponent(refererParam)}`;
        }
        
        // Generate token for this URL
        const segmentToken = generateToken(absoluteUrl);
        
        // Return proxied URL with token
        const proxiedUrl = `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}&token=${segmentToken}`;
        rewrittenLines.push(proxiedUrl);
      }

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=10, s-maxage=10', // Reduced cache time
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through other content (video segments, etc.)
    const headers = new Headers(getCorsHeaders(origin));
    if (contentType) headers.set('Content-Type', contentType);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    const contentRange = response.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);
    
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
    
    // Cache video segments longer
    headers.set('Cache-Control', 'public, max-age=3600, immutable');

    return new Response(response.body, {
      status: response.status,
      headers,
    });

  } catch (error: any) {
    console.error('❌ Proxy error:', error.message);
    return new Response(
      JSON.stringify({ error: 'Proxy failed', details: error.message }),
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
