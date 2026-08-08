import express from 'express';
import { requestLogger } from './middleware/logger';
import healthRouter from './routes/health';
import schoolsRouter from './routes/schools';

const app = express();

app.use(express.json());
app.use(requestLogger);
app.use(healthRouter);
app.use(schoolsRouter);   // The schools routes are now mounted on the application and will respond to requests.

export default app;





/** NOTES */

/*
 * One new line — app.use(requestLogger) — registers the logger middleware. 
 * Every request that hits the server will now log its method and path to the terminal before reaching any route handler.

    Why order matters here:

 * Express runs middleware in the order it is registered. 
   - express.json() runs first — it parses the request body. 
   - requestLogger runs second — it logs the request. 
   - The route handlers run last. 
 * If you registered requestLogger before express.json(), the body would not be parsed yet when the logger runs. 
   - Order is always intentional in an Express middleware chain.
 */