// api/parse-m3u.ts - FIXED WITH REFERER SUPPORT
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
  referer?: string; // Add referer support
}

const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): Channel[] => {
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      // Extract channel name (multiple methods for compatibility)
      let channelName = 'Unknown Channel';
      
      // Method 1: tvg-name attribute (most reliable)
      const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
      if (tvgNameMatch) {
        channelName = tvgNameMatch[1].trim();
      } else {
        // Method 2: group-title followed by comma and name
        const groupTitleMatch = line.match(/group-title="[^"]*",\s*(.+)$/);
        if (groupTitleMatch) {
          channelName = groupTitleMatch[1].trim();
        } else {
          // Method 3: text after last comma
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
      // CRITICAL FIX: Handle pipe-separated referer format
      let streamUrl = line;
      let referer = '';
      
      // Check for |Referer= or |referer= format
      if (line.includes('|Referer=') || line.includes('|referer=')) {
        const parts = line.split('|');
        streamUrl = parts[0].trim();
        
        // Extract referer from second part
        const refererPart = parts[1];
        if (refererPart) {
          const refererMatch = refererPart.match(/(?:Referer|referer)=(.+)/);
          if (refererMatch) {
            referer = refererMatch[1].trim();
          }
        }
      }
      
      // Generate unique ID
      const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const channelId = `${categoryId}_${cleanChannelName}_${channels.length}`;
      
      // Store referer in streamUrl using our special format
      const finalStreamUrl = referer 
        ? `${streamUrl}?__referer=${encodeURIComponent(referer)}`
        : streamUrl;
      
      const channel: Channel = {
        id: channelId,
        name: currentChannel.name,
        logoUrl: currentChannel.logoUrl || '/channel-placeholder.svg',
        streamUrl: finalStreamUrl,
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
    const { categoryId, categoryName, m3uUrl } = body;

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

    console.log(`📡 Fetching M3U playlist: ${m3uUrl}`);

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

    console.log(`✅ Parsed ${channels.length} channels from M3U playlist`);

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
