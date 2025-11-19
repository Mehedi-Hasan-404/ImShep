// api/m3u8-proxy.ts - SIMPLIFIED & FIXED VERSION
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGIN = 'https://imshep.vercel.app';

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  
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

  // SECURITY: Only allow imshep.vercel.app (no localhost in production)
  if (origin !== ALLOWED_ORIGIN) {
    return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
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
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  try {
    // Prepare headers for fetching the stream
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
    };

    // Forward Range header for video segments
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    // Add Referer from target URL's origin
    try {
      const targetUrlObj = new URL(targetUrl);
      headers['Referer'] = targetUrlObj.origin + '/';
      headers['Origin'] = targetUrlObj.origin;
    } catch (e) {
      // Invalid URL, skip referer
    }

    // Fetch the stream (NO TIMEOUT for streams)
    const response = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Stream fetch failed: ${response.status}`,
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

    // Handle M3U8 playlists - rewrite URLs to proxy them
    if (contentType.includes('mpegurl') || 
        contentType.includes('m3u') || 
        contentType.includes('vnd.apple.mpegurl') ||
        targetUrl.includes('.m3u8')) {
      
      const text = await response.text();
      
      // Use the FINAL URL after redirects as base
      const baseUrl = new URL(response.url);
      const baseOrigin = baseUrl.origin;
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
      
      // Simple URL rewriting
      const rewrittenPlaylist = text.split('\n').map(line => {
        line = line.trim();
        
        // Skip comments except those with URIs
        if (line.startsWith('#')) {
          // Handle URI in tags (e.g., #EXT-X-KEY:URI="...")
          if (line.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              const absoluteUri = makeAbsoluteUrl(uri, baseOrigin, basePath);
              const proxiedUri = `${url.origin}/api/m3u8-proxy?url=${encodeURIComponent(absoluteUri)}`;
              return `URI="${proxiedUri}"`;
            });
          }
          return line;
        }
        
        // Skip empty lines
        if (!line) return line;
        
        // Rewrite segment/playlist URLs
        const absoluteUrl = makeAbsoluteUrl(line, baseOrigin, basePath);
        return `${url.origin}/api/m3u8-proxy?url=${encodeURIComponent(absoluteUrl)}`;
      }).join('\n');

      return new Response(rewrittenPlaylist, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache',
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through video segments and other content
    const responseHeaders = new Headers(getCorsHeaders(origin));
    
    // Copy important headers
    if (contentType) {
      responseHeaders.set('Content-Type', contentType);
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const contentRange = response.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) {
      responseHeaders.set('Accept-Ranges', acceptRanges);
    }
    
    // Cache video segments aggressively
    if (contentType.includes('video') || contentType.includes('octet-stream')) {
      responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      responseHeaders.set('Cache-Control', 'public, max-age=60');
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Proxy request failed',
        details: error.message 
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

// Helper function to make URLs absolute
function makeAbsoluteUrl(url: string, baseOrigin: string, basePath: string): string {
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Protocol-relative
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  
  // Absolute path
  if (url.startsWith('/')) {
    return `${baseOrigin}${url}`;
  }
  
  // Relative path
  return `${baseOrigin}${basePath}${url}`;
}
