import { db } from '../db';
import { people } from '../db/schema';
import { and, eq } from 'drizzle-orm';
/**
 * Authentication and coarse role checks for incoming HTTP requests. requireAuth verifies the
 * signed token and attaches req.caller; role middleware narrows permitted account types.
 * Services/routes still need record-level school/class ownership checks.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { learnerSession, AccountReviewError } from '../services/accountReviewService';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthPayload {
  accountId:   number;
  accountType: string;
  schoolId:    number | null;
  role?:       string;
  claimId?: number | null;
  sessionVersion?: number;
  learnerAccess?: 'pending' | 'restricted' | 'active';
  claimReference?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      caller?: AuthPayload;
    }
  }
}

/**
 * Verify the bearer token signature and expiry before trusting its claims. Successful
 * verification attaches caller details for later handlers.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as AuthPayload;
    // Roles and school membership can change while a signed token is still valid.
    if (payload.accountType === 'person') {
      const [current] = await db.select().from(people).where(and(eq(people.id, payload.accountId), eq(people.schoolId, payload.schoolId ?? -1)));
      if (!current?.accountSetUp) return res.status(403).json({ error: 'Your staff account is no longer available.' });
      payload.role = current.role;
    }
    req.caller = payload;
    if (payload.accountType === 'learner') {
      const session = await learnerSession(payload);
      payload.learnerAccess = session.access as AuthPayload['learnerAccess'];
      payload.claimReference = session.reference;
      const path = req.originalUrl.split('?')[0];
      if (session.access === 'pending') {
        if (req.method === 'GET' && path === '/learners/me/learning-setup') return res.json({ status: 'awaiting-confirmation', reference: session.reference });
        return res.status(403).json({ error: 'Your account is awaiting confirmation by your class manager.' });
      }
      // Restricted candidate credentials get read-only, server-filtered learning content.
      if (session.access === 'restricted' && !(req.method === 'GET' && ['/learners/me/learning-setup', '/learners/me/workspace', '/learners/me/notifications'].includes(path))) return res.status(403).json({ error: 'Ask your class manager to confirm your password reference before using this feature.' });
      if (session.access === 'restricted' && path === '/learners/me/notifications') return res.json([]);
    }
    return next();
  } catch (error) {
    if (error instanceof AccountReviewError) return res.status(error.status).json({ error: error.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Allow staff account types through; finer role and record ownership checks still belong in
 * the following middleware/service.
 */
export function requirePerson(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  return next();
}

/**
 * Require a learner token. The service must still check which class/lesson this learner may
 * access.
 */
export function requireLearner(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'learner') {
    return res.status(403).json({ error: 'Learner access required' });
  }
  return next();
}

/**
 * Limit this endpoint to a person account with the developer role.
 */
export function requireDeveloper(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person' || req.caller?.role !== 'developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  return next();
}

/**
 * Require a principal role before a principal-only handler runs. School ownership is a
 * separate check.
 */
export function requirePrincipal(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person' || req.caller?.role !== 'principal') {
    return res.status(403).json({ error: 'Principal access required' });
  }
  return next();
}

/**
 * Allow teaching staff roles, including principals where supported. The teacher service then
 * checks the actual allocation owner.
 */
export function requireTeacher(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  if (req.caller?.role !== 'teacher' && req.caller?.role !== 'principal') {
    return res.status(403).json({ error: 'Teacher access required' });
  }
  return next();
}
