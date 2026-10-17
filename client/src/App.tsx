import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar.js';
import Footer from './components/layout/Footer.js';
import HomePage from './pages/HomePage.js';
import AnimeDetailPage from './pages/AnimeDetailPage.js';
import WatchlistPage from './pages/WatchlistPage.js';
import DownloadsPage from './pages/DownloadsPage.js';
import VideoPlayer from './components/player/VideoPlayer.js';
import useDownloads from './hooks/useDownloads.js';
import useWatchlist from './hooks/useWatchlist.js';

export const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Estado del reproductor
  const [playing_episode, setPlayingEpisode] = useState<{
    id: string;
    title: string;
    is_downloaded: boolean;
    number?: number;
  } | null>(null);

  const {
    tasks,
    completed_episodes,
    storage_usage,
    active_count,
    enqueueEpisode,
    enqueueSeason,
    enqueueAnime,
    cancelTask,
    deleteEpisodeFile,
  } = useDownloads();

  const { watchlist, is_loading: is_watchlist_loading, toggleWatchlist } = useWatchlist();
  const watchlist_slugs = new Set(watchlist.map((w) => w.slug));

  const handleSelectAnime = (slug: string) => {
    navigate(`/anime/${slug}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClosePlayer = () => {
    setPlayingEpisode(null);
    // Si la URL actual es /anime/:slug/:episode, regresar a /anime/:slug
    if (location.pathname.match(/\/anime\/[^/]+\/\d+/)) {
      navigate(location.pathname.replace(/\/\d+$/, ''));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-just-black text-surface-cream selection:bg-shockingly-green selection:text-just-black">
      {/* Barra superior de navegación con rutas reales */}
      <Navbar active_downloads_count={active_count} />

      {/* Contenedor principal de la aplicación con Router */}
      <main className="flex-1 max-w-page w-full mx-auto px-4 md:px-8">
        <Routes>
          {/* Catálogo Principal */}
          <Route
            path="/"
            element={
              <HomePage
                onSelectAnime={handleSelectAnime}
                onToggleWatchlist={toggleWatchlist}
                watchlist_slugs={watchlist_slugs}
              />
            }
          />

          {/* Biblioteca personal (/library y alias /biblioteca) */}
          <Route
            path="/library"
            element={
              <WatchlistPage
                watchlist={watchlist}
                is_loading={is_watchlist_loading}
                onSelectAnime={handleSelectAnime}
                onToggleWatchlist={toggleWatchlist}
                onGoToCatalog={() => navigate('/')}
              />
            }
          />
          <Route path="/biblioteca" element={<Navigate to="/library" replace />} />

          {/* Gestor de Descargas (/downloads y alias /descargas) */}
          <Route
            path="/downloads"
            element={
              <DownloadsPage
                tasks={tasks}
                completed_episodes={completed_episodes}
                storage_usage={storage_usage}
                onCancelTask={cancelTask}
                onDeleteFile={deleteEpisodeFile}
                onPlayEpisode={(ep) => setPlayingEpisode(ep)}
                onGoToCatalog={() => navigate('/')}
              />
            }
          />
          <Route path="/descargas" element={<Navigate to="/downloads" replace />} />

          {/* Ficha de Anime y Reproducción por Episodio */}
          <Route
            path="/anime/:slug"
            element={
              <AnimeDetailPage
                onPlayEpisode={(ep) => setPlayingEpisode(ep)}
                onEnqueueEpisode={enqueueEpisode}
                onEnqueueSeason={enqueueSeason}
                onEnqueueAnime={enqueueAnime}
                onDeleteEpisodeFile={deleteEpisodeFile}
                onToggleWatchlist={toggleWatchlist}
              />
            }
          />
          <Route
            path="/anime/:slug/:episode"
            element={
              <AnimeDetailPage
                onPlayEpisode={(ep) => setPlayingEpisode(ep)}
                onEnqueueEpisode={enqueueEpisode}
                onEnqueueSeason={enqueueSeason}
                onEnqueueAnime={enqueueAnime}
                onDeleteEpisodeFile={deleteEpisodeFile}
                onToggleWatchlist={toggleWatchlist}
              />
            }
          />

          {/* Fallback general */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Modal Reproductor de Video Híbrido */}
      {playing_episode && (
        <VideoPlayer
          episode_id={playing_episode.id}
          episode_title={playing_episode.title}
          is_downloaded={playing_episode.is_downloaded}
          onClose={handleClosePlayer}
        />
      )}

      {/* Pie de página */}
      <Footer />
    </div>
  );
};

export default App;
