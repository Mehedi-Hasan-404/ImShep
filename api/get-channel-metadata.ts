// api/get-channel-metadata.ts
// Returns channel metadata WITHOUT stream URLs for security
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
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

  if (request.method !== 'GET') {
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
    const url = new URL(request.url);
    const channelId = url.searchParams.get('channelId');

    if (!channelId) {
      return new Response(
        JSON.stringify({ error: 'Missing channelId parameter' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    // For M3U channels, parse the ID to get metadata
    // Format: categoryId_channelName_index
    if (channelId.includes('_')) {
      const parts = channelId.split('_');
      const categoryId = parts[0];
      const channelIndex = parts[parts.length - 1];
      
      // You'll need to fetch the category's M3U URL from Firebase here
      // For now, return basic metadata structure
      
      return new Response(
        JSON.stringify({
          id: channelId,
          name: decodeURIComponent(parts.slice(1, -1).join('_')),
          logoUrl: '/channel-placeholder.svg',
          categoryId: categoryId,
          categoryName: 'Unknown Category',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          },
        }
      );
    }

    // For manual channels, you'd fetch from Firebase
    // This is a placeholder - integrate with your Firebase connection
    return new Response(
      JSON.stringify({
        error: 'Channel not found',
      }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
        },
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch channel metadata',
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
