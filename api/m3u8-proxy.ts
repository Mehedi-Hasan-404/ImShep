// api/m3u8-proxy.ts - VERIFIED TOKEN VERIFICATION
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

/**
 * Generate token (for verification purposes)
 */
function generateToken(url: string): string {
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000);
  const data = `${url}:${timestamp}`;
  
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  const binaryString = String.fromCharCode(...encoded);
  const token = Buffer.from(binaryString, 'binary').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return token;
}

/**
 * Verify token with extended time window
 */
function verifyToken(token: string, url: string): boolean {
  try {
    const key = API_KEY.substring(0, 16);
    
    // Decode base64 token
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64');
    
    // XOR decrypt
    const keyBytes = new TextEncoder().encode(key);
    const original = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      original[i] = decoded[i] ^ keyBytes[i % keyBytes.length];
    }
    
    // Convert back to string
    const originalString = new TextDecoder().decode(original);
    const [tokenUrl, tokenTimeStr] = originalString.split(':');
    
    if (!tokenTimeStr) {
      console.log('❌ Invalid token format (no timestamp)');
      return false;
    }
    
    const tokenTime = parseInt(tokenTimeStr);
    const currentTime = Math.floor(Date.now() / 60000);
    
    // CRITICAL: Allow 5-minute window for token validity
    const timeDiff = Math.abs(currentTime - tokenTime);
    const isValid = tokenUrl === url && timeDiff <= 5;
    
    if (!isValid) {
      console.log('❌ Token validation failed:', {
        tokenUrl: tokenUrl?.substring(0, 50) + '...',
        expectedUrl: url?.substring(0, 50) + '...',
        urlMatch: tokenUrl === url,
        tokenTime,
        currentTime,
        timeDiff,
        maxAllowed: 5
      });
    } else {
      console.log('✅ Token validated successfully');
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ Token verification error:', error);
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

  // Get parameters
  const token = url.searchParams.get('token');
  const targetUrl = url.searchParams.get('url');
  
  console.log('🔍 Proxy request:', {
    hasToken: !!token,
    hasUrl: !!targetUrl,
    url: targetUrl?.substring(0, 100)
  });
  
  if (!targetUrl) {
    console.error('❌ Missing url parameter');
    return new Response(JSON.stringify({ 
      error: 'Missing url parameter',
      help: 'Use: /api/m3u8-proxy?url=<stream_url>&token=<token>'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  if (!token) {
    console.error('❌ Missing token parameter');
    return new Response(JSON.stringify({ 
      error: 'Missing token parameter',
      help: 'Generate token using the client-side encryption library'
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  // Verify token
  if (!verifyToken(token, targetUrl)) {
    console.warn(`🚫 Invalid token for ${targetUrl.substring(0, 50)}...`);
    
    // HELPFUL: Generate expected token for debugging
    const expectedToken = generateToken(targetUrl);
    console.log('🔧 Debug info:', {
      receivedToken: token.substring(0, 30) + '...',
      expectedToken: expectedToken.substring(0, 30) + '...',
      match: token === expectedToken
    });
    
    return new Response(JSON.stringify({ 
      error: 'Invalid or expired token',
      help: 'Token must be generated within the last 5 minutes',
      debug: process.env.NODE_ENV === 'development' ? {
        receivedTokenPreview: token.substring(0, 20),
        expectedTokenPreview: expectedToken.substring(0, 20),
        urlUsed: targetUrl.substring(0, 50)
      } : undefined
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      }
    });
  }

  console.log(`✅ Token verified for ${targetUrl.substring(0, 50)}...`);

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
      console.error(`❌ Upstream error: ${response.status} for ${cleanTargetUrl.substring(0, 50)}...`);
      return new Response(
        JSON.stringify({ 
          error: `Upstream error: ${response.status}`,
          statusText: response.statusText,
          url: cleanTargetUrl.substring(0, 100)
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

    // Handle M3U8 playlists
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
        
        const segmentToken = generateToken(absoluteUrl);
        const proxiedUrl = `${url.origin}${url.pathname}?url=${encodeURIComponent(absoluteUrl)}&token=${segmentToken}`;
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
      JSON.stringify({ 
        error: 'Proxy failed', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
