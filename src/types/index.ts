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

// ✅ Channel type used throughout the app
export interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

// ✅ Admin channel type (includes auth cookie)
export interface AdminChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
  authCookie?: string;
}

// ✅ UPDATED: Favorite WITHOUT streamUrl (only stores reference data)
export interface FavoriteChannel {
  id: string;
  name: string;
  logoUrl: string;
  categoryId: string;
  categoryName: string;
  addedAt: number;
  // ❌ NO streamUrl - only page reference data
}

// ✅ UPDATED: Recent WITHOUT streamUrl (only stores reference data)
export interface RecentChannel {
  id: string;
  name: string;
  logoUrl: string;
  categoryId: string;
  categoryName: string;
  watchedAt: number;
  // ❌ NO streamUrl - only page reference data
}

// --- LIVE EVENTS (unchanged) ---
export interface LiveEventLink {
  label: string;
  url: string;
}

export interface LiveEvent {
  id: string;
  category: string;
  league: string;
  team1Name: string;
  team1Logo: string;
  team2Name: string;
  team2Logo: string;
  startTime: string;
  endTime?: string;
  isLive: boolean;
  links: LiveEventLink[];
}
