import { Router } from 'express';
import { createImport, getImports, deleteImport, addCalculatedField, deleteColumn } from '../controllers/importsController';
import { getPlayersByImportId, getScatterData } from '../controllers/playersController';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Imports routes
router.post('/imports', createImport);
router.get('/imports', getImports);
router.delete('/imports/:importId', deleteImport);
router.post('/imports/:importId/calculated-fields', addCalculatedField);
router.delete('/imports/:importId/columns/:colName', deleteColumn);

// Players routes
router.get('/players/:importId', getPlayersByImportId);
router.get('/players/:importId/scatter', getScatterData);

export default router;
