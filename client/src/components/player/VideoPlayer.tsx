import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Play, AlertCircle, HardDrive, Globe, Server } from 'lucide-react';
import ServerBadge from '../ui/ServerBadge.js';

interface VideoPlayerProps {
  episode_id: string;
  episode_title: string;
  is_downloaded: boolean;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPrevEpisode?: () => void;
  anime_slug?: string;
  anime_title?: string;
  episode_number?: number;
  poster_url?: string;
}

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

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  episode_id,
  episode_title,
  is_downloaded,
  onClose,
  onNextEpisode,
  onPrevEpisode,
  anime_slug,
  anime_title,
  episode_number,
  poster_url,
}) => {
  const video_ref = useRef<HTMLVideoElement | null>(null);
  const hls_ref = useRef<Hls | null>(null);
  const lastReportedTime = useRef<number>(0);

  const reportProgress = (currentTime: number, duration: number, isEnding: boolean = false) => {
    if (!duration || duration <= 0) return;
    const resolved_slug = anime_slug || episode_id.replace(/-\d+$/, '');
    const resolved_ep = episode_number || parseInt(episode_id.match(/-(\d+)$/)?.[1] || '1', 10);

    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        animeSlug: resolved_slug,
        animeTitle: anime_title || episode_title.split('-')[0]?.trim() || resolved_slug,
        posterUrl: poster_url || '',
        episodeNum: resolved_ep,
        episodeId: episode_id,
        progressSec: currentTime,
        durationSec: duration,
        completed: isEnding || currentTime / duration >= 0.88,
      }),
    }).catch(() => {});
  };

  const handleTimeUpdate = () => {
    if (!video_ref.current) return;
    const ct = video_ref.current.currentTime;
    const dur = video_ref.current.duration;
    if (Math.abs(ct - lastReportedTime.current) >= 6) {
      lastReportedTime.current = ct;
      reportProgress(ct, dur, false);
    }
  };

  const handleEnded = () => {
    if (!video_ref.current) return;
    reportProgress(video_ref.current.duration, video_ref.current.duration, true);
  };

  const handleClose = () => {
    if (video_ref.current) {
      reportProgress(video_ref.current.currentTime, video_ref.current.duration, false);
    }
    onClose();
  };

  const [stream_data, setStreamData] = useState<RemoteStreamData | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [selected_server, setSelectedServer] = useState<string | null>(null);
  const [is_loading, setIsLoading] = useState<boolean>(true);
  const [error_msg, setErrorMsg] = useState<string | null>(null);
  const [use_iframe, setUseIframe] = useState<boolean>(false);

  // Cargar lista de servidores
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const res = await fetch(`/api/stream/servers/${episode_id}`);
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
        }
      } catch (err) {
        console.error('Error fetching servers:', err);
      }
    };

    if (!is_downloaded) {
      fetchServers();
    }
  }, [episode_id, is_downloaded]);

  // Cargar fuente de video
  useEffect(() => {
    setIsLoading(true);
    setErrorMsg(null);
    setUseIframe(false);

    if (hls_ref.current) {
      hls_ref.current.destroy();
      hls_ref.current = null;
    }

    if (is_downloaded) {
      // Reproducción local desde el servidor
      setIsLoading(false);
      if (video_ref.current) {
        video_ref.current.src = `/api/stream/local/${episode_id}`;
        video_ref.current.load();
        video_ref.current.play().catch(() => {});
      }
      return;
    }

    // Reproducción remota
    const fetchRemoteStream = async () => {
      try {
        const url = selected_server
          ? `/api/stream/remote/${episode_id}?server=${encodeURIComponent(selected_server)}`
          : `/api/stream/remote/${episode_id}`;

        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Error resolviendo stream');
        }

        const data: RemoteStreamData = await res.json();
        setStreamData(data);
        if (!selected_server) {
          setSelectedServer(data.server_name);
        }

        const video_el = video_ref.current;
        if (!video_el) return;

        if (data.is_hls) {
          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hls.loadSource(data.stream_url);
            hls.attachMedia(video_el);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false);
              video_el.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal) {
                console.warn('Error fatal de HLS, recurriendo a iframe:', data);
                setUseIframe(true);
                setIsLoading(false);
              }
            });
            hls_ref.current = hls;
          } else if (video_el.canPlayType('application/vnd.apple.mpegurl')) {
            video_el.src = data.stream_url;
            video_el.addEventListener('loadedmetadata', () => {
              setIsLoading(false);
              video_el.play().catch(() => {});
            });
          } else {
            setUseIframe(true);
            setIsLoading(false);
          }
        } else if (data.stream_url.endsWith('.mp4') || data.stream_url.includes('.mp4')) {
          video_el.src = data.stream_url;
          video_el.load();
          video_el.onloadeddata = () => {
            setIsLoading(false);
            video_el.play().catch(() => {});
          };
        } else {
          // Si no es un stream directo MP4/HLS, incrustar el iframe del host
          setUseIframe(true);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Error cargando stream:', err);
        setErrorMsg(err.message || 'No se pudo reproducir este episodio con el servidor seleccionado.');
        setStreamData(null);
        setIsLoading(false);
      }
    };

    fetchRemoteStream();

    return () => {
      if (hls_ref.current) {
        hls_ref.current.destroy();
        hls_ref.current = null;
      }
    };
  }, [episode_id, is_downloaded, selected_server]);

  const handleSelectServer = (server_name: string) => {
    if (selected_server?.toLowerCase() === server_name.toLowerCase() && !error_msg) {
      return;
    }
    setErrorMsg(null);
    setSelectedServer(server_name);
  };

  return (
    <div className="fixed inset-0 z-50 bg-just-black/95 flex flex-col items-center justify-center p-2 md:p-6 backdrop-blur-md animate-fade-in">
      {/* Barra superior de controles del reproductor */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-3 text-surface-cream">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-surface-25 flex items-center justify-center">
            <Play className="w-4 h-4 fill-current text-shockingly-green" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-semibold tracking-tight">{episode_title}</h3>
            <div className="flex items-center gap-2 text-xs text-surface-50">
              {is_downloaded ? (
                <span className="flex items-center gap-1 text-shockingly-green font-medium">
                  <HardDrive className="w-3.5 h-3.5" />
                  Streaming local en servidor
                </span>
              ) : (
                <span className="flex items-center gap-1 text-surface-cream/80 font-medium">
                  <Globe className="w-3.5 h-3.5 text-shockingly-green" />
                  Streaming remoto: {selected_server || stream_data?.server_name || 'Detectando servidor'}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="p-2 rounded-full border border-surface-25 hover:border-surface-cream text-surface-cream transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Selector de servidores (si es streaming remoto) */}
      {!is_downloaded && servers.length > 0 && (
        <div className="w-full max-w-5xl mb-3 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-surface-50 flex items-center gap-1 flex-shrink-0">
            <Server className="w-3.5 h-3.5" /> Servidores ({servers.length}):
          </span>
          {servers.map((s) => (
            <ServerBadge
              key={s.server}
              server_name={s.server}
              is_selected={selected_server?.toLowerCase() === s.server.toLowerCase()}
              onClick={() => handleSelectServer(s.server)}
            />
          ))}
        </div>
      )}

      {/* Contenedor del video */}
      <div className="w-full max-w-5xl aspect-video bg-off-black rounded-cards border border-surface-25 overflow-hidden relative flex items-center justify-center">
        {is_loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-just-black/70 gap-3">
            <div className="w-10 h-10 border-2 border-shockingly-green border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-surface-cream font-mono">&#123; Conectando con servidor de video... &#125;</p>
          </div>
        )}

        {error_msg && (
          <div className="p-8 text-center max-w-md">
            <AlertCircle className="w-12 h-12 text-orangey mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-surface-cream mb-1">Error de reproducción</h4>
            <p className="text-sm text-surface-50 mb-4">{error_msg}</p>
            {servers.length > 1 && (
              <p className="text-xs text-surface-cream/70">
                Prueba a seleccionar otro servidor en la barra superior.
              </p>
            )}
          </div>
        )}

        {use_iframe && stream_data ? (
          <iframe
            src={stream_data.original_embed_url}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            ref={video_ref}
            controls
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            className={`w-full h-full ${error_msg ? 'hidden' : 'block'}`}
          />
        )}
      </div>

      {/* Botones de navegación de episodios */}
      <div className="w-full max-w-5xl flex items-center justify-between mt-3">
        <button
          onClick={onPrevEpisode}
          disabled={!onPrevEpisode}
          className="px-4 py-2 text-sm rounded-buttons border border-surface-25 text-surface-cream disabled:opacity-30 hover:border-surface-cream cursor-pointer"
        >
          ← Episodio anterior
        </button>

        <button
          onClick={onNextEpisode}
          disabled={!onNextEpisode}
          className="px-4 py-2 text-sm rounded-buttons border border-surface-25 text-surface-cream disabled:opacity-30 hover:border-surface-cream cursor-pointer"
        >
          Siguiente episodio →
        </button>
      </div>
    </div>
  );
};

export default VideoPlayer;
