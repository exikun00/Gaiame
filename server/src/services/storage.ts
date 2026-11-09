import path from 'path';
import fs from 'fs/promises';
import { existsSync, createReadStream, createWriteStream, statSync } from 'fs';
import axios from 'axios';
import prisma from './prisma.js';
import { ANIME_BASE_URL } from '../config/constants.js';

export class StorageService {
  private base_data_dir: string;

  constructor() {
    const raw_dir = process.env.DATA_DIR || './data';
    if (!path.isAbsolute(raw_dir)) {
      if (process.cwd().endsWith('/server') || process.cwd().endsWith('\\server')) {
        this.base_data_dir = path.resolve(process.cwd(), '..', raw_dir);
      } else {
        this.base_data_dir = path.resolve(process.cwd(), raw_dir);
      }
    } else {
      this.base_data_dir = raw_dir;
    }
  }

  public getDataDir(): string {
    return this.base_data_dir;
  }

  public getCoversDir(): string {
    return path.join(this.base_data_dir, 'covers');
  }

  public getThumbnailsDir(): string {
    return path.join(this.base_data_dir, 'thumbnails');
  }

  public sanitizeSlug(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  public getRelativeEpisodePath(anime_slug: string, season_num: number, episode_num: number): string {
    const clean_slug = this.sanitizeSlug(anime_slug);
    return path.join('downloads', clean_slug, `temporada-${season_num}`, `episodio-${episode_num}.mp4`);
  }

  public getAbsoluteEpisodePath(relative_path: string): string {
    return path.resolve(this.base_data_dir, relative_path);
  }

  public async ensureDirectoryExists(dir_path: string): Promise<void> {
    if (!existsSync(dir_path)) {
      await fs.mkdir(dir_path, { recursive: true });
    }
  }

  public async prepareEpisodeDownloadPath(
    anime_slug: string,
    season_num: number,
    episode_num: number
  ): Promise<{ relative_path: string; absolute_path: string; part_path: string }> {
    const relative_path = this.getRelativeEpisodePath(anime_slug, season_num, episode_num);
    const absolute_path = this.getAbsoluteEpisodePath(relative_path);
    const part_path = `${absolute_path}.part`;

    const dir_path = path.dirname(absolute_path);
    await this.ensureDirectoryExists(dir_path);

    return {
      relative_path,
      absolute_path,
      part_path,
    };
  }

  public async finalizeDownload(part_path: string, absolute_path: string): Promise<number> {
    if (existsSync(part_path)) {
      await fs.rename(part_path, absolute_path);
      const stat = await fs.stat(absolute_path);
      return stat.size;
    }
    throw new Error(`Archivo temporal .part no encontrado: ${part_path}`);
  }

  public async cleanPartFile(part_path: string): Promise<void> {
    try {
      if (existsSync(part_path)) {
        await fs.unlink(part_path);
      }
    } catch (error) {
      console.warn(`Error limpiando archivo .part (${part_path}):`, error);
    }
  }

  public async deleteEpisodeFile(episode_id: string): Promise<boolean> {
    const episode = await prisma.episode.findUnique({
      where: { id: episode_id },
    });

    if (!episode || !episode.filePath) {
      return false;
    }

    const absolute_path = this.getAbsoluteEpisodePath(episode.filePath);

    if (existsSync(absolute_path)) {
      await fs.unlink(absolute_path);
    }

    await prisma.episode.update({
      where: { id: episode_id },
      data: {
        downloadStatus: 'PENDING',
        filePath: null,
        fileSizeBytes: null,
        downloadProgress: 0,
        usedServer: null,
      },
    });

    return true;
  }

  public async getStorageUsage(): Promise<{
    used_bytes: number;
    episode_count: number;
  }> {
    const episodes = await prisma.episode.findMany({
      where: { downloadStatus: 'COMPLETED' },
      select: { fileSizeBytes: true },
    });

    let total_bytes = 0;
    for (const ep of episodes) {
      if (ep.fileSizeBytes) {
        total_bytes += Number(ep.fileSizeBytes);
      }
    }

    return {
      used_bytes: total_bytes,
      episode_count: episodes.length,
    };
  }

  public createStreamReader(absolute_path: string, options?: { start?: number; end?: number }) {
    return createReadStream(absolute_path, options);
  }

  public createStreamWriter(file_path: string) {
    return createWriteStream(file_path);
  }

  public getFileStat(absolute_path: string) {
    if (!existsSync(absolute_path)) return null;
    return statSync(absolute_path);
  }

  public getCoverPath(slug: string): string {
    return path.join(this.getCoversDir(), `${this.sanitizeSlug(slug)}.jpg`);
  }

  public getThumbnailPath(slug: string, episode_number: number): string {
    return path.join(this.getThumbnailsDir(), this.sanitizeSlug(slug), `${episode_number}.jpg`);
  }

  public async saveAnimeCover(slug: string, remote_url: string): Promise<string | null> {
    const clean_slug = this.sanitizeSlug(slug);
    const target_path = this.getCoverPath(slug);

    if (existsSync(target_path)) {
      return `/api/storage/covers/${clean_slug}.jpg`;
    }

    if (!remote_url || !remote_url.startsWith('http')) {
      return null;
    }

    try {
      await this.ensureDirectoryExists(this.getCoversDir());
      const response = await axios.get(remote_url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer:  ANIME_BASE_URL,
        },
      });

      if (response.status === 200 && response.data && response.data.length > 200) {
        await fs.writeFile(target_path, Buffer.from(response.data));
        return `/api/storage/covers/${clean_slug}.jpg`;
      }
    } catch (error) {
      console.warn(`[StorageService] No se pudo descargar carátula local para ${slug} (${remote_url}):`, (error as Error).message);
    }

