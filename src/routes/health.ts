/**
 * HTTP routing for this feature. A small server health response useful for checking whether
 * Express is reachable. req.params contains URL IDs, req.body contains submitted JSON, and
 * res.json sends the response. Read each handler's guards before assuming access is allowed.
 */
// pulling in Express's Router class
import { Router } from 'express';

// creating an instance of the router
const router = Router();

// registering a handler for GET /health
/**
 * GET /health: Read/return data.
 */
router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// make this router available to other files that import it
export default router;  