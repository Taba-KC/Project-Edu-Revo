ALTER TABLE learners ADD COLUMN account_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE learners ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
ALTER TABLE refresh_tokens ADD COLUMN claim_id integer;
ALTER TABLE refresh_tokens ADD COLUMN session_version integer NOT NULL DEFAULT 0;
CREATE TABLE learner_account_claims (
 id serial PRIMARY KEY,
 learner_id integer NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
 reference text NOT NULL UNIQUE,
 kind text NOT NULL CHECK (kind IN ('claim','password')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','revoked')),
 username text,
 password_hash text,
 session_version integer NOT NULL DEFAULT 0,
 visible_content jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamp NOT NULL DEFAULT now(),
 reviewed_at timestamp,
 reviewed_by integer REFERENCES people(id) ON DELETE SET NULL
);
CREATE INDEX learner_claim_account_idx ON learner_account_claims(learner_id, created_at);
