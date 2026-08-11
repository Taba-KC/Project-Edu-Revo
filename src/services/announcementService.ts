import { eq, and, or, inArray } from 'drizzle-orm';
import { db } from '../db';
import { announcements, classes } from '../db/schema';

export async function createAnnouncement(data: {
  schoolId: number;
  createdBy: number;
  title: string;
  body: string;
  audienceType: 'all' | 'grade' | 'class' | 'stream';
  audienceId?: number;
}) {
  const [announcement] = await db.insert(announcements).values(data).returning();
  return announcement;
}

export async function getSchoolAnnouncements(schoolId: number) {
  return db
    .select()
    .from(announcements)
    .where(eq(announcements.schoolId, schoolId))
    .orderBy(announcements.createdAt);
}

export async function getLearnerAnnouncements(schoolId: number, classId: number) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) return [];

  return db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.schoolId, schoolId),
        or(
          eq(announcements.audienceType, 'all'),
          and(eq(announcements.audienceType, 'class'),  eq(announcements.audienceId, classId)),
          and(eq(announcements.audienceType, 'grade'),  eq(announcements.audienceId, cls.gradeId)),
          and(eq(announcements.audienceType, 'stream'), eq(announcements.audienceId, cls.streamId!)),
        )
      )
    )
    .orderBy(announcements.createdAt);
}