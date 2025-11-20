// src/services/streamService.ts
// Frontend service for securely handling stream tokens

import { StreamToken } from '@/types';

class StreamService {
  private tokenCache: Map<string, StreamToken> = new Map();

  /**
   * Get a secure stream token for a channel
   * Tokens are cached and automatically refreshed before expiration
   */
  async getStreamToken(channelId: string): Promise<string> {
    // Check if we have a valid cached token
    const cached = this.tokenCache.get(channelId);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      // Token expires in more than 1 minute, use it
      return cached.token;
    }

    // Request new token from backend
    try {
      const response = await fetch('/api/generate-stream-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      });

      if (!response.ok) {
        throw new Error('Failed to get stream token');
      }

      const data = await response.json();
      const streamToken: StreamToken = {
        token: data.token,
        expiresIn: data.expiresIn,
        expiresAt: Date.now() + (data.expiresIn * 1000),
      };

      // Cache the token
      this.tokenCache.set(channelId, streamToken);

      return streamToken.token;
    } catch (error) {
      console.error('Error getting stream token:', error);
      throw error;
    }
  }

  /**
   * Get the secure stream URL with token
   * This URL goes through our secure proxy that validates the token
   */
  async getSecureStreamUrl(channelId: string): Promise<string> {
    const token = await this.getStreamToken(channelId);
    return `/api/secure-stream?token=${encodeURIComponent(token)}`;
  }

  /**
   * Clear cached token for a channel
   */
  clearToken(channelId: string): void {
    this.tokenCache.delete(channelId);
  }

  /**
   * Clear all cached tokens
   */
  clearAllTokens(): void {
    this.tokenCache.clear();
  }
}

// Export singleton instance
export const streamService = new StreamService();
