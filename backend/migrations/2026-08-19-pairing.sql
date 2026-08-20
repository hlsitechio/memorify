-- 2026-08-19 — Device-flow agent pairing (org-blind, human-approved)
-- Hot state lives here (Upstash Redis swap-in later); audit trail in pairing_attempts.
-- SECURITY: device_code stored only as sha256 hash; user_code is short-lived + strike-laddered.

CREATE TABLE IF NOT EXISTS pairings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code         text NOT NULL,                       -- 6 chars, unambiguous alphabet
  device_code_hash  text NOT NULL,                       -- sha256(256-bit device code)
  status            text NOT NULL DEFAULT 'pending',     -- pending|approved|denied|consumed|killed|cancelled
  org_id            text,                                -- NULL until a human approves (org-blind start)
  agent_id          uuid,                                -- created at approval time
  agent_name        text,
  agent_kind        text,
  requested_scopes  text[],
  fingerprint       text,                                -- client-provided (CLI/agent identity hint)
  ip_hash           text,                                -- sha256(ip + salt)
  interval_seconds  int  NOT NULL DEFAULT 2,
  poll_count        int  NOT NULL DEFAULT 0,
  poll_abuse        int  NOT NULL DEFAULT 0,             -- rapid-poll strikes → kill pairing
  last_polled_at    timestamptz,
  approved_by       text,                                -- Clerk user id of approver
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  approved_at       timestamptz,
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pairings_user_code  ON pairings (user_code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pairings_device_hash ON pairings (device_code_hash);
CREATE INDEX IF NOT EXISTS idx_pairings_expiry      ON pairings (expires_at);

-- Every security-relevant event: start / lookup hit / miss / approve / deny / kill / cancel
CREATE TABLE IF NOT EXISTS pairing_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id  uuid,
  user_id     text,        -- Clerk user (confirm endpoint is authenticated)
  ip_hash     text,
  fingerprint text,
  outcome     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pairing_attempts_user_time ON pairing_attempts (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pairing_attempts_ip_time   ON pairing_attempts (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_pairing_attempts_pairing   ON pairing_attempts (pairing_id, created_at);
