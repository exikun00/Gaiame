import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trash2,
  X,
  Search,
  Play,
  Clock,
} from 'lucide-react';
import CurlyEyebrow from '../components/ui/CurlyEyebrow.js';
import HairlineDivider from '../components/ui/HairlineDivider.js';
import { EpisodeCardsSkeleton } from '../components/ui/ShimmerSkeleton.js';

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

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();

  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'progress'>('date');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const isInitialMount = useRef<boolean>(true);

  const fetchHistory = async (showShimmer = false) => {
    if (showShimmer) {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.append('sort', sortBy);
      params.append('order', sortOrder);
      if (searchFilter.trim()) params.append('q', searchFilter.trim());

      const res = await fetch(`/api/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Error obteniendo historial:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Carga inicial y cambios de ordenación
  useEffect(() => {
    fetchHistory(true);
  }, [sortBy, sortOrder]);

  // Debounce para búsqueda sin disparar doble shimmer en el montaje inicial
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchHistory(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Error eliminando elemento del historial:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('¿Estás seguro de que deseas vaciar todo el historial de reproducción?')) {
      return;
    }

    setIsClearing(true);
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      if (res.ok) {
        setHistory([]);
      }
    } catch (err) {
      console.error('Error vaciando historial:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="py-8 space-y-8">
      {/* Cabecera y botón Vaciar historial (Inspirado en historial1.png) */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <CurlyEyebrow text="Historial" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-surface-cream mt-1 uppercase">
            HISTORIAL DE EPISODIOS VISTOS
          </h1>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            disabled={isClearing}
            className="px-5 py-2 rounded-full bg-red-600/80 hover:bg-red-600 text-white font-medium text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-900/20 active:scale-95 disabled:opacity-50 self-start sm:self-auto"
          >
            <Trash2 className="w-4 h-4" />
            <span>Vaciar historial</span>
          </button>
        )}
      </div>

      {/* Barra de Filtros y Ordenamiento (Inspirado en historial1.png) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-off-black/60 border border-surface-25/50 p-4 rounded-2xl">
        {/* Ordenar */}
        <div className="sm:col-span-4 flex flex-col gap-1.5">
          <label className="text-xs font-mono text-surface-50">Ordenar</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full bg-off-black border border-surface-25 text-surface-cream text-sm rounded-buttons px-3 py-2 outline-none focus:border-shockingly-green transition-colors cursor-pointer"
          >
            <option value="date">Por fecha</option>
            <option value="title">Por nombre</option>
            <option value="progress">Por progreso</option>
          </select>
        </div>

        {/* Orden */}
        <div className="sm:col-span-4 flex flex-col gap-1.5">
          <label className="text-xs font-mono text-surface-50">Orden</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="w-full bg-off-black border border-surface-25 text-surface-cream text-sm rounded-buttons px-3 py-2 outline-none focus:border-shockingly-green transition-colors cursor-pointer"
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>
        </div>

        {/* Filtrar */}
        <div className="sm:col-span-4 flex flex-col gap-1.5">
          <label className="text-xs font-mono text-surface-50">Filtrar</label>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-surface-50 pointer-events-none" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-off-black border border-surface-25 text-surface-cream text-sm rounded-buttons pl-9 pr-8 py-2 outline-none focus:border-shockingly-green transition-colors placeholder:text-surface-50"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2.5 text-surface-50 hover:text-surface-cream p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <HairlineDivider />

      {/* Grid de Tarjetas del Historial */}
      {isLoading ? (
        <EpisodeCardsSkeleton count={12} />
      ) : history.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {history.map((item) => {
            const progressPct =
              item.durationSec > 0
                ? Math.min(100, Math.round((item.progressSec / item.durationSec) * 100))
                : 0;

            return (
              <div
                key={item.id}
                onClick={() => navigate(`/anime/${item.animeSlug}/${item.episodeNum}`)}
                className="group cursor-pointer flex flex-col gap-2 relative"
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
                  <div className="absolute inset-0 bg-gradient-to-t from-just-black/90 via-just-black/20 to-transparent" />

                  {/* Botón de eliminación individual (X en la esquina superior izquierda) */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteItem(e, item.id)}
                    className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-md z-10 active:scale-90"
                    title="Eliminar de historial"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Badge Episodio en la esquina superior derecha */}
                  <span className="absolute top-2 right-2 px-2.5 py-0.5 text-xs font-semibold rounded bg-shockingly-green text-just-black shadow font-mono">
                    Episodio {item.episodeNum}
                  </span>

                  {/* Play hover icon */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-just-black/80 border border-shockingly-green flex items-center justify-center text-shockingly-green shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>

                  {/* Título sobrepuesto en la base de la miniatura */}
                  <div className="absolute bottom-2 left-2 right-2 text-xs font-medium text-surface-cream truncate drop-shadow">
                    {item.animeTitle}
                  </div>

                  {/* Barra de progreso en el fondo inferior de la miniatura */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-25/80">
                    <div
                      className="h-full bg-orangey transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Fecha y hora del registro */}
                <span className="text-xs font-mono text-surface-50 text-center truncate">
                  {formatDate(item.updatedAt)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-24 flex flex-col items-center justify-center text-center gap-3">
          <Clock className="w-12 h-12 text-surface-50/50" />
          <h3 className="text-lg font-medium text-surface-cream">Tu historial está vacío</h3>
          <p className="text-sm text-surface-50 max-w-sm">
            Los animes y episodios que comiences a ver se guardarán automáticamente aquí para que puedas continuar donde los dejaste.
          </p>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
