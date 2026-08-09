ALTER TABLE "teachers" RENAME TO "people";--> statement-breakpoint
ALTER TABLE "chapters" RENAME COLUMN "teacher_id" TO "person_id";--> statement-breakpoint
ALTER TABLE "people" RENAME COLUMN "email" TO "staff_number";--> statement-breakpoint
ALTER TABLE "people" DROP CONSTRAINT "teachers_email_unique";--> statement-breakpoint
ALTER TABLE "chapters" DROP CONSTRAINT "chapters_teacher_id_teachers_id_fk";
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "school_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "account_set_up" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_school_id_staff_number_unique" UNIQUE("school_id","staff_number");