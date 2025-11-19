// api/m3u8-proxy.ts - FIXED VERSION
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Range, Accept-Ranges',
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

  // SECURITY: Origin validation - STRICTLY enforce ALLOWED_ORIGINS
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
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
    // CRITICAL FIX: Add proper User-Agent and headers for HLS streaming
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // Don't request compression for streams
    };

    // Forward Range header for video segments
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Add referer if target URL has one
    try {
      const targetUrlObj = new URL(targetUrl);
      headers['Referer'] = targetUrlObj.origin;
      headers['Origin'] = targetUrlObj.origin;
    } catch (e) {
      // Ignore invalid URLs
    }

    // Fetch the stream with proper headers
    const response = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      // Add signal for timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      console.error(`Stream fetch failed: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch stream: ${response.status}`,
          details: response.statusText 
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
        contentType.includes('m3u') || 
        contentType.includes('vnd.apple.mpegurl') ||
        targetUrl.includes('.m3u8')) {
      
      const text = await response.text();
      
      // CRITICAL FIX: Use response.url (final URL after redirects) for base URL
      const baseUrl = new URL(response.url);
      
      const createProxiedUrl = (target: string) => {
        let absoluteUrl: string;
        
        // Handle absolute URLs
        if (target.startsWith('http://') || target.startsWith('https://')) {
          absoluteUrl = target;
        } 
        // Handle protocol-relative URLs
        else if (target.startsWith('//')) {
          absoluteUrl = `${baseUrl.protocol}${target}`;
        }
        // Handle absolute paths
        else if (target.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${target}`;
        } 
        // Handle relative paths
        else {
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${target}`;
        }
        
        return `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}`;
      };

      // Rewrite playlist
      const rewrittenPlaylist = text.split('\n').map(line => {
        line = line.trim();
        
        if (!line || line.startsWith('#EXT')) {
          // Handle URIs in tags (encryption keys, maps, etc.)
          if (line.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              return `URI="${createProxiedUrl(uri)}"`;
            });
          }
          return line;
        }
        
        // Rewrite segment/playlist URLs
        if (!line.startsWith('#')) {
          return createProxiedUrl(line);
        }
        
        return line;
      }).join('\n');

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

    // Pass through other content (video segments, encryption keys, etc.)
    const headers_out = new Headers(getCorsHeaders(origin));
    
    if (contentType) {
      headers_out.set('Content-Type', contentType);
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers_out.set('Content-Length', contentLength);
    }

    // Forward Range-related headers for video segments
    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      headers_out.set('Content-Range', contentRange);
    }

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      headers_out.set('Accept-Ranges', acceptRanges);
    }
    
    // Cache video segments aggressively, but not playlists
    if (contentType.includes('video') || contentType.includes('application/octet-stream')) {
      headers_out.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers_out.set('Cache-Control', 'public, max-age=60');
    }

    return new Response(response.body, {
      status: response.status,
      headers: headers_out,
    });

  } catch (error: any) {
    console.error('Proxy error:', error.message);
    
    // Provide helpful error messages
    let errorMessage = 'Proxy failed';
    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout - stream took too long to respond';
    } else if (error.message.includes('fetch')) {
      errorMessage = 'Failed to connect to stream server';
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        // Only include details in development
        ...(process.env.NODE_ENV === 'development' ? { details: error.message } : {})
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
