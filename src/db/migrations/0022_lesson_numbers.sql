ALTER TABLE "class_subjects" ADD COLUMN "lesson_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "lesson_number" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY class_subject_id ORDER BY created_at, id)::integer AS number
  FROM lessons
)
UPDATE lessons SET lesson_number = numbered.number FROM numbered WHERE lessons.id = numbered.id;
--> statement-breakpoint
UPDATE class_subjects SET lesson_count = counts.total
FROM (SELECT class_subject_id, max(lesson_number) AS total FROM lessons GROUP BY class_subject_id) counts
WHERE class_subjects.id = counts.class_subject_id;
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_class_subject_number_unique" UNIQUE ("class_subject_id", "lesson_number");
--> statement-breakpoint
CREATE FUNCTION assign_lesson_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE class_subjects SET lesson_count = lesson_count + 1
  WHERE id = NEW.class_subject_id RETURNING lesson_count INTO NEW.lesson_number;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lessons_assign_number BEFORE INSERT ON lessons
FOR EACH ROW EXECUTE FUNCTION assign_lesson_number();
