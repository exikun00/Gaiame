import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'events';
import prisma from './prisma.js';
import storageService from './storage.js';
import streamExtractor, { ResolvedStream } from './extractor.js';
import jkanimeScraper from './scraper.js';
import logger from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface DownloadProgressEvent {
  task_id: string;
  episode_id: string;
  status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED';
  progress: number;
  speed_bytes_sec: number;
  current_server: string | null;
  error_message?: string | null;
}

interface ActiveDownloadContext {
  task_id: string;
  abort_controller: AbortController;
  part_path: string;
  absolute_path: string;
}

export class DownloadManager extends EventEmitter {
  private max_concurrent: number;
  private active_downloads_map: Map<string, ActiveDownloadContext> = new Map();
  private pending_queue: string[] = []; // Array of task_ids
  private is_processing_queue: boolean = false;

  constructor() {
    super();
    this.max_concurrent = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '2', 10);
  }

  public async enqueueEpisode(episode_id: string): Promise<string> {
    const existing_task = await prisma.downloadTask.findFirst({
      where: {
        episodeId: episode_id,
        status: { in: ['PENDING', 'DOWNLOADING'] },
      },
    });

    if (existing_task) {
      return existing_task.id;
    }

    const task = await prisma.downloadTask.create({
      data: {
        episodeId: episode_id,
        status: 'PENDING',
        progress: 0,
      },
    });

    await prisma.episode.update({
      where: { id: episode_id },
      data: { downloadStatus: 'PENDING' },
    });

    this.pending_queue.push(task.id);
    this.processQueue();

    return task.id;
  }

  public async enqueueSeason(season_id: string): Promise<string[]> {
    const episodes = await prisma.episode.findMany({
      where: { seasonId: season_id },
      orderBy: { number: 'asc' },
    });

    const task_ids: string[] = [];
    for (const ep of episodes) {
      if (ep.downloadStatus !== 'COMPLETED') {
        const t_id = await this.enqueueEpisode(ep.id);
        task_ids.push(t_id);
      }
    }
    return task_ids;
  }

  public async enqueueAnime(anime_id: string): Promise<string[]> {
    const seasons = await prisma.season.findMany({
      where: { animeId: anime_id },
      include: { episodes: true },
    });

    const task_ids: string[] = [];
    for (const s of seasons) {
      for (const ep of s.episodes) {
        if (ep.downloadStatus !== 'COMPLETED') {
          const t_id = await this.enqueueEpisode(ep.id);
          task_ids.push(t_id);
        }
      }
    }
    return task_ids;
  }

  public async cancelDownload(task_id: string): Promise<boolean> {
    const active = this.active_downloads_map.get(task_id);
    if (active) {
      active.abort_controller.abort();
      this.active_downloads_map.delete(task_id);
      await storageService.cleanPartFile(active.part_path);
    }

    this.pending_queue = this.pending_queue.filter((id) => id !== task_id);

    const task = await prisma.downloadTask.findUnique({ where: { id: task_id } });
    if (task) {
      await prisma.downloadTask.update({
        where: { id: task_id },
        data: {
          status: 'FAILED',
          errorMessage: 'Cancelado por el usuario',
        },
      });

      await prisma.episode.update({
        where: { id: task.episodeId },
        data: {
          downloadStatus: 'FAILED',
          downloadProgress: 0,
        },
      });

      this.emitProgress({
        task_id,
        episode_id: task.episodeId,
        status: 'FAILED',
        progress: 0,
        speed_bytes_sec: 0,
        current_server: null,
        error_message: 'Cancelado por el usuario',
      });
    }

    this.processQueue();
    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.is_processing_queue) return;
    this.is_processing_queue = true;

    try {
      while (this.active_downloads_map.size < this.max_concurrent && this.pending_queue.length > 0) {
        const next_task_id = this.pending_queue.shift();
        if (next_task_id) {
          this.executeDownload(next_task_id).catch((err) => {
            console.error(`[DownloadManager] Error en tarea ${next_task_id}:`, err);
          });
        }
      }
    } finally {
      this.is_processing_queue = false;
    }
  }

  private async executeDownload(task_id: string): Promise<void> {
    const task = await prisma.downloadTask.findUnique({
      where: { id: task_id },
      include: {
        episode: {
          include: {
            season: {
              include: { anime: true },
            },
          },
        },
      },
    });

    if (!task) return;

    const episode = task.episode;
    const season = episode.season;
    const anime = season.anime;

    const abort_controller = new AbortController();
    const { relative_path, absolute_path, part_path } = await storageService.prepareEpisodeDownloadPath(
      anime.slug,
      season.number,
      episode.number
    );

    this.active_downloads_map.set(task_id, {
      task_id,
      abort_controller,
      part_path,
      absolute_path,
    });

    await prisma.downloadTask.update({
      where: { id: task_id },
      data: {
        status: 'DOWNLOADING',
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.episode.update({
      where: { id: episode.id },
      data: { downloadStatus: 'DOWNLOADING' },
    });

    console.log(`[DownloadManager] Obteniendo servidores para ${anime.slug} Ep. ${episode.number}`);
    const candidate_servers = await jkanimeScraper.getEpisodeServers(anime.slug, episode.number);

    if (candidate_servers.length === 0) {
      await this.handleTaskFailure(task_id, episode.id, part_path, 'No se encontraron servidores para este episodio');
      return;
    }

    logger.info(
      { anime: anime.slug, episode: episode.number, servers_count: candidate_servers.length },
      '[DownloadManager] Iniciando selección jerárquica de servidores para descarga'
    );
    const sorted_servers = streamExtractor.sortServersForDownload(candidate_servers);
    let download_success = false;
    let final_server_used = '';

    for (const candidate of sorted_servers) {
      if (abort_controller.signal.aborted) break;

      logger.info({ server: candidate.server, url: candidate.raw_url }, '[DownloadManager] Evaluando candidato de descarga');
      try {
        const stream = await streamExtractor.extractStreamFromCandidate(candidate);

        if (!stream) {
          logger.warn({ server: candidate.server }, '[DownloadManager] Servidor no compatible o descartado');
          continue;
        }

        if (!streamExtractor.isDownloadableStream(stream)) {
          logger.warn(
            { server: candidate.server, stream_url: stream.stream_url },
            '[DownloadManager] Servidor es solo un reproductor embebido (no descargable). Pasando al siguiente...'
          );
          continue;
        }

        if (!(await streamExtractor.verifyStreamAvailability(stream))) {
          logger.warn({ server: candidate.server }, '[DownloadManager] Servidor sin archivo o enlace eliminado. Pasando al siguiente...');
          continue;
        }

        logger.info({ server: stream.server_name, is_hls: stream.is_hls }, '[DownloadManager] ✔ Servidor válido seleccionado para descarga');

        await prisma.downloadTask.update({
          where: { id: task_id },
          data: { currentServer: stream.server_name },
        });

        this.emitProgress({
          task_id,
          episode_id: episode.id,
          status: 'DOWNLOADING',
          progress: 0,
          speed_bytes_sec: 0,
          current_server: stream.server_name,
        });

        if (stream.is_hls) {
          await this.downloadHls(stream, part_path, task_id, episode.id, abort_controller.signal);
        } else {
          await this.downloadDirectFile(stream, part_path, task_id, episode.id, abort_controller.signal);
        }

        // Validación estricta con ffprobe de integridad de video reproducible
        const is_valid_media = await this.validateDownloadedMedia(part_path);
        if (!is_valid_media) {
          logger.warn(
            { server: candidate.server },
            '[DownloadManager] Archivo descargado no superó validación de video reproducible con ffprobe. Limpiando y pasando al siguiente servidor...'
          );
          await storageService.cleanPartFile(part_path);
          continue;
        }

        download_success = true;
        final_server_used = stream.server_name;
        break;
      } catch (err: any) {
        if (abort_controller.signal.aborted) {
          logger.info({ task_id }, '[DownloadManager] Descarga cancelada por el usuario');
          return;
        }
        logger.warn({ server: candidate.server, err: err.message }, '[DownloadManager] Falló descarga con servidor. Intentando fallback...');
        await storageService.cleanPartFile(part_path);
      }
    }

    if (download_success && !abort_controller.signal.aborted) {
      const file_size = await storageService.finalizeDownload(part_path, absolute_path);

      await prisma.downloadTask.update({
        where: { id: task_id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          currentServer: final_server_used,
        },
      });

      await prisma.episode.update({
        where: { id: episode.id },
        data: {
          downloadStatus: 'COMPLETED',
          filePath: relative_path,
          fileSizeBytes: BigInt(file_size),
          downloadProgress: 100,
          usedServer: final_server_used,
        },
      });

      this.emitProgress({
        task_id,
        episode_id: episode.id,
        status: 'COMPLETED',
        progress: 100,
        speed_bytes_sec: 0,
        current_server: final_server_used,
      });

      console.log(`[DownloadManager] ✔ Episodio completado con éxito: ${anime.slug} E${episode.number} (${final_server_used})`);
    } else if (!abort_controller.signal.aborted) {
      await this.handleTaskFailure(task_id, episode.id, part_path, 'Todos los servidores fallaron o fueron eliminados');
    }

    this.active_downloads_map.delete(task_id);
    this.processQueue();
  }

  private async downloadDirectFile(
    stream: ResolvedStream,
    part_path: string,
    task_id: string,
    episode_id: string,
    signal: AbortSignal
  ): Promise<void> {
    const writer = storageService.createStreamWriter(part_path);

    const response = await axios.get(stream.stream_url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        ...(stream.headers || {}),
      },
      signal,
    });

    // 1. Pre-flight de Content-Type
    const content_type = String(response.headers['content-type'] || '').toLowerCase();
    if (content_type.includes('text/html') || content_type.includes('application/json') || content_type.includes('text/plain')) {
      writer.destroy();
      throw new Error(`Contenido no es video: Content-Type=${content_type}`);
    }

    const raw_len = response.headers['content-length'];
    const total_bytes = raw_len ? parseInt(String(raw_len), 10) : 0;

    // Si el servidor reporta un tamaño ridículamente pequeño (< 5MB) para un episodio de anime
    if (total_bytes > 0 && total_bytes < 5 * 1024 * 1024) {
      writer.destroy();
      throw new Error(`Archivo demasiado pequeño (${total_bytes} bytes). Probable mensaje de error o thumbnail.`);
    }

    let downloaded_bytes = 0;
    let last_time = Date.now();
    let bytes_since_last_time = 0;
    let first_chunk_checked = false;

    return new Promise<void>((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        // 2. Magic bytes sniffing en el primer chunk
        if (!first_chunk_checked) {
          first_chunk_checked = true;
          const head_str = chunk.subarray(0, 1024).toString('utf-8').toLowerCase();
          if (
            head_str.includes('<!doctype') ||
            head_str.includes('<html') ||
            head_str.includes('<head') ||
            head_str.includes('<script') ||
            head_str.includes('file was deleted') ||
            head_str.includes('file not found') ||
            head_str.includes('video not found')
          ) {
            writer.destroy();
            response.data.destroy();
            return reject(new Error('Payload rechazado: contiene HTML o mensaje de error en lugar de stream binario'));
          }
        }

        downloaded_bytes += chunk.length;
        bytes_since_last_time += chunk.length;

        const now = Date.now();
        const elapsed = (now - last_time) / 1000;

        if (elapsed >= 1.0) {
          const speed = bytes_since_last_time / elapsed;
          const progress = total_bytes > 0 ? Math.floor((downloaded_bytes / total_bytes) * 100) : 50;

          this.emitProgress({
            task_id,
            episode_id,
            status: 'DOWNLOADING',
            progress,
            speed_bytes_sec: speed,
            current_server: stream.server_name,
          });

          last_time = now;
          bytes_since_last_time = 0;
        }
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        if (downloaded_bytes < 5 * 1024 * 1024) {
          reject(new Error(`Descarga incompleta o corrupta (${downloaded_bytes} bytes < 5 MB)`));
        } else {
          resolve();
        }
      });
      writer.on('error', (err) => reject(err));
      response.data.on('error', (err: any) => reject(err));
    });
  }

  private async downloadHls(
    stream: ResolvedStream,
    part_path: string,
    task_id: string,
    episode_id: string,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const command = ffmpeg(stream.stream_url)
        .addOptions([
          '-c copy',
          '-bsf:a aac_adtstoasc',
          '-movflags +faststart',
        ])
        .output(part_path)
        .on('progress', (prog: { percent?: number }) => {
          const percent = prog.percent ? Math.min(Math.floor(prog.percent), 99) : 50;
          this.emitProgress({
            task_id,
            episode_id,
            status: 'DOWNLOADING',
            progress: percent,
            speed_bytes_sec: 0,
            current_server: stream.server_name,
          });
        })
        .on('end', () => {
          try {
            const stats = fs.statSync(part_path);
            if (stats.size < 5 * 1024 * 1024) {
              reject(new Error(`HLS descargó archivo incompleto (${stats.size} bytes < 5 MB)`));
            } else {
              resolve();
            }
          } catch (e: any) {
            reject(e);
          }
        })
        .on('error', (err) => {
          if (signal.aborted) {
            resolve();
          } else {
            reject(err);
          }
        });

      if (signal) {
        signal.addEventListener('abort', () => {
          command.kill('SIGKILL');
          reject(new Error('Descarga cancelada'));
        });
      }

      command.run();
    });
  }

  private async validateDownloadedMedia(file_path: string): Promise<boolean> {
    try {
      if (!fs.existsSync(file_path)) return false;
      const stat = fs.statSync(file_path);
      if (stat.size < 5 * 1024 * 1024) {
        logger.warn({ size: stat.size }, '[DownloadManager] Archivo menor al umbral mínimo de 5 MB');
        return false;
      }

      const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,width,height',
        '-of',
        'json',
        file_path,
      ]);

      const info = JSON.parse(stdout);
      const v = info.streams?.[0];
      if (v && v.codec_name && ((v.width && v.width > 0) || (v.height && v.height > 0))) {
        logger.info(
          { codec: v.codec_name, resolution: `${v.width}x${v.height}`, size_mb: (stat.size / (1024 * 1024)).toFixed(1) },
          '[DownloadManager] ✔ ffprobe confirmó video reproducible legítimo'
        );
        return true;
      }

      logger.warn({ info }, '[DownloadManager] ffprobe no encontró stream de video válido');
      return false;
    } catch (err: any) {
      logger.warn({ err: err.message }, '[DownloadManager] Error en validación ffprobe');
      return false;
    }
  }

  private async handleTaskFailure(
    task_id: string,
    episode_id: string,
    part_path: string,
    error_message: string
  ): Promise<void> {
    await storageService.cleanPartFile(part_path);

    await prisma.downloadTask.update({
      where: { id: task_id },
      data: {
        status: 'FAILED',
        errorMessage: error_message,
      },
    });

    await prisma.episode.update({
      where: { id: episode_id },
      data: {
        downloadStatus: 'FAILED',
        downloadProgress: 0,
      },
    });

    this.emitProgress({
      task_id,
      episode_id,
      status: 'FAILED',
      progress: 0,
      speed_bytes_sec: 0,
      current_server: null,
      error_message,
    });
  }

  private emitProgress(event: DownloadProgressEvent): void {
    this.emit('progress', event);
  }
}

export const downloadManager = new DownloadManager();
export default downloadManager;
