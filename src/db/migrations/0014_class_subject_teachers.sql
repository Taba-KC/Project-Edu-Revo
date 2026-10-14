ALTER TABLE "class_subjects" ADD COLUMN "person_id" integer REFERENCES "people"("id");
--> statement-breakpoint
ALTER TABLE "class_subjects" ADD COLUMN "active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- Preserve a previous whole-subject teacher allocation when all chapter teachers agree.
UPDATE class_subjects cs SET person_id = allocation.person_id
FROM (SELECT class_subject_id, min(person_id) person_id FROM class_chapters
      GROUP BY class_subject_id HAVING count(DISTINCT person_id) = 1) allocation
WHERE cs.id = allocation.class_subject_id;
--> statement-breakpoint
-- Repair subjects left behind by earlier stream edits without removing teaching history.
UPDATE class_subjects cs SET active = EXISTS (
 SELECT 1 FROM classes c JOIN stream_subjects ss ON ss.stream_id = c.stream_id
 WHERE c.id = cs.class_id AND ss.subject_id = cs.subject_id
);
--> statement-breakpoint
INSERT INTO class_subjects (class_id, subject_id, active)
SELECT c.id, ss.subject_id, true FROM classes c JOIN stream_subjects ss ON ss.stream_id = c.stream_id
ON CONFLICT (class_id, subject_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO class_chapters (class_subject_id, chapter_id, person_id)
SELECT cs.id, ch.id, cs.person_id FROM class_subjects cs
JOIN classes c ON c.id = cs.class_id JOIN grades g ON g.id = c.grade_id
JOIN chapters ch ON ch.subject_id = cs.subject_id AND ch.grade_number = g.number
WHERE cs.active AND NOT EXISTS (SELECT 1 FROM class_chapters cc WHERE cc.class_subject_id = cs.id AND cc.chapter_id = ch.id);
