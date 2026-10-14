ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "class_subject_id" integer REFERENCES "class_subjects"("id");
--> statement-breakpoint
UPDATE concepts c SET class_subject_id = source.class_subject_id
FROM (SELECT lc.concept_id, min(l.class_subject_id) AS class_subject_id FROM lesson_concepts lc JOIN lessons l ON l.id=lc.lesson_id GROUP BY lc.concept_id HAVING count(DISTINCT l.class_subject_id)=1) source
WHERE c.id=source.concept_id AND c.is_custom=true AND c.class_subject_id IS NULL;
