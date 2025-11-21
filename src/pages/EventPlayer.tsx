import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LiveEvent, LiveEventLink } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Loader2, AlertCircle, Check, Signal, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

const EventPlayer = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentLinkIndex, setCurrentLinkIndex] = useState(0);
  const [error, setError] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);

  // Fetch Event Data
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
      // Try next link
      setCurrentLinkIndex(prev => prev + 1);
    } else {
      // All links failed, restart from 0 or stop
      console.log("All links failed. Restarting loop.");
      setCurrentLinkIndex(0);
      // Optional: setAutoRetry(false) to stop infinite loop if you prefer
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-black"><Loader2 className="animate-spin text-accent" /></div>;
  if (!event) return <div className="flex h-screen items-center justify-center bg-black text-white">Event not found</div>;

  const currentLink = event.links[currentLinkIndex];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Player Section */}
      <div className="w-full aspect-video bg-black relative sticky top-0 z-50">
        <div className="absolute top-4 left-4 z-20">
            <Link to="/live" className="bg-black/50 p-2 rounded-full text-white hover:bg-accent transition-colors backdrop-blur-sm">
                <ArrowLeft size={20} />
            </Link>
        </div>
        
        {event.links.length > 0 ? (
            <VideoPlayer 
                key={currentLink.url} // Key forces player reload on link change
                url={currentLink.url}
                onError={handleVideoError}
            />
        ) : (
            <div className="flex h-full items-center justify-center text-text-secondary flex-col gap-2">
                <AlertCircle size={48} />
                <p>No streams available for this event yet.</p>
            </div>
        )}
      </div>

      {/* Info & Links Section */}
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">{event.title}</h1>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="text-accent font-bold">{event.league}</span>
                <span>•</span>
                <span>{new Date(event.startTime).toLocaleString()}</span>
            </div>
        </div>

        {/* Server Selector */}
        <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
                <Signal className="text-accent" size={20} />
                <h3 className="font-bold text-white">Stream Sources</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {event.links.map((link, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            setCurrentLinkIndex(index);
                            setError(false);
                        }}
                        className={`relative flex items-center justify-between p-3 rounded-lg border transition-all ${
                            currentLinkIndex === index 
                            ? 'bg-accent/10 border-accent text-accent' 
                            : 'bg-bg-tertiary border-transparent hover:border-white/20 text-text-secondary'
                        }`}
                    >
                        <div className="flex flex-col items-start">
                            <span className="font-bold text-sm">{link.label}</span>
                            <span className="text-[10px] opacity-70 truncate max-w-[150px]">Source {index + 1}</span>
                        </div>
                        {currentLinkIndex === index && (
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] animate-pulse">PLAYING</span>
                                <Check size={16} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
            <p className="text-xs text-text-secondary mt-4 italic">
                * Player will automatically switch to the next server if the current one fails.
            </p>
        </div>

        <div className="mt-6 text-sm text-text-secondary bg-card/50 p-4 rounded-lg">
            <h4 className="font-bold text-white mb-2">Match Details</h4>
            <p>{event.description || "No additional details available."}</p>
        </div>
      </div>
    </div>
  );
};

export default EventPlayer;
