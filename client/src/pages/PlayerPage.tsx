import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Hls from 'hls.js';
import {
  Play,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  AlertCircle,
  Server,
  Download,
  Check,
  Loader2,
  Film,
} from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import ServerBadge from '../components/ui/ServerBadge.js';

interface ServerOption {
  server: string;
  raw_url: string;
}

interface RemoteStreamData {
  server_name: string;
  stream_url: string;
  is_hls: boolean;
  original_embed_url: string;
}

interface EpisodeItem {
  id: string;
  number: number;
  title: string;
  image?: string | null;
  downloadStatus: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  filePath?: string | null;
  fileSizeBytes?: string | null;
  usedServer?: string | null;
}

interface AnimeData {
  id: string;
  slug: string;
  title: string;
  posterUrl: string;
  episodesCount?: number;
  inWatchlist?: boolean;
}

export const PlayerPage: React.FC = () => {
  const { slug, episode } = useParams<{ slug: string; episode: string }>();
  const navigate = useNavigate();

  const currentEpNum = parseInt(episode || '1', 10);
  const animeSlug = slug || '';

  const [anime, setAnime] = useState<AnimeData | null>(null);
  const [sidebarEpisodes, setSidebarEpisodes] = useState<EpisodeItem[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [streamData, setStreamData] = useState<RemoteStreamData | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(true);
  const [isLoadingSidebar, setIsLoadingSidebar] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [useIframe, setUseIframe] = useState<boolean>(false);
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<'PENDING' | 'DOWNLOADING' | 'COMPLETED' | null>(null);
  const [isEnqueueing, setIsEnqueueing] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastReportedTime = useRef<number>(0);

  // Escuchar eventos SSE de descargas para reflejar cambios en tiempo real
  useEffect(() => {
    const eventSource = new EventSource('/api/downloads/progress');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status && data.episode_id) {
          const currentId = `${animeSlug}-${currentEpNum}`;
          const currentItem = sidebarEpisodes.find((e) => e.number === currentEpNum);

          if (data.episode_id === currentId || (currentItem && data.episode_id === currentItem.id)) {
            setDownloadStatus(data.status);
            if (data.status === 'COMPLETED') {
              setIsDownloaded(true);
            }
          }

          // Actualizar estado en la lista lateral
          setSidebarEpisodes((prev) =>
            prev.map((ep) => {
              if (data.episode_id === `${animeSlug}-${ep.number}` || data.episode_id === ep.id) {
                return {
                  ...ep,
                  downloadStatus: data.status,
                };
              }
              return ep;
            })
          );
        }
      } catch (err) {
        console.error('Error procesando evento SSE de descarga:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [animeSlug, currentEpNum, sidebarEpisodes]);

  const handleDownloadCurrentEpisode = async () => {
    if (isDownloaded || downloadStatus === 'COMPLETED' || isEnqueueing) return;
    setIsEnqueueing(true);
    setDownloadStatus('DOWNLOADING');
    try {
      const currentItem = sidebarEpisodes.find((e) => e.number === currentEpNum);
      const targetId = currentItem?.id || `${animeSlug}-${currentEpNum}`;
      await fetch(`/api/downloads/episode/${targetId}`, { method: 'POST' });
    } catch (err) {
      console.error('Error encolando descarga en PlayerPage:', err);
      setDownloadStatus(null);
    } finally {
      setIsEnqueueing(false);
    }
  };

  // 1. Cargar metadatos generales del anime (título, total_episodes, carátula)
  useEffect(() => {
    if (!animeSlug) return;
    let isMounted = true;

    fetch(`/api/anime/${animeSlug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setAnime({
            id: data.id,
            slug: data.slug,
            title: data.title,
            posterUrl: data.posterUrl,
            episodesCount: data.episodesCount || (data.seasons?.[0]?.episodes?.length ?? 1),
            inWatchlist: data.inWatchlist,
          });
        }
      })
      .catch((err) => console.error('Error cargando detalles del anime:', err));

    return () => {
      isMounted = false;
    };
  }, [animeSlug]);

  // 2. Cálculo de la ventana de 5 capítulos (múltiplos de 5)
  // - Si está en el cap 1: muestra 1 + los próximos 4 [1, 2, 3, 4, 5]
  // - Si está en el último cap (T): muestra los 4 anteriores + T [T-4, ..., T]
  // - Si está en capítulo intermedio: se alinea al bloque correspondiente de múltiplos de 5
  const calculate5EpisodeWindow = (current: number, total: number) => {
    if (total <= 5) return { start: 1, end: Math.max(1, total) };
    if (current <= 1) return { start: 1, end: 5 };
    if (current >= total) return { start: Math.max(1, total - 4), end: total };

    const blockIndex = Math.floor((current - 1) / 5);
    let start = blockIndex * 5 + 1;
    let end = Math.min(start + 4, total);
    if (end === total && total >= 5) {
      start = total - 4;
    }
    return { start, end };
  };

  // 3. Cargar los 5 episodios para la barra lateral / inferior
  useEffect(() => {
    if (!animeSlug) return;
    let isMounted = true;
    setIsLoadingSidebar(true);

    const total = anime?.episodesCount || 100;
    const { start, end } = calculate5EpisodeWindow(currentEpNum, total);

    fetch(`/api/anime/${animeSlug}/episodes?start=${start}&end=${end}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.episodes) {
          setSidebarEpisodes(data.episodes);
          // Verificar si el capítulo actual está marcado como descargado
          const currentItem = data.episodes.find((e: EpisodeItem) => e.number === currentEpNum);
          if (currentItem) {
            setIsDownloaded(currentItem.downloadStatus === 'COMPLETED');
          }
        }
      })
      .catch((err) => console.error('Error cargando lista de 5 capítulos:', err))
      .finally(() => {
        if (isMounted) setIsLoadingSidebar(false);
      });

    return () => {
      isMounted = false;
    };
  }, [animeSlug, currentEpNum, anime?.episodesCount]);

  // 4. Cargar lista de servidores del episodio
  useEffect(() => {
    if (!animeSlug || !currentEpNum) return;
    let isMounted = true;

    fetch(`/api/stream/servers/${animeSlug}-${currentEpNum}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.servers) {
          setServers(data.servers);
        }
      })
      .catch((err) => console.error('Error cargando servidores:', err));

    return () => {
      isMounted = false;
    };
  }, [animeSlug, currentEpNum]);

  // 5. Cargar fuente de video (streaming local o resolución remota)
  useEffect(() => {
    setIsLoadingStream(true);
    setErrorMsg(null);
    setUseIframe(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const episodeId = `${animeSlug}-${currentEpNum}`;

    if (isDownloaded) {
      setIsLoadingStream(false);
      if (videoRef.current) {
        videoRef.current.src = `/api/stream/local/${episodeId}`;
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    let isMounted = true;
    const fetchStream = async () => {
      try {
        const queryParam = selectedServer
          ? `?server=${encodeURIComponent(selectedServer)}`
          : '';
        const res = await fetch(`/api/stream/remote/${episodeId}${queryParam}`);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'No se pudo resolver el stream de video.');
        }

        const data: RemoteStreamData = await res.json();
        if (!isMounted) return;

        setStreamData(data);
        if (!selectedServer) {
          setSelectedServer(data.server_name);
        }

        const videoEl = videoRef.current;
        if (!videoEl) return;

        if (data.is_hls) {
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(data.stream_url);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoadingStream(false);
              videoEl.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_event, errorData) => {
              if (errorData.fatal) {
                console.warn('Fallo HLS fatal, usando fallback iframe:', errorData);
                setUseIframe(true);
                setIsLoadingStream(false);
              }
            });
            hlsRef.current = hls;
          } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = data.stream_url;
            videoEl.addEventListener('loadedmetadata', () => {
              setIsLoadingStream(false);
              videoEl.play().catch(() => {});
            });
          } else {
            setUseIframe(true);
            setIsLoadingStream(false);
          }
        } else if (data.stream_url.endsWith('.mp4') || data.stream_url.includes('.mp4')) {
          videoEl.src = data.stream_url;
          videoEl.load();
          videoEl.onloadeddata = () => {
            setIsLoadingStream(false);
            videoEl.play().catch(() => {});
          };
        } else {
          setUseIframe(true);
          setIsLoadingStream(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error obteniendo stream remoto:', err);
        setErrorMsg(err.message || 'Error resolviendo el servidor de video.');
        setIsLoadingStream(false);
      }
    };

    fetchStream();

    return () => {
      isMounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [animeSlug, currentEpNum, isDownloaded, selectedServer]);

  // 6. Reporte de historial de visualización
  const reportProgress = (currentTime: number, duration: number, isEnding: boolean = false) => {
    if (!duration || duration <= 0) return;
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animeSlug,
        animeTitle: anime?.title || animeSlug,
        posterUrl: anime?.posterUrl || '',
        episodeNum: currentEpNum,
        episodeId: `${animeSlug}-${currentEpNum}`,
        progressSec: currentTime,
        durationSec: duration,
        completed: isEnding || currentTime / duration >= 0.88,
      }),
    }).catch(() => {});
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    const dur = videoRef.current.duration;
    if (Math.abs(ct - lastReportedTime.current) >= 6) {
      lastReportedTime.current = ct;
      reportProgress(ct, dur, false);
    }
  };

  const handleEnded = () => {
    if (!videoRef.current) return;
    reportProgress(videoRef.current.duration, videoRef.current.duration, true);
  };

  const totalEpisodes = anime?.episodesCount || 100;
  const hasPrev = currentEpNum > 1;
  const hasNext = currentEpNum < totalEpisodes;

  const goToPrev = () => {
    if (hasPrev) {
      navigate(`/anime/${animeSlug}/${currentEpNum - 1}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToNext = () => {
    if (hasNext) {
      navigate(`/anime/${animeSlug}/${currentEpNum + 1}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const { start: windowStart, end: windowEnd } = calculate5EpisodeWindow(currentEpNum, totalEpisodes);

  return (
    <div className="py-6 md:py-8 space-y-6">
      {/* 1. Barra Superior de Navegación y Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-surface-25/50">
        <div className="flex items-center gap-3">
          <Link
            to={`/anime/${animeSlug}`}
            className="px-4 py-2 rounded-full border border-surface-25 hover:border-surface-cream text-surface-cream hover:bg-off-black transition-colors text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            title="Volver a la ficha del anime"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Todos los episodios</span>
          </Link>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-bold text-surface-cream truncate">
              {anime?.title || animeSlug}
            </h1>
            <p className="text-xs font-mono text-shockingly-green flex items-center gap-1.5">
              <span>Capítulo {currentEpNum}</span>
              {anime?.episodesCount && (
                <span className="text-surface-50 font-normal">de {anime.episodesCount}</span>
              )}
            </p>
          </div>
        </div>

        {/* Botones Anterior / Siguiente */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={goToPrev}
            disabled={!hasPrev}
            className="px-3.5 py-1.5 rounded-full border border-surface-25 text-surface-cream text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-surface-cream cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <button
            type="button"
            onClick={goToNext}
            disabled={!hasNext}
            className="px-3.5 py-1.5 rounded-full bg-shockingly-green/10 text-shockingly-green border border-shockingly-green/40 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-shockingly-green/20 cursor-pointer"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Grid Principal: Reproductor (Izquierda/Principal) + 5 Episodios (Derecha/Inferior) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Columna Principal: Video Player y Servidores (8 cols) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Contenedor 16:9 del Video Player */}
          <div className="relative aspect-video w-full rounded-2xl bg-off-black border border-surface-25 overflow-hidden shadow-2xl flex items-center justify-center">
            {isLoadingStream && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-just-black/80 gap-3">
                <div className="w-10 h-10 border-2 border-shockingly-green border-t-transparent rounded-full animate-spin" />
                <p className="text-xs sm:text-sm text-surface-cream font-mono">
                  &#123; Conectando con servidor de video... &#125;
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="p-8 text-center max-w-md z-20">
                <AlertCircle className="w-12 h-12 text-orangey mx-auto mb-3" />
                <h4 className="text-base sm:text-lg font-semibold text-surface-cream mb-1">
                  Error de reproducción
                </h4>
                <p className="text-xs sm:text-sm text-surface-50 mb-4">{errorMsg}</p>
                {servers.length > 1 && (
                  <p className="text-xs text-surface-cream/80">
                    Prueba a seleccionar otro servidor de la barra inferior.
                  </p>
                )}
              </div>
            )}

            {useIframe && streamData ? (
              <iframe
                src={streamData.original_embed_url}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                ref={videoRef}
                controls
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                className={`w-full h-full ${errorMsg ? 'hidden' : 'block'}`}
              />
            )}
          </div>

          {/* Barra de Servidores Autorizados */}
          {!isDownloaded && servers.length > 0 && (
            <div className="p-3 rounded-2xl bg-off-black/60 border border-surface-25/50 flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-surface-50 flex items-center gap-1.5 mr-1">
                <Server className="w-3.5 h-3.5 text-shockingly-green" />
                Servidores ({servers.length}):
              </span>
              {servers.map((s) => (
                <ServerBadge
                  key={s.server}
                  server_name={s.server}
                  is_selected={selectedServer?.toLowerCase() === s.server.toLowerCase()}
                  onClick={() => {
                    setSelectedServer(s.server);
                    setErrorMsg(null);
                  }}
                />
              ))}
            </div>
          )}

          {/* Metadatos y acciones debajo del reproductor */}
          <div className="p-4 rounded-2xl bg-off-black/40 border border-surface-25/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-surface-cream">
                {anime?.title} — Capítulo {currentEpNum}
              </h2>
            </div>

            {/* Acciones principales: Descarga y Ficha técnica */}
            <div className="flex items-center gap-3">
              {isDownloaded || downloadStatus === 'COMPLETED' ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-shockingly-green/40 bg-shockingly-green/10 text-shockingly-green text-xs font-semibold cursor-default select-none"
                  title="Este capítulo ya se encuentra descargado en el servidor"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Descargado</span>
                </div>
              ) : downloadStatus === 'DOWNLOADING' || isEnqueueing ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-orangey/40 bg-orangey/10 text-orangey text-xs font-semibold cursor-default animate-pulse select-none"
                  title="Descarga en curso en el servidor"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Descargando...</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadCurrentEpisode}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-surface-25 bg-off-black hover:border-shockingly-green hover:text-shockingly-green text-surface-cream text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                  title="Descargar este capítulo en el servidor"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar capítulo</span>
                </button>
              )}

              <Link
                to={`/anime/${animeSlug}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-surface-25 bg-off-black hover:border-surface-cream/80 hover:bg-surface-25/40 text-surface-cream text-xs font-semibold transition-all cursor-pointer shadow-sm group active:scale-95"
                title="Ver ficha técnica completa del anime"
              >
                <Film className="w-3.5 h-3.5 text-surface-50 group-hover:text-surface-cream transition-colors" />
                <span>Ficha técnica</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Columna Derecha / Inferior: Lista de 5 Episodios (Múltiplos de 5) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <CurlyEyebrow text="Lista de reproducción" />
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-surface-25 bg-off-black text-surface-cream/70 flex-shrink-0">
                {totalEpisodes} caps.
              </span>
            </div>
            <h3 className="text-sm font-bold text-surface-cream uppercase tracking-tight">
              Capítulos {windowStart} - {windowEnd}
            </h3>
          </div>

          <div className="space-y-3 bg-off-black/30 border border-surface-25/50 p-3 sm:p-4 rounded-2xl">
            {isLoadingSidebar ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-shimmer flex gap-3 p-2 rounded-xl bg-off-black/60 border border-surface-25/30">
                    <div className="w-24 aspect-video bg-surface-25/40 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="w-12 h-3 bg-surface-25/40 rounded" />
                      <div className="w-3/4 h-3 bg-surface-25/40 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sidebarEpisodes.length > 0 ? (
              sidebarEpisodes.map((ep) => {
                const isCurrent = ep.number === currentEpNum;
                return (
                  <div
                    key={ep.id || ep.number}
                    onClick={() => {
                      if (!isCurrent) {
                        navigate(`/anime/${animeSlug}/${ep.number}`);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer group ${
                      isCurrent
                        ? 'border-shockingly-green bg-shockingly-green/10 ring-1 ring-shockingly-green/30'
                        : 'border-surface-25/60 bg-off-black/70 hover:border-surface-cream/50 hover:bg-off-black'
                    }`}
                  >
                    {/* Thumbnail 16:9 con Play overlay */}
                    <div className="w-24 sm:w-28 aspect-video rounded-lg overflow-hidden relative flex-shrink-0 bg-off-black border border-surface-25">
                      <img
                        src={ep.image || anime?.posterUrl}
                        alt={`Capítulo ${ep.number}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://cdn.jkdesa.com/assets/images/animes/image/${animeSlug}.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 bg-just-black/40 flex items-center justify-center">
                        {isCurrent ? (
                          <div className="w-6 h-6 rounded-full bg-shockingly-green flex items-center justify-center text-just-black">
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-just-black/80 border border-surface-cream/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-surface-cream transition-opacity">
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          </div>
                        )}
                      </div>
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 text-[9px] font-mono font-bold bg-just-black/90 text-surface-cream rounded">
                        E{ep.number}
                      </span>
                    </div>

                    {/* Información del episodio */}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-xs font-semibold block ${
                          isCurrent ? 'text-shockingly-green' : 'text-surface-cream'
                        }`}
                      >
                        Capítulo {ep.number}
                      </span>
                      <h4 className="text-xs text-surface-50 group-hover:text-surface-cream/90 transition-colors truncate mt-0.5">
                        {ep.title || `${anime?.title || 'Episodio'} ${ep.number}`}
                      </h4>
                      {ep.downloadStatus === 'COMPLETED' && (
                        <span className="text-[10px] text-shockingly-green flex items-center gap-1 mt-1 font-mono">
                          <HardDrive className="w-2.5 h-2.5" /> Descargado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-surface-50 font-mono">
                No se encontraron capítulos en este rango.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage;
