CREATE TABLE IF NOT EXISTS cases (
 id uuid PRIMARY KEY, title varchar(120) NOT NULL, description varchar(2000) NOT NULL,
 status text NOT NULL CHECK(status IN ('OPEN','TRIAGE','ASSIGNED','RESOLVED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS case_history (
 id bigserial PRIMARY KEY, case_id uuid NOT NULL REFERENCES cases(id),
 from_status text, to_status text NOT NULL, correlation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
 event_id uuid PRIMARY KEY, envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(created_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS cases_listing ON cases(status,created_at,id);
CREATE INDEX IF NOT EXISTS history_case ON case_history(case_id,id);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY, event_id uuid NOT NULL UNIQUE, case_id uuid NOT NULL REFERENCES cases(id),
 kind text NOT NULL DEFAULT 'CASE_RECEIVED', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_case ON notifications(case_id,created_at);
