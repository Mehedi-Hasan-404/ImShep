// api/parse-m3u.ts - SIMPLIFIED VERSION
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGIN = 'https://imshep.vercel.app';

interface Channel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function parseM3U(m3uContent: string, categoryId: string, categoryName: string): Channel[] {
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      // Extract channel name
      let channelName = 'Unknown Channel';
      
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
      if (tvgNameMatch) {
        channelName = tvgNameMatch[1].trim();
      } else {
        const nameMatch = line.match(/,\s*(.+)$/);
        if (nameMatch) {
          channelName = nameMatch[1].trim();
        }
      }
      
      // Extract logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const logoUrl = logoMatch ? logoMatch[1] : '/channel-placeholder.svg';

      currentChannel = {
        name: channelName,
        logoUrl: logoUrl,
        categoryId,
        categoryName,
      };
    } else if (line && !line.startsWith('#') && currentChannel.name) {
      // This is the stream URL
      const streamUrl = line;
      
      // Generate unique ID
      const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const channelId = `${categoryId}_${cleanChannelName}_${channels.length}`;
      
      channels.push({
        id: channelId,
        name: currentChannel.name,
        logoUrl: currentChannel.logoUrl || '/channel-placeholder.svg',
        streamUrl: streamUrl,
        categoryId,
        categoryName,
      });
      
      currentChannel = {};
    }
  }

  return channels;
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

  // SECURITY: Only allow imshep.vercel.app
  if (origin !== ALLOWED_ORIGIN) {
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
    const { categoryId, categoryName, m3uUrl } = body;

    if (!categoryId || !categoryName || !m3uUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    // Fetch M3U playlist
    const response = await fetch(m3uUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch M3U: ${response.statusText}` }),
        { 
          status: response.status,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    const m3uContent = await response.text();
    const channels = parseM3U(m3uContent, categoryId, categoryName);

    return new Response(
      JSON.stringify({ channels }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
          'Cache-Control': 'public, max-age=300',
        },
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to parse M3U playlist',
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
