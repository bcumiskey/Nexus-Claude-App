import { useState, useRef, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const C = { bg: "#050a12", panel: "rgba(6,14,24,0.88)", glass: "rgba(0,229,255,0.03)", border: "rgba(0,229,255,0.08)", borderHi: "rgba(0,229,255,0.2)", cyan: "#00e5ff", teal: "#00ffaa", dimCyan: "#0088aa", text: "#b8d8e8", textDim: "#2a4a5a", textBright: "#e0f4ff", glow: "0 0 12px rgba(0,229,255,0.2)", glowTeal: "0 0 12px rgba(0,255,170,0.2)" };

const MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", tier: "APEX", color: "#00e5ff", costIn: 0.015, costOut: 0.075, speed: 1, quality: 5, tokPerSec: 40, desc: "Maximum intelligence" },
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5", tier: "CORE", color: "#00ccaa", costIn: 0.003, costOut: 0.015, speed: 3, quality: 4, tokPerSec: 80, desc: "Speed + capability" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tier: "SWIFT", color: "#00ffaa", costIn: 0.0008, costOut: 0.004, speed: 5, quality: 3, tokPerSec: 150, desc: "Fastest, lowest cost" },
];

const CONNS = [
  { id: "api", label: "API Direct", icon: "⚡", desc: "Raw endpoint", bestFor: ["Automation", "Batch", "Pipelines"] },
  { id: "claude-ai", label: "claude.ai", icon: "◈", desc: "Web session", bestFor: ["Conversational", "Artifacts", "Memory"] },
  { id: "claude-code", label: "Claude Code", icon: "⌬", desc: "CLI agent", bestFor: ["Codebase edits", "Multi-file", "Git"] },
];

// ═══════════════════════════════════════════════
// ROUTING ENGINE
// ═══════════════════════════════════════════════
const PAT = {
  architecture: { re: /\b(architect|design system|infrastructure|integration|middleware|scale|microservice|pipeline|data model)\b/i, cx: 5, m: 0, c: 0 },
  debugging: { re: /\b(debug|fix|error|bug|broken|crash|exception|traceback|failing|not working)\b/i, cx: 3, m: 1, c: 2 },
  codeGen: { re: /\b(write|create|build|implement|code|function|class|component|script|module|endpoint)\b/i, cx: 3, m: 1, c: 2 },
  config: { re: /\b(config|configure|setup|bgp|vpn|firewall|nginx|docker|kubernetes|terraform|yaml)\b/i, cx: 3, m: 1, c: 0 },
  networking: { re: /\b(network|routing|bgp|vlan|subnet|dns|dhcp|ssl|tls|proxy|gateway|wan)\b/i, cx: 4, m: 0, c: 0 },
  sql: { re: /\b(sql|query|select|join|table|index|stored proc|database|wms|koerber)\b/i, cx: 3, m: 1, c: 0 },
  simple: { re: /\b(what is|explain|define|summarize|list|translate|convert|quick)\b/i, cx: 1, m: 2, c: 1 },
  analysis: { re: /\b(analyze|compare|evaluate|assess|research|investigate|audit|report|deep dive)\b/i, cx: 4, m: 0, c: 1 },
  creative: { re: /\b(draft|compose|brainstorm|blog|email|proposal|presentation)\b/i, cx: 3, m: 0, c: 1 },
  dataWork: { re: /\b(csv|excel|data|parse|extract|transform|etl|migration|mapping)\b/i, cx: 2, m: 2, c: 0 },
  multiFile: { re: /\b(multiple files|codebase|repo|project wide|refactor all|migration)\b/i, cx: 4, m: 1, c: 2 },
};

