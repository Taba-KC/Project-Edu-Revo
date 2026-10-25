ALTER TABLE "lesson_feedback" ADD COLUMN "goal_responses" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "lesson_concepts" ADD COLUMN "review_goals" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "lesson_review_concepts" ADD COLUMN "review_goals" jsonb DEFAULT '[]'::jsonb NOT NULL;
