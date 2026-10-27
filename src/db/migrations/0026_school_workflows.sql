ALTER TABLE classes ADD COLUMN academic_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer;
ALTER TABLE classes ADD COLUMN stream_revision integer NOT NULL DEFAULT 0;
ALTER TABLE classes ADD COLUMN stream_configuration jsonb;
ALTER TABLE class_subjects ADD COLUMN academic_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer;
ALTER TABLE class_subjects DROP CONSTRAINT class_subjects_class_id_subject_id_unique;
ALTER TABLE class_subjects ADD CONSTRAINT class_subjects_class_subject_year_unique UNIQUE(class_id,subject_id,academic_year);
ALTER TABLE learners ALTER COLUMN class_id DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE class_streams (id serial PRIMARY KEY, class_id integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE, stream_id integer NOT NULL REFERENCES streams(id) ON DELETE CASCADE, UNIQUE(class_id,stream_id));
INSERT INTO class_streams(class_id,stream_id) SELECT id,stream_id FROM classes WHERE stream_id IS NOT NULL;
CREATE TABLE learner_stream_selections (id serial PRIMARY KEY, learner_id integer NOT NULL REFERENCES learners(id) ON DELETE CASCADE, class_id integer NOT NULL REFERENCES classes(id) ON DELETE CASCADE, academic_year integer NOT NULL, stream_id integer NOT NULL REFERENCES streams(id) ON DELETE CASCADE, revision integer NOT NULL, UNIQUE(learner_id,class_id,academic_year));
CREATE TABLE learner_class_history (id serial PRIMARY KEY, learner_id integer NOT NULL REFERENCES learners(id) ON DELETE CASCADE, class_id integer REFERENCES classes(id) ON DELETE SET NULL, academic_year integer NOT NULL, started_at timestamp NOT NULL DEFAULT now(), ended_at timestamp);
CREATE UNIQUE INDEX learner_one_open_membership ON learner_class_history(learner_id) WHERE ended_at IS NULL;
INSERT INTO learner_class_history(learner_id,class_id,academic_year) SELECT l.id,l.class_id,c.academic_year FROM learners l JOIN classes c ON c.id=l.class_id;
CREATE TABLE administrative_work (id serial PRIMARY KEY, school_id integer NOT NULL REFERENCES schools(id), person_id integer NOT NULL REFERENCES people(id) ON DELETE CASCADE, capability text NOT NULL CHECK(capability IN ('grades','streams','staff','learners','curriculum')), UNIQUE(person_id,capability));
