CREATE TABLE topics (
 id serial PRIMARY KEY, chapter_id integer NOT NULL REFERENCES chapters(id),
 name text NOT NULL, order_index integer NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamp NOT NULL DEFAULT now(), CONSTRAINT topics_id_chapter_unique UNIQUE(id, chapter_id)
);
--> statement-breakpoint
-- Existing concepts keep their IDs and lesson references under a neutral default topic.
INSERT INTO topics (chapter_id, name, order_index, active)
SELECT id, 'General', 1, active FROM chapters;
--> statement-breakpoint
ALTER TABLE concepts ADD COLUMN topic_id integer;
--> statement-breakpoint
UPDATE concepts c SET topic_id = t.id FROM topics t WHERE t.chapter_id = c.chapter_id;
--> statement-breakpoint
ALTER TABLE concepts ALTER COLUMN topic_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE concepts ADD CONSTRAINT concepts_topic_chapter_fk FOREIGN KEY(topic_id, chapter_id) REFERENCES topics(id, chapter_id);
--> statement-breakpoint
CREATE UNIQUE INDEX subjects_normalized_name_unique ON subjects (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')));
--> statement-breakpoint
-- Force open editors using the previous data shape to reload before saving.
UPDATE curriculum_libraries SET revision = revision + 1, updated_at = now();
