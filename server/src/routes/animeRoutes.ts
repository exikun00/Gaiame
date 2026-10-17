import { Router } from 'express';
import animeController from '../controllers/animeController.js';

const router = Router();

router.get('/search', (req, res) => animeController.search(req, res));
router.get('/latest', (req, res) => animeController.getLatest(req, res));
router.get('/watchlist', (req, res) => animeController.getWatchlist(req, res));
router.get('/catalog', (req, res) => animeController.getCatalog(req, res));
router.post('/watchlist/:slug', (req, res) => animeController.toggleWatchlist(req, res));
router.get('/:slug', (req, res) => animeController.getDetails(req, res));

export default router;
