# NEXUS — Claude Operations Platform

Intelligent Claude interface with prompt enhancement, project management, usage tracking, and operational monitoring. Runs on the CLX SQL Server instance.

## Project Structure

```
nexus/
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── ClaudeNexus.jsx # Main UI component
│   │   ├── api.js          # Backend API client
│   │   └── main.jsx        # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                 # Express backend
│   ├── src/
│   │   ├── index.js        # Server entry point
│   │   ├── db.js           # SQL Server connection
│   │   ├── routes/
│   │   │   ├── health.js   # Health check
│   │   │   ├── chat.js     # Chat CRUD + streaming
│   │   │   ├── enhance.js  # Prompt enhancement + routing
│   │   │   ├── project.js  # Projects, tasks, milestones
│   │   │   └── usage.js    # Budget, usage tracking, settings
│   │   └── services/
│   │       ├── anthropic.js # Anthropic API client + streaming
│   │       └── usage.js    # Usage logging + budget calculation
│   └── package.json
├── sql/
│   └── deploy.sql          # Full schema deployment script
├── .env.template           # Environment config template
└── package.json            # Root scripts
```

## Setup — 5 Steps

### 1. Deploy SQL Schema

Open SSMS, connect to the CLX SQL Server instance, and run:

```
sql/deploy.sql
```

This creates the `nexus` schema with all tables, indexes, and seed data. It's idempotent — safe to run multiple times (uses IF NOT EXISTS checks).

**Verify:** Run `SELECT * FROM nexus.settings` — should return 3 rows.

### 2. Configure Environment

```bash
cp .env.template .env
```

Edit `.env` with your values:
```
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
SQL_SERVER=your-clx-server
SQL_DATABASE=CLX
SQL_USER=nexus_svc
SQL_PASSWORD=your_password
```

### 3. Install Dependencies

```bash
npm run setup
# Or manually:
cd server && npm install
cd ../client && npm install
```

### 4. Start Server

Terminal 1:
```bash
npm run server
```

You should see:
```
╔══════════════════════════════════════╗
║       NEXUS — Starting Up...         ║
╚══════════════════════════════════════╝

✓ SQL Server connected: your-server / CLX
✓ Nexus API listening on port 3100
```

### 5. Start Client

Terminal 2:
```bash
npm run client
```

Opens http://localhost:3000 — Nexus is running.

## Verify

Hit the health endpoint:
```bash
curl http://localhost:3100/api/health
```

Expected:
```json
{
  "status": "healthy",
  "services": {
    "database": { "connected": true, "nexusSchema": true },
    "anthropicApi": { "connected": true }
  }
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check (SQL + API connectivity) |
| GET | /api/chat | List all chats |
| POST | /api/chat/new | Create new chat |
| GET | /api/chat/:id | Get chat with messages |
| POST | /api/chat/:id/send | Send message (SSE streaming) |
| PATCH | /api/chat/:id | Update chat (title, model, project) |
| DELETE | /api/chat/:id | Delete chat |
| POST | /api/enhance | Enhance prompt via Haiku |
| POST | /api/enhance/analyze | Routing analysis only (no API call) |
| POST | /api/enhance/log | Log enhancement outcome |
| GET | /api/project | List projects |
| POST | /api/project/new | Create project |
| GET | /api/project/:id | Get project with tasks/milestones |
| POST | /api/project/:id/task | Create task |
| PATCH | /api/project/task/:id | Update task |
| GET | /api/project/tasks/focus | Cross-project focus view |
| GET | /api/usage/budget | Budget status (all contexts) |
| GET | /api/usage/breakdown | Usage breakdown (by context/model/day) |
| POST | /api/usage/log-external | Log claude.ai usage manually |
| GET | /api/usage/settings | Get settings |

## Architecture

- **Frontend** → Vite dev server proxies `/api/*` to backend (no CORS in dev)
- **Backend** → Express, streams responses via SSE, persists everything to SQL Server
- **Database** → `nexus` schema on CLX SQL Server, completely isolated from WMS/Koerber tables
- **API Key** → Stored server-side in `.env`, never exposed to browser
