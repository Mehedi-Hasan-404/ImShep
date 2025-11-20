// api/secure-stream.ts
// Validates token and proxies the actual stream
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

const SECRET_KEY = process.env.STREAM_SECRET_KEY || 'your-secret-key-change-this';

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

async function validateToken(token: string): Promise<{ valid: boolean; channelId?: string }> {
  try {
    const [payloadB64, signature] = token.split('.');
    
    if (!payloadB64 || !signature) {
      return { valid: false };
    }

    const payloadStr = atob(payloadB64);
    const payload = JSON.parse(payloadStr);

    // Check expiration
    if (payload.exp < Date.now()) {
      return { valid: false };
    }

    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadStr + SECRET_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (expectedSignature !== signature) {
      return { valid: false };
    }

    return { valid: true, channelId: payload.channelId };
  } catch (error) {
    return { valid: false };
  }
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

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing token' }),
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    // Validate token
    const validation = await validateToken(token);
    if (!validation.valid || !validation.channelId) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    // Here you would:
    // 1. Look up the actual stream URL from Firebase using validation.channelId
    // 2. Proxy the stream through m3u8-proxy
    
    // For now, redirect to m3u8-proxy with a placeholder
    // You need to integrate Firebase to fetch the real stream URL
    
    // Placeholder response - replace with actual stream URL lookup
    return new Response(
      JSON.stringify({ 
        error: 'Stream URL lookup not implemented',
        message: 'Please integrate Firebase to fetch stream URLs based on channelId'
      }),
      {
        status: 501,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Stream access failed',
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
