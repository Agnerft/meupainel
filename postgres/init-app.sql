CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  instance_name TEXT,
  remote_jid TEXT,
  sender_name TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  body TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_remote_jid
  ON whatsapp_messages(remote_jid);

CREATE TABLE IF NOT EXISTS ads_dispatches (
  id BIGSERIAL PRIMARY KEY,
  group_name TEXT,
  group_jid TEXT,
  label TEXT,
  raw_value NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  tax_rate NUMERIC(8, 4) NOT NULL DEFAULT 12.15,
  taxed_value NUMERIC(12, 2),
  customer_name TEXT,
  pix TEXT,
  message_body TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  raw_input TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ads_dispatches_group_jid
  ON ads_dispatches(group_jid);

CREATE TABLE IF NOT EXISTS external_ads_stats (
  id BIGSERIAL PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  campaign_label TEXT NOT NULL,
  stats_date DATE NOT NULL,
  sales INTEGER NOT NULL DEFAULT 0,
  renewals INTEGER NOT NULL DEFAULT 0,
  tests INTEGER NOT NULL DEFAULT 0,
  conversations_started INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT,
  pix TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_key, stats_date)
);

CREATE INDEX IF NOT EXISTS idx_external_ads_stats_date
  ON external_ads_stats(stats_date);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
