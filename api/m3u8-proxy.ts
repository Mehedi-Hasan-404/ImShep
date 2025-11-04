// api/m3u8-proxy.ts
export const config = {
  runtime: 'edge',
};

// Simple encryption/decryption functions
const SECRET_KEY = process.env.PROXY_SECRET_KEY || 'your-secret-key-change-this-in-production';

function encryptUrl(url: string): string {
  // Base64 encode with a simple XOR cipher
  const key = SECRET_KEY;
  let encrypted = '';
  for (let i = 0; i < url.length; i++) {
    encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decryptUrl(encrypted: string): string {
  try {
    // Restore base64 padding and characters
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
  const encryptedUrl = searchParams.get('token');

  if (!encryptedUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing "token" parameter' }),
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
    // Decrypt the URL
    const streamUrl = decryptUrl(encryptedUrl);

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
          const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${basePath}${line}`;
        }
        
        // Encrypt the URL and return proxied path
        const encryptedToken = encryptUrl(absoluteUrl);
        return `/api/m3u8-proxy?token=${encryptedToken}`;
      }

      // Rewrite encryption key URLs
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
          const proxiedKeyUrl = `/api/m3u8-proxy?token=${encryptedToken}`;
          return line.replace(uriMatch[1], proxiedKeyUrl);
        }
      }

      return line;
    });

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
        details: e.message
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
