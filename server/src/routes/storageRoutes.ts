import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import storageService from '../services/storage.js';
import prisma from '../services/prisma.js';

const router = Router();

// Servir carátula local con fallback bajo demanda
router.get('/covers/:filename', async (req: Request, res: Response) => {
  const filename = (req.params['filename'] as string) || '';
  const slug = filename.replace(/\.(jpg|jpeg|webp|png)$/i, '');
  const cover_path = storageService.getCoverPath(slug);

  if (existsSync(cover_path)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.sendFile(cover_path);
    return;
  }

  // Fallback: Descarga bajo demanda desde JKAnime CDN
  const remote_url = `https://cdn.jkdesa.com/assets/images/animes/image/${slug}.jpg`;
  const saved_url = await storageService.saveAnimeCover(slug, remote_url);

  if (saved_url && existsSync(cover_path)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.sendFile(cover_path);
    return;
  }

  res.status(404).json({ error: 'Carátula no encontrada' });
});

// Servir miniatura de episodio con fallback
router.get('/thumbnails/:slug/:number', async (req: Request, res: Response) => {
  const slug = (req.params['slug'] as string) || '';
  const number = (req.params['number'] as string) || '';
  const ep_num = parseInt(number.replace(/\.(jpg|jpeg|webp|png)$/i, ''), 10);

  if (isNaN(ep_num)) {
    res.status(400).json({ error: 'Número de episodio inválido' });
    return;
  }

  const thumb_path = storageService.getThumbnailPath(slug, ep_num);

  if (existsSync(thumb_path)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.sendFile(thumb_path);
    return;
  }

  // Fallback: buscar imagen remota en la base de datos si existe
  try {
    const episode = await prisma.episode.findFirst({
      where: {
        number: ep_num,
        season: { anime: { slug } },
      },
      select: { image: true },
    });

    if (episode?.image && episode.image.startsWith('http')) {
      const saved = await storageService.saveEpisodeThumbnail(slug, ep_num, episode.image);
      if (saved && existsSync(thumb_path)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        res.sendFile(thumb_path);
        return;
      }
    }
  } catch {
    // Continuar al 404
  }

  res.status(404).json({ error: 'Miniatura no encontrada' });
});

export default router;
