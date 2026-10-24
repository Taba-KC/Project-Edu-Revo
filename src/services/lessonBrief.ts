import { z } from 'zod';

const item = z.string().trim().min(1).max(1000);
export const lessonBriefSchema = z.object({
  prerequisites: z.array(item).max(5),
  learningOutcomes: z.array(item).max(5),
}).strict();
export type LessonBriefContent = z.infer<typeof lessonBriefSchema>;
