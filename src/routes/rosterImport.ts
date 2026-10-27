/**
 * HTTP routing for this feature. Permission-checked spreadsheet preview and commit endpoints
 * for staff or learner accounts. req.params contains URL IDs, req.body contains submitted
 * JSON, and res.json sends the response. Read each handler's guards before assuming access
 * is allowed.
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { previewRoster, saveRoster, RosterImportError, RosterKind, rosterRowsSchema } from '../services/rosterImportService';
import { requireSchoolAdministration } from '../middleware/schoolAdministration';
import { reviewLearnerRoster,commitLearnerRoster,rosterImpact,type LearnerImportMode } from '../services/learnerRosterService';
import { parseRosterWorkbook } from '../services/rosterImportService';
import { db } from '../db';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 3 } });
/**
 * Verify principal access to the school named in the import request before parsing or
 * writing roster data.
 */
function authorise(req: Request, res: Response, next: NextFunction) {
  const schoolId = Number(req.params.schoolId);
  if (!Number.isSafeInteger(schoolId) || schoolId <= 0) return res.status(400).json({ error: 'Invalid school ID' });
  if (req.caller?.schoolId !== schoolId) return res.status(403).json({ error: 'School access denied' });
  if (req.params.classId && (!Number.isSafeInteger(Number(req.params.classId)) || Number(req.params.classId) <= 0)) return res.status(400).json({ error: 'Invalid class ID' });
  next();
}
/**
 * Return expected import/validation failures as useful client messages and forward
 * unexpected errors.
 */
function handleError(error: unknown, res: Response) {
  if (error instanceof RosterImportError) return res.status(error.status).json({ error: error.message });
  const databaseError = error as { code?: string; cause?: { code?: string } };
  if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return res.status(409).json({ error: 'Nothing saved. A number was registered elsewhere. Go back and preview again.' });
  throw error;
}
for (const [base, kind] of [['/schools/:schoolId/people/import', 'staff'], ['/schools/:schoolId/classes/:classId/learners/import', 'learners']] as const) {
  /**
   * POST the path constructed below: Create data or run the submitted operation.
   */
  router.post(base + '/preview', requireAuth, requireSchoolAdministration(kind==='staff'?['staff']:['grades','learners']), authorise, (req, res, next) => {
    upload.single('file')(req, res, error => {
      if (error) return res.status(400).json({ error: 'Upload one spreadsheet, up to 2 MB.' });
      next();
    });
  }, async (req, res) => {
    if (!req.file || !/\.(xlsx|xls|csv)$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Choose an .xlsx, .xls or .csv spreadsheet.' });
    try {
      if(kind==='learners'){const rows=parseRosterWorkbook(req.file.buffer,'learners');await db.transaction(tx=>reviewLearnerRoster(tx,Number(req.params.schoolId),Number(req.params.classId),[],(req.body.mode??'add') as LearnerImportMode,Number(req.body.academicYear)));return res.json({rows,existingIdentifiers:[]});}
      return res.json(await previewRoster(Number(req.params.schoolId), kind, req.file.buffer, req.params.classId ? Number(req.params.classId) : undefined)); }
    catch (error) { return handleError(error, res); }
  });
  /**
   * POST the path constructed below: Create data or run the submitted operation.
   */
  router.post(base + '/commit', requireAuth, requireSchoolAdministration(kind==='staff'?['staff']:['grades','learners']), authorise, async (req, res) => {
    const result = rosterRowsSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Use 1–500 rows, with text fields up to 200 characters.' });
    try {
      if(kind==='learners'){if(!req.body.reviewHash)return res.status(409).json({error:'Review the register changes before saving.'});return res.status(201).json(await db.transaction(tx=>commitLearnerRoster(tx,Number(req.params.schoolId),Number(req.params.classId),result.data.rows,(req.body.mode??'add') as LearnerImportMode,Number(req.body.academicYear),String(req.body.reviewHash))));}
      return res.status(201).json(await saveRoster(Number(req.params.schoolId), kind as RosterKind, result.data.rows, req.params.classId ? Number(req.params.classId) : undefined)); }
    catch (error) { return handleError(error, res); }
  });
  router.post(base+'/review',requireAuth,requireSchoolAdministration(kind==='staff'?['staff']:['grades','learners']),authorise,async(req,res)=>{
    const parsed=rosterRowsSchema.safeParse(req.body);if(kind!=='learners'||!parsed.success)return res.status(400).json({error:'Submit valid learner rows to review.'});
    try{return res.json(rosterImpact(await db.transaction(tx=>reviewLearnerRoster(tx,Number(req.params.schoolId),Number(req.params.classId),parsed.data.rows,req.body.mode,Number(req.body.academicYear)))));}catch(error){return handleError(error,res);}
  });
  // Direct uploads must no longer bypass the review step.
  /**
   * POST the path constructed below: Create data or run the submitted operation.
   */
  router.post(base, requireAuth, requireSchoolAdministration(kind==='staff'?['staff']:['grades','learners']), authorise, (_req, res) => res.status(400).json({ error: 'Preview the spreadsheet and confirm the edited rows before saving.' }));
}
export default router;
