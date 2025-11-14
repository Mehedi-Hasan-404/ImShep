// src/pages/StreamTest.tsx - Comprehensive Stream Testing
import { useState } from 'react';
import VideoPlayerDebug from '@/components/VideoPlayerDebug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getProxiedUrl } from '@/lib/urlEncryption';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const StreamTest = () => {
  const [testUrl, setTestUrl] = useState('');
  const [processedUrl, setProcessedUrl] = useState('');
  const [showPlayer, setShowPlayer] = useState(false);
  const [checks, setChecks] = useState<any>({});

  const sampleStreams = [
    {
      name: 'Sample HLS Stream 1',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
      name: 'Sample HLS Stream 2', 
      url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8'
    }
  ];

  const runChecks = async (url: string) => {
    const results: any = {};

    // Check 1: Environment
    results.apiKey = {
      status: !!import.meta.env.VITE_API_KEY,
      message: import.meta.env.VITE_API_KEY ? 'Configured' : 'NOT CONFIGURED'
    };

    // Check 2: URL Format
    const urlLower = url.toLowerCase();
    results.urlFormat = {
      status: urlLower.includes('.m3u8') || urlLower.includes('.m3u'),
      message: urlLower.includes('.m3u8') || urlLower.includes('.m3u') ? 'Valid M3U8' : 'Not M3U8 format'
    };

    // Check 3: Proxying
    const proxied = getProxiedUrl(url);
    const isProxied = proxied !== url && proxied.includes('token=');
    results.proxying = {
      status: isProxied,
      message: isProxied ? 'URL Proxied Successfully' : 'Proxying Failed',
      details: {
        original: url.substring(0, 80),
        proxied: proxied.substring(0, 80),
        hasToken: proxied.includes('token=')
      }
    };

    // Check 4: Proxy Endpoint
    try {
      const proxyTest = await fetch('/api/m3u8-proxy?url=test&token=test');
      results.proxyEndpoint = {
        status: proxyTest.status !== 404,
        message: proxyTest.status === 401 ? 'Proxy Working (Auth Required)' : 
                 proxyTest.status === 404 ? 'Proxy NOT FOUND' : 
                 `Proxy Status: ${proxyTest.status}`
      };
    } catch (err: any) {
      results.proxyEndpoint = {
        status: false,
        message: 'Proxy Unreachable: ' + err.message
      };
    }

    // Check 5: Stream Accessibility
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      
      const streamTest = await fetch(proxied, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      results.streamAccess = {
        status: streamTest.ok,
        message: streamTest.ok ? 'Stream Accessible' : `HTTP ${streamTest.status}`,
        details: {
          status: streamTest.status,
          contentType: streamTest.headers.get('content-type')
        }
      };
    } catch (err: any) {
      results.streamAccess = {
        status: false,
        message: 'Stream Not Accessible: ' + err.message
      };
    }

    setChecks(results);
    return results;
  };

  const handleTest = async () => {
    if (!testUrl) return;
    
    setShowPlayer(false);
    await runChecks(testUrl);
    
    const proxied = getProxiedUrl(testUrl);
    setProcessedUrl(proxied);
    setShowPlayer(true);
  };

  const handleSampleSelect = async (url: string) => {
    setTestUrl(url);
    setShowPlayer(false);
    await runChecks(url);
    
    const proxied = getProxiedUrl(url);
    setProcessedUrl(proxied);
    setShowPlayer(true);
  };

  const getStatusIcon = (status: boolean) => {
    return status ? 
      <CheckCircle className="text-green-500" size={20} /> : 
      <XCircle className="text-red-500" size={20} />;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Stream Testing & Diagnostics</h1>
        <p className="text-gray-400">Test HLS streams and diagnose playback issues</p>
      </div>

      {/* Environment Check */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Environment Status:</strong><br />
          API Key: {import.meta.env.VITE_API_KEY ? '✅ Configured' : '❌ NOT CONFIGURED'}<br />
          Proxy URL: {import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy'}
        </AlertDescription>
      </Alert>

      {/* Sample Streams */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Try Sample Streams:</h3>
        <div className="space-y-2">
          {sampleStreams.map((stream, i) => (
            <button
              key={i}
              onClick={() => handleSampleSelect(stream.url)}
              className="w-full text-left p-3 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
            >
              <div className="font-medium">{stream.name}</div>
              <div className="text-xs text-gray-400 truncate">{stream.url}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom URL Input */}
      <div className="space-y-3">
        <label className="font-semibold">Test Your Own Stream:</label>
        <div className="flex gap-2">
          <Input
            type="url"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://example.com/stream.m3u8"
            className="flex-1"
          />
          <Button onClick={handleTest} disabled={!testUrl}>
            Test Stream
          </Button>
        </div>
      </div>

      {/* Diagnostic Results */}
      {Object.keys(checks).length > 0 && (
        <div className="bg-card border rounded-lg p-4">
          <h3 className="font-semibold mb-3">Diagnostic Results:</h3>
          <div className="space-y-3">
            {Object.entries(checks).map(([key, value]: [string, any]) => (
              <div key={key} className="flex items-start gap-3 p-3 bg-secondary rounded-lg">
                {getStatusIcon(value.status)}
                <div className="flex-1">
                  <div className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                  <div className="text-sm text-gray-400">{value.message}</div>
                  {value.details && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-blue-400">
                        View Details
                      </summary>
                      <pre className="text-xs mt-2 p-2 bg-black/20 rounded overflow-x-auto">
                        {JSON.stringify(value.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Player */}
      {showPlayer && processedUrl && (
        <div className="bg-card border rounded-lg p-4">
          <h3 className="font-semibold mb-3">Stream Player:</h3>
          <VideoPlayerDebug 
            streamUrl={processedUrl}
            channelName="Test Stream"
          />
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Troubleshooting Guide:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
          <li><strong>If API Key check fails:</strong> Add VITE_API_KEY to your .env file</li>
          <li><strong>If Proxy Endpoint fails:</strong> Make sure your dev server is running</li>
          <li><strong>If Proxying fails:</strong> Check that the URL contains .m3u8</li>
          <li><strong>If Stream Access fails:</strong> The stream URL might be invalid or blocked</li>
          <li><strong>If video loads but won't play:</strong> Check browser console for HLS.js errors</li>
        </ol>
      </div>

      {/* Quick Fix Commands */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="font-semibold mb-2">Quick Fix Commands:</h3>
        <div className="space-y-2 text-sm font-mono">
          <div className="p-2 bg-black rounded">
            <div className="text-gray-400"># Add API key to .env:</div>
            <div className="text-green-400">VITE_API_KEY="MKL8dhX0+Q/2US2oS5LB2X4tQ8e6Tvy1KUH8TQngp2M="</div>
          </div>
          <div className="p-2 bg-black rounded">
            <div className="text-gray-400"># Restart dev server:</div>
            <div className="text-green-400">npm run dev</div>
          </div>
          <div className="p-2 bg-black rounded">
            <div className="text-gray-400"># Test in console:</div>
            <div className="text-green-400">
              await fetch('/api/m3u8-proxy?url=test&token=test')
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamTest;
