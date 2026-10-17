import { useState, useEffect, useCallback } from 'react';

export interface DownloadTaskItem {
  id: string;
  episodeId: string;
  status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  progress: number;
  speedBytesPerSec: number;
  currentServer: string | null;
  errorMessage?: string | null;
  episode?: {
    number: number;
    title: string;
    season?: {
      number: number;
      anime?: {
        title: string;
        slug: string;
      };
    };
  };
}

export interface DownloadedEpisodeItem {
  id: string;
  number: number;
  title: string;
  filePath: string;
  fileSizeBytes: string | null;
  usedServer: string | null;
  season: {
    number: number;
    anime: {
      title: string;
      slug: string;
      posterUrl: string;
    };
  };
}

export const useDownloads = () => {
  const [tasks, setTasks] = useState<DownloadTaskItem[]>([]);
  const [completed_episodes, setCompletedEpisodes] = useState<DownloadedEpisodeItem[]>([]);
  const [storage_usage, setStorageUsage] = useState<{ used_bytes: number; episode_count: number }>({
    used_bytes: 0,
    episode_count: 0,
  });
  const [is_loading, setIsLoading] = useState<boolean>(true);

  const fetchTasksAndCompleted = useCallback(async () => {
    try {
      const [tasks_res, completed_res, storage_res] = await Promise.all([
        fetch('/api/downloads/tasks'),
        fetch('/api/downloads/completed'),
        fetch('/api/downloads/storage'),
      ]);

      if (tasks_res.ok) {
        const data = await tasks_res.json();
        setTasks(data.tasks || []);
      }

      if (completed_res.ok) {
        const data = await completed_res.json();
        setCompletedEpisodes(data.episodes || []);
      }

      if (storage_res.ok) {
        const data = await storage_res.json();
        setStorageUsage(data);
      }
    } catch (err) {
      console.error('Error fetching download data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasksAndCompleted();

    // Conectar a Server-Sent Events para progreso en tiempo real
    const event_source = new EventSource('/api/downloads/progress');

    event_source.onmessage = (event) => {
      try {
        const progress_data = JSON.parse(event.data);
        if (progress_data.task_id) {
          setTasks((prev_tasks) => {
            const index = prev_tasks.findIndex((t) => t.id === progress_data.task_id);
            if (index !== -1) {
              const updated = [...prev_tasks];
              const old_task = updated[index];
              if (old_task) {
                updated[index] = {
                  ...old_task,
                  status: progress_data.status,
                  progress: progress_data.progress,
                  speedBytesPerSec: progress_data.speed_bytes_sec,
                  currentServer: progress_data.current_server || old_task.currentServer,
                  errorMessage: progress_data.error_message,
                };
              }
              return updated;
            } else {
              // Tarea nueva o actualizar lista completa
              fetchTasksAndCompleted();
              return prev_tasks;
            }
          });

          if (progress_data.status === 'COMPLETED' || progress_data.status === 'FAILED') {
            fetchTasksAndCompleted();
          }
        }
      } catch (err) {
        console.error('Error parsing SSE progress message:', err);
      }
    };

    event_source.onerror = () => {
      // Reconexión automática nativa de EventSource
    };

    return () => {
      event_source.close();
    };
  }, [fetchTasksAndCompleted]);

  const enqueueEpisode = async (episode_id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/downloads/episode/${episode_id}`, { method: 'POST' });
      if (res.ok) {
        await fetchTasksAndCompleted();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const enqueueSeason = async (season_id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/downloads/season/${season_id}`, { method: 'POST' });
      if (res.ok) {
        await fetchTasksAndCompleted();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const enqueueAnime = async (anime_id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/downloads/anime/${anime_id}`, { method: 'POST' });
      if (res.ok) {
        await fetchTasksAndCompleted();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const cancelTask = async (task_id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/downloads/task/${task_id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchTasksAndCompleted();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteEpisodeFile = async (episode_id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/downloads/episode/${episode_id}/file`, { method: 'DELETE' });
      if (res.ok) {
        await fetchTasksAndCompleted();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const active_count = tasks.filter((t) => t.status === 'DOWNLOADING' || t.status === 'PENDING').length;

  return {
    tasks,
    completed_episodes,
    storage_usage,
    is_loading,
    active_count,
    enqueueEpisode,
    enqueueSeason,
    enqueueAnime,
    cancelTask,
    deleteEpisodeFile,
    refresh: fetchTasksAndCompleted,
  };
};

export default useDownloads;