    return null;
  }

  public async saveEpisodeThumbnail(
    slug: string,
    episode_number: number,
    remote_url: string
  ): Promise<string | null> {
    const clean_slug = this.sanitizeSlug(slug);
    const target_dir = path.join(this.getThumbnailsDir(), clean_slug);
    const target_path = this.getThumbnailPath(slug, episode_number);

    if (existsSync(target_path)) {
      return `/api/storage/thumbnails/${clean_slug}/${episode_number}.jpg`;
    }

    if (!remote_url || !remote_url.startsWith('http')) {
      return null;
    }

    try {
      await this.ensureDirectoryExists(target_dir);
      const response = await axios.get(remote_url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer:  ANIME_BASE_URL,
        },
      });

      if (response.status === 200 && response.data && response.data.length > 100) {
        await fs.writeFile(target_path, Buffer.from(response.data));
        return `/api/storage/thumbnails/${clean_slug}/${episode_number}.jpg`;
      }
    } catch (error) {
      console.warn(
        `[StorageService] No se pudo descargar miniatura local para ${slug} ep ${episode_number} (${remote_url}):`,
        (error as Error).message
      );
    }

    return null;
  }

  public async deleteAnimeFiles(slug: string): Promise<void> {
    const clean_slug = this.sanitizeSlug(slug);

    // 1. Eliminar carpeta de descargas de episodios
    const downloads_dir = path.join(this.base_data_dir, 'downloads', clean_slug);
    try {
      if (existsSync(downloads_dir)) {
        await fs.rm(downloads_dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[StorageService] Error eliminando carpeta de descargas ${downloads_dir}:`, err);
    }

    // 2. Eliminar carátula local
    const cover_file = this.getCoverPath(slug);
    try {
      if (existsSync(cover_file)) {
        await fs.unlink(cover_file);
      }
    } catch (err) {
      console.warn(`[StorageService] Error eliminando carátula ${cover_file}:`, err);
    }

    // 3. Eliminar carpeta de miniaturas
    const thumbnails_dir = path.join(this.getThumbnailsDir(), clean_slug);
    try {
      if (existsSync(thumbnails_dir)) {
        await fs.rm(thumbnails_dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[StorageService] Error eliminando miniaturas ${thumbnails_dir}:`, err);
    }
  }
}

export const storageService = new StorageService();
export default storageService;
