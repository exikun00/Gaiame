import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Info,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Film,
} from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import AnimeCard from '../components/anime/AnimeCard.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';
import {
  HeroSkeleton,
  EpisodeCardsSkeleton,
  AnimeGridSkeleton,
} from '../components/ui/ShimmerSkeleton.js';

interface HeroSlide {
  slug: string;
  title: string;
  backdrop_url: string;
  synopsis: string;
  type: string;
  status: string;
  details_slug: string;
  latest_episode?: number;
}

interface RecentEpisodeRelease {
  slug: string;
  title: string;
  poster_url: string;
  episode_number: number;
  time_ago?: string;
}

interface OvaRelease {
  slug: string;
  title: string;
  poster_url: string;
  episode_number: number;
  badge: string;
}

interface AnimeItem {
  slug: string;
  title: string;
  poster_url: string;
  type?: string;
  status?: string;
}

interface WatchHistoryItem {
  id: string;
  animeSlug: string;
  animeTitle: string;
  posterUrl: string;
  episodeNum: number;
  episodeId?: string | null;
  progressSec: number;
  durationSec: number;
  completed: boolean;
  updatedAt: string;
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
  const navigate = useNavigate();

  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [isSlidePaused, setIsSlidePaused] = useState<boolean>(false);

  const [historyItems, setHistoryItems] = useState<WatchHistoryItem[]>([]);
  const [recentEpisodes, setRecentEpisodes] = useState<RecentEpisodeRelease[]>([]);
  const [ovas, setOvas] = useState<OvaRelease[]>([]);
  const [trending, setTrending] = useState<AnimeItem[]>([]);

