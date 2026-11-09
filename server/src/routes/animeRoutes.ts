import { Router } from 'express';
import animeController from '../controllers/animeController.js';

const router = Router();

router.get('/home', (req, res) => animeController.getHome(req, res));
router.get('/search', (req, res) => animeController.search(req, res));
router.get('/latest', (req, res) => animeController.getLatest(req, res));
router.get('/watchlist', (req, res) => animeController.getWatchlist(req, res));
router.get('/catalog', (req, res) => animeController.getCatalog(req, res));
router.post('/watchlist/:slug', (req, res) => animeController.toggleWatchlist(req, res));
router.get('/:slug/franchise', (req, res) => animeController.getFranchise(req, res));
router.get('/:slug/episodes', (req, res) => animeController.getEpisodes(req, res));
router.get('/:slug', (req, res) => animeController.getDetails(req, res));

export default router;
