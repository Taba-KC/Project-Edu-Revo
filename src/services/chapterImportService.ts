import { db } from '../db';
import { chapters, concepts, classSubjects, classChapters, classes, grades } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function bulkImportChapters(
  rows: { chapterName: string; conceptName: string }[],
  subjectId: number,
  gradeNumber: number,
) {
  const chapterMap = new Map<string, number>();
  const conceptErrors: { row: number; reason: string }[] = [];
  let chapterOrderIndex = 1;
  const conceptOrderMap = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const { chapterName, conceptName } = rows[i];

    if (!chapterMap.has(chapterName)) {
      const [existing] = await db.select().from(chapters)
        .where(and(
          eq(chapters.subjectId, subjectId),
          eq(chapters.gradeNumber, gradeNumber),
          eq(chapters.name, chapterName),
        ));

      if (existing) {
        chapterMap.set(chapterName, existing.id);
      } else {
        const [created] = await db.insert(chapters)
          .values({ subjectId, gradeNumber, name: chapterName, orderIndex: chapterOrderIndex++ })
          .returning();
        chapterMap.set(chapterName, created.id);
        await autoAssignToExistingClasses(created.id, subjectId, gradeNumber);
      }

      conceptOrderMap.set(chapterName, 1);
    }

    const chapterId = chapterMap.get(chapterName)!;
    const conceptIndex = conceptOrderMap.get(chapterName)!;

    try {
      await db.insert(concepts).values({ chapterId, name: conceptName, orderIndex: conceptIndex });
      conceptOrderMap.set(chapterName, conceptIndex + 1);
    } catch {
      conceptErrors.push({ row: i + 2, reason: `Could not add concept "${conceptName}" to chapter "${chapterName}"` });
    }
  }

  return {
    chaptersCreated: chapterOrderIndex - 1,
    conceptsCreated: rows.length - conceptErrors.length,
    errors: conceptErrors,
  };
}

async function autoAssignToExistingClasses(chapterId: number, subjectId: number, gradeNumber: number) {
  const matchingClassSubjects = await db
    .select({ classSubjectId: classSubjects.id })
    .from(classSubjects)
    .innerJoin(classes, eq(classes.id, classSubjects.classId))
    .innerJoin(grades, eq(grades.id, classes.gradeId))
    .where(and(eq(classSubjects.subjectId, subjectId), eq(grades.number, gradeNumber)));

  if (matchingClassSubjects.length === 0) return;

  await db.insert(classChapters).values(
    matchingClassSubjects.map(cs => ({ classSubjectId: cs.classSubjectId, chapterId }))
  );
}