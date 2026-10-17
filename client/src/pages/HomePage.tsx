import React, { useState, useEffect } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import AnimeCard from '../components/anime/AnimeCard.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';

interface AnimeItem {
  slug: string;
  title: string;
  poster_url: string;
  type?: string;
  synopsis?: string;
}

interface HomePageProps {
  onSelectAnime: (slug: string) => void;
  onToggleWatchlist: (slug: string) => void;
  watchlist_slugs: Set<string>;
}

export const HomePage: React.FC<HomePageProps> = ({
  onSelectAnime,
  onToggleWatchlist,
  watchlist_slugs,
}) => {
  const [query, setQuery] = useState<string>('');
  const [active_query, setActiveQuery] = useState<string>('');
  const [search_results, setSearchResults] = useState<AnimeItem[]>([]);
  const [latest_animes, setLatestAnimes] = useState<AnimeItem[]>([]);
  const [is_searching, setIsSearching] = useState<boolean>(false);
  const [is_loading_latest, setIsLoadingLatest] = useState<boolean>(true);
  const [has_searched, setHasSearched] = useState<boolean>(false);

  // Cargar últimos lanzamientos
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('/api/anime/latest');
        if (res.ok) {
          const data = await res.json();
          setLatestAnimes(data.results || []);
        }
      } catch (err) {
        console.error('Error fetching latest animes:', err);
      } finally {
        setIsLoadingLatest(false);
      }
    };

    fetchLatest();
  }, []);

  // Función ejecutora de búsqueda
  const executeSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setSearchResults([]);
      setHasSearched(false);
      setActiveQuery('');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setActiveQuery(trimmed);

    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Error en búsqueda:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Manejar submit del formulario (Enter o botón Buscar)
  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch(query);
  };

  // Búsqueda reactiva con debounce de 400ms al tipear
  useEffect(() => {
    if (!query.trim()) {
      if (has_searched) {
        setSearchResults([]);
        setHasSearched(false);
        setActiveQuery('');
      }
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(query);
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleClear = () => {
    setQuery('');
    setActiveQuery('');
    setSearchResults([]);
    setHasSearched(false);
  };

  return (
    <div className="w-full">
      {/* Hero Display Section */}
      <section className="py-12 md:py-20 flex flex-col items-start justify-center">
        <CurlyEyebrow>Streaming Híbrido & Gestor de Descargas</CurlyEyebrow>

        <h1 className="text-4xl sm:text-6xl md:text-8xl font-semibold text-surface-cream tracking-tight leading-[0.95] max-w-4xl mb-6">
          Explora<span className="text-shockingly-green">.</span> Transmite<span className="text-orangey">.</span> Descarga<span className="text-blue">.</span>
        </h1>

        <p className="text-base sm:text-xl text-surface-50 max-w-2xl mb-8 leading-relaxed">
          Catálogo en tiempo real sincronizado con JKAnime. Descarga temporadas completas en tu servidor y reproduce en streaming local con respuestas <span className="text-surface-cream font-mono">HTTP 206</span>.
        </p>

        {/* Buscador interactivo */}
        <form onSubmit={handleSearch} className="w-full max-w-2xl relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título (ej. Naruto, Attack on Titan, Solo Leveling)..."
            className="w-full px-6 py-4 pl-12 pr-28 rounded-buttons bg-off-black border border-surface-25 text-surface-cream placeholder:text-surface-50 focus:outline-none focus:border-surface-cream transition-colors text-base"
          />
          <Search className="w-5 h-5 text-surface-50 absolute left-4 top-1/2 -translate-y-1/2" />
          
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 text-surface-50 hover:text-surface-cream transition-colors cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 rounded-buttons border border-surface-cream text-surface-cream text-sm font-semibold hover:opacity-80 transition-opacity cursor-pointer bg-just-black"
            >
              Buscar
            </button>
          </div>
        </form>
      </section>

      <HairlineDivider />

      {/* Sección de Resultados de Búsqueda */}
      {(has_searched || is_searching) && (
        <section className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div>
              <CurlyEyebrow>Búsqueda</CurlyEyebrow>
              <h2 className="text-2xl md:text-3xl font-semibold text-surface-cream">
                Resultados para "{active_query || query}"
              </h2>
            </div>
            {is_searching && <Loader2 className="w-6 h-6 animate-spin text-shockingly-green" />}
          </div>

          {search_results.length === 0 && !is_searching ? (
            <p className="text-surface-50 text-base">No se encontraron animes para esta búsqueda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
              {search_results.map((anime) => (
                <AnimeCard
                  key={anime.slug}
                  slug={anime.slug}
                  title={anime.title}
                  poster_url={anime.poster_url}
                  type={anime.type}
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

          <HairlineDivider />
        </section>
      )}

      {/* Sección de Últimos Lanzamientos / Destacados */}
      <section className="mb-16">
        <div className="mb-8">
          <CurlyEyebrow>Directorio</CurlyEyebrow>
          <h2 className="text-2xl md:text-4xl font-semibold text-surface-cream tracking-tight">
            Últimos Animes y Estrenos
          </h2>
        </div>

        {is_loading_latest ? (
          <div className="flex items-center justify-center py-20 gap-3 text-surface-50 font-mono">
            <Loader2 className="w-6 h-6 animate-spin text-shockingly-green" />
            <span>Cargando directorio de JKAnime...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {latest_animes.map((anime) => (
              <AnimeCard
                key={anime.slug}
                slug={anime.slug}
                title={anime.title}
                poster_url={anime.poster_url}
                type={anime.type}
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
      </section>
    </div>
  );
};

export default HomePage;
