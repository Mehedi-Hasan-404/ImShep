// This tells Vercel to run this function on the fast "Edge" runtime
export const config = {
  runtime: 'edge',
};

// This function will run every time /api/m3u8-proxy is called
export default async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('url');

  if (!streamUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing "url" query parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Fetch the original M3U8 file
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Vercel-Proxy',
        // Use the original stream's domain as the Referer
        'Referer': new URL(streamUrl).origin,
      },
    });

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
      });
    }

    const m3u8Content = await response.text();
    // Get the base URL (e.g., "https://stream.com/live/")
    // to correctly resolve relative paths
    const baseUrl = new URL(streamUrl);

    // 2. Rewrite all internal URLs in the M3U8
    const rewrittenLines = m3u8Content.split('\n').map(line => {
      line = line.trim();

      // Rewrite segment/playlist URLs (lines that don't start with #)
      if (line.length > 0 && !line.startsWith('#')) {
        const absoluteUrl = new URL(line, baseUrl).toString();
        // Point it back to our own proxy
        return `/api/m3u8-proxy?url=${encodeURIComponent(absoluteUrl)}`;
      }

      // Rewrite encryption key URLs
      if (line.startsWith('#EXT-X-KEY')) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (uriMatch && uriMatch[1]) {
          const absoluteKeyUrl = new URL(uriMatch[1], baseUrl).toString();
          // Point the key URL back to our own proxy
          const proxiedKeyUrl = `/api/m3u8-proxy?url=${encodeURIComponent(absoluteKeyUrl)}`;
          return line.replace(uriMatch[1], proxiedKeyUrl);
        }
      }

      // Return all other lines (comments, etc.) unchanged
      return line;
    });

    // 3. Return the modified M3U8 file
    const headers = new Headers({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 's-maxage=600, stale-while-revalidate', // Cache for 10 mins
    });

    return new Response(rewrittenLines.join('\n'), { headers });

  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: 'Failed to proxy stream', details: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
