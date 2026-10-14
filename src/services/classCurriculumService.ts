import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { classes, grades, classSubjects, subjects } from '../db/schema';
import { getCurriculum } from './curriculumService';
import { SetupError } from './classSubjectService';

// Derive subject and grade from the active class allocation, never client input.
export async function getClassCurriculum(schoolId: number, classId: number, classSubjectId: number, database: Pick<typeof db, 'transaction'> = db) {
  return database.transaction(async tx => {
    const [allocation] = await tx.select({ subjectId: subjects.id, subjectName: subjects.name, gradeNumber: grades.number, className: classes.name })
      .from(classSubjects).innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(grades.schoolId, schoolId), eq(classes.id, classId), eq(classSubjects.id, classSubjectId), eq(classSubjects.active, true)));
    if (!allocation) throw new SetupError('Active class subject not found', 404);
    return { ...await getCurriculum(allocation.subjectId, allocation.gradeNumber, tx), subjectName: allocation.subjectName, className: allocation.className };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
