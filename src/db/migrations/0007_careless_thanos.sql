CREATE TABLE "class_chapters" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_subject_id" integer NOT NULL,
	"chapter_id" integer NOT NULL,
	"person_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_class_subject_id_class_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_person_id_people_id_fk";
--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "subject_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "grade_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "class_chapters" ADD CONSTRAINT "class_chapters_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_chapters" ADD CONSTRAINT "class_chapters_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_chapters" ADD CONSTRAINT "class_chapters_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" DROP COLUMN "class_subject_id";--> statement-breakpoint
ALTER TABLE "chapters" DROP COLUMN "person_id";