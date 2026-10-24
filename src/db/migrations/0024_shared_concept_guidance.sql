ALTER TABLE "concepts" ADD COLUMN "prerequisites" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "learning_outcomes" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_prerequisites_limit" CHECK (jsonb_typeof("prerequisites") = 'array' AND jsonb_array_length("prerequisites") <= 5);
--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_outcomes_limit" CHECK (jsonb_typeof("learning_outcomes") = 'array' AND jsonb_array_length("learning_outcomes") <= 5);
