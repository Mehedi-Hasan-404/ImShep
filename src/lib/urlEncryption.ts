// src/lib/urlEncryption.ts - SIMPLIFIED VERSION
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Debug logging
console.log('🔑 Proxy Config:', {
  hasApiKey: !!API_KEY,
  proxyUrl: PROXY_URL,
});

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.warn('⚠️ Empty URL provided');
    return originalUrl;
  }

  // Check if API key is available
  if (!API_KEY) {
    console.error('❌ VITE_API_KEY is not set! Streams will not work.');
    return originalUrl;
  }
  
  // Clean URL if it's already proxied
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        cleanUrl = decodeURIComponent(encodedUrl);
        console.log('🔄 Unwrapped existing proxy URL');
      }
    } catch (e) {
      console.error('❌ Error cleaning proxied URL:', e);
    }
  }
  
  // Check if URL needs proxying (M3U8 streams)
  const urlLower = cleanUrl.toLowerCase();
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls');
  
  if (isM3U8) {
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&apiKey=${API_KEY}`;
    
    console.log('🔐 Proxy URL Generated:', {
      original: cleanUrl.substring(0, 50) + '...',
      proxied: proxiedUrl.substring(0, 80) + '...',
      hasApiKey: !!API_KEY,
    });
    
    return proxiedUrl;
  }
  
  console.log('ℹ️ URL does not need proxying:', cleanUrl);
  return cleanUrl;
}

export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}

// Test function for debugging
export function testProxySetup() {
  const testUrl = 'https://test.com/stream.m3u8';
  const proxied = getProxiedUrl(testUrl);
  
  console.log('🧪 Proxy Setup Test:');
  console.log('Input:', testUrl);
  console.log('Output:', proxied);
  console.log('Has API Key:', !!API_KEY);
  
  return {
    hasApiKey: !!API_KEY,
    proxyUrl: PROXY_URL,
  };
}

// Auto-run test in development
if (import.meta.env.DEV) {
  setTimeout(() => {
    console.log('🔍 Running automatic proxy setup test...');
    testProxySetup();
  }, 1000);
}
