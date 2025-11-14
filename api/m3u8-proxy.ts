// api/m3u8-proxy.ts - COMPLETELY FIXED VERSION
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

// CRITICAL FIX: Match client-side token generation exactly
function generateToken(url: string): string {
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  // Convert to bytes for XOR
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  // XOR cipher
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to base64 - use Buffer for Node.js compatibility
  const binaryString = String.fromCharCode(...encoded);
  const token = Buffer.from(binaryString, 'binary').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return token;
}

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
    const [tokenUrl, tokenTime] = originalString.split(':');
    const currentTime = Math.floor(Date.now() / 60000);
    
    // Token valid for 5 minutes
    const isValid = tokenUrl === url && Math.abs(currentTime - parseInt(tokenTime)) <= 5;
    
    if (!isValid) {
      console.log('❌ Token validation failed:', {
        tokenUrl: tokenUrl?.substring(0, 50),
        expectedUrl: url?.substring(0, 50),
        tokenTime,
        currentTime,
        timeDiff: Math.abs(currentTime - parseInt(tokenTime))
      });
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

  // Get token and target URL
  const token = url.searchParams.get('token');
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    console.error('❌ Missing url parameter');
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

  console.log(`✅ Token verified for ${targetUrl.substring(0, 50)}...`);

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

    console.log(`📡 Fetching: ${cleanTargetUrl.substring(0, 100)}...`);

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
      console.log(`📺 Processing M3U8 playlist: ${cleanTargetUrl.substring(0, 50)}...`);
      
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

      console.log(`✅ M3U8 playlist processed: ${rewrittenLines.length} lines`);

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=10, s-maxage=10',
          ...getCorsHeaders(origin),
        },
      });
    }

    // Pass through other content (video segments, etc.)
    console.log(`📦 Passing through content: ${contentType}`);
    
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
