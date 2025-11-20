// api/m3u8-proxy.ts - FIXED WORKING VERSION
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'https://imshep.vercel.app',
      'https://livetvpro.vercel.app',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:3000'
    ];

// Log configuration on startup (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('M3U8 Proxy Config:', { allowedOrigins: ALLOWED_ORIGINS });
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  // Allow all origins in allowed list, fallback to first if no match
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Range, Accept-Ranges',
    'Access-Control-Allow-Credentials': 'true',
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

  // Origin validation - Allow if origin is in allowed list OR if no origin (direct access)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.error('Unauthorized origin:', origin);
    return new Response(JSON.stringify({ 
      error: 'Unauthorized origin',
      allowedOrigins: ALLOWED_ORIGINS 
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  // Get target URL
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    console.error('Missing url parameter');
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  // Log request (only in development)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Proxying request:', {
      origin,
      targetUrl: targetUrl.substring(0, 100) + '...',
      method: request.method,
    });
  }

  try {
    // Fetch the stream
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    };

    // Forward Range header for video segments
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Add referer from target URL origin
    try {
      const targetUrlObj = new URL(targetUrl);
      headers['Referer'] = targetUrlObj.origin + '/';
      headers['Origin'] = targetUrlObj.origin;
    } catch (e) {
      console.warn('Could not set referer/origin headers');
    }

    const response = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      console.error('Stream fetch failed:', {
        status: response.status,
        statusText: response.statusText,
      });
      
      return new Response(
        JSON.stringify({ 
          error: `Stream unavailable: ${response.status}`,
          details: response.statusText,
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

    // Handle M3U8 playlists - rewrite URLs
    if (contentType.includes('mpegurl') || 
        contentType.includes('m3u8') || 
        contentType.includes('m3u') || 
        contentType.includes('vnd.apple.mpegurl') ||
        targetUrl.toLowerCase().includes('.m3u8') ||
        targetUrl.toLowerCase().includes('.m3u')) {
      
      const text = await response.text();
      
      // Get base URL from response (handles redirects)
      const baseUrl = new URL(response.url);
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // Rewrite playlist URLs
      const rewrittenPlaylist = text.split('\n').map(line => {
        const trimmedLine = line.trim();
        
        // Skip comments and empty lines
        if (!trimmedLine || trimmedLine.startsWith('#EXT')) {
          // Handle URIs in tags (like encryption keys)
          if (trimmedLine.includes('URI="')) {
            return trimmedLine.replace(/URI="([^"]+)"/g, (match, uri) => {
              const absoluteUrl = resolveUrl(uri, baseUrl, basePath);
              const proxiedUrl = `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}`;
              return `URI="${proxiedUrl}"`;
            });
          }
          return trimmedLine;
        }
        
        // Rewrite segment/playlist URLs
        if (!trimmedLine.startsWith('#')) {
          const absoluteUrl = resolveUrl(trimmedLine, baseUrl, basePath);
          return `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}`;
        }
        
        return trimmedLine;
      }).join('\n');

      console.log('Successfully proxied M3U8 playlist');

      return new Response(rewrittenPlaylist, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through video segments and other content
    const responseHeaders = new Headers(getCorsHeaders(origin));
    
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    // Forward Range-related headers
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      responseHeaders.set('Accept-Ranges', acceptRanges);
    }
    
    // Cache control
    if (contentType.includes('video') || contentType.includes('octet-stream')) {
      responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      responseHeaders.set('Cache-Control', 'public, max-age=60');
    }

    console.log('Successfully proxied stream segment');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('Proxy error:', {
      message: error.message,
      name: error.name,
    });

    return new Response(
      JSON.stringify({ 
        error: 'Proxy failed to fetch stream',
        details: error.message,
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

// Helper function to resolve relative URLs
function resolveUrl(target: string, baseUrl: URL, basePath: string): string {
  // Absolute URL
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }
  
  // Protocol-relative URL
  if (target.startsWith('//')) {
    return `${baseUrl.protocol}${target}`;
  }
  
  // Absolute path
  if (target.startsWith('/')) {
    return `${baseUrl.protocol}//${baseUrl.host}${target}`;
  }
  
  // Relative path
  return `${baseUrl.protocol}//${baseUrl.host}${basePath}${target}`;
}
