import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Download, Trash2, Bookmark, ArrowLeft, Loader2, HardDrive, Calendar, Clock, Film, Tv } from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import PillButton from '../components/ui/PillButton.js';
import GradientPillButton from '../components/ui/GradientPillButton.js';
import CategoryBadge, { CategoryVariant } from '../components/ui/CategoryBadge.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';

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
  onPlayEpisode: (episode: { id: string; title: string; is_downloaded: boolean; number: number }) => void;
  onEnqueueEpisode: (episode_id: string) => Promise<boolean>;
  onEnqueueSeason: (season_id: string) => Promise<boolean>;
  onEnqueueAnime: (anime_id: string) => Promise<boolean>;
  onDeleteEpisodeFile: (episode_id: string) => Promise<boolean>;
  onToggleWatchlist: (slug: string) => Promise<boolean>;
}

export const AnimeDetailPage: React.FC<AnimeDetailPageProps> = ({
  slug: prop_slug,
  onPlayEpisode,
  onEnqueueEpisode,
  onEnqueueSeason,
  onEnqueueAnime,
  onDeleteEpisodeFile,
  onToggleWatchlist,
}) => {
  const params = useParams<{ slug: string; episode?: string }>();
  const navigate = useNavigate();

  const active_slug = prop_slug || params.slug || '';
  const episode_param = params.episode;

  const [anime, setAnime] = useState<AnimeDetailsData | null>(null);
  const [is_loading, setIsLoading] = useState<boolean>(true);
  const [selected_season_index, setSelectedSeasonIndex] = useState<number>(0);
  const [is_toggling_watchlist, setIsTogglingWatchlist] = useState<boolean>(false);

  const fetchDetails = async () => {
    if (!active_slug) return;
    try {
      const res = await fetch(`/api/anime/${active_slug}`);
      if (res.ok) {
        const data = await res.json();
        setAnime(data);
      }
    } catch (err) {
      console.error('Error fetching anime details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [active_slug]);

  // Si la URL contiene el número de episodio (/anime/:slug/:episode), activar reproducción automática
  useEffect(() => {
    if (anime && episode_param) {
      const ep_num = parseInt(episode_param, 10);
      const all_episodes = anime.seasons.flatMap((s) => s.episodes);
      const matched_ep = all_episodes.find(
        (e) => (!isNaN(ep_num) && e.number === ep_num) || e.id === episode_param
      );

      if (matched_ep) {
        onPlayEpisode({
          id: matched_ep.id,
          title: `${anime.title} — Ep. ${matched_ep.number}`,
          is_downloaded: matched_ep.downloadStatus === 'COMPLETED',
          number: matched_ep.number,
        });
      }
    }
  }, [anime, episode_param]);

  const handleWatchlistClick = async () => {
    if (!anime || is_toggling_watchlist) return;
    setIsTogglingWatchlist(true);
    const new_state = await onToggleWatchlist(anime.slug);
    setAnime((prev) => (prev ? { ...prev, inWatchlist: new_state } : prev));
    setIsTogglingWatchlist(false);
  };

  const handlePlay = (ep: EpisodeItem) => {
    if (!anime) return;
    navigate(`/anime/${anime.slug}/${ep.number}`);
    onPlayEpisode({
      id: ep.id,
      title: `${anime.title} — Ep. ${ep.number}`,
      is_downloaded: ep.downloadStatus === 'COMPLETED',
      number: ep.number,
    });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (is_loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4 text-surface-50">
        <Loader2 className="w-8 h-8 animate-spin text-shockingly-green" />
        <span className="font-mono text-sm">&#123; Obteniendo episodios y ficha técnica desde JKAnime... &#125;</span>
      </div>
    );
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
                  await onEnqueueSeason(current_season.id);
                  fetchDetails();
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
                  await onEnqueueAnime(anime.id);
                  fetchDetails();
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

      {/* Selector de Temporadas */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <CurlyEyebrow>Capítulos</CurlyEyebrow>
          <h2 className="text-2xl md:text-3xl font-semibold text-surface-cream">
            Lista de Episodios
          </h2>
        </div>

        {anime.seasons.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {anime.seasons.map((season, idx) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeasonIndex(idx)}
                className={`px-4 py-2 rounded-buttons text-sm font-semibold transition-all cursor-pointer ${
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

      {/* Lista de Episodios con Preview 16:9 */}
      {current_season && current_season.episodes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {current_season.episodes.map((ep) => {
            const is_completed = ep.downloadStatus === 'COMPLETED';
            const is_downloading = ep.downloadStatus === 'DOWNLOADING';

            return (
              <div
                key={ep.id}
                className="p-3 sm:p-4 rounded-cards bg-off-black border border-surface-25/60 flex items-center justify-between gap-3 sm:gap-4 hover:border-surface-cream/40 transition-colors group"
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
                      className="text-sm font-semibold text-surface-cream truncate cursor-pointer hover:text-shockingly-green transition-colors"
                      title={ep.title}
                    >
                      Episodio {ep.number}: {ep.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-surface-50 mt-1">
                      {is_completed ? (
                        <span className="text-shockingly-green flex items-center gap-1 font-medium">
                          <HardDrive className="w-3 h-3" />
                          Descargado {ep.usedServer ? `(${ep.usedServer})` : ''}
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
                        await onDeleteEpisodeFile(ep.id);
                        fetchDetails();
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
                        await onEnqueueEpisode(ep.id);
                        fetchDetails();
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
      ) : (
        <p className="text-surface-50 py-8">No hay episodios disponibles para esta temporada.</p>
      )}
    </div>
  );
};

export default AnimeDetailPage;
