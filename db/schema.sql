-- ============================================
-- NEXUS SCHEMA — Postgres (Neon)
-- v2 — Config-driven models
-- ============================================

-- Models: single source of truth for all model info.
-- When Anthropic ships a new model, add a row. No code change needed.
CREATE TABLE IF NOT EXISTS models (
    id              TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'standard',
    input_price     NUMERIC(10,4) NOT NULL,
    output_price    NUMERIC(10,4) NOT NULL,
    max_output      INTEGER NOT NULL DEFAULT 64000,
    context_window  INTEGER NOT NULL DEFAULT 200000,
    supports_thinking BOOLEAN NOT NULL DEFAULT FALSE,
    supports_adaptive BOOLEAN NOT NULL DEFAULT FALSE,
    supports_fast   BOOLEAN NOT NULL DEFAULT FALSE,
    supports_vision BOOLEAN NOT NULL DEFAULT TRUE,
    supports_1m_ctx BOOLEAN NOT NULL DEFAULT FALSE,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_enhancement  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed current models (March 2026)
INSERT INTO models (id, label, tier, input_price, output_price, max_output, context_window,
    supports_thinking, supports_adaptive, supports_fast, supports_1m_ctx,
    is_default, is_enhancement, sort_order, notes) VALUES
    ('claude-opus-4-6', 'Opus 4.6', 'apex', 5.00, 25.00, 128000, 200000,
        TRUE, TRUE, TRUE, TRUE,
        FALSE, FALSE, 1, 'Most intelligent. 1M ctx beta. Fast mode ~2.5x.'),
    ('claude-sonnet-4-6', 'Sonnet 4.6', 'standard', 3.00, 15.00, 64000, 200000,
        TRUE, TRUE, FALSE, TRUE,
        TRUE, FALSE, 2, 'Best speed/intelligence. Near-Opus quality. 1M ctx beta.'),
    ('claude-haiku-4-5-20251001', 'Haiku 4.5', 'fast', 1.00, 5.00, 64000, 200000,
        TRUE, FALSE, FALSE, FALSE,
        FALSE, TRUE, 3, 'Fastest, cheapest. Enhancement, summaries, simple tasks.'),
    ('claude-sonnet-4-5-20250929', 'Sonnet 4.5', 'legacy', 3.00, 15.00, 64000, 200000,
        TRUE, FALSE, FALSE, FALSE,
        FALSE, FALSE, 10, 'Previous gen Sonnet. Still capable, will retire eventually.')
ON CONFLICT (id) DO NOTHING;

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
    ('default_context_budget', '2000'),
    ('enhancement_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    goal            TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versioned context per project
CREATE TABLE IF NOT EXISTS project_context (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    context_json    JSONB NOT NULL DEFAULT '{}',
    compressed_text TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_context_project ON project_context(project_id, version DESC);

-- Chats
CREATE TABLE IF NOT EXISTS chats (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL DEFAULT 'New Chat',
    model_id        TEXT NOT NULL,
    project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL PRIMARY KEY,
    chat_id         INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    model_used      TEXT,
    tokens_in       INTEGER,
    tokens_out      INTEGER,
    cost_usd        NUMERIC(10,6),
    duration_ms     INTEGER,
    enhanced        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);

-- Enhancement history
CREATE TABLE IF NOT EXISTS enhancements (
    id                  SERIAL PRIMARY KEY,
    message_id          INTEGER REFERENCES messages(id),
    original_text       TEXT NOT NULL,
    enhanced_text       TEXT NOT NULL,
    project_id          INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    enhancement_model   TEXT NOT NULL,
    enhancement_tokens  INTEGER,
    enhancement_cost    NUMERIC(10,6),
    enhancement_ms      INTEGER,
    user_action         TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
