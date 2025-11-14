// src/components/VideoPlayerDebug.tsx - DEEP DEBUG VERSION
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface VideoPlayerDebugProps {
  streamUrl: string;
  channelName: string;
}

interface DebugLog {
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
  data?: any;
}

const VideoPlayerDebug: React.FC<VideoPlayerDebugProps> = ({ streamUrl, channelName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLog = (level: DebugLog['level'], message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, level, message, data }]);
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
  };

  useEffect(() => {
    addLog('info', 'Component mounted', { streamUrl, channelName });
    testAndLoadStream();

    return () => {
      addLog('info', 'Component unmounting');
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [streamUrl]);

  const testAndLoadStream = async () => {
    const video = videoRef.current;
    if (!video) {
      addLog('error', 'Video element not found');
      return;
    }

    // Step 1: Check environment
    addLog('info', 'Checking environment');
    const apiKey = import.meta.env.VITE_API_KEY;
    const proxyUrl = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';
    
    addLog(apiKey ? 'success' : 'error', 'API Key', { 
      configured: !!apiKey,
      length: apiKey?.length 
    });
    addLog('info', 'Proxy URL', { proxyUrl });

    // Step 2: Check stream URL format
    addLog('info', 'Analyzing stream URL', { 
      url: streamUrl.substring(0, 100),
      length: streamUrl.length 
    });

    const urlLower = streamUrl.toLowerCase();
    const isM3U8 = urlLower.includes('.m3u8') || urlLower.includes('.m3u');
    const isProxied = streamUrl.includes('/api/m3u8-proxy');
    
    addLog(isM3U8 ? 'success' : 'warning', 'Stream type detection', { 
      isM3U8, 
      isProxied,
      needsProxy: isM3U8 && !isProxied 
    });

    // Step 3: Check if URL is accessible
    if (!isProxied) {
      addLog('warning', '⚠️ Stream URL is NOT proxied! This will likely fail due to CORS.');
      addLog('info', 'Expected proxied URL format: /api/m3u8-proxy?url=...&token=...');
    }

    // Step 4: Test proxy accessibility
    try {
      addLog('info', 'Testing proxy endpoint...');
      const testResponse = await fetch('/api/m3u8-proxy?url=test&token=test', {
        method: 'GET'
      });
      addLog(testResponse.ok ? 'success' : 'warning', 'Proxy endpoint response', {
        status: testResponse.status,
        statusText: testResponse.statusText
      });
    } catch (proxyError: any) {
      addLog('error', 'Proxy endpoint unreachable', { error: proxyError.message });
    }

    // Step 5: Test actual stream URL
    try {
      addLog('info', 'Testing stream accessibility...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const streamResponse = await fetch(streamUrl, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      addLog(streamResponse.ok ? 'success' : 'error', 'Stream response', {
        status: streamResponse.status,
        contentType: streamResponse.headers.get('content-type')
      });
    } catch (streamError: any) {
      addLog('error', 'Stream not accessible', { 
        error: streamError.message,
        name: streamError.name 
      });
    }

    // Step 6: Check HLS.js support
    try {
      addLog('info', 'Loading HLS.js...');
      const Hls = (await import('hls.js')).default;
      const hlsSupported = Hls.isSupported();
      
      addLog(hlsSupported ? 'success' : 'error', 'HLS.js support', {
        supported: hlsSupported,
        version: Hls.version || 'unknown'
      });

      if (!hlsSupported) {
        // Try native support
        const nativeSupport = video.canPlayType('application/vnd.apple.mpegurl');
        addLog(nativeSupport ? 'success' : 'error', 'Native HLS support', {
          supported: !!nativeSupport
        });

        if (nativeSupport) {
          addLog('info', 'Using native HLS');
          video.src = streamUrl;
          video.play().catch(e => {
            addLog('error', 'Native playback failed', { error: e.message });
            setError(e.message);
          });
          return;
        } else {
          const errorMsg = 'No HLS support available';
          addLog('error', errorMsg);
          setError(errorMsg);
          return;
        }
      }

      // Step 7: Initialize HLS.js
      addLog('info', 'Initializing HLS.js player');
      const hls = new Hls({
        debug: true, // Enable debug for diagnostics
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
      });

      hlsRef.current = hls;

      // HLS.js event listeners
      hls.on(Hls.Events.MEDIA_ATTACHING, () => {
        addLog('info', 'HLS: Attaching media');
      });

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        addLog('success', 'HLS: Media attached');
      });

      hls.on(Hls.Events.MANIFEST_LOADING, () => {
        addLog('info', 'HLS: Loading manifest');
      });

      hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
        addLog('success', 'HLS: Manifest loaded', {
          levels: data.levels?.length || 0,
          url: data.url?.substring(0, 100)
        });
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        addLog('success', 'HLS: Manifest parsed', {
          levels: data.levels.length,
          firstLevel: data.firstLevel
        });
        
        video.play()
          .then(() => {
            addLog('success', '✅ PLAYBACK STARTED!');
            setIsPlaying(true);
          })
          .catch(err => {
            addLog('error', 'Autoplay failed', { error: err.message });
            setError('Click play button to start');
          });
      });

      hls.on(Hls.Events.LEVEL_SWITCHING, (event, data) => {
        addLog('info', 'HLS: Switching quality', { level: data.level });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        addLog('info', 'HLS: Quality switched', { level: data.level });
      });

      hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
        addLog('info', 'HLS: Loading fragment', { 
          sn: data.frag.sn,
          url: data.frag.url?.substring(0, 50) 
        });
      });

      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        addLog('success', 'HLS: Fragment loaded', { sn: data.frag.sn });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const isRecoverable = !data.fatal;
        addLog(isRecoverable ? 'warning' : 'error', 'HLS: Error occurred', {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          url: data.url?.substring(0, 100)
        });

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              addLog('error', '❌ NETWORK ERROR - Cannot load stream');
              addLog('info', 'Possible causes: CORS, invalid URL, proxy not working');
              setError('Network error loading stream');
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              addLog('warning', 'Media error, attempting recovery');
              hls.recoverMediaError();
              break;
            default:
              addLog('error', '❌ FATAL ERROR');
              setError(`Fatal error: ${data.details}`);
              hls.destroy();
          }
        }
      });

      // Step 8: Load source
      addLog('info', 'Loading stream source', { url: streamUrl.substring(0, 100) });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

    } catch (error: any) {
      addLog('error', '❌ Failed to initialize player', { 
        error: error.message,
        stack: error.stack 
      });
      setError(error.message);
    }
  };

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const getLogIcon = (level: DebugLog['level']) => {
    switch (level) {
      case 'success': return <CheckCircle size={14} className="text-green-500" />;
      case 'error': return <XCircle size={14} className="text-red-500" />;
      case 'warning': return <AlertCircle size={14} className="text-yellow-500" />;
      default: return <div className="w-3.5 h-3.5 rounded-full bg-blue-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <div className="relative bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls={false}
          playsInline
        />
        
        {!isPlaying && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={handlePlay}
              className="bg-red-600 hover:bg-red-700 text-white p-4 rounded-full"
            >
              <Play size={32} />
            </button>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white p-4">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
              <p className="text-lg font-semibold mb-2">Playback Error</p>
              <p className="text-sm text-gray-300">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Debug Console */}
      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Debug Console</h3>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-gray-400 hover:text-white"
          >
            Clear
          </button>
        </div>
        <div className="space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-gray-300">
                {getLogIcon(log.level)}
                <span className="text-gray-500">{log.timestamp}</span>
                <span className="flex-1">{log.message}</span>
                {log.data && (
                  <details className="text-gray-500">
                    <summary className="cursor-pointer">data</summary>
                    <pre className="text-xs mt-1 p-2 bg-gray-800 rounded">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Fixes */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <h4 className="text-white font-semibold mb-2">Common Issues & Fixes:</h4>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>✓ If you see "Stream URL is NOT proxied" - URL needs to go through proxy</li>
          <li>✓ If you see "NETWORK ERROR" - Check if proxy is running</li>
          <li>✓ If you see "401/403" - Check API key in .env</li>
          <li>✓ If video shows but doesn't play - Click the play button</li>
        </ul>
      </div>
    </div>
  );
};

export default VideoPlayerDebug;
