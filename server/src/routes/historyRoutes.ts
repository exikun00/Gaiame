import { Router } from 'express';
import historyController from '../controllers/historyController.js';

const router = Router();

router.get('/', (req, res) => historyController.getHistory(req, res));
router.post('/', (req, res) => historyController.updateProgress(req, res));
router.delete('/:id', (req, res) => historyController.deleteItem(req, res));
router.delete('/', (req, res) => historyController.clearHistory(req, res));

export default router;
