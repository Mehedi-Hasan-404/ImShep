// api/m3u8-proxy.ts - UPDATED WITH REFERER SUPPORT
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
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

  // Verify API key
  const apiKey = request.headers.get('x-api-key') || url.searchParams.get('apiKey');
  if (!apiKey || apiKey !== API_KEY) {
    console.warn(`🚫 Unauthorized request from ${origin}`);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  // Get target URL from query parameter
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

  try {
    // CRITICAL FIX: Extract referer from URL if present
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
      console.log(`🔗 Using Referer: ${refererParam}`);
      
      // Remove the __referer param from the actual request URL
      targetUrlObj.searchParams.delete('__referer');
    } else {
      fetchHeaders['Referer'] = new URL(targetUrl).origin;
    }
    
    const cleanTargetUrl = refererParam ? targetUrlObj.toString() : targetUrl;
    console.log(`🔄 Proxying: ${cleanTargetUrl.substring(0, 50)}...`);

    // Fetch the stream
    const response = await fetch(cleanTargetUrl, {
      headers: fetchHeaders,
    });

    if (!response.ok) {
      console.error(`❌ Fetch failed: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch: ${response.status}` }),
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
      const text = await response.text();
      const baseUrl = new URL(cleanTargetUrl);
      
      const rewrittenPlaylist = text.split('\n').map(line => {
        line = line.trim();
        
        // Skip comments and empty lines
        if (line.startsWith('#') || !line) {
          return line;
        }
        
        // Rewrite segment URLs
        let absoluteUrl: string;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          absoluteUrl = line;
        } else if (line.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${line}`;
        } else {
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${line}`;
        }
        
        // CRITICAL: Preserve referer in proxied URLs
        if (refererParam) {
          absoluteUrl += (absoluteUrl.includes('?') ? '&' : '?') + `__referer=${encodeURIComponent(refererParam)}`;
        }
        
        // Return proxied URL
        const proxiedUrl = `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}&apiKey=${apiKey}`;
        return proxiedUrl;
      }).join('\n');

      return new Response(rewrittenPlaylist, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=60',
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through other content (segments, etc.)
    const headers = new Headers(getCorsHeaders(origin));
    if (contentType) headers.set('Content-Type', contentType);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);
    
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(response.body, {
      status: response.status,
      headers,
    });

  } catch (error: any) {
    console.error('❌ Proxy error:', error);
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
