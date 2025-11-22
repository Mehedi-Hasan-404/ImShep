// src/pages/Live.tsx
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { LiveEvent } from '@/types';
import { Loader2, PlayCircle, CheckCircle2, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'live' | 'recent' | 'upcoming';

const Live = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // --- UPDATED SORTING LOGIC ---
  const getProcessedEvents = () => {
    let filtered = events.filter(event => {
      const eventTime = new Date(event.startTime).getTime();
      const isRecentTime = eventTime < now && eventTime > (now - 24 * 60 * 60 * 1000);
      
      switch (filter) {
        case 'live': return event.isLive;
        case 'upcoming': return eventTime > now && !event.isLive;
        case 'recent': return isRecentTime && !event.isLive;
        case 'all': default: return true;
      }
    });

    return filtered.sort((a, b) => {
      // 1. Live events always first
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      
      const timeA = new Date(a.startTime).getTime();
      const timeB = new Date(b.startTime).getTime();
      const isUpcomingA = timeA > now;
      const isUpcomingB = timeB > now;

      // 2. Upcoming events come before Recent events
      if (isUpcomingA && !isUpcomingB) return -1;
      if (!isUpcomingA && isUpcomingB) return 1;

      // 3. Upcoming: Sort Ascending (Soonest first)
      if (isUpcomingA && isUpcomingB) return timeA - timeB;

      // 4. Recent: Sort Descending (Newest ended first)
      return timeB - timeA;
    });
  };

  const processedEvents = getProcessedEvents();

  const counts = {
    all: events.length,
    live: events.filter(e => e.isLive).length,
    recent: events.filter(e => new Date(e.startTime).getTime() < now && !e.isLive && new Date(e.startTime).getTime() > (now - 86400000)).length,
    upcoming: events.filter(e => new Date(e.startTime).getTime() > now && !e.isLive).length
  };

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin text-accent w-10 h-10" />
    </div>
  );

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <FilterTab 
          active={filter === 'all'} 
          onClick={() => setFilter('all')} 
          label="All" 
          count={counts.all}
          icon={<CheckCircle2 size={16} />}
        />
        <FilterTab 
          active={filter === 'live'} 
          onClick={() => setFilter('live')} 
          label="Live" 
          count={counts.live}
          activeClass="bg-red-600 border-red-500 text-white"
          // FIX 1: Conditional color for the live dot (Red when inactive/white-bg, White when active/red-bg)
          icon={<div className={cn("w-2 h-2 rounded-full animate-pulse", filter === 'live' ? "bg-white" : "bg-red-500")} />}
        />
        <FilterTab 
          active={filter === 'recent'} 
          onClick={() => setFilter('recent')} 
          label="Recent" 
          count={counts.recent} 
        />
        <FilterTab 
          active={filter === 'upcoming'} 
          onClick={() => setFilter('upcoming')} 
          label="Upcoming" 
          count={counts.upcoming} 
        />
      </div>
      
      {/* FIX 3: Use flex-col gap-4 instead of space-y-4 for more consistent spacing with links */}
      <div className="flex flex-col gap-4">
        {processedEvents.length > 0 ? (
          processedEvents.map(event => (
            // FIX 3: Added className="block" to ensure Link behaves like a block element for spacing
            <Link key={event.id} to={`/live/${event.id}`} className="block">
                 <MatchCard event={event} now={now} />
            </Link>
          ))
        ) : (
          <div className="text-center py-12 bg-card border border-border rounded-xl">
            <Trophy className="mx-auto h-12 w-12 text-text-secondary opacity-50 mb-2" />
            <p className="text-text-secondary">No matches found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const FilterTab = ({ 
  active, 
  onClick, 
  label, 
  count, 
  icon,
  activeClass = "bg-emerald-600 border-emerald-500 text-white" 
}: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-all",
      active 
        ? activeClass
        : "bg-card border-border text-text-secondary hover:border-accent/50"
    )}
  >
    {icon}
    <span>{label}</span>
    {count > 0 && <span className="text-xs opacity-80">({count})</span>}
  </button>
);

const MatchCard = ({ event, now }: { event: LiveEvent, now: number }) => {
  const eventTime = new Date(event.startTime).getTime();
  const isUpcoming = eventTime > now && !event.isLive;
  
  const dateObj = new Date(event.startTime);
  const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = dateObj.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  
  const diff = Math.abs(now - eventTime);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  const timerString = `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    // FIX 2: Changed bg-[#0a0a0a] to bg-card for theme support
    <div className="bg-card rounded-xl border border-border hover:border-accent/50 transition-all duration-300 overflow-hidden relative group shadow-sm">
      <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center gap-2">
        <Trophy size={14} className="text-accent" />
        <span className="text-xs font-medium text-foreground/90 uppercase tracking-wide">
          {event.category} | {event.league}
        </span>
      </div>

      <div className="p-4 flex items-center justify-between relative">
        <div className="flex flex-col items-center gap-2 w-1/3 z-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-muted/30 p-2 flex items-center justify-center border border-border/50">
            <img 
              src={event.team1Logo} 
              alt={event.team1Name} 
              className="w-full h-full object-contain"
              onError={(e) => e.currentTarget.src = `https://ui-avatars.com/api/?name=${event.team1Name}&background=random`}
            />
          </div>
          <span className="text-sm font-bold text-center leading-tight text-foreground">{event.team1Name}</span>
        </div>

        <div className="flex flex-col items-center justify-center w-1/3 z-10">
          {event.isLive ? (
            <>
              <div className="flex items-center gap-1.5 text-red-500 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">Live</span>
              </div>
              <div className="text-xl sm:text-2xl font-mono font-medium text-foreground tracking-widest">
                {timerString}
              </div>
            </>
          ) : isUpcoming ? (
            <>
              <div className="text-xl font-bold text-foreground mb-1">{timeString}</div>
              <div className="text-xs text-accent font-medium mb-2">{dateString}</div>
              <div className="text-[10px] text-text-secondary uppercase tracking-wide">
                Starts in {timerString}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-text-secondary font-medium">Match Ended</div>
              <div className="text-xs text-muted-foreground mt-1">{dateString}</div>
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 w-1/3 z-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-muted/30 p-2 flex items-center justify-center border border-border/50">
            <img 
              src={event.team2Logo} 
              alt={event.team2Name} 
              className="w-full h-full object-contain"
              onError={(e) => e.currentTarget.src = `https://ui-avatars.com/api/?name=${event.team2Name}&background=random`}
            />
          </div>
          <span className="text-sm font-bold text-center leading-tight text-foreground">{event.team2Name}</span>
        </div>
      </div>

      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-20 backdrop-blur-[1px]">
        <div className="flex flex-col items-center gap-2 transform scale-95 group-hover:scale-100 transition-transform duration-300">
          <div className="bg-accent text-white rounded-full p-3 shadow-lg shadow-accent/20">
            <PlayCircle size={32} fill="currentColor" className="text-white" />
          </div>
          <span className="text-white font-bold text-xs tracking-widest uppercase">Click to Watch</span>
        </div>
      </div>
    </div>
  );
};

export default Live;
