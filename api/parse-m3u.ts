// api/parse-m3u.ts - SECURED WITH DOMAIN RESTRICTION
export const config = {
  runtime: 'edge',
};

const API_KEY = process.env.API_KEY || 'your-api-key-change-this';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://imshep.vercel.app'];

interface Channel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
  referer?: string;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): Channel[] => {
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXTINF:')) {
      let channelName = 'Unknown Channel';
      
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
      
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const logoUrl = logoMatch ? logoMatch[1] : '/channel-placeholder.svg';

      currentChannel = {
        name: channelName,
        logoUrl: logoUrl,
        categoryId,
        categoryName,
      };
    } else if (line && !line.startsWith('#') && currentChannel.name) {
      let streamUrl = line;
      let referer = '';
      
      if (line.includes('|Referer=') || line.includes('|referer=')) {
        const parts = line.split('|');
        streamUrl = parts[0].trim();
        
        const refererPart = parts[1];
        if (refererPart) {
          const refererMatch = refererPart.match(/(?:Referer|referer)=(.+)/);
          if (refererMatch) {
            referer = refererMatch[1].trim();
          }
        }
      }
      
      const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const channelId = `${categoryId}_${cleanChannelName}_${channels.length}`;
      
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
  const origin = request.headers.get('origin');
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }

  // SECURITY: Verify origin is allowed
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`🚫 Unauthorized origin: ${origin}`);
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

  // SECURITY: Verify API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== API_KEY) {
    console.warn(`🚫 Invalid API key from ${origin}`);
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { 
        status: 401,
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

    console.log(`📡 Fetching M3U playlist: ${m3uUrl}`);

    const response = await fetch(m3uUrl);
    
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

    console.log(`✅ Parsed ${channels.length} channels from M3U playlist`);

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
          ...getCorsHeaders(origin),
        }
      }
    );
  }
}
