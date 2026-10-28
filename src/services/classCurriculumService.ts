/**
 * Resolve the shared subject/grade curriculum from an active class allocation and add this
 * class's confirmed teaching coverage. Coverage is not a universal taught flag on shared
 * concepts.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { classes, grades, classSubjects, subjects, lessons, lessonConcepts } from '../db/schema';
import { getCurriculum } from './curriculumService';
import { SetupError } from './classSubjectService';

// Derive subject and grade from the active class allocation, never client input.
/**
 * Resolve the active allocation's shared content and combine it with confirmed teaching
 * history into a read-only curriculum/coverage response.
 */
export async function getClassCurriculum(schoolId: number, classId: number, classSubjectId: number, database: Pick<typeof db, 'transaction'> = db) {
  return database.transaction(async tx => {
    const [allocation] = await tx.select({ subjectId: subjects.id, subjectName: subjects.name, gradeNumber: grades.number, className: classes.name })
      .from(classSubjects).innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
      .innerJoin(classes, eq(classes.id, classSubjects.classId)).innerJoin(grades, eq(grades.id, classes.gradeId))
      .where(and(eq(grades.schoolId, schoolId), eq(classes.id, classId), eq(classSubjects.id, classSubjectId), eq(classSubjects.active, true), eq(classSubjects.academicYear, classes.academicYear)));
    if (!allocation) throw new SetupError('Active class subject not found', 404);
    const curriculum = await getCurriculum(allocation.subjectId, allocation.gradeNumber, tx);
    const confirmed = await tx.selectDistinct({ conceptId: lessonConcepts.conceptId })
      .from(lessonConcepts).innerJoin(lessons, eq(lessons.id, lessonConcepts.lessonId))
      .where(and(eq(lessons.classSubjectId, classSubjectId), eq(lessons.status, 'confirmed')));
    const taught = new Set(confirmed.map(row => row.conceptId));
    let totalConcepts = 0, taughtConcepts = 0;
    const chapters = curriculum.chapters.map(chapter => ({ ...chapter,
      topics: chapter.topics.map(topic => ({ ...topic,
        concepts: topic.concepts.map(concept => {
          const isTaught = taught.has(concept.id);
          totalConcepts++;
          if (isTaught) taughtConcepts++;
          return { ...concept, isTaught };
        }),
      })),
    }));
    return { ...curriculum, chapters, subjectName: allocation.subjectName, className: allocation.className,
      coverage: { totalConcepts, taughtConcepts, percentage: totalConcepts ? Math.round(taughtConcepts / totalConcepts * 1000) / 10 : 0 },
    };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