  const [isLoadingHome, setIsLoadingHome] = useState<boolean>(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  // Cargar contenido completo del Home
  useEffect(() => {
    let isMounted = true;
    const fetchHomeContent = async () => {
      try {
        const res = await fetch('/api/anime/home');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHeroSlides(data.hero || []);
            setRecentEpisodes(data.recent_episodes || []);
            setOvas(data.ovas || []);
            setTrending(data.trending || []);
          }
        }
      } catch (err) {
        console.error('Error cargando contenido de inicio:', err);
      } finally {
        if (isMounted) setIsLoadingHome(false);
      }
    };

    fetchHomeContent();
    return () => {
      isMounted = false;
    };
  }, []);

  // Cargar historial de visualización reciente para "Continuar Mirando"
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/history?limit=12&sort=date&order=desc');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHistoryItems(data.history || []);
          }
        }
      } catch (err) {
        console.error('Error cargando historial reciente:', err);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  // Rotación automática del Hero Slider (7 segundos)
  useEffect(() => {
    if (heroSlides.length <= 1 || isSlidePaused) return;

    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 7000);

    return () => clearInterval(interval);
  }, [heroSlides.length, isSlidePaused]);

  const handlePrevSlide = () => {
    setCurrentSlideIndex((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
  };

  const handleNextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % heroSlides.length);
  };

  const activeSlide = heroSlides[currentSlideIndex];

  return (
    <div className="py-6 space-y-12">
      {/* 1. HERO CAROUSEL (Inspirado en home1.png con diseño Gaiame) */}
      {isLoadingHome ? (
        <HeroSkeleton />
      ) : activeSlide ? (
        <section
          className="relative w-full h-[380px] sm:h-[440px] md:h-[500px] rounded-3xl overflow-hidden border border-surface-25/40 shadow-2xl group transition-all"
          onMouseEnter={() => setIsSlidePaused(true)}
          onMouseLeave={() => setIsSlidePaused(false)}
        >
          {/* Imagen de fondo / Backdrop con fallback */}
          <img
            src={activeSlide.backdrop_url}
            alt={activeSlide.title}
            className="absolute inset-0 w-full h-full object-cover object-center transform transition-transform duration-1000 scale-105 group-hover:scale-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${activeSlide.slug}.jpg`;
            }}
          />

          {/* Gradientes oscuros para legibilidad y elegancia */}
          <div className="absolute inset-0 bg-gradient-to-t from-just-black via-just-black/60 to-just-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-just-black/90 via-just-black/40 to-transparent" />

          {/* Flechas de navegación en la esquina superior derecha */}
          {heroSlides.length > 1 && (
            <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevSlide}
                className="w-10 h-10 rounded-full bg-just-black/70 hover:bg-off-black border border-surface-25 hover:border-surface-cream text-surface-cream flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm shadow-lg active:scale-95"
                title="Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextSlide}
                className="w-10 h-10 rounded-full bg-just-black/70 hover:bg-off-black border border-surface-25 hover:border-surface-cream text-surface-cream flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm shadow-lg active:scale-95"
                title="Siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Información principal de la portada (Badges, Título, Sinopsis, Botones) */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 z-10 flex flex-col justify-end max-w-3xl">
            {/* Badges de Formato y Estado */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {activeSlide.type && (
                <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-full bg-off-black/80 border border-surface-25 text-surface-cream">
                  <Film className="w-3 h-3 text-shockingly-green" />
                  {activeSlide.type}
                </span>
              )}
              {activeSlide.status && (
                <span
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-full border ${
                    activeSlide.status.toLowerCase().includes('emisi')
                      ? 'bg-shockingly-green/10 text-shockingly-green border-shockingly-green/30'
                      : 'bg-off-black/80 text-surface-50 border-surface-25'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {activeSlide.status}
                </span>
              )}
            </div>

            {/* Título de la obra */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight text-surface-cream mb-3 drop-shadow-md line-clamp-2">
              {activeSlide.title}
            </h1>

            {/* Sinopsis limitada */}
            {activeSlide.synopsis && (
              <p className="text-sm md:text-base text-surface-cream/80 max-w-2xl line-clamp-2 md:line-clamp-3 mb-6 leading-relaxed">
                {activeSlide.synopsis}
              </p>
            )}

            {/* Botones de acción: Detalles y Ver ahora */}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={() => onSelectAnime(activeSlide.details_slug || activeSlide.slug)}
                className="px-6 py-2.5 rounded-full bg-surface-25/80 hover:bg-surface-25 text-surface-cream font-medium text-sm md:text-base flex items-center gap-2 border border-surface-50/30 transition-all cursor-pointer backdrop-blur-sm"
              >
                <Info className="w-4 h-4" />
                <span>DETALLES</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const ep = activeSlide.latest_episode || 1;
                  navigate(`/anime/${activeSlide.details_slug || activeSlide.slug}/${ep}`);
                }}
                className="px-6 py-2.5 rounded-full bg-shockingly-green hover:bg-light-green text-just-black font-semibold text-sm md:text-base flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-shockingly-green/20"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>VER AHORA</span>
              </button>
            </div>
          </div>

          {/* Indicadores / Puntos de paginación inferiores */}
          {heroSlides.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-1.5">
              {heroSlides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentSlideIndex
                      ? 'w-6 bg-shockingly-green'
                      : 'w-1.5 bg-surface-cream/30 hover:bg-surface-cream/60'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 2. CONTINUAR MIRANDO (Historial con progreso y botón 'Ver todo') */}
      {(!isLoadingHistory && historyItems.length > 0) || isLoadingHistory ? (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <CurlyEyebrow text="Continuar Mirando" />
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
                CONTINUAR MIRANDO...
              </h2>
            </div>

            <button
              type="button"
              onClick={() => navigate('/history')}
              className="px-4 py-1.5 rounded-full bg-shockingly-green/10 hover:bg-shockingly-green/20 text-shockingly-green border border-shockingly-green/30 text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Ver todo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {isLoadingHistory ? (
            <EpisodeCardsSkeleton count={6} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {historyItems.slice(0, 6).map((item) => {
                const progressPct =
                  item.durationSec > 0
                    ? Math.min(100, Math.round((item.progressSec / item.durationSec) * 100))
                    : 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/anime/${item.animeSlug}/${item.episodeNum}`)}
                    className="group cursor-pointer flex flex-col gap-2"
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-off-black border border-surface-25/50 group-hover:border-shockingly-green/50 transition-colors">
                      <img
                        src={item.posterUrl}
                        alt={`${item.animeTitle} - Ep ${item.episodeNum}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${item.animeSlug}.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-just-black/80 via-transparent to-transparent" />

                      {/* Badge Episodio */}
                      <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-semibold rounded bg-shockingly-green text-just-black font-mono">
                        Episodio {item.episodeNum}
                      </span>

                      {/* Icono de Reproducción al hover */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-just-black/80 border border-shockingly-green flex items-center justify-center text-shockingly-green shadow-lg">
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </div>
                      </div>

                      {/* Barra inferior de progreso */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-25/80">
                        <div
                          className="h-full bg-orangey transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    <h4 className="text-sm font-medium text-surface-cream group-hover:text-shockingly-green transition-colors truncate">
                      {item.animeTitle}
                    </h4>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      <HairlineDivider />

      {/* 3. EPISODIOS RECIENTES (Tab 0 de JKAnime) */}
      <section className="space-y-4">
        <div>
          <CurlyEyebrow text="Episodios Recientes" />
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
            ÚLTIMOS EPISODIOS EMITIDOS
          </h2>
        </div>

        {isLoadingHome ? (
          <EpisodeCardsSkeleton count={12} />
        ) : recentEpisodes.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recentEpisodes.map((ep, idx) => (
              <div
                key={`${ep.slug}-${ep.episode_number}-${idx}`}
                onClick={() => navigate(`/anime/${ep.slug}/${ep.episode_number}`)}
                className="group cursor-pointer flex flex-col gap-2"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-off-black border border-surface-25/50 group-hover:border-shockingly-green/50 transition-colors">
                  <img
                    src={ep.poster_url}
                    alt={`${ep.title} - ${ep.episode_number}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${ep.slug}.jpg`;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-just-black/70 via-transparent to-transparent" />

                  {/* Badge Episodio y Fecha */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-shockingly-green text-just-black">
                      Ep {ep.episode_number}
                    </span>
                    {ep.time_ago && (
                      <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-just-black/70 text-surface-50 border border-surface-25">
                        {ep.time_ago}
                      </span>
                    )}
                  </div>

                  {/* Play hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-just-black/80 border border-shockingly-green flex items-center justify-center text-shockingly-green shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-medium text-surface-cream group-hover:text-shockingly-green transition-colors truncate">
                  {ep.title}
                </h4>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-surface-50 font-mono">
            No hay episodios recientes disponibles en este momento.
          </div>
        )}
      </section>

      <HairlineDivider />

      {/* 4. OVAS Y ESPECIALES (Tab 3 de JKAnime) */}
      <section className="space-y-4">
        <div>
          <CurlyEyebrow text="Ovas y Especiales" />
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
            OVAS, ONAS Y EMISIONES ESPECIALES
          </h2>
        </div>

        {isLoadingHome ? (
          <EpisodeCardsSkeleton count={6} />
        ) : ovas.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {ovas.map((ova, idx) => (
              <div
                key={`${ova.slug}-${ova.episode_number}-${idx}`}
                onClick={() => navigate(`/anime/${ova.slug}/${ova.episode_number}`)}
                className="group cursor-pointer flex flex-col gap-2"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-off-black border border-surface-25/50 group-hover:border-shockingly-green/50 transition-colors">
                  <img
                    src={ova.poster_url}
                    alt={`${ova.title}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${ova.slug}.jpg`;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-just-black/70 via-transparent to-transparent" />

                  {/* Badge OVA / ONA */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-semibold rounded bg-shockingly-green text-just-black font-mono">
                    {ova.badge}
                  </span>

                  {/* Play hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-just-black/80 border border-shockingly-green flex items-center justify-center text-shockingly-green shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <h4 className="text-sm font-medium text-surface-cream group-hover:text-shockingly-green transition-colors truncate">
                  {ova.title}
                </h4>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <HairlineDivider />

      {/* 5. TENDENCIAS / ANIMES RECIENTES (.trending_div) */}
      <section className="space-y-4">
        <div>
          <CurlyEyebrow text="Tendencias" />
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
            ANIMES DESTACADOS
          </h2>
        </div>

        {isLoadingHome ? (
          <AnimeGridSkeleton count={10} />
        ) : trending.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {trending.map((anime) => (
              <AnimeCard
                key={anime.slug}
                slug={anime.slug}
                title={anime.title}
                poster_url={anime.poster_url}
                type={anime.type}
                in_watchlist={watchlist_slugs.has(anime.slug)}
                onSelect={() => onSelectAnime(anime.slug)}
                onToggleWatchlist={() => onToggleWatchlist(anime.slug)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default HomePage;
