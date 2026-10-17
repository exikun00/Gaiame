import { Router } from 'express';
import downloadController from '../controllers/downloadController.js';

const router = Router();

router.post('/episode/:episodeId', (req, res) => downloadController.enqueueEpisode(req, res));
router.post('/season/:seasonId', (req, res) => downloadController.enqueueSeason(req, res));
router.post('/anime/:animeId', (req, res) => downloadController.enqueueAnime(req, res));
router.delete('/task/:taskId', (req, res) => downloadController.cancelTask(req, res));
router.delete('/episode/:episodeId/file', (req, res) => downloadController.deleteFile(req, res));
router.get('/tasks', (req, res) => downloadController.getTasks(req, res));
router.get('/completed', (req, res) => downloadController.getDownloadedEpisodes(req, res));
router.get('/storage', (req, res) => downloadController.getStorageUsage(req, res));
router.get('/progress', (req, res) => downloadController.streamProgress(req, res));

export default router;
