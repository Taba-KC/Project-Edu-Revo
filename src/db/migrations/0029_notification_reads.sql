CREATE TABLE "notification_reads" (
  "school_id" integer NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "account_type" text NOT NULL,
  "account_id" integer NOT NULL,
  "notification_id" text NOT NULL,
  "read_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("school_id", "account_type", "account_id", "notification_id")
);
