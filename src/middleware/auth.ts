import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthPayload {
  accountId:   number;
  accountType: string;
  schoolId:    number;
  role?:       string;
}

declare global {
  namespace Express {
    interface Request {
      caller?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.caller = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePerson(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  return next();
}

export function requireLearner(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'learner') {
    return res.status(403).json({ error: 'Learner access required' });
  }
  return next();
}

export function requireDeveloper(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person' || req.caller?.role !== 'developer') {
    return res.status(403).json({ error: 'Developer access required' });
  }
  return next();
}

export function requirePrincipal(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person' || req.caller?.role !== 'principal') {
    return res.status(403).json({ error: 'Principal access required' });
  }
  return next();
}

export function requireTeacher(req: Request, res: Response, next: NextFunction) {
  if (req.caller?.accountType !== 'person') {
    return res.status(403).json({ error: 'Staff access required' });
  }
  if (req.caller?.role !== 'teacher' && req.caller?.role !== 'principal') {
    return res.status(403).json({ error: 'Teacher access required' });
  }
  return next();
}