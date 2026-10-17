import { Router } from 'express';
import streamController from '../controllers/streamController.js';

const router = Router();

router.get('/local/:episodeId', (req, res) => streamController.streamLocal(req, res));
router.get('/remote/:episodeId', (req, res) => streamController.resolveRemote(req, res));
router.get('/servers/:episodeId', (req, res) => streamController.getServers(req, res));

export default router;
