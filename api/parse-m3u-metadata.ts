// api/parse-m3u-metadata.ts - Returns ONLY metadata (no stream URLs)
export const config = {
  runtime: 'edge',
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  categoryId: string;
  categoryName: string;
  // NO streamUrl for security
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const parseM3UMetadata = (m3uContent: string, categoryId: string, categoryName: string): PublicChannel[] => {
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
  const channels: PublicChannel[] = [];
  let currentChannel: Partial<PublicChannel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      let channelName = 'Unknown Channel';
      
      // Try to extract channel name
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
      if (tvgNameMatch) {
        channelName = tvgNameMatch[1].trim();
      } else {
        const groupTitleMatch = line.match(/group-title="[^"]*",\s*(.+)$/);
        if (groupTitleMatch) {
          channelName = groupTitleMatch[1].trim();
        } else {
          const nameMatch = line.match(/,\s*([^,]+)$/);
          if (nameMatch) {
            channelName = nameMatch[1].trim();
          }
        }
      }
      
      // Extract logo URL
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const logoUrl = logoMatch ? logoMatch[1] : '/channel-placeholder.svg';

      currentChannel = {
        name: channelName,
        logoUrl: logoUrl,
        categoryId,
        categoryName,
      };
    } else if (line && !line.startsWith('#') && currentChannel.name) {
      // This is the stream URL line - we create the channel but DON'T include the URL
      const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const channelId = `${categoryId}_${cleanChannelName}_${channels.length}`;
      
      // SECURITY: Only return metadata, no stream URLs
      const channel: PublicChannel = {
        id: channelId,
        name: currentChannel.name,
        logoUrl: currentChannel.logoUrl || '/channel-placeholder.svg',
        categoryId,
        categoryName,
        // streamUrl is NOT included for security
      };
      
      channels.push(channel);
      currentChannel = {};
    }
  }

  return channels;
};

export default async function handler(request: Request) {
  const origin = request.headers.get('origin');
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // Verify origin is allowed
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
    const { categoryId, categoryName, m3uUrl } = body;

    if (!categoryId || !categoryName) {
      return new Response(
        JSON.stringify({ error: 'Missing categoryId or categoryName' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    if (!m3uUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing m3uUrl' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(origin),
          }
        }
      );
    }

    console.log('Fetching M3U playlist from:', m3uUrl);

    // Fetch the M3U playlist
    const response = await fetch(m3uUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch M3U:', response.status, response.statusText);
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
    console.log('M3U content length:', m3uContent.length);
    
    // Parse the M3U content and return only metadata (no URLs)
    const channels = parseM3UMetadata(m3uContent, categoryId, categoryName);
    
    console.log('Parsed channels count:', channels.length);

    return new Response(
      JSON.stringify({ 
        channels,
        count: channels.length 
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(origin),
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      }
    );

  } catch (error: any) {
    console.error('Error parsing M3U playlist:', error);
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
