// api/m3u8-proxy.ts
export const config = {
  runtime: 'edge',
};

// Get allowed origins from environment
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

export default async function handler(request: Request) {
  const origin = request.headers.get('origin') || '';
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('url');

  if (!streamUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing "url" query parameter' }),
      { 
        status: 400, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }

  try {
    // Fetch the original M3U8 file
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(streamUrl).origin,
        'Accept': '*/*',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${streamUrl}: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch stream: ${response.status} ${response.statusText}` 
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    
    // If it's not a playlist, just proxy the content directly (segments, keys, etc.)
    if (!contentType.includes('mpegurl') && !contentType.includes('m3u')) {
      const headers = new Headers({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'public, max-age=3600',
      });

      // Copy relevant headers from the original response
      const contentLength = response.headers.get('content-length');
      if (contentLength) headers.set('Content-Length', contentLength);
      
      const contentRange = response.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      
      if (contentType) headers.set('Content-Type', contentType);

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    // It's a playlist - rewrite URLs
    const m3u8Content = await response.text();
    const baseUrl = new URL(streamUrl);

    // Rewrite all internal URLs in the M3U8
    const rewrittenLines = m3u8Content.split('\n').map(line => {
      line = line.trim();

      // Rewrite segment/playlist URLs (lines that don't start with #)
      if (line.length > 0 && !line.startsWith('#')) {
        let absoluteUrl: string;
        
        // Handle relative URLs
        if (line.startsWith('http://') || line.startsWith('https://')) {
          absoluteUrl = line;
        } else if (line.startsWith('/')) {
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${line}`;
        } else {
          // Relative to current path
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${line}`;
        }
        
        // Point it back to our own proxy
        return `/api/m3u8-proxy?url=${encodeURIComponent(absoluteUrl)}`;
      }

      // Rewrite encryption key URLs
      if (line.startsWith('#EXT-X-KEY')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
          let absoluteKeyUrl: string;
          const keyUrl = uriMatch[1];
          
          // Handle relative URLs
          if (keyUrl.startsWith('http://') || keyUrl.startsWith('https://')) {
            absoluteKeyUrl = keyUrl;
          } else if (keyUrl.startsWith('/')) {
            absoluteKeyUrl = `${baseUrl.protocol}//${baseUrl.host}${keyUrl}`;
          } else {
            const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
            absoluteKeyUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${keyUrl}`;
          }
          
          const proxiedKeyUrl = `/api/m3u8-proxy?url=${encodeURIComponent(absoluteKeyUrl)}`;
          return line.replace(uriMatch[1], proxiedKeyUrl);
        }
      }

      // Return all other lines (comments, etc.) unchanged
      return line;
    });

    // Return the modified M3U8 file with proper headers
    const headers = new Headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    });

    return new Response(rewrittenLines.join('\n'), { headers });

  } catch (e: any) {
    console.error('Proxy error:', e);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to proxy stream', 
        details: e.message,
        url: streamUrl 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
}
