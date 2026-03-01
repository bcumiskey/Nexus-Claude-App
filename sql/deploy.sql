-- ============================================
-- NEXUS SCHEMA DEPLOYMENT v1.0
-- Claude Operations Platform
-- Run against CLX SQL Server instance
-- ============================================

-- Create schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'nexus')
    EXEC('CREATE SCHEMA nexus');
GO

-- ── Settings ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'settings')
CREATE TABLE nexus.settings (
    [key]       VARCHAR(100) PRIMARY KEY,
    value       NVARCHAR(MAX) NOT NULL,
    updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ── Projects ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'projects')
CREATE TABLE nexus.projects (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    name                NVARCHAR(255) NOT NULL,
    goal                NVARCHAR(MAX) NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'active',
    health              VARCHAR(20) NOT NULL DEFAULT 'on_track',
    context_budget      INT NOT NULL DEFAULT 2000,
    timeline_start      DATE NULL,
    timeline_target     DATE NULL,
    parent_project_id   INT NULL REFERENCES nexus.projects(id),
    user_id             INT NULL,
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'project_context')
CREATE TABLE nexus.project_context (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES nexus.projects(id),
    context_json    NVARCHAR(MAX) NOT NULL,
    compressed_text NVARCHAR(MAX) NULL,
    token_count     INT NULL,
    version         INT NOT NULL DEFAULT 1,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_context_project')
    CREATE INDEX IX_context_project ON nexus.project_context(project_id, version DESC);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'project_decisions')
CREATE TABLE nexus.project_decisions (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES nexus.projects(id),
    decision        NVARCHAR(MAX) NOT NULL,
    rationale       NVARCHAR(MAX) NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    revisit_trigger NVARCHAR(500) NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'project_discoveries')
CREATE TABLE nexus.project_discoveries (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    project_id  INT NOT NULL REFERENCES nexus.projects(id),
    finding     NVARCHAR(MAX) NOT NULL,
    impact      NVARCHAR(MAX) NULL,
    source      NVARCHAR(255) NULL,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'project_artifacts')
CREATE TABLE nexus.project_artifacts (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES nexus.projects(id),
    name            NVARCHAR(255) NOT NULL,
    artifact_type   VARCHAR(50) NULL,
    path_or_ref     NVARCHAR(500) NULL,
    description     NVARCHAR(MAX) NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'project_progress')
CREATE TABLE nexus.project_progress (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES nexus.projects(id),
    summary             NVARCHAR(MAX) NOT NULL,
    next_steps          NVARCHAR(MAX) NULL,
    reassessment_notes  NVARCHAR(MAX) NULL,
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ── Tasks & Milestones ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'tasks')
CREATE TABLE nexus.tasks (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES nexus.projects(id),
    parent_task_id  INT NULL REFERENCES nexus.tasks(id),
    title           NVARCHAR(500) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'todo',
    priority        VARCHAR(10) NOT NULL DEFAULT 'medium',
    effort          VARCHAR(10) NULL,
    due_date        DATE NULL,
    blocked_by      NVARCHAR(500) NULL,
    depends_on      VARCHAR(255) NULL,
    tags            NVARCHAR(255) NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    completed_at    DATETIME2 NULL,
    user_id         INT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tasks_project')
    CREATE INDEX IX_tasks_project ON nexus.tasks(project_id, status, sort_order);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tasks_active')
    CREATE INDEX IX_tasks_active ON nexus.tasks(status) WHERE status != 'done' AND status != 'cut';
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'milestones')
CREATE TABLE nexus.milestones (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    project_id      INT NOT NULL REFERENCES nexus.projects(id),
    title           NVARCHAR(255) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    target_date     DATE NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    reached_at      DATETIME2 NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ── Chats ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'chats')
CREATE TABLE nexus.chats (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    title           NVARCHAR(255) NOT NULL,
    model_id        VARCHAR(100) NOT NULL,
    connection_type VARCHAR(20) NOT NULL DEFAULT 'api',
    project_id      INT NULL REFERENCES nexus.projects(id),
    user_id         INT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'messages')
