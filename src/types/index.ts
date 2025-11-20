// src/types/index.ts - Updated with secure token support

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

// SECURITY: Never expose actual streamUrl to frontend
export interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  // streamUrl is removed - frontend only gets tokens
  categoryId: string;
  categoryName: string;
}

// Admin still needs full URLs for management
export interface AdminChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string; // Only in admin context
  categoryId: string;
  categoryName: string;
  authCookie?: string;
}

export interface FavoriteChannel {
  id: string;
  name: string;
  logoUrl: string;
  // No streamUrl stored
  categoryName: string;
  addedAt: number;
}

export interface RecentChannel {
  id: string;
  name: string;
  logoUrl: string;
  // No streamUrl stored
  categoryName: string;
  watchedAt: number;
}

// New interface for stream tokens
export interface StreamToken {
  token: string;
  expiresIn: number;
  expiresAt: number;
}
