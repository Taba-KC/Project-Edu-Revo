-- Freeze confirmed lesson audiences so transfers cannot rewrite feedback statistics.
ALTER TABLE lessons ADD COLUMN learner_ids_snapshot jsonb;
UPDATE lessons l SET learner_ids_snapshot = COALESCE((
 SELECT jsonb_agg(a.learner_id ORDER BY a.learner_id) FROM (
  SELECT f.learner_id FROM lesson_feedback f JOIN lesson_concepts lc ON lc.id=f.lesson_concept_id WHERE lc.lesson_id=l.id
  UNION
  SELECT lr.id FROM learners lr JOIN class_subjects cs ON cs.class_id=lr.class_id JOIN classes c ON c.id=cs.class_id
  WHERE cs.id=l.class_subject_id AND cs.active AND cs.academic_year=c.academic_year
 ) a
), '[]'::jsonb) WHERE l.status='confirmed';
-- Legacy audiences are reconstructed once; exact attendance was not recorded before this migration.

--> statement-breakpoint
ALTER TABLE lessons ADD CONSTRAINT lessons_audience_array CHECK (learner_ids_snapshot IS NULL OR jsonb_typeof(learner_ids_snapshot)='array');
CREATE UNIQUE INDEX learners_school_admission_normalized_unique ON learners(school_id, lower(btrim(admission_number)));
CREATE FUNCTION validate_school_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='learners' AND NEW.class_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM classes c JOIN grades g ON g.id=c.grade_id WHERE c.id=NEW.class_id AND g.school_id=NEW.school_id) THEN
   RAISE EXCEPTION 'Learner class must belong to the learner school' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='class_subjects' THEN
  IF NEW.active AND NOT EXISTS (SELECT 1 FROM classes WHERE id=NEW.class_id AND academic_year=NEW.academic_year) THEN
   RAISE EXCEPTION 'Active allocation must belong to the current class year' USING ERRCODE='23514';
  END IF;
  IF NEW.person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM people p JOIN grades g ON g.school_id=p.school_id JOIN classes c ON c.grade_id=g.id WHERE c.id=NEW.class_id AND p.id=NEW.person_id AND p.role IN ('teacher','principal')) THEN
   RAISE EXCEPTION 'Assigned teacher must belong to the class school' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER learners_school_relationship BEFORE INSERT OR UPDATE OF school_id,class_id ON learners FOR EACH ROW EXECUTE FUNCTION validate_school_relationships();
CREATE TRIGGER allocations_school_relationship BEFORE INSERT OR UPDATE ON class_subjects FOR EACH ROW EXECUTE FUNCTION validate_school_relationships();
