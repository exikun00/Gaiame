import React from 'react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';
import PillButton from '../components/ui/PillButton.js';
import ServerBadge from '../components/ui/ServerBadge.js';
import { DownloadTaskItem, DownloadedEpisodeItem } from '../hooks/useDownloads.js';
import { HardDrive, X, Play, Trash2, CheckCircle2, Clock } from 'lucide-react';

interface DownloadsPageProps {
  tasks: DownloadTaskItem[];
  completed_episodes: DownloadedEpisodeItem[];
  storage_usage: { used_bytes: number; episode_count: number };
  onCancelTask: (task_id: string) => Promise<boolean>;
  onDeleteFile: (episode_id: string) => Promise<boolean>;
  onPlayEpisode: (episode: { id: string; title: string; is_downloaded: boolean }) => void;
  onGoToCatalog: () => void;
}

export const DownloadsPage: React.FC<DownloadsPageProps> = ({
  tasks,
  completed_episodes,
  storage_usage,
  onCancelTask,
  onDeleteFile,
  onPlayEpisode,
  onGoToCatalog,
}) => {
  const active_tasks = tasks.filter((t) => t.status === 'DOWNLOADING' || t.status === 'PENDING');
  const finished_tasks = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'FAILED');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (speed_bytes_sec: number) => {
    if (speed_bytes_sec <= 0) return '0 KB/s';
    return (speed_bytes_sec / (1024 * 1024)).toFixed(2) + ' MB/s';
  };

  return (
    <div className="w-full py-8">
      <CurlyEyebrow>Almacenamiento Local en Servidor</CurlyEyebrow>

      {/* Header y Resumen de Almacenamiento */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-semibold text-surface-cream tracking-tight">
            Gestor de Descargas
          </h1>
          <p className="text-sm md:text-base text-surface-50 mt-1">
            Cola de descargas concurrentes en el servidor y gestión de capítulos en disco.
          </p>
        </div>

        {/* Tarjeta de Uso de Almacenamiento */}
        <div className="p-4 rounded-cards bg-off-black border border-surface-25 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full border border-shockingly-green flex items-center justify-center text-shockingly-green">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-surface-50 font-mono">Espacio Ocupado</div>
            <div className="text-lg font-semibold text-surface-cream">
              {formatBytes(storage_usage.used_bytes)}
            </div>
            <div className="text-xs text-surface-50">
              {storage_usage.episode_count} episodios en disco
            </div>
          </div>
        </div>
      </div>

      <HairlineDivider className="my-6" />

      {/* Tareas Activas en Progreso */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-orangey" />
          <h2 className="text-xl md:text-2xl font-semibold text-surface-cream">
            Descargas en Curso ({active_tasks.length})
          </h2>
        </div>

        {active_tasks.length === 0 ? (
          <div className="p-8 rounded-cards bg-off-black/40 border border-surface-25 text-center text-surface-50">
            No hay descargas activas en este momento.
          </div>
        ) : (
          <div className="space-y-3">
            {active_tasks.map((task) => {
              const ep_num = task.episode?.number || '?';
              const anime_title = task.episode?.season?.anime?.title || 'Anime';
              const ep_title = task.episode?.title || `Episodio ${ep_num}`;

              return (
                <div
                  key={task.id}
                  className="p-4 rounded-cards bg-off-black border border-surface-25 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-semibold text-surface-cream truncate">
                        {anime_title} — Ep. {ep_num}
                      </span>
                      {task.currentServer && (
                        <ServerBadge server_name={task.currentServer} />
                      )}
                    </div>
                    <p className="text-xs text-surface-50 truncate">{ep_title}</p>

                    {/* Barra de progreso */}
                    <div className="w-full h-1.5 bg-just-black rounded-full overflow-hidden mt-3 border border-surface-25/50">
                      <div
                        className="h-full bg-gradient-to-r from-shockingly-green to-light-green transition-all duration-300"
                        style={{ width: `${Math.max(task.progress, 5)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4">
                    <div className="text-right">
                      <span className="text-sm font-semibold text-surface-cream font-mono">
                        {task.progress}%
                      </span>
                      {task.status === 'DOWNLOADING' && (
                        <div className="text-xs text-surface-50 font-mono">
                          {formatSpeed(task.speedBytesPerSec)}
                        </div>
                      )}
                      {task.status === 'PENDING' && (
                        <div className="text-xs text-orangey">En espera en cola...</div>
                      )}
                    </div>

                    <button
                      onClick={() => onCancelTask(task.id)}
                      className="p-2 rounded-full border border-surface-25 text-surface-50 hover:text-orangey hover:border-orangey transition-colors cursor-pointer"
                      title="Cancelar descarga"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Capítulos Almacenados en Disco (Listos para Streaming Local) */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-shockingly-green" />
          <h2 className="text-xl md:text-2xl font-semibold text-surface-cream">
            Capítulos en Disco Local ({completed_episodes.length})
          </h2>
        </div>

        {completed_episodes.length === 0 ? (
          <div className="p-8 rounded-cards bg-off-black/40 border border-surface-25 text-center text-surface-50">
            Aún no has descargado ningún capítulo en el servidor.
            <div className="mt-4">
              <PillButton onClick={onGoToCatalog} size="sm">
                Explorar catálogo para descargar
              </PillButton>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed_episodes.map((ep) => (
              <div
                key={ep.id}
                className="p-4 rounded-cards bg-off-black border border-surface-25 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() =>
                      onPlayEpisode({
                        id: ep.id,
                        title: `${ep.season.anime.title} — Ep. ${ep.number}`,
                        is_downloaded: true,
                      })
                    }
                    className="w-10 h-10 rounded-full border border-surface-cream flex items-center justify-center flex-shrink-0 text-surface-cream hover:text-shockingly-green hover:border-shockingly-green transition-colors cursor-pointer"
                    title="Reproducir desde servidor (HTTP 206)"
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>

                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-surface-cream truncate">
                      {ep.season.anime.title} — Ep. {ep.number}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-surface-50 mt-0.5">
                      <span className="text-shockingly-green">Local</span>
                      {ep.usedServer && <span>• {ep.usedServer}</span>}
                      {ep.fileSizeBytes && (
                        <span>• {formatBytes(parseInt(ep.fileSizeBytes, 10))}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onDeleteFile(ep.id)}
                  className="p-2 rounded-full border border-surface-25 text-surface-50 hover:text-orangey hover:border-orangey transition-colors cursor-pointer"
                  title="Eliminar archivo del servidor"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historial reciente de tareas finalizadas */}
      {finished_tasks.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-surface-50 uppercase tracking-wider mb-3">
            Registro Reciente de Descargas
          </h3>
          <div className="space-y-2">
            {finished_tasks.slice(0, 5).map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-cards bg-off-black/60 border border-surface-25/40 flex items-center justify-between text-xs text-surface-50"
              >
                <span>
                  {t.episode?.season?.anime?.title || 'Anime'} Ep. {t.episode?.number || '?'}
                </span>
                <span className={t.status === 'COMPLETED' ? 'text-shockingly-green' : 'text-orangey'}>
                  {t.status === 'COMPLETED' ? 'Completada' : `Error: ${t.errorMessage || 'Falló'}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default DownloadsPage;
