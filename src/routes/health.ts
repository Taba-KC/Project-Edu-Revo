// pulling in Express's Router class
import { Router } from 'express';

// creating an instance of the router
const router = Router();

// registering a handler for GET /health
router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// make this router available to other files that import it
export default router;  