function analyzePrompt(text) {
  if (!text || text.trim().length < 3) return null;
  const matches = Object.entries(PAT).filter(([, p]) => p.re.test(text)).map(([t, p]) => ({ task: t, ...p }));
  const words = text.split(/\s+/).length;
  const hasCode = /```|`[^`]+`|\bfunction\b|\bconst\b|\bdef\b/.test(text);
  const multiQ = (text.match(/\?/g) || []).length > 1;
  const hasFile = /\.(js|ts|py|sql|json|yaml|tsx|jsx|css|html|sh|cfg|conf)\b/i.test(text);
  let cx = matches.length ? Math.max(...matches.map(m => m.cx)) : 2;
  if (words > 150) cx = Math.min(5, cx + 1);
  if (words < 15 && !hasCode) cx = Math.max(1, cx - 1);
  if (multiQ) cx = Math.min(5, cx + 1);
  let mi = cx >= 4 ? 0 : cx <= 2 ? 2 : 1;
  let ci = hasFile || matches.some(m => ["multiFile", "debugging", "codeGen"].includes(m.task)) ? 2 : matches.some(m => ["creative", "analysis"].includes(m.task)) ? 1 : 0;
  if (matches.length) { const s = matches.reduce((a, b) => a.cx > b.cx ? a : b); mi = s.m; }
  const rm = MODELS[mi], rc = CONNS[ci];
  const estIn = Math.round(words * 1.3), estOut = cx >= 4 ? 2000 : cx >= 3 ? 1000 : 400;
  const cost = ((estIn / 1000) * rm.costIn + (estOut / 1000) * rm.costOut).toFixed(4);
  const timeSec = Math.round(estOut / rm.tokPerSec);
  const tasks = matches.map(m => m.task);
  return { model: rm, mi, conn: rc, ci, cx, tasks, estIn, estOut, cost, timeSec, conf: Math.min(95, 50 + matches.length * 15 + (words > 20 ? 10 : 0)) };
}

// Rule-based prompt enhancement (simulated; swap for real API call)
function enhancePrompt(raw) {
  let enhanced = raw.trim();
  // Add specificity instructions
  if (!/\b(step by step|detailed|thorough|comprehensive)\b/i.test(enhanced)) {
    enhanced += "\n\nPlease provide a thorough, well-structured response.";
  }
  // Add format hints for code requests
  if (/\b(write|create|build|implement|code|function|script)\b/i.test(enhanced) && !/\b(format|example|comments)\b/i.test(enhanced)) {
    enhanced += " Include clear comments and usage examples.";
  }
  // Add context for analysis
  if (/\b(analyze|compare|evaluate|review)\b/i.test(enhanced) && !/\b(consider|perspective|tradeoff)\b/i.test(enhanced)) {
    enhanced += " Consider tradeoffs, edge cases, and practical implications.";
  }
  // Add debugging context
  if (/\b(debug|fix|error|bug|broken)\b/i.test(enhanced) && !/\b(root cause|explain why)\b/i.test(enhanced)) {
    enhanced += " Identify the root cause and explain why this fix works.";
  }
  return enhanced;
}

// ═══════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════
const SAMPLE_MSGS = [
  { id: 1, role: "user", content: "Write a debounce utility function with cancel support" },
  { id: 2, role: "assistant", content: "Here's a debounce utility with full cancel support:\n\n```javascript\nfunction debounce(fn, delay = 300) {\n  let timer = null;\n\n  const debounced = (...args) => {\n    if (timer) clearTimeout(timer);\n    timer = setTimeout(() => {\n      fn(...args);\n      timer = null;\n    }, delay);\n  };\n\n  debounced.cancel = () => {\n    if (timer) clearTimeout(timer);\n    timer = null;\n  };\n\n  debounced.flush = (...args) => {\n    debounced.cancel();\n    fn(...args);\n  };\n\n  return debounced;\n}\n\n// Usage example\nconst search = debounce((query) => {\n  console.log('Searching:', query);\n}, 400);\n```\n\nThe `.cancel()` clears any pending execution, and `.flush()` fires immediately then cancels the timer. Useful for cleanup in component unmounts." },
];

const SAMPLE_CHATS = [
  { id: 1, title: "Debounce Utility", messages: SAMPLE_MSGS, ts: "2m ago", model: "claude-sonnet-4-5-20250929" },
  { id: 2, title: "CLX Middleware Design", messages: [], ts: "1h ago", model: "claude-opus-4-6" },
  { id: 3, title: "BGP Route Policy", messages: [], ts: "3h ago", model: "claude-sonnet-4-5-20250929" },
  { id: 4, title: "WMS Query Optimization", messages: [], ts: "Yesterday", model: "claude-haiku-4-5-20251001" },
];

const SAMPLE_BATCHES = [
  { id: "batch_2xK9", name: "CLX Invoice Parse", model: "Haiku 4.5", status: "processing", progress: 67, total: 1200, completed: 804, failed: 3, eta: "~6m", cost: "$1.84" },
  { id: "batch_8mN3", name: "WMS Query Opt", model: "Sonnet 4.5", status: "completed", progress: 100, total: 48, completed: 48, failed: 0, eta: "—", cost: "$0.42" },
  { id: "batch_4rT7", name: "Vendor Doc Class", model: "Haiku 4.5", status: "queued", progress: 0, total: 3400, completed: 0, failed: 0, eta: "~25m", cost: "$4.20" },
];

const SAMPLE_AGENTS = [
  { id: "ag_x7K", name: "CLX API Scaffold", status: "active", model: "Sonnet 4.5", steps: 14, step: "Writing tests", files: 8, lines: 342, time: "4m 22s", branch: "feat/clx-api" },
  { id: "ag_p3N", name: "BGP Config Audit", status: "active", model: "Opus 4.6", steps: 7, step: "Analyzing routes", files: 3, lines: 0, time: "1m 48s", branch: "audit/bgp" },
  { id: "ag_w5R", name: "DB Migration", status: "completed", model: "Sonnet 4.5", steps: 22, step: "Done — 22/22", files: 5, lines: 891, time: "12m 05s", branch: "chore/db-migrate" },
];

// ═══════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════
function parseMsg(t) {
  const p = [], r = /```(\w*)\n([\s\S]*?)```/g; let l = 0, m;
  while ((m = r.exec(t)) !== null) { if (m.index > l) p.push({ type: "text", content: t.slice(l, m.index) }); p.push({ type: "code", lang: m[1] || "text", content: m[2].trimEnd() }); l = m.index + m[0].length; }
  if (l < t.length) p.push({ type: "text", content: t.slice(l) }); return p;
}

function hl(c) {
  return c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/(\/\/.*$|#.*$)/gm, `<span style="color:${C.textDim};font-style:italic">$1</span>`)
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, `<span style="color:${C.teal}">$&</span>`)
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|this|async|await|try|catch|throw|true|false|null|undefined|def|self|print|None|True|False)\b/g, `<span style="color:${C.cyan};font-weight:600">$1</span>`)
    .replace(/\b(\d+\.?\d*)\b/g, `<span style="color:#fbbf24">$1</span>`)
    .replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, `<span style="color:#00ccaa">$1</span>`);
}

function CodeBlock({ lang, content }) {
  const [cp, setCp] = useState(false);
  return (
    <div style={{ background: "rgba(0,8,16,0.6)", border: `1px solid ${C.border}`, borderRadius: 8, margin: "12px 0", overflow: "hidden", backdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px", background: C.glass, borderBottom: `1px solid ${C.border}`, fontSize: 9, color: C.dimCyan, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Space Mono',monospace" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: C.cyan, boxShadow: C.glow }} />{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(content); setCp(true); setTimeout(() => setCp(false), 2e3); }} style={{ background: cp ? `${C.cyan}15` : "transparent", border: `1px solid ${C.border}`, color: cp ? C.cyan : C.dimCyan, cursor: "pointer", fontSize: 8, padding: "2px 10px", borderRadius: 3, letterSpacing: 2, fontFamily: "inherit", transition: "all .3s" }}>{cp ? "✓ COPIED" : "COPY"}</button>
      </div>
      <pre style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.7, overflowX: "auto", color: C.text, fontFamily: "'Space Mono',monospace" }} dangerouslySetInnerHTML={{ __html: hl(content) }} />
    </div>
  );
}

