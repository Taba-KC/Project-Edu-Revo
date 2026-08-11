ALTER TABLE "chapters" DROP CONSTRAINT "chapters_grade_id_grades_id_fk";
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "grade_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" DROP COLUMN "grade_id";