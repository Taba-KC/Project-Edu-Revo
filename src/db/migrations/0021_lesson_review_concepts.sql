CREATE TABLE "lesson_review_concepts" (
  "id" serial PRIMARY KEY NOT NULL,
  "class_subject_id" integer NOT NULL REFERENCES "class_subjects"("id") ON DELETE CASCADE,
  "person_id" integer NOT NULL REFERENCES "people"("id") ON DELETE CASCADE,
  "concept_id" integer NOT NULL REFERENCES "concepts"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "lesson_review_concepts_teacher_concept_unique" UNIQUE("class_subject_id", "person_id", "concept_id")
);
