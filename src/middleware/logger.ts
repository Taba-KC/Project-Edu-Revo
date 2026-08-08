import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.path}`);
  next();
}




/** NOTES */

/*
 * Request, Response, NextFunction — TypeScript types from Express describing the three objects every middleware function receives.
 * req.method — the HTTP method: GET, POST, PUT, DELETE.
 * req.path — the URL path: /schools, /health, etc.
 * next() — tells Express to move on to the next middleware or route handler. 
    - Without calling next(), the request would stop here and never reach the route. 
    - This is the most important line — forgetting it is a common mistake that causes requests to hang indefinitely.
 */