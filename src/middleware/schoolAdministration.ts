import type { Request, Response, NextFunction } from 'express';
import { staffAccess, AccessError, type Capability } from '../services/staffAccessService';
/** Every request checks current grants; revocation is effective without signing in again. */
export function requireSchoolAdministration(write: Capability[], read = write) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const access = await staffAccess(req.caller!);
      if (Number(req.params.schoolId) !== access.schoolId) throw new AccessError('School access denied.');
      const needed = req.method === 'GET' ? read : write;
      if (!access.isPrincipal && !needed.some(key => access.capabilities.includes(key))) throw new AccessError('This administrative work has not been assigned to you.');
      next();
    } catch (error) { if (error instanceof AccessError) return void res.status(error.status).json({ error: error.message }); next(error); }
  };
}
/** Shared curriculum browsing has no school ID in its URL, but still requires a live grant. */
export async function requireCurriculumReader(req: Request, res: Response, next: NextFunction) {
  try { const access = await staffAccess(req.caller!); if (!access.isPrincipal && !access.capabilities.includes('curriculum')) throw new AccessError('Curriculum administration has not been assigned to you.'); next(); }
  catch (error) { if (error instanceof AccessError) return void res.status(error.status).json({ error: error.message }); next(error); }
}
