import { useState, useEffect, useCallback } from 'react';

export interface WatchlistAnimeItem {
  id: string;
  slug: string;
  title: string;
  posterUrl: string;
  synopsis: string;
  genres: string[];
  status: string;
  inWatchlist: boolean;
  seasons: Array<{
    id: string;
    number: number;
    episodes: Array<{
      id: string;
      number: number;
      downloadStatus: string;
    }>;
  }>;
}

export const useWatchlist = () => {
  const [watchlist, setWatchlist] = useState<WatchlistAnimeItem[]>([]);
  const [is_loading, setIsLoading] = useState<boolean>(true);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/anime/watchlist');
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.watchlist || []);
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const toggleWatchlist = async (slug: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/anime/watchlist/${slug}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        await fetchWatchlist();
        return data.inWatchlist;
      }
      return false;
    } catch {
      return false;
    }
  };

  return {
    watchlist,
    is_loading,
    toggleWatchlist,
    refresh: fetchWatchlist,
  };
};

export default useWatchlist;
