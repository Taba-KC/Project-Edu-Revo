CREATE TABLE auth_attempt_windows (key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX auth_attempt_windows_expiry ON auth_attempt_windows(expires_at);
