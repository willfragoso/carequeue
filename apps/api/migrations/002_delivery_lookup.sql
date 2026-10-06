CREATE INDEX outbox_case_lookup ON outbox ((envelope->'payload'->>'caseId'));
