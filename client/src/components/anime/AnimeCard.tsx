import React from 'react';
import { Play, Bookmark } from 'lucide-react';

export interface AnimeCardProps {
  slug: string;
  title: string;
  poster_url: string;
  type?: string;
  in_watchlist?: boolean;
  onSelect: (slug: string) => void;
  onToggleWatchlist?: (slug: string, e: React.MouseEvent) => void;
}

export const AnimeCard: React.FC<AnimeCardProps> = ({
  slug,
  title,
  poster_url,
  type = 'Anime',
  in_watchlist = false,
  onSelect,
  onToggleWatchlist,
}) => {
  return (
    <div
      onClick={() => onSelect(slug)}
      className="group relative bg-off-black rounded-cards overflow-hidden border border-surface-25/50 hover:border-surface-cream/40 transition-all duration-300 cursor-pointer flex flex-col"
    >
      {/* Poster Image Container */}
      <div className="aspect-[3/4] w-full overflow-hidden bg-just-black relative">
        <img
          src={poster_url}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=60';
          }}
        />

        {/* Hover Overlay Play Icon */}
        <div className="absolute inset-0 bg-just-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border border-surface-cream bg-just-black/60 flex items-center justify-center text-surface-cream">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Watchlist Bookmark Button */}
        {onToggleWatchlist && (
          <button
            type="button"
            onClick={(e) => onToggleWatchlist(slug, e)}
            className="absolute top-2 right-2 p-2 rounded-full bg-just-black/80 border border-surface-25 hover:border-surface-cream text-surface-cream transition-colors z-10"
          >
            <Bookmark
              className={`w-4 h-4 ${in_watchlist ? 'fill-shockingly-green text-shockingly-green' : 'text-surface-cream'}`}
            />
          </button>
        )}

        {/* Type Badge */}
        {type && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 text-xs font-semibold rounded-cards bg-just-black/80 border border-surface-25 text-surface-cream">
            {type}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <h4 className="text-sm md:text-base font-semibold text-surface-cream line-clamp-2 leading-snug group-hover:text-shockingly-green transition-colors">
          {title}
        </h4>
      </div>
    </div>
  );
};

export default AnimeCard;
