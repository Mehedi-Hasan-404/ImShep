// /src/types/index.ts
export interface User {
  uid: string;
  email: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  m3uUrl?: string;
  order?: number;
}

export interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

export interface AdminChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
  authCookie?: string;
}

export interface FavoriteChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryName: string;
  addedAt: number;
}

export interface RecentChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryName: string;
  watchedAt: number;
}

// --- UPDATED TYPES FOR LIVE EVENTS ---
export interface LiveEventLink {
  label: string;
  url: string;
}

export interface LiveEvent {
  id: string;
  category: string; // e.g., "Cricket", "Football"
  league: string;   // e.g., "Bangladesh Premier League"
  team1Name: string;
  team1Logo: string;
  team2Name: string;
  team2Logo: string;
  startTime: string; // ISO string date
  endTime?: string;  // Optional ISO string date for when match ends
  isLive: boolean;   // Force live status
  links: LiveEventLink[];
}
