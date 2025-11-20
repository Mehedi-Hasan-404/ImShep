// api/parse-m3u.ts
export const config = {
  runtime: 'edge',
};

interface Channel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): Channel[] => {
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      let channelName = 'Unknown Channel';
      
      // Method 1: Try tvg-name attribute
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
      if (tvgNameMatch) {
        channelName = tvgNameMatch[1].trim();
      } else {
        // Method 2: Try group-title attribute followed by comma and name
        const groupTitleMatch = line.match(/group-title="[^"]*",(.+)$/);
        if (groupTitleMatch) {
          channelName = groupTitleMatch[1].trim();
        } else {
          // Method 3: Fallback to text after last comma
          const nameMatch = line.match(/,([^,]+)$/);
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
      const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const channel: Channel = {
        id: `${categoryId}_${cleanChannelName}_${channels.length}`,
        name: currentChannel.name,
        logoUrl: currentChannel.logoUrl || '/channel-placeholder.svg',
        streamUrl: line,
        categoryId,
        categoryName,
      };
      channels.push(channel);
      currentChannel = {};
    }
  }

  return channels;
};

export default async function handler(request: Request) {
  const origin = request.headers.get('origin') || '';
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }

  try {
    const body = await request.json();
    const { categoryId, categoryName } = body;

    if (!categoryId || !categoryName) {
      return new Response(
        JSON.stringify({ error: 'Missing categoryId or categoryName' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Get the M3U URL from your Firebase/Firestore
    // For security, the M3U URL should be stored server-side only
    // For now, we'll accept it in the request body, but you should fetch it from your database
    const { m3uUrl } = body;

    if (!m3uUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing m3uUrl' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Fetch the M3U playlist server-side
    const response = await fetch(m3uUrl);
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch M3U: ${response.statusText}` }),
        { 
          status: response.status,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      }
    );

  } catch (error: any) {
    console.error('Parse M3U error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to parse M3U playlist',
        details: error.message
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
