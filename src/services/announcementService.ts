/**
 * Create/read/edit/delete announcements and derive learner-visible school/class notices.
 * Backend support here does not mean the new announcement bookshelf UI is finished.
 */
import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { announcements, classes, people } from '../db/schema';

/**
 * Insert one announcement from the supplied fields; recipient scoping is represented by its
 * school/class relationships.
 */
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

/**
 * Read announcements in the requested school, using the implemented optional class
 * filtering.
 */
export async function getSchoolAnnouncements(schoolId: number) {
  return db
    .select({
      id: announcements.id,
      schoolId: announcements.schoolId,
      createdBy: announcements.createdBy,
      title: announcements.title,
      body: announcements.body,
      audienceType: announcements.audienceType,
      audienceId: announcements.audienceId,
      createdAt: announcements.createdAt,
      createdByTitle: people.title,
      createdByFirstName: people.firstName,
      createdBySurname: people.surname,
    })
    .from(announcements)
    .leftJoin(people, eq(people.id, announcements.createdBy))
    .where(eq(announcements.schoolId, schoolId))
    .orderBy(desc(announcements.createdAt));
}

/**
 * Persist the supplied announcement changes and return the updated record.
 */
export async function updateAnnouncement(
  schoolId: number,
  announcementId: number,
  data: {
    title?: string;
    body?: string;
    audienceType?: 'all' | 'grade' | 'class' | 'stream';
    audienceId?: number | null;
  },
) {
  const updates = {
    ...data,
    ...(data.audienceType === 'all' ? { audienceId: null } : {}),
  };

  const [announcement] = await db
    .update(announcements)
    .set(updates)
    .where(and(eq(announcements.id, announcementId), eq(announcements.schoolId, schoolId)))
    .returning();

  return announcement ?? null;
}

/**
 * Delete the announcement record. The calling route must establish the caller's right to do
 * this.
 */
export async function deleteAnnouncement(schoolId: number, announcementId: number) {
  const [announcement] = await db
    .delete(announcements)
    .where(and(eq(announcements.id, announcementId), eq(announcements.schoolId, schoolId)))
    .returning({ id: announcements.id });

  return announcement ?? null;
}

/**
 * Combine the learner's school/class relationships to obtain the notices relevant to that
 * learner.
 */
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