function MsgContent({ text }) {
  const p = parseMsg(text);
  return <div>{p.map((x, i) => x.type === "code" ? <CodeBlock key={i} lang={x.lang} content={x.content} /> : <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{x.content}</div>)}</div>;
}

const ST_COLORS = { processing: C.cyan, completed: C.teal, queued: "#fbbf24", failed: "#ef4444", active: C.cyan, paused: "#fbbf24" };

function StatusDot({ status, size = 5 }) {
  const col = ST_COLORS[status] || C.dimCyan;
  const pulse = status === "processing" || status === "active";
  return <span style={{ width: size, height: size, borderRadius: "50%", background: col, boxShadow: `0 0 ${size + 3}px ${col}88`, display: "inline-block", animation: pulse ? "pulse 2s infinite" : "none" }} />;
}

function MiniBar({ val, max, color = C.cyan }) {
  return <div style={{ width: "100%", height: 2, background: "rgba(0,229,255,0.06)", borderRadius: 1, overflow: "hidden" }}>
    <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 1, boxShadow: `0 0 4px ${color}66`, transition: "width .5s ease" }} />
  </div>;
}

// ═══════════════════════════════════════════════
// PRE-FLIGHT PANEL
// ═══════════════════════════════════════════════
function PreFlight({ original, enhanced, analysis, onSend, onEdit, onCancel }) {
  const [showDiff, setShowDiff] = useState(true);
  if (!analysis) return null;
  const { model: rm, conn: rc, cx, estIn, estOut, cost, timeSec, conf, tasks } = analysis;
  const cxL = ["", "Trivial", "Simple", "Moderate", "Complex", "Advanced"][cx];
  const cxC = ["", C.teal, C.teal, "#fbbf24", "#f97316", "#ef4444"][cx];

  return (
    <div style={{ background: C.panel, backdropFilter: "blur(24px)", border: `1px solid ${C.borderHi}`, borderRadius: 12, overflow: "hidden", animation: "slideUp .25s ease", boxShadow: `0 8px 40px rgba(0,0,0,.5), ${C.glow}` }}>
      {/* Header */}
      <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: `linear-gradient(135deg,${C.cyan},${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#000", fontWeight: 800, boxShadow: C.glow }}>⚡</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textBright, fontFamily: "'Outfit',sans-serif" }}>Pre-Flight Check</span>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {/* Enhanced prompt comparison */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 2, fontFamily: "'Space Mono',monospace" }}>ENHANCED PROMPT</span>
            <button onClick={() => setShowDiff(!showDiff)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 3, color: C.dimCyan, cursor: "pointer", fontSize: 8, padding: "1px 8px", fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>{showDiff ? "HIDE ORIGINAL" : "SHOW ORIGINAL"}</button>
          </div>
          {showDiff && (
            <div style={{ padding: "8px 10px", background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.08)", borderRadius: 6, marginBottom: 6, fontSize: 11, color: "#ef9a9a", lineHeight: 1.6, fontStyle: "italic", position: "relative" }}>
              <span style={{ position: "absolute", top: 4, left: 6, fontSize: 8, color: "rgba(239,68,68,0.4)", fontFamily: "'Space Mono',monospace" }}>ORIGINAL</span>
              <div style={{ marginTop: 10 }}>{original}</div>
            </div>
          )}
          <div style={{ padding: "8px 10px", background: `${C.teal}06`, border: `1px solid ${C.teal}15`, borderRadius: 6, fontSize: 11, color: C.text, lineHeight: 1.6, position: "relative", cursor: "text" }} onClick={onEdit}>
            <span style={{ position: "absolute", top: 4, left: 6, fontSize: 8, color: `${C.teal}66`, fontFamily: "'Space Mono',monospace" }}>ENHANCED</span>
            <div style={{ marginTop: 10 }}>{enhanced}</div>
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 4, fontFamily: "'Space Mono',monospace" }}>Click to edit before sending</div>
          </div>
        </div>

        {/* Advisor metrics */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {/* Model */}
          <div style={{ flex: 1, padding: "8px 10px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 7 }}>
            <div style={{ fontSize: 7, color: C.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace", marginBottom: 4 }}>MODEL</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <StatusDot status="active" size={5} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textBright, fontFamily: "'Outfit',sans-serif" }}>{rm.label}</span>
            </div>
            <div style={{ fontSize: 8, color: rm.color, fontFamily: "'Space Mono',monospace", letterSpacing: 1.5, marginTop: 2 }}>{rm.tier}</div>
          </div>
          {/* Connection */}
          <div style={{ flex: 1, padding: "8px 10px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 7 }}>
            <div style={{ fontSize: 7, color: C.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace", marginBottom: 4 }}>CONNECTION</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 13 }}>{rc.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textBright, fontFamily: "'Outfit',sans-serif" }}>{rc.label}</span>
            </div>
          </div>
          {/* Complexity */}
          <div style={{ flex: 1, padding: "8px 10px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 7 }}>
            <div style={{ fontSize: 7, color: C.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace", marginBottom: 4 }}>COMPLEXITY</div>
            <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>{[1, 2, 3, 4, 5].map(l => <div key={l} style={{ width: 14, height: 3, borderRadius: 1, background: l <= cx ? cxC : "rgba(0,229,255,0.06)" }} />)}</div>
            <div style={{ fontSize: 9, color: cxC, fontWeight: 600, fontFamily: "'Space Mono',monospace" }}>{cxL}</div>
          </div>
        </div>

        {/* Cost / Time / Tokens */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[
            { label: "EST. COST", val: `$${cost}`, color: C.teal },
            { label: "EST. TIME", val: `~${timeSec}s`, color: C.cyan },
            { label: "TOKENS", val: `${estIn}→${estOut}`, color: C.dimCyan },
            { label: "CONFIDENCE", val: `${conf}%`, color: conf > 70 ? C.teal : "#fbbf24" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: "6px 8px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 6, textAlign: "center" }}>
              <div style={{ fontSize: 7, color: C.textDim, letterSpacing: 1.5, fontFamily: "'Space Mono',monospace", marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "'Outfit',sans-serif" }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Task tags */}
        {tasks.length > 0 && <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          {tasks.slice(0, 4).map(t => <span key={t} style={{ fontSize: 8, color: C.dimCyan, background: C.glass, padding: "2px 7px", borderRadius: 3, border: `1px solid ${C.border}`, fontFamily: "'Space Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{t}</span>)}
        </div>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSend} style={{
            flex: 1, padding: "10px", background: `linear-gradient(135deg,${C.cyan}20,${C.teal}12)`,
            border: `1px solid ${C.cyan}35`, borderRadius: 8, color: C.cyan, cursor: "pointer",
            fontSize: 12, fontWeight: 600, fontFamily: "'Outfit',sans-serif", letterSpacing: .5,
            transition: "all .25s", boxShadow: C.glow,
          }}
            onMouseEnter={e => { e.target.style.background = `linear-gradient(135deg,${C.cyan}30,${C.teal}20)`; e.target.style.boxShadow = "0 0 24px rgba(0,229,255,0.3)"; }}
            onMouseLeave={e => { e.target.style.background = `linear-gradient(135deg,${C.cyan}20,${C.teal}12)`; e.target.style.boxShadow = C.glow; }}
          >▶ Send Enhanced Prompt</button>
          <button onClick={onCancel} style={{
            padding: "10px 16px", background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.05)`,
            borderRadius: 8, color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// HUD BOTTOM STRIP
// ═══════════════════════════════════════════════
function HudStrip({ batches, agents, onExpand }) {
  const activeBatches = batches.filter(b => b.status === "processing");
  const activeAgents = agents.filter(a => a.status === "active");
  const totalItems = [...batches, ...agents];

  return (
    <div style={{
      padding: "6px 16px", background: C.panel, backdropFilter: "blur(20px)",
      borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12,
      fontSize: 10, flexShrink: 0, cursor: "pointer", transition: "all .2s",
    }} onClick={onExpand}
      onMouseEnter={e => e.currentTarget.style.borderTopColor = C.borderHi}
      onMouseLeave={e => e.currentTarget.style.borderTopColor = C.border}>

      {/* System status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <StatusDot status={activeBatches.length + activeAgents.length > 0 ? "active" : "completed"} size={4} />
        <span style={{ fontSize: 8, color: C.dimCyan, fontFamily: "'Space Mono',monospace", letterSpacing: 2 }}>NEXUS HUD</span>
      </div>

      <div style={{ width: 1, height: 14, background: C.border }} />

      {/* Batch summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 9, color: C.textDim }}>◫</span>
        <span style={{ color: C.text, fontSize: 10, fontFamily: "'Space Mono',monospace" }}>
          <span style={{ color: C.cyan, fontWeight: 700 }}>{activeBatches.length}</span> batch{activeBatches.length !== 1 ? "es" : ""}
        </span>
        {activeBatches.map(b => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", background: C.glass, borderRadius: 4, border: `1px solid ${C.border}` }}>
            <StatusDot status={b.status} size={3} />
            <span style={{ fontSize: 9, color: C.text, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
            <span style={{ fontSize: 8, color: C.dimCyan, fontFamily: "'Space Mono',monospace" }}>{b.progress}%</span>
          </div>
        ))}
      </div>

      <div style={{ width: 1, height: 14, background: C.border }} />

      {/* Agent summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 9, color: C.textDim }}>⌬</span>
        <span style={{ color: C.text, fontSize: 10, fontFamily: "'Space Mono',monospace" }}>
          <span style={{ color: C.teal, fontWeight: 700 }}>{activeAgents.length}</span> agent{activeAgents.length !== 1 ? "s" : ""}
        </span>
        {activeAgents.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", background: C.glass, borderRadius: 4, border: `1px solid ${C.border}` }}>
            <StatusDot status={a.status} size={3} />
            <span style={{ fontSize: 9, color: C.text, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
            <span style={{ fontSize: 8, color: C.teal, fontFamily: "'Space Mono',monospace" }}>{a.step.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      {/* Expand arrow */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>DETAILS</span>
        <span style={{ fontSize: 10, color: C.dimCyan }}>△</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// RIGHT DETAIL PANEL
// ═══════════════════════════════════════════════
function DetailPanel({ batches, agents, onClose }) {
  const [tab, setTab] = useState("all");
  return (
    <div style={{ width: 320, minWidth: 320, background: C.panel, backdropFilter: "blur(24px)", borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideLeft .3s ease" }}>
      <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 2, fontFamily: "'Space Mono',monospace" }}>OPERATIONS</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 13 }}>×</button>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", padding: "6px 8px", gap: 2, flexShrink: 0 }}>
        {[{ id: "all", l: "All" }, { id: "batches", l: "Batches" }, { id: "agents", l: "Agents" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "5px 8px", background: tab === t.id ? C.glass : "transparent",
            border: tab === t.id ? `1px solid ${C.border}` : "1px solid transparent",
            borderRadius: 5, color: tab === t.id ? C.textBright : C.textDim,
            cursor: "pointer", fontSize: 10, fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
          }}>{t.l}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
        {/* Batches */}
        {(tab === "all" || tab === "batches") && <>
          {tab === "all" && <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace", padding: "6px 4px 4px" }}>BATCH JOBS</div>}
          {batches.map(b => (
            <div key={b.id} style={{ padding: "8px 10px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 7, marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{b.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StatusDot status={b.status} size={4} />
                  <span style={{ fontSize: 8, color: ST_COLORS[b.status], fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>{b.status.toUpperCase()}</span>
                </div>
              </div>
              <MiniBar val={b.completed} max={b.total} color={ST_COLORS[b.status]} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: C.textDim }}>
                <span>{b.completed}/{b.total}</span>
                <span>{b.model}</span>
                <span>{b.cost}</span>
                <span>{b.eta}</span>
              </div>
            </div>
          ))}
        </>}
        {/* Agents */}
        {(tab === "all" || tab === "agents") && <>
          {tab === "all" && <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 2, fontFamily: "'Space Mono',monospace", padding: "8px 4px 4px" }}>AGENT SESSIONS</div>}
          {agents.map(a => (
            <div key={a.id} style={{ padding: "8px 10px", background: C.glass, border: `1px solid ${a.status === "active" ? `${C.cyan}15` : C.border}`, borderRadius: 7, marginBottom: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.textBright }}>{a.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StatusDot status={a.status} size={4} />
                  <span style={{ fontSize: 8, color: ST_COLORS[a.status], fontFamily: "'Space Mono',monospace", letterSpacing: 1 }}>{a.status.toUpperCase()}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: a.status === "active" ? C.cyan : C.textDim, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                {a.status === "active" && <StatusDot status="active" size={3} />}{a.step}
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.textDim, flexWrap: "wrap" }}>
                <span>{a.files} files</span><span>·</span><span>+{a.lines} lines</span><span>·</span><span>{a.time}</span><span>·</span>
                <span style={{ color: C.dimCyan, fontFamily: "'Space Mono',monospace" }}>{a.branch}</span>
              </div>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════
export default function ClaudeNexus() {
  const [chats, setChats] = useState(SAMPLE_CHATS);
  const [activeChat, setActiveChat] = useState(1);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[1]);
  const [conn, setConn] = useState(CONNS[0]);
  const [showModelPk, setShowModelPk] = useState(false);
  const [showConnPk, setShowConnPk] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [files, setFiles] = useState([]);
  const [sideOpen, setSideOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [preFlight, setPreFlight] = useState(null); // { original, enhanced, analysis }
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [sysPrompt, setSysPrompt] = useState("");
  const [temp, setTemp] = useState(1.0);
  const [maxTok, setMaxTok] = useState(4096);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null);

  const curChat = chats.find(c => c.id === activeChat);
  const msgs = curChat?.messages || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, isTyping]);
  useEffect(() => { if (taRef.current) { taRef.current.style.height = "24px"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px"; } }, [input]);

  // Initiate pre-flight: enhance prompt + analyze
  const initPreFlight = useCallback(() => {
    if (!input.trim() && !files.length) return;
    const enhanced = enhancePrompt(input);
    const analysis = analyzePrompt(enhanced);
    setPreFlight({ original: input, enhanced, analysis });
  }, [input, files]);

  // Execute send (after pre-flight approval)
  const executeSend = useCallback((textToSend) => {
    const analysis = preFlight?.analysis;
    const useModel = analysis?.model || model;
    const useConn = analysis?.conn || conn;

    const um = { id: Date.now(), role: "user", content: textToSend + (files.length ? `\n\n[Attached: ${files.map(f => f.name).join(", ")}]` : "") };
    setChats(p => p.map(c => c.id === activeChat ? { ...c, messages: [...c.messages, um] } : c));
    setInput(""); setFiles([]); setPreFlight(null); setIsTyping(true);

    // Apply recommended model/conn
    if (analysis) { setModel(useModel); setConn(useConn); }

    setTimeout(() => {
      const bm = { id: Date.now() + 1, role: "assistant", content: `Processed via **${useConn.label}** using **${useModel.label}** (${useModel.tier}).\n\nEstimated: ~$${analysis?.cost || "0.00"} · ~${analysis?.timeSec || "?"}s\n\n\`\`\`bash\ncurl -X POST https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $KEY" \\\n  -d '{"model":"${useModel.id}","max_tokens":${maxTok}}'\n\`\`\`\n\nReady for your next prompt.` };
      setChats(p => p.map(c => c.id === activeChat ? { ...c, messages: [...c.messages, bm] } : c));
      setIsTyping(false);
    }, 1800);
  }, [preFlight, model, conn, files, activeChat, maxTok]);

  const newChat = () => { const id = Date.now(); setChats(p => [{ id, title: "New Thread", messages: [], ts: "Now", model: model.id }, ...p]); setActiveChat(id); };
  const delChat = (cid, e) => { e.stopPropagation(); setChats(p => p.filter(c => c.id !== cid)); if (activeChat === cid) { const r = chats.filter(c => c.id !== cid); if (r.length) setActiveChat(r[0].id); } };
  const filtered = chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: C.bg, color: C.text, fontFamily: "'DM Sans',system-ui,sans-serif", overflow: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideLeft{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(0,229,255,.1)}50%{box-shadow:0 0 20px rgba(0,229,255,.2)}}
        @keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(25px,-18px) scale(1.06)}66%{transform:translate(-15px,20px) scale(.96)}}
        *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:${C.border} transparent}
        *::-webkit-scrollbar{width:3px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:${C.border};border-radius:10px}
        textarea::placeholder,input::placeholder{color:${C.textDim}}
      `}</style>

      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "0%", width: 600, height: 600, background: `radial-gradient(circle,${C.cyan}08 0%,transparent 60%)`, filter: "blur(80px)", animation: "orbFloat 22s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "0%", width: 500, height: 500, background: `radial-gradient(circle,${C.teal}06 0%,transparent 60%)`, filter: "blur(70px)", animation: "orbFloat 28s ease-in-out 4s infinite" }} />
      </div>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div style={{ width: sideOpen ? 250 : 0, minWidth: sideOpen ? 250 : 0, background: C.panel, backdropFilter: "blur(24px)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", transition: "all .35s cubic-bezier(.4,0,.2,1)", overflow: "hidden", zIndex: 10 }}>
        <div style={{ padding: "14px 12px 10px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: `linear-gradient(135deg,${C.cyan},${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#050a12", boxShadow: C.glow, fontFamily: "'Outfit',sans-serif" }}>N</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textBright, fontFamily: "'Outfit',sans-serif", letterSpacing: .5 }}>NEXUS</div>
                <div style={{ fontSize: 7, color: C.dimCyan, letterSpacing: 4, fontFamily: "'Space Mono',monospace" }}>CLAUDE</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 13, padding: 3 }} onMouseEnter={e => e.target.style.color = C.cyan} onMouseLeave={e => e.target.style.color = C.textDim}>⚙</button>
              <button onClick={() => setSideOpen(false)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12, padding: 3 }} onMouseEnter={e => e.target.style.color = C.cyan} onMouseLeave={e => e.target.style.color = C.textDim}>◁</button>
            </div>
          </div>
          <button onClick={newChat} style={{ width: "100%", padding: "7px 10px", background: `linear-gradient(135deg,${C.cyan}0a,${C.teal}06)`, border: `1px solid ${C.border}`, borderRadius: 6, color: C.cyan, cursor: "pointer", fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans',sans-serif", transition: "all .2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.boxShadow = C.glow; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
          ><span style={{ fontSize: 12 }}>+</span> New Thread</button>
          <div style={{ position: "relative", marginTop: 7 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ width: "100%", padding: "5px 9px 5px 26px", background: "rgba(0,229,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 10, outline: "none", fontFamily: "'DM Sans',sans-serif" }} />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.textDim, fontSize: 10 }}>⌕</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
          {filtered.map(ch => {
            const act = ch.id === activeChat, cm = MODELS.find(m => m.id === ch.model);
            return <div key={ch.id} onClick={() => setActiveChat(ch.id)} style={{ padding: "7px 8px", borderRadius: 5, cursor: "pointer", marginBottom: 1, background: act ? `${C.cyan}0a` : "transparent", border: act ? `1px solid ${C.cyan}12` : "1px solid transparent", transition: "all .2s", position: "relative" }}
              onMouseEnter={e => { if (!act) e.currentTarget.style.background = `${C.cyan}05`; const d = e.currentTarget.querySelector('.db'); if (d) d.style.opacity = 1; }}
              onMouseLeave={e => { if (!act) e.currentTarget.style.background = "transparent"; const d = e.currentTarget.querySelector('.db'); if (d) d.style.opacity = 0; }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 11.5, fontWeight: act ? 500 : 400, color: act ? C.textBright : C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 6 }}>{ch.title}</div>
                <button className="db" onClick={e => delChat(ch.id, e)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 9, opacity: 0, transition: "all .15s", flexShrink: 0 }} onMouseEnter={e => e.target.style.color = "#ef4444"} onMouseLeave={e => e.target.style.color = C.textDim}>✕</button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ fontSize: 9, color: C.textDim }}>{ch.ts}</span>
                {cm && <span style={{ fontSize: 7, color: cm.color, background: `${cm.color}0a`, padding: "1px 5px", borderRadius: 3, letterSpacing: 1.2, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{cm.tier}</span>}
              </div>
            </div>;
          })}
        </div>

        {/* Connection */}
        <div style={{ padding: "7px 10px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowConnPk(!showConnPk)} style={{ width: "100%", padding: "5px 8px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 5, color: C.cyan, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", gap: 6, fontFamily: "'DM Sans',sans-serif", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontSize: 11 }}>{conn.icon}</span>{conn.label}<StatusDot status="active" size={3} /></span>
              <span style={{ fontSize: 7, color: C.textDim }}>▼</span>
            </button>
            {showConnPk && <div style={{ position: "absolute", bottom: "110%", left: 0, right: 0, background: C.panel, backdropFilter: "blur(24px)", border: `1px solid ${C.borderHi}`, borderRadius: 7, overflow: "hidden", zIndex: 100, boxShadow: `0 -12px 40px rgba(0,0,0,.6),${C.glow}`, animation: "slideUp .15s ease" }}>
              {CONNS.map(c => <div key={c.id} onClick={() => { setConn(c); setShowConnPk(false); }} style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: conn.id === c.id ? C.glass : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = C.glass} onMouseLeave={e => e.currentTarget.style.background = conn.id === c.id ? C.glass : "transparent"}>
                <span style={{ fontSize: 13 }}>{c.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: C.textBright }}>{c.label}</div><div style={{ fontSize: 9, color: C.textDim }}>{c.desc}</div></div>
                {conn.id === c.id && <StatusDot status="active" size={4} />}
              </div>)}
            </div>}
          </div>
        </div>
      </div>

      {/* ═══ CENTER ═══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 5, minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, background: `${C.bg}aa`, backdropFilter: "blur(16px)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!sideOpen && <button onClick={() => setSideOpen(true)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 12, padding: "2px 4px" }} onMouseEnter={e => e.target.style.color = C.cyan} onMouseLeave={e => e.target.style.color = C.textDim}>▷</button>}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: C.textBright }}>{curChat?.title || "New Thread"}</div>
              <div style={{ fontSize: 8, color: C.textDim, fontFamily: "'Space Mono',monospace", letterSpacing: 1.5 }}>{msgs.length} MSG · {conn.label.toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Model selector */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowModelPk(!showModelPk)} style={{ padding: "4px 11px", background: `${model.color}08`, border: `1px solid ${model.color}20`, borderRadius: 6, color: model.color, cursor: "pointer", fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", gap: 7, fontFamily: "'DM Sans',sans-serif" }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 16px ${model.color}20`} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                <StatusDot status="active" size={4} />
                {model.label}<span style={{ fontSize: 7, opacity: .5, fontFamily: "'Space Mono',monospace", letterSpacing: 1.5 }}>{model.tier}</span>
              </button>
              {showModelPk && <div style={{ position: "absolute", top: "120%", right: 0, width: 210, background: C.panel, backdropFilter: "blur(24px)", border: `1px solid ${C.borderHi}`, borderRadius: 8, overflow: "hidden", zIndex: 100, boxShadow: `0 12px 40px rgba(0,0,0,.7),${C.glow}`, animation: "slideUp .15s ease" }}>
                <div style={{ padding: "7px 11px 3px", fontSize: 7, color: C.textDim, letterSpacing: 2.5, fontFamily: "'Space Mono',monospace" }}>MODEL</div>
                {MODELS.map(m => <div key={m.id} onClick={() => { setModel(m); setShowModelPk(false); }} style={{ padding: "8px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, background: model.id === m.id ? C.glass : "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.glass} onMouseLeave={e => e.currentTarget.style.background = model.id === m.id ? C.glass : "transparent"}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, boxShadow: `0 0 8px ${m.color}55` }} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: C.textBright, fontWeight: 500 }}>{m.label}</div><div style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono',monospace" }}>{m.desc}</div></div>
                  <span style={{ fontSize: 8, color: m.color, fontFamily: "'Space Mono',monospace", fontWeight: 700 }}>{m.tier}</span>
                </div>)}
              </div>}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px" }}>
            {msgs.length === 0 && !preFlight && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", textAlign: "center", animation: "slideUp .6s ease" }}>
              <div style={{ width: 60, height: 60, borderRadius: 14, background: `linear-gradient(135deg,${C.cyan},${C.teal})`, backgroundSize: "200% 200%", animation: "shimmer 4s ease infinite", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#050a12", fontFamily: "'Outfit',sans-serif", fontWeight: 800, boxShadow: `0 0 40px ${C.cyan}35`, marginBottom: 22 }}>N</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.textBright, fontFamily: "'Outfit',sans-serif", marginBottom: 6 }}>Ready when you are</div>
              <div style={{ fontSize: 12, color: C.textDim, maxWidth: 320, lineHeight: 1.7 }}>
                Your prompt will be <span style={{ color: C.teal }}>enhanced</span> and <span style={{ color: C.cyan }}>optimally routed</span> before sending
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 26, flexWrap: "wrap", justifyContent: "center" }}>
                {["Design CLX API layer", "Debug BGP routing", "Analyze WMS data", "Write migration script"].map(s => <button key={s} onClick={() => setInput(s)} style={{ padding: "6px 13px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif", transition: "all .25s" }}
                  onMouseEnter={e => { e.target.style.borderColor = C.borderHi; e.target.style.color = C.cyan; e.target.style.boxShadow = C.glow; }}
                  onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.textDim; e.target.style.boxShadow = "none"; }}>{s}</button>)}
              </div>
            </div>}

            {msgs.map((m, i) => <div key={m.id} style={{ marginBottom: 24, animation: `slideUp .3s ease ${i * .04}s both` }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 5, flexShrink: 0, marginTop: 2, background: m.role === "assistant" ? `linear-gradient(135deg,${C.cyan},${C.teal})` : "rgba(0,229,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: m.role === "assistant" ? "#050a12" : C.textDim, boxShadow: m.role === "assistant" ? C.glow : "none", fontFamily: "'Outfit',sans-serif", border: m.role === "user" ? `1px solid ${C.border}` : "none" }}>{m.role === "assistant" ? "N" : "B"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: m.role === "assistant" ? C.cyan : C.textDim, fontFamily: "'Outfit',sans-serif" }}>{m.role === "assistant" ? "Nexus" : "You"}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.75 }}><MsgContent text={m.content} /></div>
                </div>
              </div>
            </div>)}

            {isTyping && <div style={{ display: "flex", gap: 12, marginBottom: 20, animation: "slideUp .3s ease" }}>
              <div style={{ width: 24, height: 24, borderRadius: 5, background: `linear-gradient(135deg,${C.cyan},${C.teal})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#050a12", fontFamily: "'Outfit',sans-serif", boxShadow: C.glow, animation: "glowPulse 2s infinite" }}>N</div>
              <div style={{ display: "flex", gap: 4, paddingTop: 6 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: C.cyan, boxShadow: C.glow, animation: `pulse 1.2s ease-in-out ${i * .15}s infinite` }} />)}</div>
            </div>}

            {/* Pre-flight panel - shown inline above input */}
            {preFlight && <div style={{ marginBottom: 16 }}>
              <PreFlight original={preFlight.original} enhanced={preFlight.enhanced} analysis={preFlight.analysis}
                onSend={() => executeSend(preFlight.enhanced)}
                onEdit={() => { setInput(preFlight.enhanced); setPreFlight(null); }}
                onCancel={() => setPreFlight(null)} />
            </div>}

            <div ref={endRef} />
          </div>
        </div>

        {/* Input */}
        {!preFlight && <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${C.border}`, background: `${C.bg}80`, backdropFilter: "blur(16px)", flexShrink: 0 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {files.length > 0 && <div style={{ display: "flex", gap: 4, marginBottom: 7, flexWrap: "wrap" }}>
              {files.map((f, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 10, color: C.cyan, fontFamily: "'Space Mono',monospace" }}>
                ◇ <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span onClick={() => setFiles(p => p.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: C.textDim, fontSize: 11 }}>×</span>
              </div>)}
            </div>}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", transition: "border-color .3s, box-shadow .3s" }}
              onFocus={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.boxShadow = C.glow; }}
              onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}>
              <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => setFiles(p => [...p, ...Array.from(e.target.files)])} />
              <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15, padding: "1px 3px", flexShrink: 0 }} onMouseEnter={e => e.target.style.color = C.cyan} onMouseLeave={e => e.target.style.color = C.textDim}>◇</button>
              <textarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); initPreFlight(); } }} placeholder="Type your request — it will be enhanced before sending..." rows={1}
                style={{ flex: 1, background: "transparent", border: "none", color: C.textBright, fontSize: 13, outline: "none", resize: "none", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5, maxHeight: 160 }} />
              <button onClick={initPreFlight} disabled={!input.trim() && !files.length} style={{
                background: input.trim() || files.length ? `linear-gradient(135deg,${C.cyan},${C.teal})` : C.glass,
                border: "none", borderRadius: 6, width: 28, height: 28, cursor: input.trim() || files.length ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: input.trim() || files.length ? C.glow : "none",
                color: input.trim() || files.length ? "#050a12" : C.textDim, fontSize: 12, fontWeight: 700,
              }}>↑</button>
            </div>
            <div style={{ textAlign: "center", marginTop: 5 }}>
              <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'Space Mono',monospace", letterSpacing: 1.5 }}>ENTER: ENHANCE + REVIEW · SHIFT+ENTER: NEW LINE</span>
            </div>
          </div>
        </div>}

        {/* HUD Strip */}
        <HudStrip batches={SAMPLE_BATCHES} agents={SAMPLE_AGENTS} onExpand={() => setDetailOpen(!detailOpen)} />
      </div>

      {/* ═══ RIGHT DETAIL PANEL ═══ */}
      {detailOpen && <DetailPanel batches={SAMPLE_BATCHES} agents={SAMPLE_AGENTS} onClose={() => setDetailOpen(false)} />}

      {/* ═══ SETTINGS ═══ */}
      {showSettings && <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={() => setShowSettings(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)" }} />
        <div style={{ position: "relative", width: 400, background: C.panel, backdropFilter: "blur(24px)", border: `1px solid ${C.borderHi}`, borderRadius: 12, boxShadow: `0 24px 80px rgba(0,0,0,.7),${C.glow}`, animation: "slideUp .25s ease", overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: C.textBright, fontFamily: "'Outfit',sans-serif" }}>Settings</div><div style={{ fontSize: 7, color: C.textDim, fontFamily: "'Space Mono',monospace", letterSpacing: 2, marginTop: 1 }}>API CONFIG</div></div>
            <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 15 }}>×</button>
          </div>
          <div style={{ padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 1.5, fontFamily: "'Space Mono',monospace", display: "block", marginBottom: 4 }}>API KEY</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="sk-ant-..." style={{ width: "100%", padding: "7px 9px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 11, outline: "none", fontFamily: "'Space Mono',monospace" }} />
            </div>
            <div>
              <label style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 1.5, fontFamily: "'Space Mono',monospace", display: "block", marginBottom: 4 }}>SYSTEM PROMPT</label>
              <textarea value={sysPrompt} onChange={e => setSysPrompt(e.target.value)} placeholder="You are a helpful assistant..." rows={3} style={{ width: "100%", padding: "7px 9px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 11, outline: "none", fontFamily: "'DM Sans',sans-serif", resize: "vertical", lineHeight: 1.5 }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 1.5, fontFamily: "'Space Mono',monospace", display: "block", marginBottom: 4 }}>TEMPERATURE</label>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <input type="range" min="0" max="2" step="0.1" value={temp} onChange={e => setTemp(parseFloat(e.target.value))} style={{ flex: 1, accentColor: C.cyan }} />
                  <span style={{ fontSize: 10, color: C.cyan, fontFamily: "'Space Mono',monospace", minWidth: 22 }}>{temp}</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 8, color: C.dimCyan, letterSpacing: 1.5, fontFamily: "'Space Mono',monospace", display: "block", marginBottom: 4 }}>MAX TOKENS</label>
                <input type="number" value={maxTok} onChange={e => setMaxTok(parseInt(e.target.value) || 4096)} style={{ width: "100%", padding: "5px 7px", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 11, outline: "none", fontFamily: "'Space Mono',monospace" }} />
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} style={{ width: "100%", padding: "8px", background: `linear-gradient(135deg,${C.cyan}25,${C.teal}15)`, border: `1px solid ${C.cyan}30`, borderRadius: 7, color: C.cyan, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Outfit',sans-serif", boxShadow: C.glow, transition: "all .2s" }}
              onMouseEnter={e => e.target.style.boxShadow = `0 0 24px ${C.cyan}35`} onMouseLeave={e => e.target.style.boxShadow = C.glow}
            >Save Configuration</button>
          </div>
        </div>
      </div>}

      {(showModelPk || showConnPk) && <div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={() => { setShowModelPk(false); setShowConnPk(false); }} />}
    </div>
  );
}