CREATE TABLE nexus.messages (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    chat_id     INT NOT NULL REFERENCES nexus.chats(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,
    content     NVARCHAR(MAX) NOT NULL,
    model_used  VARCHAR(100) NULL,
    tokens_in   INT NULL,
    tokens_out  INT NULL,
    cost_usd    DECIMAL(10,6) NULL,
    duration_ms INT NULL,
    enhanced    BIT NOT NULL DEFAULT 0,
    user_id     INT NULL,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_messages_chat')
    CREATE INDEX IX_messages_chat ON nexus.messages(chat_id, created_at);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'enhancements')
CREATE TABLE nexus.enhancements (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    message_id          INT NULL REFERENCES nexus.messages(id),
    original_text       NVARCHAR(MAX) NOT NULL,
    enhanced_text       NVARCHAR(MAX) NOT NULL,
    project_id          INT NULL REFERENCES nexus.projects(id),
    enhancement_model   VARCHAR(100) NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    enhancement_tokens  INT NULL,
    enhancement_cost    DECIMAL(10,6) NULL,
    enhancement_ms      INT NULL,
    user_action         VARCHAR(20) NOT NULL,
    created_at          DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ── Budgets ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'budgets')
CREATE TABLE nexus.budgets (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    context         VARCHAR(20) NOT NULL,
    budget_type     VARCHAR(20) NOT NULL,
    limit_value     DECIMAL(10,2) NOT NULL,
    warn_pct        INT NOT NULL DEFAULT 80,
    critical_pct    INT NOT NULL DEFAULT 95,
    is_active       BIT NOT NULL DEFAULT 1,
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_budget UNIQUE (context, budget_type)
);
GO

-- ── Usage Tracking ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'usage_log')
CREATE TABLE nexus.usage_log (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    context         VARCHAR(20) NOT NULL,
    model_id        VARCHAR(100) NOT NULL,
    project_id      INT NULL REFERENCES nexus.projects(id),
    chat_id         INT NULL REFERENCES nexus.chats(id),
    tokens_in       INT NULL,
    tokens_out      INT NULL,
    cost_usd        DECIMAL(10,6) NULL,
    duration_ms     INT NULL,
    message_count   INT NOT NULL DEFAULT 1,
    user_id         INT NULL,
    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_usage_log_context')
    CREATE INDEX IX_usage_log_context ON nexus.usage_log(context, created_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_usage_log_created')
    CREATE INDEX IX_usage_log_created ON nexus.usage_log(created_at DESC);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'usage_daily')
CREATE TABLE nexus.usage_daily (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    usage_date      DATE NOT NULL,
    context         VARCHAR(20) NOT NULL,
    model_id        VARCHAR(100) NOT NULL,
    project_id      INT NULL,
    tokens_in       BIGINT NOT NULL DEFAULT 0,
    tokens_out      BIGINT NOT NULL DEFAULT 0,
    total_cost_usd  DECIMAL(10,4) NOT NULL DEFAULT 0,
    request_count   INT NOT NULL DEFAULT 0,
    message_count   INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_usage_daily UNIQUE (usage_date, context, model_id, project_id)
);
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'rate_limits')
CREATE TABLE nexus.rate_limits (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    context         VARCHAR(20) NOT NULL,
    limit_type      VARCHAR(30) NOT NULL,
    limit_value     INT NOT NULL,
    remaining       INT NOT NULL,
    resets_at       DATETIME2 NULL,
    captured_at     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_rate_limits_latest')
    CREATE INDEX IX_rate_limits_latest ON nexus.rate_limits(context, limit_type, captured_at DESC);
GO

-- ── Batch Ops ──
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'nexus' AND TABLE_NAME = 'batch_jobs')
CREATE TABLE nexus.batch_jobs (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    anthropic_batch_id  VARCHAR(255) NOT NULL,
    name                NVARCHAR(255) NOT NULL,
    model_id            VARCHAR(100) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
    total_requests      INT NOT NULL DEFAULT 0,
    completed           INT NOT NULL DEFAULT 0,
    failed              INT NOT NULL DEFAULT 0,
    cost_usd            DECIMAL(10,4) NULL,
    project_id          INT NULL REFERENCES nexus.projects(id),
    user_id             INT NULL,
    submitted_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    completed_at        DATETIME2 NULL
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_batch_status')
    CREATE INDEX IX_batch_status ON nexus.batch_jobs(status, submitted_at DESC);
GO

-- ── Seed Data ──
IF NOT EXISTS (SELECT 1 FROM nexus.settings WHERE [key] = 'default_model')
BEGIN
    INSERT INTO nexus.settings ([key], value) VALUES
        ('default_model', 'claude-sonnet-4-5-20250929'),
        ('default_context_budget', '2000'),
        ('enhancement_enabled', 'true');
END
GO

IF NOT EXISTS (SELECT 1 FROM nexus.budgets WHERE context = 'all')
BEGIN
    INSERT INTO nexus.budgets (context, budget_type, limit_value, warn_pct, critical_pct) VALUES
        ('all',         'monthly_usd',    50.00,  80, 95),
        ('api',         'monthly_usd',    30.00,  80, 95),
        ('batch',       'monthly_usd',    15.00,  80, 95),
        ('enhancement', 'monthly_usd',     5.00,  80, 95),
        ('claude_ai',   '5hr_messages',  100.00,  70, 90),
        ('claude_ai',   'daily_messages',400.00,  70, 90),
        ('claude_code', 'monthly_usd',    20.00,  80, 95);
END
GO

PRINT '✓ Nexus schema deployed successfully.';
GO
