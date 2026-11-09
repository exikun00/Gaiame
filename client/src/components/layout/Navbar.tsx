import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Play, Download, Bookmark, Search, Clock, X } from 'lucide-react';

interface NavbarProps {
  active_downloads_count: number;
}

interface SearchItem {
  slug: string;
  title: string;
  poster_url: string;
  type?: string;
  status?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ active_downloads_count }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Búsqueda con debounce de 300ms
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    setIsOpen(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/anime/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error('Error buscando anime en Navbar:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectAnime = (slug: string) => {
    setIsOpen(false);
    setSearchQuery('');
    navigate(`/anime/${slug}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-sm md:text-base font-normal rounded-buttons transition-colors duration-200 cursor-pointer flex items-center gap-2 border ${
      isActive
        ? 'text-shockingly-green border-shockingly-green/40 bg-shockingly-green/10 font-medium'
        : 'text-surface-50 border-transparent hover:text-surface-cream hover:bg-white/[0.03]'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full bg-just-black/90 backdrop-blur-md border-b border-surface-25">
      <div className="max-w-page mx-auto px-4 md:px-8 h-18 flex items-center justify-between gap-4">
        {/* Brand Wordmark */}
        <Link
          to="/"
          className="flex items-center gap-2 group text-left cursor-pointer flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-full border border-shockingly-green flex items-center justify-center text-shockingly-green">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
          <span className="text-2xl font-semibold tracking-tighter text-surface-cream group-hover:text-shockingly-green transition-colors">
            GAIAME<span className="text-shockingly-green">.</span>
          </span>
        </Link>

        {/* Centro/Derecha: Ghost Nav Links & Search Dropdown */}
        <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end">
          <nav className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/" end className={navClass}>
              <span>Inicio</span>
            </NavLink>

            <NavLink to="/library" className={navClass}>
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Biblioteca</span>
            </NavLink>

            <NavLink to="/history" className={navClass}>
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Historial</span>
            </NavLink>

            <NavLink to="/downloads" className={navClass}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargas</span>
              {active_downloads_count > 0 && (
                <span className="w-2 h-2 rounded-full bg-shockingly-green animate-pulse" />
              )}
            </NavLink>
          </nav>

          {/* Barra de búsqueda superior derecha con Dropdown interactivo */}
          <div className="relative w-44 sm:w-60 md:w-72" ref={dropdownRef}>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-surface-50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchQuery.trim().length > 0) setIsOpen(true);
                }}
                placeholder="Buscar anime..."
                className="w-full bg-off-black border border-surface-25 focus:border-shockingly-green text-surface-cream text-sm rounded-buttons pl-9 pr-8 py-2 outline-none transition-colors placeholder:text-surface-50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsOpen(false);
                  }}
                  className="absolute right-2.5 text-surface-50 hover:text-surface-cream p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Menú desplegable con resultados */}
            {isOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-84 md:w-96 max-h-[440px] overflow-y-auto bg-off-black/95 backdrop-blur-md border border-surface-25 rounded-2xl shadow-2xl p-2 z-50 divide-y divide-surface-25/40">
                {isSearching ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-3 items-center animate-shimmer p-2 rounded-xl">
                        <div className="w-10 h-14 bg-surface-25/50 rounded flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="w-3/4 h-3.5 bg-surface-25/50 rounded" />
                          <div className="w-1/2 h-3 bg-surface-25/50 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : results.length > 0 ? (
                  <div className="py-1">
                    {results.map((item) => {
                      const isAir = item.status?.toLowerCase().includes('emisi');
                      return (
                        <div
                          key={item.slug}
                          onClick={() => handleSelectAnime(item.slug)}
                          className="flex items-center gap-3 p-2.5 hover:bg-surface-25/40 rounded-xl cursor-pointer transition-colors group"
                        >
                          <img
                            src={item.poster_url}
                            alt={item.title}
                            className="w-11 h-15 object-cover rounded flex-shrink-0 bg-surface-25/40"
                            loading="lazy"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${item.slug}.jpg`;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-surface-cream group-hover:text-shockingly-green transition-colors truncate">
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {item.type && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-25/60 text-surface-cream/80">
                                  {item.type}
                                </span>
                              )}
                              {item.status && (
                                <span
                                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                                    isAir
                                      ? 'text-shockingly-green bg-shockingly-green/10 border-shockingly-green/30'
                                      : 'text-surface-50 bg-off-black border-surface-25'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-surface-50 font-mono">
                    No se encontraron animes para "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
