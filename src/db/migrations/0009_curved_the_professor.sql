CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience_type" text NOT NULL,
	"audience_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_people_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;