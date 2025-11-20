// api/generate-stream-token.ts
// Vercel Edge Function for generating temporary stream tokens

export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

// Secret key for signing tokens (set in Vercel environment variables)
const SECRET_KEY = process.env.STREAM_SECRET_KEY || 'your-secret-key-change-this';

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Simple token generation (you should use a proper JWT library in production)
async function generateToken(channelId: string, expiresIn: number = 3600): Promise<string> {
  const payload = {
    channelId,
    exp: Date.now() + (expiresIn * 1000),
    nonce: Math.random().toString(36).substring(2)
  };
  
  const payloadStr = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadStr + SECRET_KEY);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return btoa(payloadStr) + '.' + signature;
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

  // Origin validation
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized origin' }),
      { 
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        }
      }
    );
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        }
      }
    );
  }

  try {
    const body = await request.json();
    const { channelId } = body;

    if (!channelId) {
      return new Response(
        JSON.stringify({ error: 'Missing channelId' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    // Generate token that expires in 1 hour
    const token = await generateToken(channelId, 3600);

    return new Response(
      JSON.stringify({ 
        token,
        expiresIn: 3600 
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate token',
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
