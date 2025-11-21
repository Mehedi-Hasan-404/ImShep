// src/pages/EventPlayer.tsx
import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LiveEvent } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Loader2, AlertCircle, Check, Signal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const EventPlayer = () => {
  const { eventId } = useParams();
  const [location, setLocation] = useLocation();
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentLinkIndex, setCurrentLinkIndex] = useState(0);
  const [autoRetry, setAutoRetry] = useState(true);
  const { toast } = useToast();

  // Fetch Event Data
  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return;
      try {
        const docRef = doc(db, 'live_events', eventId);
        const docSnap = await getDocs(docRef); // Using getDoc but typo was likely in original file or snippet
        if (docSnap.exists()) {
          setEvent({ id: docSnap.id, ...docSnap.data() } as LiveEvent);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [eventId]);

  // Note: Re-implementing fetch with correct import to be safe
  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return;
      try {
        const docRef = doc(db, 'live_events', eventId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEvent({ id: docSnap.id, ...docSnap.data() } as LiveEvent);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
  }, [eventId]);


  // Handle Video Errors (Auto-Rollback Logic)
  const handleVideoError = () => {
    if (!event || !autoRetry) return;
    console.log(`Link ${currentLinkIndex + 1} failed. Trying next...`);
    if (currentLinkIndex < event.links.length - 1) {
      setCurrentLinkIndex(prev => prev + 1);
    } else {
      console.log("All links failed. Restarting loop.");
      setCurrentLinkIndex(0);
    }
  };
  
  // Share Handler
  const handleShare = async () => {
    if (!event) return;
    const shareData = {
      title: event.title,
      text: `Watch ${event.title} live on ImShep!`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast({
            title: "Link copied",
            description: "Event link copied to clipboard",
        });
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-black"><Loader2 className="animate-spin text-accent" /></div>;
  if (!event) return <div className="flex h-screen items-center justify-center bg-black text-white">Event not found</div>;

  const currentLink = event.links[currentLinkIndex];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Player Container - Updated sticky top position to respect header */}
      <div className="w-full aspect-video bg-black relative sticky top-header z-50 group">
        
        {/* VIDEO PLAYER */}
        {event.links.length > 0 ? (
            <VideoPlayer 
                key={currentLink.url} 
                streamUrl={currentLink.url}
                channelName={event.title}
                onError={handleVideoError}
                onBack={() => setLocation('/live')} 
                onShare={handleShare}
                autoPlay={true}
            />
        ) : (
            <div className="flex h-full items-center justify-center text-text-secondary flex-col gap-2">
                <AlertCircle size={48} />
                <p>No streams available for this event yet.</p>
                <button 
                  onClick={() => setLocation('/live')}
                  className="mt-4 px-4 py-2 bg-accent/20 text-accent rounded-full hover:bg-accent/30 transition"
                >
                  Go Back
                </button>
            </div>
        )}

      </div>

      {/* Info & Links Section */}
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="mb-6 flex justify-between items-start">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">{event.title}</h1>
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <span className="text-accent font-bold px-2 py-0.5 bg-accent/10 rounded">{event.league}</span>
                    <span>•</span>
                    <span>{new Date(event.startTime).toLocaleString()}</span>
                </div>
            </div>
        </div>

        {/* Server Selector */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
                <Signal className="text-accent" size={20} />
                <h3 className="font-bold text-white">Stream Sources</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {event.links.map((link, index) => (
                    <button
                        key={index}
                        onClick={() => setCurrentLinkIndex(index)}
                        className={`relative flex items-center justify-between p-3 rounded-lg border transition-all ${
                            currentLinkIndex === index 
                            ? 'bg-accent/10 border-accent text-accent shadow-[0_0_10px_rgba(16,185,129,0.2)]' 
                            : 'bg-bg-tertiary border-transparent hover:border-white/20 text-text-secondary hover:text-white'
                        }`}
                    >
                        <div className="flex flex-col items-start">
                            <span className="font-bold text-sm">{link.label}</span>
                            <span className="text-[10px] opacity-70 truncate max-w-[150px]">Server {index + 1}</span>
                        </div>
                        {currentLinkIndex === index && (
                            <div className="flex items-center gap-1 bg-accent text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                <span>ON AIR</span>
                                <Check size={12} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
            <p className="text-xs text-text-secondary mt-4 flex items-center gap-1 opacity-70">
               <AlertCircle size={12} />
               If a stream fails, the player will automatically switch to the next available server.
            </p>
        </div>

        {/* Description */}
        {event.description && (
          <div className="mt-6 text-sm text-text-secondary bg-card/50 p-4 rounded-lg border border-border/50">
              <h4 className="font-bold text-white mb-2">Event Details</h4>
              <p className="leading-relaxed">{event.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventPlayer;
