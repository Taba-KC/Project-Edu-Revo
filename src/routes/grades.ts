import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createGrade, getGradesBySchool } from '../services/gradeService';
import { getSchoolById } from '../services/schoolService';

const router = Router();

const createGradeSchema = z.object({
  number: z.number().int().min(7).max(12),
});

router.post('/schools/:schoolId/grades', async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  if (isNaN(schoolId)) {
    res.status(400).json({ error: 'Invalid school ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const result = createGradeSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return;
  }

  const grade = await createGrade({ schoolId, number: result.data.number });
  res.status(201).json(grade);
});

router.get('/schools/:schoolId/grades', async (req: Request, res: Response) => {
  const schoolId = parseInt(req.params.schoolId as string);
  if (isNaN(schoolId)) {
    res.status(400).json({ error: 'Invalid school ID' });
    return;
  }

  const school = await getSchoolById(schoolId);
  if (!school) {
    res.status(404).json({ error: 'School not found' });
    return;
  }

  const grades = await getGradesBySchool(schoolId);
  res.json(grades);
});

export default router;



/** NOTES */

/*
 * These routes are nested under /schools/:schoolId/. 
    - This is a deliberate design — a grade does not exist independently, it always belongs to a school. 
        -The URL structure reflects that relationship. /schools/2/grades means "grades belonging to school 2." 
    - This pattern is called a nested resource and you will see it throughout the API.

Why we check the school exists before acting:

Before creating a grade or listing grades, we verify the school exists. This gives a clear 404 if an invalid schoolId is passed, rather than silently returning an empty list or creating an orphaned record. A caller always knows exactly what went wrong.
 */