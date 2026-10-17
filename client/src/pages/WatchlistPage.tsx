import React from 'react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import AnimeCard from '../components/anime/AnimeCard.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';
import PillButton from '../components/ui/PillButton.js';
import { Bookmark, Search } from 'lucide-react';
import { WatchlistAnimeItem } from '../hooks/useWatchlist.js';

interface WatchlistPageProps {
  watchlist: WatchlistAnimeItem[];
  is_loading: boolean;
  onSelectAnime: (slug: string) => void;
  onToggleWatchlist: (slug: string) => void;
  onGoToCatalog: () => void;
}

export const WatchlistPage: React.FC<WatchlistPageProps> = ({
  watchlist,
  is_loading,
  onSelectAnime,
  onToggleWatchlist,
  onGoToCatalog,
}) => {
  const watchlist_slugs = new Set(watchlist.map((w) => w.slug));

  return (
    <div className="w-full py-8">
      <CurlyEyebrow>Biblioteca Personal</CurlyEyebrow>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold text-surface-cream tracking-tight">
            Mi Biblioteca
          </h1>
          <p className="text-sm md:text-base text-surface-50 mt-1">
            Tus animes guardados y sincronizados disponibles para ver online y sin conexión.
          </p>
        </div>

        {/* Contador de animes guardados */}
        <div className="flex items-center gap-2 bg-off-black px-3.5 py-1.5 rounded-buttons border border-surface-25 text-xs font-semibold text-surface-cream w-fit">
          <Bookmark className="w-3.5 h-3.5 text-shockingly-green fill-shockingly-green" />
          <span>Guardados ({watchlist.length})</span>
        </div>
      </div>

      <HairlineDivider className="my-6 md:my-8" />

      {is_loading ? (
        <div className="py-20 text-center text-surface-50 font-mono">
          &#123; Cargando biblioteca personal... &#125;
        </div>
      ) : watchlist.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto">
          <Bookmark className="w-12 h-12 text-surface-50 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-surface-cream mb-2">Tu biblioteca está vacía</h3>
          <p className="text-sm text-surface-50 mb-6">
            Guarda tus animes favoritos desde el catálogo para tenerlos siempre a mano y disponibles sin conexión.
          </p>
          <PillButton onClick={onGoToCatalog}>
            <Search className="w-4 h-4" /> Explorar catálogo
          </PillButton>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {watchlist.map((anime) => (
            <AnimeCard
              key={anime.slug}
              slug={anime.slug}
              title={anime.title}
              poster_url={anime.posterUrl}
              type={anime.status}
              in_watchlist={watchlist_slugs.has(anime.slug)}
              onSelect={onSelectAnime}
              onToggleWatchlist={(_slug, e) => {
                e.stopPropagation();
                onToggleWatchlist(anime.slug);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default WatchlistPage;
