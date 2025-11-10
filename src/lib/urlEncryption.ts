// src/lib/urlEncryption.ts - FIXED WITH DEBUGGING
const SECRET_KEY = 'turNjS/qrjIbiCMAQah952gc4WQU3OwdjfOZFF0NkSY=';
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Debug logging
console.log('🔑 URL Encryption Config:', {
  hasApiKey: !!API_KEY,
  apiKeyPrefix: API_KEY ? API_KEY.substring(0, 10) + '...' : 'MISSING',
  proxyUrl: PROXY_URL,
  secretKeyPrefix: SECRET_KEY.substring(0, 10) + '...'
});

export function encryptUrl(url: string): string {
  const key = SECRET_KEY;
  let encrypted = '';
  for (let i = 0; i < url.length; i++) {
    encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function decryptUrl(encrypted: string): string {
  try {
    const restored = encrypted.replace(/-/g, '+').replace(/_/g, '/');
    const padded = restored + '=='.substring(0, (4 - restored.length % 4) % 4);
    const decoded = atob(padded);
    
    const key = SECRET_KEY;
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
  } catch (e) {
    console.error('❌ Error decrypting URL:', e);
    throw new Error('Invalid encrypted URL');
  }
}

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.warn('⚠️ getProxiedUrl: Empty URL provided');
    return originalUrl;
  }

  // Check if API key is available
  if (!API_KEY) {
    console.error('❌ VITE_API_KEY is not set! Streams will not work.');
    console.error('Please check your .env file and Vercel environment variables.');
  }
  
  let cleanUrl = originalUrl;
  
  // If URL is already proxied, extract the original
  if (originalUrl.includes('/api/m3u8-proxy?token=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const token = urlObj.searchParams.get('token');
      if (token) {
        cleanUrl = decryptUrl(token);
        console.log('🔄 Unwrapped existing proxy URL');
      }
    } catch (e) {
      console.error('❌ Error cleaning proxied URL:', e);
    }
  }
  
  const urlLower = cleanUrl.toLowerCase();
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls') ||
                 urlLower.includes('live');
  
  if (isM3U8) {
    const encryptedToken = encryptUrl(cleanUrl);
    const proxiedUrl = `${PROXY_URL}?token=${encryptedToken}&apiKey=${API_KEY || 'MISSING'}`;
    
    console.log('🔐 Proxy URL Generated:', {
      original: cleanUrl.substring(0, 50) + '...',
      proxied: proxiedUrl.substring(0, 80) + '...',
      hasApiKey: !!API_KEY,
      tokenLength: encryptedToken.length
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

// Add a test function for debugging
export function testProxySetup() {
  const testUrl = 'https://test.com/stream.m3u8';
  const proxied = getProxiedUrl(testUrl);
  
  console.log('🧪 Proxy Setup Test:');
  console.log('Input:', testUrl);
  console.log('Output:', proxied);
  console.log('Has API Key:', !!API_KEY);
  console.log('API Key Length:', API_KEY?.length || 0);
  
  // Test encryption/decryption
  const encrypted = encryptUrl(testUrl);
  const decrypted = decryptUrl(encrypted);
  console.log('Encryption Test:', decrypted === testUrl ? '✅ PASS' : '❌ FAIL');
  
  return {
    hasApiKey: !!API_KEY,
    proxyUrl: PROXY_URL,
    encryptionWorks: decrypted === testUrl
  };
}

// Auto-run test in development
if (import.meta.env.DEV) {
  setTimeout(() => {
    console.log('🔍 Running automatic proxy setup test...');
    testProxySetup();
  }, 1000);
}
