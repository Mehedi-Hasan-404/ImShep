// api/m3u8-proxy.ts - FIXED VERSION WITH QUERY PARAM API KEY
export const config = {
  runtime: 'edge',
};

const SECRET_KEY = process.env.PROXY_SECRET_KEY || 'your-secret-key-change-this-in-production';
const API_KEY = process.env.API_KEY || 'your-api-key-change-this-in-production';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

function encryptUrl(url: string): string {
  const key = SECRET_KEY;
  let encrypted = '';
  for (let i = 0; i < url.length; i++) {
    encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decryptUrl(encrypted: string): string {
  try {
    const restored = encrypted.replace(/-/g, '+').replace(/_/g, '/');
    const padded = restored + '=='.substring(0, (4 - restored.length % 4) % 4);
    const decoded = atob(padded);
    
    const key = SECRET_KEY;
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
  } catch (e) {
    throw new Error('Invalid encrypted URL');
  }
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin : 'null';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin!,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(request: Request) {
  const origin = request.headers.get('origin');
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  const { searchParams } = new URL(request.url);
  const encryptedUrl = searchParams.get('token');
  
  // ✅ FIX: Accept API key from both header AND query parameter
  const apiKeyFromHeader = request.headers.get('x-api-key');
  const apiKeyFromQuery = searchParams.get('apiKey');
  const providedApiKey = apiKeyFromHeader || apiKeyFromQuery;

  // ✅ SECURITY CHECK 1: Validate API Key
  if (!providedApiKey || providedApiKey !== API_KEY) {
    console.warn(`🚫 BLOCKED - Invalid API Key from origin: ${origin}`);
    return new Response(
      JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Invalid or missing API key'
      }),
      { 
        status: 401,
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        }
      }
    );
  }

  // ✅ SECURITY CHECK 2: Validate Origin (relaxed for proxied requests)
  // Allow same-origin or whitelisted origins
  if (origin && !isOriginAllowed(origin)) {
    console.warn(`⚠️ WARNING - Request from non-whitelisted origin: ${origin} (but has valid API key)`);
    // Don't block - API key is sufficient
  }

  if (!encryptedUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing "token" parameter' }),
      { 
        status: 400, 
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        } 
      }
    );
  }

  try {
    const streamUrl = decryptUrl(encryptedUrl);

    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
        'Referer': new URL(streamUrl).origin,
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${streamUrl}: ${response.status}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch stream: ${response.status}` 
        }),
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
    
    // Handle non-playlist content (segments, keys)
    if (!contentType.includes('mpegurl') && !contentType.includes('m3u')) {
      const headers = new Headers(getCorsHeaders(origin));
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      headers.set('Cache-Control', 'public, max-age=3600');

      const contentLength = response.headers.get('content-length');
      if (contentLength) headers.set('Content-Length', contentLength);
      
      if (contentType) headers.set('Content-Type', contentType);

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    // Handle M3U8 playlist content
    const m3u8Content = await response.text();
    const baseUrl = new URL(streamUrl);

    const rewrittenLines = m3u8Content.split('\n').map(line => {
      line = line.trim();

      if (line.length > 0 && !line.startsWith('#')) {
        let absoluteUrl: string;
        
        if (line.startsWith('http://') || line.startsWith('https://')) {
          absoluteUrl = line;
        } else if (line.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${line}`;
        } else {
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${line}`;
        }
        
        const encryptedToken = encryptUrl(absoluteUrl);
        // ✅ FIX: Include API key in proxied URLs
        return `/api/m3u8-proxy?token=${encryptedToken}&apiKey=${providedApiKey}`;
      }

      if (line.startsWith('#EXT-X-KEY')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
          let absoluteKeyUrl: string;
          const keyUrl = uriMatch[1];
          
          if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
            absoluteKeyUrl = keyUrl;
          } else if (keyUrl.startsWith('/')) {
            absoluteKeyUrl = `${baseUrl.protocol}//${baseUrl.host}${keyUrl}`;
          } else {
            const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
            absoluteKeyUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${keyUrl}`;
          }
          
          const encryptedToken = encryptUrl(absoluteKeyUrl);
          const proxiedKeyUrl = `/api/m3u8-proxy?token=${encryptedToken}&apiKey=${providedApiKey}`;
          return line.replace(uriMatch[1], proxiedKeyUrl);
        }
      }

      return line;
    });

    const headers = new Headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'public, max-age=60',
      ...getCorsHeaders(origin),
    });

    return new Response(rewrittenLines.join('\n'), { headers });

  } catch (e: any) {
    console.error('Proxy error:', e);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to proxy stream', 
        details: e.message
      }),
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
