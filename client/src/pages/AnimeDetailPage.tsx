import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Download,
  Trash2,
  Bookmark,
  ArrowLeft,
  HardDrive,
  Calendar,
  Clock,
  Film,
  Tv,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import PillButton from '../components/ui/PillButton.js';
import GradientPillButton from '../components/ui/GradientPillButton.js';
import CategoryBadge, { CategoryVariant } from '../components/ui/CategoryBadge.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';
import { DetailPageSkeleton, FranchiseSkeleton, Skeleton } from '../components/ui/ShimmerSkeleton.js';

export interface ValidatedFranchiseItem {
  anilistId: number;
  jkanimeSlug: string;
  title: string;
  format: string;
  category: 'season' | 'movie' | 'ova' | 'special';
  seasonNumber?: number;
  year?: number;
  episodes?: number;
  status?: string;
  coverUrl: string;
  localCoverUrl?: string;
}

export interface FranchiseData {
  franchiseName: string;
  seasons: ValidatedFranchiseItem[];
  movies: ValidatedFranchiseItem[];
  ovas: ValidatedFranchiseItem[];
  all: ValidatedFranchiseItem[];
}

export interface EpisodeItem {
  id: string;
  number: number;
  title: string;
  image?: string | null;
  downloadStatus: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  filePath?: string | null;
  fileSizeBytes?: string | null;
  usedServer?: string | null;
}

export interface SeasonItem {
  id: string;
  number: number;
  title: string;
  episodes: EpisodeItem[];
}

export interface AnimeDetailsData {
  id: string;
  slug: string;
  title: string;
  posterUrl: string;
  synopsis: string;
  genres: string[];
  status: string;
  type?: string | null;
  studios?: string | null;
  seasonName?: string | null;
  languages?: string | null;
  episodesCount?: number | null;
  duration?: string | null;
  aired?: string | null;
  inWatchlist: boolean;
  seasons: SeasonItem[];
}

interface AnimeDetailPageProps {
  slug?: string;
  onPlayEpisode?: (episode: {
    id: string;
    title: string;
    is_downloaded: boolean;
    number: number;
    slug?: string;
    poster_url?: string;
  }) => void;
  onEnqueueEpisode: (episode_id: string) => Promise<boolean>;
  onEnqueueSeason: (season_id: string) => Promise<boolean>;
  onEnqueueAnime: (anime_id: string) => Promise<boolean>;
  onDeleteEpisodeFile: (episode_id: string) => Promise<boolean>;
  onToggleWatchlist: (slug: string) => Promise<boolean>;
}

