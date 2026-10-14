CREATE TABLE app_managers (
 id serial PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE curriculum_libraries (
 id serial PRIMARY KEY, subject_id integer NOT NULL REFERENCES subjects(id),
 grade_number integer NOT NULL CHECK (grade_number BETWEEN 8 AND 12),
 revision integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now(),
 UNIQUE(subject_id, grade_number)
);
--> statement-breakpoint
ALTER TABLE refresh_tokens ALTER COLUMN school_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE chapters ADD COLUMN active boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE concepts ADD COLUMN active boolean NOT NULL DEFAULT true;
