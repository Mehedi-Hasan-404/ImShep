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

// New Types for Live Events
export interface LiveEventLink {
  label: string;
  url: string;
}

export interface LiveEvent {
  id: string;
  title: string;
  description: string;
  bannerUrl: string;
  startTime: string; // ISO string
  isLive: boolean;
  links: LiveEventLink[];
}