export const AnimeDetailPage: React.FC<AnimeDetailPageProps> = ({
  slug: prop_slug,
  onEnqueueEpisode,
  onEnqueueSeason,
  onEnqueueAnime,
  onDeleteEpisodeFile,
  onToggleWatchlist,
}) => {
  const params = useParams<{ slug: string; episode?: string }>();
  const navigate = useNavigate();

  const active_slug = prop_slug || params.slug || '';

  const [anime, setAnime] = useState<AnimeDetailsData | null>(null);
  const [franchise, setFranchise] = useState<FranchiseData | null>(null);
  const [is_loading, setIsLoading] = useState<boolean>(true);
  const [is_franchise_loading, setIsFranchiseLoading] = useState<boolean>(true);
  const [selected_season_index, setSelectedSeasonIndex] = useState<number>(0);
  const [is_toggling_watchlist, setIsTogglingWatchlist] = useState<boolean>(false);

  // Estados de paginación y búsqueda
  const [current_page, setCurrentPage] = useState<number>(1);
  const [displayed_episodes, setDisplayedEpisodes] = useState<EpisodeItem[]>([]);
  const [is_episodes_loading, setIsEpisodesLoading] = useState<boolean>(false);
  const [search_query, setSearchQuery] = useState<string>('');
  const [search_error, setSearchError] = useState<string | null>(null);
  const [highlighted_episode, setHighlightedEpisode] = useState<number | null>(null);
  const episodes_cache_ref = useRef<Record<number, EpisodeItem[]>>({});

  const fetchDetails = async () => {
    if (!active_slug) return;
    setIsLoading(true);
    if (!franchise) {
      setIsFranchiseLoading(true);
    }
    try {
      const res = await fetch(`/api/anime/${active_slug}`);
      if (res.ok) {
        const data: AnimeDetailsData = await res.json();
        setAnime(data);
        const initial_episodes = data.seasons?.[0]?.episodes || [];
        episodes_cache_ref.current = { 1: initial_episodes };
        setDisplayedEpisodes(initial_episodes);
        setCurrentPage(1);
        setSearchError(null);
        setHighlightedEpisode(null);
      }

      // Cargar información de franquicia de forma no bloqueante con transición sutil
      fetch(`/api/anime/${active_slug}/franchise`)
        .then((r) => (r.ok ? r.json() : null))
        .then((fData) => {
          if (fData) setFranchise(fData);
        })
        .catch(() => {})
        .finally(() => {
          setIsFranchiseLoading(false);
        });
    } catch (err) {
      console.error('Error fetching anime details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [active_slug]);

  // Escuchar eventos SSE de descargas para actualización reactiva en tiempo real sin recarga
  useEffect(() => {
    const event_source = new EventSource('/api/downloads/progress');

    event_source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status && data.episode_id) {
          const matchesEp = (e: EpisodeItem) =>
            e.id === data.episode_id || `${active_slug}-${e.number}` === data.episode_id;

          setDisplayedEpisodes((prev) =>
            prev.map((e) => (matchesEp(e) ? { ...e, downloadStatus: data.status } : e))
          );

          // Actualizar todas las páginas cacheadas en memoria
          for (const page_num in episodes_cache_ref.current) {
            const cached = episodes_cache_ref.current[page_num];
            if (cached) {
              episodes_cache_ref.current[page_num] = cached.map((e) =>
                matchesEp(e) ? { ...e, downloadStatus: data.status } : e
              );
            }
          }
        }
      } catch (err) {
        console.error('Error procesando evento SSE en AnimeDetailPage:', err);
      }
    };

    return () => {
      event_source.close();
    };
  }, [active_slug]);

  const total_episodes =
    anime?.episodesCount ||
    (anime?.seasons?.[selected_season_index]?.episodes?.length ?? 0);
  const total_pages = Math.max(1, Math.ceil(total_episodes / 16));

  const loadEpisodesPage = async (page: number, highlight_num?: number) => {
    if (!anime || page < 1 || page > total_pages) return;

    // Si ya está en la caché en memoria del cliente, respuesta instantánea con 0 peticiones
    if (episodes_cache_ref.current[page]) {
      setDisplayedEpisodes(episodes_cache_ref.current[page]);
      setCurrentPage(page);
      if (highlight_num !== undefined) {
        setHighlightedEpisode(highlight_num);
        setTimeout(() => {
          const el = document.getElementById(`ep-card-${highlight_num}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      }
      return;
    }

    setIsEpisodesLoading(true);
    try {
      const res = await fetch(`/api/anime/${active_slug}/episodes?page=${page}`);
      if (res.ok) {
        const data = await res.json();
        const eps: EpisodeItem[] = data.episodes || [];
        episodes_cache_ref.current[page] = eps;
        setDisplayedEpisodes(eps);
        setCurrentPage(page);
        if (highlight_num !== undefined) {
          setHighlightedEpisode(highlight_num);
          setTimeout(() => {
            const el = document.getElementById(`ep-card-${highlight_num}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        }
      }
    } catch (err) {
      console.error('Error cargando página de episodios:', err);
    } finally {
      setIsEpisodesLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean_val = search_query.trim();
    if (!clean_val) {
      setSearchError(null);
      return;
    }

    const num = parseInt(clean_val, 10);
    if (isNaN(num)) {
      setSearchError('Ingresa un número válido de capítulo.');
      return;
    }

    // Validación estricta en frontend con la cantidad total de capítulos conocida
    if (num < 1 || num > total_episodes) {
      setSearchError(`El anime solo cuenta con ${total_episodes} capítulos (rango 1 - ${total_episodes}).`);
      // EXACTAMENTE 0 peticiones http innecesarias al servidor
      return;
    }

    setSearchError(null);
    const target_page = Math.ceil(num / 16);
    loadEpisodesPage(target_page, num);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchError(null);
      setHighlightedEpisode(null);
    } else {
      const num = parseInt(val.trim(), 10);
      if (!isNaN(num) && (num < 1 || num > total_episodes)) {
        setSearchError(`Capítulo fuera de rango (1 - ${total_episodes}).`);
      } else {
        setSearchError(null);
      }
    }
  };

  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis', total];
    }
    if (current >= total - 3) {
      return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
  };

  const handleWatchlistClick = async () => {
    if (!anime || is_toggling_watchlist) return;
    setIsTogglingWatchlist(true);
    const new_state = await onToggleWatchlist(anime.slug);
    setAnime((prev) => (prev ? { ...prev, inWatchlist: new_state } : prev));
    setIsTogglingWatchlist(false);
  };

  const handlePlay = (ep: EpisodeItem) => {
    if (!anime) return;
    // Navegación a página dedicada de reproducción (nunca modal encima de anime)
    navigate(`/anime/${anime.slug}/${ep.number}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (is_loading) {
    return <DetailPageSkeleton />;
  }

  if (!anime) {
    return (
      <div className="py-20 text-center">
        <h3 className="text-2xl font-semibold text-surface-cream mb-4">No se pudo cargar la información</h3>
        <PillButton onClick={handleBack}>
          <ArrowLeft className="w-4 h-4" /> Volver al catálogo
        </PillButton>
      </div>
    );
  }

  const current_season = anime.seasons[selected_season_index] || anime.seasons[0];
  const genres_variants: CategoryVariant[] = ['green', 'orange', 'pink', 'lilac', 'blue'];
  const is_concluido = anime.status.toLowerCase().includes('concluid');

  return (
    <div className="w-full py-6 md:py-10">
      {/* Botón de retroceso */}
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-2 text-surface-50 hover:text-surface-cream mb-8 transition-colors text-sm font-semibold cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      {/* Header del Anime */}
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        {/* Póster */}
        <div className="w-full sm:w-64 lg:w-72 flex-shrink-0 aspect-[3/4] rounded-cards overflow-hidden border border-surface-25 shadow-none bg-off-black">
          <img
            src={anime.posterUrl}
            alt={anime.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Información y Acciones */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                is_concluido
                  ? 'border-shockingly-green/40 text-shockingly-green bg-shockingly-green/10'
                  : 'border-orangey/40 text-orangey bg-orangey/10'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {anime.status}
            </span>

            {anime.type && (
              <span className="text-xs font-mono text-surface-50 px-2 py-0.5 rounded border border-surface-25">
                {anime.type}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-semibold text-surface-cream tracking-tight mb-4 leading-tight">
            {anime.title}
          </h1>

          {/* Badges de Géneros */}
          <div className="flex flex-wrap gap-2 mb-6">
            {anime.genres.map((genre, idx) => (
              <CategoryBadge
                key={genre}
                label={genre}
                variant={genres_variants[idx % genres_variants.length]}
              />
            ))}
          </div>

          <p className="text-surface-50 text-base md:text-lg leading-relaxed mb-6 max-w-3xl">
            {anime.synopsis || 'Sin sinopsis disponible.'}
          </p>

          {/* Ficha de datos (card.mt-3.anime_data.pc) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-cards bg-off-black/80 border border-surface-25 text-xs text-surface-50 mb-8 max-w-3xl">
            <div>
              <span className="text-surface-cream/50 block font-medium mb-0.5">Estado</span>
              <span className={is_concluido ? 'text-shockingly-green font-semibold' : 'text-orangey font-semibold'}>
                {anime.status}
              </span>
            </div>
            <div>
              <span className="text-surface-cream/50 block font-medium mb-0.5">
                <Tv className="w-3.5 h-3.5 inline mr-1 text-surface-cream/60" />
                Tipo
              </span>
              <span className="text-surface-cream font-medium">{anime.type || 'Serie'}</span>
            </div>
            {anime.studios && (
              <div>
                <span className="text-surface-cream/50 block font-medium mb-0.5">
                  <Film className="w-3.5 h-3.5 inline mr-1 text-surface-cream/60" />
                  Estudios
                </span>
                <span className="text-surface-cream font-medium">{anime.studios}</span>
              </div>
            )}
            {anime.seasonName && (
              <div>
                <span className="text-surface-cream/50 block font-medium mb-0.5">
                  <Calendar className="w-3.5 h-3.5 inline mr-1 text-surface-cream/60" />
                  Temporada
                </span>
                <span className="text-surface-cream font-medium">{anime.seasonName}</span>
              </div>
            )}
            {anime.languages && (
              <div>
                <span className="text-surface-cream/50 block font-medium mb-0.5">Idiomas</span>
                <span className="text-surface-cream font-medium">{anime.languages}</span>
              </div>
            )}
            <div>
              <span className="text-surface-cream/50 block font-medium mb-0.5">Episodios</span>
              <span className="text-surface-cream font-medium">
                {anime.episodesCount || (current_season?.episodes.length ?? 0)}
              </span>
            </div>
            {anime.duration && (
              <div>
                <span className="text-surface-cream/50 block font-medium mb-0.5">
                  <Clock className="w-3.5 h-3.5 inline mr-1 text-surface-cream/60" />
                  Duración
                </span>
                <span className="text-surface-cream font-medium">{anime.duration}</span>
              </div>
            )}
            {anime.aired && (
              <div className="col-span-2">
                <span className="text-surface-cream/50 block font-medium mb-0.5">
                  <Calendar className="w-3.5 h-3.5 inline mr-1 text-surface-cream/60" />
                  Emitido
                </span>
                <span className="text-surface-cream font-medium">{anime.aired}</span>
              </div>
            )}
          </div>

          {/* Acciones principales */}
          <div className="flex flex-wrap gap-4 items-center">
            {current_season && (
              <GradientPillButton
                onClick={async () => {
                  setDisplayedEpisodes((prev) =>
                    prev.map((e) =>
                      e.downloadStatus !== 'COMPLETED' ? { ...e, downloadStatus: 'DOWNLOADING' } : e
                    )
                  );
                  await onEnqueueSeason(current_season.id);
                }}
              >
                <Download className="w-4 h-4 text-shockingly-green" />
                Descargar Temporada
              </GradientPillButton>
            )}

            <PillButton onClick={handleWatchlistClick}>
              <Bookmark className={`w-4 h-4 ${anime.inWatchlist ? 'fill-shockingly-green text-shockingly-green' : ''}`} />
              {anime.inWatchlist ? 'En mi biblioteca' : 'Agregar a biblioteca'}
            </PillButton>

            {anime.seasons.length > 1 && (
              <PillButton
                onClick={async () => {
                  setDisplayedEpisodes((prev) =>
                    prev.map((e) =>
                      e.downloadStatus !== 'COMPLETED' ? { ...e, downloadStatus: 'DOWNLOADING' } : e
                    )
                  );
                  await onEnqueueAnime(anime.id);
                }}
              >
                <Download className="w-4 h-4" />
                Descargar Todas las Temporadas
              </PillButton>
            )}
          </div>
        </div>
      </div>

      <HairlineDivider />

      {/* Selector de Franquicia (Temporadas, Películas, OVAs) */}
      {is_franchise_loading ? (
        <FranchiseSkeleton />
      ) : franchise && franchise.all.length > 1 ? (
        <section className="mb-10 space-y-4 transition-opacity duration-500 ease-out">
          <div>
            <CurlyEyebrow text="Franquicia" />
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
              UNIVERSO Y CONTENIDO DE LA FRANQUICIA
            </h2>
          </div>

          <div className="space-y-6 bg-off-black/40 border border-surface-25/50 p-4 md:p-6 rounded-2xl">
            {/* Temporadas de la franquicia */}
            {franchise.seasons.length > 0 && (
              <div>
                <span className="text-xs font-mono text-surface-50 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-shockingly-green" />
                  Temporadas ({franchise.seasons.length})
                </span>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {franchise.seasons.map((item) => {
                    const isCurrent = item.jkanimeSlug === active_slug;
                    return (
                      <button
                        key={item.jkanimeSlug}
                        type="button"
                        onClick={() => {
                          if (!isCurrent) {
                            navigate(`/anime/${item.jkanimeSlug}`);
                          }
                        }}
                        className={`flex items-center gap-3 p-2.5 pr-4 rounded-xl border text-left transition-all cursor-pointer flex-shrink-0 max-w-xs ${
                          isCurrent
                            ? 'border-shockingly-green bg-shockingly-green/10 text-surface-cream ring-1 ring-shockingly-green/30'
                            : 'border-surface-25 bg-off-black/70 hover:border-surface-cream/50 text-surface-50 hover:text-surface-cream'
                        }`}
                      >
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="w-11 h-15 object-cover rounded bg-surface-25/50 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${item.jkanimeSlug}.jpg`;
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold line-clamp-1">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            {item.year && <span className="font-mono">{item.year}</span>}
                            {item.status && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-25 text-surface-cream/80">
                                {item.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Películas de la franquicia */}
            {franchise.movies.length > 0 && (
              <div>
                <span className="text-xs font-mono text-surface-50 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-shockingly-green" />
                  Películas ({franchise.movies.length})
                </span>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {franchise.movies.map((item) => {
                    const isCurrent = item.jkanimeSlug === active_slug;
                    return (
                      <button
                        key={item.jkanimeSlug}
                        type="button"
                        onClick={() => {
                          if (!isCurrent) {
                            navigate(`/anime/${item.jkanimeSlug}`);
                          }
                        }}
                        className={`flex items-center gap-3 p-2.5 pr-4 rounded-xl border text-left transition-all cursor-pointer flex-shrink-0 max-w-xs ${
                          isCurrent
                            ? 'border-shockingly-green bg-shockingly-green/10 text-surface-cream ring-1 ring-shockingly-green/30'
                            : 'border-surface-25 bg-off-black/70 hover:border-surface-cream/50 text-surface-50 hover:text-surface-cream'
                        }`}
                      >
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="w-11 h-15 object-cover rounded bg-surface-25/50 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${item.jkanimeSlug}.jpg`;
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold line-clamp-1">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            {item.year && <span className="font-mono">{item.year}</span>}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-25 text-surface-cream/80">
                              Película
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OVAs y Especiales de la franquicia */}
            {franchise.ovas.length > 0 && (
              <div>
                <span className="text-xs font-mono text-surface-50 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-shockingly-green" />
                  OVAs y Especiales ({franchise.ovas.length})
                </span>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {franchise.ovas.map((item) => {
                    const isCurrent = item.jkanimeSlug === active_slug;
                    return (
                      <button
                        key={item.jkanimeSlug}
                        type="button"
                        onClick={() => {
                          if (!isCurrent) {
                            navigate(`/anime/${item.jkanimeSlug}`);
                          }
                        }}
                        className={`flex items-center gap-3 p-2.5 pr-4 rounded-xl border text-left transition-all cursor-pointer flex-shrink-0 max-w-xs ${
                          isCurrent
                            ? 'border-shockingly-green bg-shockingly-green/10 text-surface-cream ring-1 ring-shockingly-green/30'
                            : 'border-surface-25 bg-off-black/70 hover:border-surface-cream/50 text-surface-50 hover:text-surface-cream'
                        }`}
                      >
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="w-11 h-15 object-cover rounded bg-surface-25/50 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${item.jkanimeSlug}.jpg`;
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold line-clamp-1">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs">
                            {item.year && <span className="font-mono">{item.year}</span>}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-25 text-surface-cream/80">
                              {item.format}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {/* Header de la sección de episodios: Título + Buscador + Temporadas */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <CurlyEyebrow>Capítulos</CurlyEyebrow>
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-2xl md:text-3xl font-semibold text-surface-cream">
                Lista de Episodios
              </h2>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border border-surface-25 text-surface-50 bg-off-black">
                {total_episodes} {total_episodes === 1 ? 'capítulo' : 'capítulos'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Buscador de capítulo con validación estricta en frontend */}
            <div className="relative">
              <form onSubmit={handleSearchSubmit} className="relative flex items-center">
                <Search className="w-4 h-4 text-surface-50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="number"
                  min="1"
                  max={total_episodes}
                  placeholder={`Buscar cap. (1 - ${total_episodes})`}
                  value={search_query}
                  onChange={handleSearchChange}
                  className="pl-9 pr-14 py-2 text-xs sm:text-sm bg-off-black border border-surface-25 rounded-full text-surface-cream placeholder:text-surface-50/60 focus:outline-none focus:border-shockingly-green transition-colors w-full sm:w-60"
                />
                <button
                  type="submit"
                  disabled={!search_query.trim()}
                  className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-semibold rounded-full bg-shockingly-green text-just-black hover:bg-shockingly-green/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Buscar
                </button>
              </form>

              {search_error && (
                <div className="absolute top-full left-0 mt-1.5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-just-black border border-orangey/60 text-xs text-orangey shadow-lg">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{search_error}</span>
                </div>
              )}
            </div>

            {/* Selector de Temporadas si el anime cuenta con más de una */}
            {anime.seasons.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                {anime.seasons.map((season, idx) => (
                  <button
                    key={season.id}
                    onClick={() => {
                      setSelectedSeasonIndex(idx);
                      episodes_cache_ref.current = {};
                      setDisplayedEpisodes(season.episodes || []);
                      setCurrentPage(1);
                      setSearchQuery('');
                      setSearchError(null);
                      setHighlightedEpisode(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      selected_season_index === idx
                        ? 'border border-surface-cream text-surface-cream bg-off-black'
                        : 'text-surface-50 hover:text-surface-cream border border-surface-25'
                    }`}
                  >
                    {season.title || `Temporada ${season.number}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid de Episodios con Preview 16:9 y Paginación (16 por página) */}
      {is_episodes_loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="p-3 sm:p-4 rounded-cards bg-off-black border border-surface-25/40 flex items-center gap-3 sm:gap-4 animate-pulse"
            >
              <Skeleton className="w-24 sm:w-36 aspect-video rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-3/4 h-4 rounded" />
                <Skeleton className="w-1/2 h-3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed_episodes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayed_episodes.map((ep) => {
              const is_completed = ep.downloadStatus === 'COMPLETED';
              const is_downloading = ep.downloadStatus === 'DOWNLOADING';
              const is_highlighted = highlighted_episode === ep.number;

              return (
                <div
                  key={ep.id}
                  id={`ep-card-${ep.number}`}
                  className={`p-3 sm:p-4 rounded-cards bg-off-black border transition-all duration-300 flex items-center justify-between gap-3 sm:gap-4 group ${
                    is_highlighted
                      ? 'border-shockingly-green bg-shockingly-green/10 ring-2 ring-shockingly-green/40 shadow-lg shadow-shockingly-green/10'
                      : 'border-surface-25/60 hover:border-surface-cream/40'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Preview Thumbnail 16:9 con Play Overlay */}
                    <div
                      onClick={() => handlePlay(ep)}
                      className="w-24 sm:w-36 aspect-video rounded-lg overflow-hidden relative flex-shrink-0 bg-off-black border border-surface-25 cursor-pointer"
                    >
                      <img
                        src={ep.image || anime.posterUrl}
                        alt={ep.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = anime.posterUrl;
                        }}
                      />
                      <div className="absolute inset-0 bg-just-black/40 group-hover:bg-just-black/20 flex items-center justify-center transition-colors">
                        <div className="w-8 h-8 rounded-full bg-just-black/70 border border-surface-cream/80 flex items-center justify-center text-surface-cream group-hover:border-shockingly-green group-hover:text-shockingly-green transition-colors">
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        </div>
                      </div>
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-just-black/80 text-surface-cream rounded">
                        E{ep.number}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4
                        onClick={() => handlePlay(ep)}
                        className={`text-sm font-semibold truncate cursor-pointer transition-colors ${
                          is_highlighted
                            ? 'text-shockingly-green font-bold'
                            : 'text-surface-cream hover:text-shockingly-green'
                        }`}
                        title={ep.title}
                      >
                        Episodio {ep.number}: {ep.title}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-surface-50 mt-1">
                        {is_completed ? (
                          <span className="text-shockingly-green flex items-center gap-1 font-medium">
                            <HardDrive className="w-3 h-3" />
                            Descargado
                          </span>
                        ) : is_downloading ? (
                          <span className="text-orangey font-medium animate-pulse">
                            Descargando...
                          </span>
                        ) : (
                          <span>Disponible para streaming</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones del episodio */}
                  <div className="flex items-center gap-2">
                    {is_completed ? (
                      <button
                        title="Eliminar del servidor"
                        onClick={async () => {
                          setDisplayedEpisodes((prev) =>
                            prev.map((e) => (e.id === ep.id ? { ...e, downloadStatus: 'PENDING' } : e))
                          );
                          if (episodes_cache_ref.current[current_page]) {
                            episodes_cache_ref.current[current_page] = episodes_cache_ref.current[
                              current_page
                            ].map((e) => (e.id === ep.id ? { ...e, downloadStatus: 'PENDING' } : e));
                          }
                          await onDeleteEpisodeFile(ep.id);
                        }}
                        className="p-2 rounded-full border border-surface-25 text-surface-50 hover:text-orangey hover:border-orangey transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        title="Descargar en servidor"
                        disabled={is_downloading}
                        onClick={async () => {
                          setDisplayedEpisodes((prev) =>
                            prev.map((e) => (e.id === ep.id ? { ...e, downloadStatus: 'DOWNLOADING' } : e))
                          );
                          if (episodes_cache_ref.current[current_page]) {
                            episodes_cache_ref.current[current_page] = episodes_cache_ref.current[
                              current_page
                            ].map((e) => (e.id === ep.id ? { ...e, downloadStatus: 'DOWNLOADING' } : e));
                          }
                          await onEnqueueEpisode(ep.id);
                        }}
                        className="p-2 rounded-full border border-surface-25 text-surface-cream hover:border-shockingly-green hover:text-shockingly-green transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra de Paginación Numerada (Máx 16 capítulos por página) */}
          {total_pages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-surface-25/50">
              <div className="text-xs sm:text-sm text-surface-50 font-mono">
                Mostrando episodios{' '}
                <span className="text-surface-cream font-medium">
                  {Math.min((current_page - 1) * 16 + 1, total_episodes)}
                </span>{' '}
                -{' '}
                <span className="text-surface-cream font-medium">
                  {Math.min(current_page * 16, total_episodes)}
                </span>{' '}
                de{' '}
                <span className="text-surface-cream font-medium">
                  {total_episodes}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <button
                  type="button"
                  disabled={current_page <= 1 || is_episodes_loading}
                  onClick={() => loadEpisodesPage(current_page - 1)}
                  className="px-3.5 py-1.5 rounded-full border border-surface-25 text-surface-cream text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-surface-cream cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                {getPageNumbers(current_page, total_pages).map((p, idx) => {
                  if (p === 'ellipsis') {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-surface-50 text-xs font-mono select-none"
                      >
                        ...
                      </span>
                    );
                  }
                  const is_active = p === current_page;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={is_episodes_loading}
                      onClick={() => loadEpisodesPage(p)}
                      className={`min-w-8 h-8 px-2 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer flex items-center justify-center ${
                        is_active
                          ? 'border border-shockingly-green bg-shockingly-green/10 text-shockingly-green ring-1 ring-shockingly-green/30'
                          : 'border border-surface-25 text-surface-50 hover:text-surface-cream hover:border-surface-cream bg-off-black'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={current_page >= total_pages || is_episodes_loading}
                  onClick={() => loadEpisodesPage(current_page + 1)}
                  className="px-3.5 py-1.5 rounded-full border border-surface-25 text-surface-cream text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-surface-cream cursor-pointer"
                  title="Página siguiente"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-surface-50 py-8 text-center bg-off-black rounded-cards border border-surface-25">
          No hay episodios disponibles para esta temporada.
        </p>
      )}
    </div>
  );
};

export default AnimeDetailPage;
