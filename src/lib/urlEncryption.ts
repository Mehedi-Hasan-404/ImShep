// src/lib/urlEncryption.ts - FIXED TO MATCH SERVER EXACTLY
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

/**
 * Generate authentication token for stream URL
 * CRITICAL: Must match server-side implementation EXACTLY
 */
function generateToken(url: string): string {
  if (!API_KEY) {
    console.error('❌ API_KEY is not configured!');
    return '';
  }
  
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  // CRITICAL: Use same encoding as server
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  // XOR cipher (same as server)
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // CRITICAL: Convert to base64 using ArrayBuffer (matches Node.js Buffer)
  const binaryString = Array.from(encoded)
    .map(byte => String.fromCharCode(byte))
    .join('');
  
  // URL-safe base64 encoding (same as server)
  const token = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  console.log('🔐 Token generated:', {
    url: url.substring(0, 50) + '...',
    timestamp,
    token: token.substring(0, 20) + '...',
    tokenLength: token.length
  });
  
  return token;
}

/**
 * Get proxied URL for stream
 */
export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.error('❌ No URL provided');
    return originalUrl;
  }

  if (!API_KEY) {
    console.error('❌ VITE_API_KEY not configured');
    return originalUrl;
  }
  
  // Clean URL if already proxied
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        cleanUrl = decodeURIComponent(encodedUrl);
      }
    } catch (e) {
      // Keep original URL
    }
  }
  
  const urlLower = cleanUrl.toLowerCase();
  
  // Check if needs proxy
  const needsProxy = 
    urlLower.includes('.m3u8') || 
    urlLower.includes('.m3u') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('.mpd') ||
    cleanUrl.includes('|Referer=');
  
  if (needsProxy) {
    const token = generateToken(cleanUrl);
    
    if (!token) {
      console.error('❌ Token generation failed');
      return cleanUrl;
    }
    
    // Build proxied URL
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&token=${token}`;
    
    console.log('✅ URL proxied:', {
      original: cleanUrl.substring(0, 50) + '...',
      proxied: proxiedUrl.substring(0, 80) + '...',
      hasToken: proxiedUrl.includes('token=')
    });
    
    return proxiedUrl;
  }
  
  return cleanUrl;
}

/**
 * Test token generation (for debugging)
 */
export function testTokenGeneration(url: string = 'https://example.com/test.m3u8') {
  console.log('🧪 Testing token generation...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (!API_KEY) {
    console.error('❌ API_KEY not set!');
    return;
  }
  
  console.log('✅ API_KEY:', API_KEY.substring(0, 20) + '...');
  console.log('✅ Test URL:', url);
  
  const token = generateToken(url);
  console.log('✅ Generated Token:', token);
  console.log('✅ Token Length:', token.length);
  
  const proxied = getProxiedUrl(url);
  console.log('✅ Proxied URL:', proxied);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return { token, proxied };
}

// Export test function to window
if (typeof window !== 'undefined') {
  (window as any).testTokenGeneration = testTokenGeneration;
  console.log('💡 Test available: window.testTokenGeneration()');
}

// Validate stream URL
export function isValidStreamUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const urlLower = url.toLowerCase();
    
    const isSupported = 
      urlLower.includes('.m3u8') ||
      urlLower.includes('.m3u') ||
      urlLower.includes('.mpd') ||
      urlLower.includes('.mp4');
    
    return isSupported && (urlObj.protocol === 'http:' || urlObj.protocol === 'https:');
  } catch (e) {
    return false;
  }
}

// Get stream type
export function getStreamType(url: string): 'hls' | 'dash' | 'mp4' | 'unknown' {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('/api/m3u8-proxy')) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const targetUrl = urlObj.searchParams.get('url');
      if (targetUrl) {
        return getStreamType(decodeURIComponent(targetUrl));
      }
    } catch (e) {
      // Continue
    }
  }
  
  if (urlLower.includes('.m3u8') || urlLower.includes('.m3u') || urlLower.includes('hls')) {
    return 'hls';
  }
  
  if (urlLower.includes('.mpd') || urlLower.includes('dash')) {
    return 'dash';
  }
  
  if (urlLower.includes('.mp4')) {
    return 'mp4';
  }
  
  return 'unknown';
}
