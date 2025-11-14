// src/lib/urlEncryption.ts - FIXED VERSION
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Enable debug logging
const DEBUG = true;

// CRITICAL FIX: Use TextEncoder/TextDecoder for consistent encoding
function generateToken(url: string): string {
  if (!API_KEY) {
    console.error('❌ API_KEY is not configured!');
    return '';
  }
  
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  // Convert to Uint8Array for consistent byte handling
  const dataBytes = new TextEncoder().encode(data);
  const keyBytes = new TextEncoder().encode(key);
  
  // XOR cipher
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to base64 using standard btoa (which expects latin1)
  const binaryString = Array.from(encoded)
    .map(byte => String.fromCharCode(byte))
    .join('');
  
  const token = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  if (DEBUG) {
    console.log('🔐 Token generated:', {
      url: url.substring(0, 50) + '...',
      timestamp,
      tokenLength: token.length
    });
  }
  
  return token;
}

export function getProxiedUrl(originalUrl: string): string {
  if (DEBUG) {
    console.log('📡 getProxiedUrl called:', {
      originalUrl: originalUrl?.substring(0, 100),
      hasApiKey: !!API_KEY,
      apiKeyLength: API_KEY?.length,
      proxyUrl: PROXY_URL
    });
  }

  if (!originalUrl) {
    console.error('❌ No URL provided to proxy');
    return originalUrl;
  }

  if (!API_KEY) {
    console.error('❌ VITE_API_KEY is not configured in .env file!');
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
        if (DEBUG) {
          console.log('🔄 URL was already proxied, extracted clean URL:', cleanUrl.substring(0, 100));
        }
      }
    } catch (e) {
      console.error('❌ Error parsing proxied URL:', e);
    }
  }
  
  // Check if URL needs proxying
  const urlLower = cleanUrl.toLowerCase();
  
  // CRITICAL FIX: More comprehensive M3U8/HLS detection
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('.m3u') ||
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls') ||
                 urlLower.includes('playlist') ||
                 urlLower.includes('master') ||
                 urlLower.includes('index') ||
                 cleanUrl.includes('|Referer=') || // M3U format with referer
                 cleanUrl.includes('|referer=');
  
  if (isM3U8) {
    const token = generateToken(cleanUrl);
    
    if (!token) {
      console.error('❌ Failed to generate token, returning original URL');
      return cleanUrl;
    }
    
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&token=${token}`;
    
    if (DEBUG) {
      console.log('✅ Proxying M3U8 stream:', {
        original: cleanUrl.substring(0, 100) + '...',
        proxied: proxiedUrl.substring(0, 100) + '...',
        tokenGenerated: !!token
      });
    }
    
    return proxiedUrl;
  }
  
  if (DEBUG) {
    console.log('⚠️ Not proxying (not detected as M3U8):', {
      url: cleanUrl.substring(0, 100),
      urlLower: urlLower.substring(0, 100)
    });
  }
  
  return cleanUrl;
}

export function getProxyHeaders(): HeadersInit {
  // No longer needed with token-based auth
  return {};
}

// Debug function to test proxy
export function testProxy() {
  const testUrl = 'https://example.com/stream.m3u8';
  console.log('🧪 Testing proxy with:', testUrl);
  const proxied = getProxiedUrl(testUrl);
  console.log('🧪 Result:', proxied);
  
  // Test environment
  console.log('🧪 Environment check:', {
    API_KEY: API_KEY ? `Set (${API_KEY.length} chars)` : 'NOT SET',
    PROXY_URL: PROXY_URL,
    ENV_MODE: import.meta.env.MODE,
    BASE_URL: import.meta.env.BASE_URL
  });
}

// Auto-run test in development
if (import.meta.env.DEV) {
  console.log('🔧 URL Encryption module loaded in DEV mode');
}
