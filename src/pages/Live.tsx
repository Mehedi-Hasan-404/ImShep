// src/pages/Live.tsx
import { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LiveEvent } from '@/types';
import { Loader2, Calendar, ExternalLink } from 'lucide-react';

const Live = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const q = query(collection(db, 'live_events'), orderBy('startTime', 'asc'));
        const snapshot = await getDocs(q);
        setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveEvent)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <Loader2 className="animate-spin text-accent w-8 h-8" />
    </div>
  );

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
          <Calendar className="text-accent" />
          <span className="gradient-text">Live & Upcoming Events</span>
        </h1>
        <p className="text-text-secondary">Don't miss out on the biggest matches and streams</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
        
        {events.length === 0 && (
          <div className="col-span-full text-center py-16 bg-card border border-border rounded-xl">
            <Calendar size={48} className="mx-auto mb-4 text-text-secondary opacity-50" />
            <h3 className="text-xl font-semibold text-foreground">No Events Scheduled</h3>
            <p className="text-text-secondary mt-2">Check back later for upcoming streams.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const EventCard = ({ event }: { event: LiveEvent }) => {
  const [timeLeft, setTimeLeft] = useState(+new Date(event.startTime) - +new Date());
  const [isLive, setIsLive] = useState(event.isLive);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = +new Date(event.startTime) - +new Date();
      setTimeLeft(remaining);
      
      // Auto-switch to LIVE if time is reached, unless manually set to false via admin
      if (remaining <= 0) {
        // We only auto-enable the visual "LIVE" badge if it's past start time. 
        // The actual isLive property from DB controls if it's strictly forced live/offline.
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [event.startTime]);

  // Format timer
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const isCurrentlyLive = isLive || timeLeft <= 0;

  return (
    <div className="bg-card rounded-xl overflow-hidden border border-border shadow-lg hover:border-accent transition-all duration-300 flex flex-col">
      <div className="relative h-48 sm:h-56 w-full group">
        <img 
          src={event.bannerUrl} 
          alt={event.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => e.currentTarget.src = 'https://placehold.co/800x400/1a1a1a/cccccc?text=No+Image'} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        
        <div className="absolute bottom-4 left-4 right-4">
          {isCurrentlyLive ? (
            <span className="inline-flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse mb-2 shadow-lg shadow-red-900/20">
              <span className="w-2 h-2 bg-white rounded-full"></span> LIVE NOW
            </span>
          ) : (
            <div className="flex gap-2 mb-2">
               <div className="bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 rounded-md text-accent font-mono text-xs font-bold">
                 {days}d {hours}h {minutes}m {seconds}s
               </div>
            </div>
          )}
          <h3 className="text-xl font-bold text-white leading-tight line-clamp-2">{event.title}</h3>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <p className="text-text-secondary text-sm mb-6 line-clamp-3 flex-1">{event.description}</p>
        
        <div className="space-y-2 mt-auto">
          {event.links.map((link, i) => (
            <a 
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg hover:bg-accent hover:text-white transition-all duration-300 group border border-transparent hover:border-accent/50"
            >
              <span className="font-medium text-sm">{link.label}</span>
              <ExternalLink size={16} className="opacity-50 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
          {event.links.length === 0 && (
            <div className="text-center text-xs text-text-secondary italic py-2">
              Links will be available soon
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Live;
