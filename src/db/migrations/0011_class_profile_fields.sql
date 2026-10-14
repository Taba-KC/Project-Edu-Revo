ALTER TABLE "classes" ADD COLUMN "class_teacher_id" integer;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "profile_image_url" text;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_class_teacher_id_people_id_fk" FOREIGN KEY ("class_teacher_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
