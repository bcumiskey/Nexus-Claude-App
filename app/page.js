"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── API helpers ──

async function fetchJSON(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function streamMessage(chatId, content, opts, onText, onDone, onError, onThinking) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`/api/chat/${chatId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, model: opts.model, enhanced: opts.enhanced || false, thinking: opts.thinking || false, fast: opts.fast || false, regenerate: opts.regenerate || false, editMessageId: opts.editMessageId || null, editContent: opts.editContent || null }),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text") onText(data.text);
            else if (data.type === "thinking" && onThinking) onThinking(data.text);
            else if (data.type === "thinking_start" && onThinking) onThinking(null);
            else if (data.type === "done") onDone(data);
            else if (data.type === "error") onError(new Error(data.error));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") onError(err);
    }
  })();
  return () => controller.abort();
}

// ── Format helpers ──

function formatCost(usd) {
  usd = Number(usd);
  if (!usd || usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTime(ms) {
  ms = Number(ms);
  if (!ms) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function renderMarkdown(text) {
  if (!text) return "";
  // Code blocks with language header and copy button
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang || "code";
    return `<div class="code-block-wrap" style="border-radius:6px;overflow:hidden;margin:8px 0;border:1px solid var(--border)"><div class="code-block-header" style="display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:var(--bg-tertiary);border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--text-muted)">${escapeHtml(langLabel)}</span><button class="code-copy-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 6px">Copy</button></div><pre style="margin:0;padding:12px;overflow-x:auto;background:var(--bg-primary)"><code class="${lang}">${escapeHtml(code.trim())}</code></pre></div>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Line breaks
  html = html.replace(/\n/g, "<br>");
  return html;
}

function handleCodeCopyClick(e) {
  const btn = e.target.closest(".code-copy-btn");
  if (!btn) return;
  const wrap = btn.closest(".code-block-wrap");
  const pre = wrap?.querySelector("pre");
  if (pre) {
    navigator.clipboard.writeText(pre.textContent);
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Main Component ──

export default function NexusChat() {
  // State
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [enhanceMode, setEnhanceMode] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("chats");
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [expandedProject, setExpandedProject] = useState(null);
  const [showAllChats, setShowAllChats] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [fastEnabled, setFastEnabled] = useState(false);
  const [thinkingStreamText, setThinkingStreamText] = useState("");
  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editContext, setEditContext] = useState("");
  const [editContextVersion, setEditContextVersion] = useState(null);
  const [editContextUpdatedAt, setEditContextUpdatedAt] = useState(null);
  const [savingProject, setSavingProject] = useState(false);
  const [copiedMessageIdx, setCopiedMessageIdx] = useState(null);
  const [hoveredMessageIdx, setHoveredMessageIdx] = useState(null);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [chatMenuId, setChatMenuId] = useState(null);
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editingMessageIdx, setEditingMessageIdx] = useState(null);
  const [editMessageValue, setEditMessageValue] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);

  const endRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const taRef = useRef(null);
  const abortRef = useRef(null);
  const thinkingRef = useRef("");

  // ── Load initial data ──
  useEffect(() => {
    loadModels();
    loadChats();
    loadProjects();
  }, []);

  // ── Track scroll position with IntersectionObserver ──
  useEffect(() => {
    if (!endRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Auto-scroll when at bottom ──
  useEffect(() => {
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, streamText, isAtBottom]);

  // ── Auto-disable capability toggles on model change ──
  useEffect(() => {
    const m = models.find((mod) => mod.id === selectedModel);
    if (!m) return;
    if (!m.supports_thinking) setThinkingEnabled(false);
    if (!m.supports_fast) setFastEnabled(false);
  }, [selectedModel, models]);

  // ── Close project editor on Escape ──
  useEffect(() => {
    if (!editingProject) return;
    function handleEsc(e) {
      if (e.key === "Escape") setEditingProject(null);
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [editingProject]);

  // ── Auto-resize textarea ──
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // ── Data loaders ──
  async function loadModels() {
    try {
      const data = await fetchJSON("/models");
      setModels(data);
      const defaultModel = data.find((m) => m.is_default) || data[0];
      if (defaultModel) setSelectedModel(defaultModel.id);
    } catch (err) {
      setError("Failed to load models: " + err.message);
    }
  }

  async function loadChats() {
    try {
      const data = await fetchJSON("/chat");
      setChats(data);
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }

  async function loadProjects() {
    try {
      const data = await fetchJSON("/project");
      setProjects(data);
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
  }

  async function loadChat(id) {
    try {
      const data = await fetchJSON(`/chat/${id}`);
      setActiveChat(data);
      setMessages(data.messages || []);
      setSelectedModel(data.model_id);
    } catch (err) {
      setError("Failed to load chat: " + err.message);
    }
  }

  // ── Actions ──
  async function createNewChat() {
    try {
      const chat = await fetchJSON("/chat", {
        method: "POST",
        body: JSON.stringify({
          modelId: selectedModel,
          projectId: selectedProject,
        }),
      });
      setActiveChat(chat);
      setMessages([]);
      await loadChats();
    } catch (err) {
      setError("Failed to create chat: " + err.message);
    }
  }

  async function deleteChat(id) {
    try {
      await fetchJSON(`/chat/${id}`, { method: "DELETE" });
      if (activeChat?.id === id) {
        const remaining = chats.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          loadChat(remaining[0].id);
        } else {
          setActiveChat(null);
          setMessages([]);
        }
      }
      setConfirmDeleteId(null);
      await loadChats();
    } catch (err) {
      setError("Failed to delete chat: " + err.message);
    }
  }

  async function renameChat(id, newTitle) {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed.length > 100) return;
    // Optimistic update
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    setRenamingChatId(null);
    try {
      await fetchJSON(`/chat/${id}`, { method: "PATCH", body: JSON.stringify({ title: trimmed }) });
    } catch (err) {
      setError("Failed to rename chat: " + err.message);
      await loadChats();
    }
  }

  async function createProject() {
    if (!newProjectName.trim() || creatingProject) return;
    setCreatingProject(true);
    setError(null);
    try {
      const project = await fetchJSON("/project", {
        method: "POST",
        body: JSON.stringify({ name: newProjectName.trim(), goal: newProjectGoal.trim() || null }),
      });
      setNewProjectName("");
      setNewProjectGoal("");
      setShowNewProjectForm(false);
      setSelectedProject(project.id);
      await loadProjects();
    } catch (err) {
      setError("Failed to create project: " + err.message);
    } finally {
      setCreatingProject(false);
    }
  }

  async function openProjectEditor(projectId) {
    try {
      const data = await fetchJSON(`/project/${projectId}`);
      setEditingProject(data);
      setEditName(data.name || "");
      setEditGoal(data.goal || "");
      setEditStatus(data.status || "active");
      setEditContext(data.context?.compressed_text || "");
      setEditContextVersion(data.context?.version || null);
      setEditContextUpdatedAt(data.context?.created_at || null);
    } catch (err) {
      setError("Failed to load project: " + err.message);
    }
  }

  function closeProjectEditor() {
    setEditingProject(null);
  }

  async function saveProject() {
    if (!editingProject || savingProject) return;
    setSavingProject(true);
    setError(null);
    try {
      const body = {};
      if (editName !== editingProject.name) body.name = editName;
      if (editGoal !== (editingProject.goal || "")) body.goal = editGoal;
      if (editStatus !== editingProject.status) body.status = editStatus;
      if (editContext !== (editingProject.context?.compressed_text || "")) {
        body.compressed_text = editContext;
      }
      if (Object.keys(body).length > 0) {
        await fetchJSON(`/project/${editingProject.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      setEditingProject(null);
      await loadProjects();
    } catch (err) {
      setError("Failed to save project: " + err.message);
    } finally {
      setSavingProject(false);
    }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return;

    let chatId = activeChat?.id;

    // Create chat if none active
    if (!chatId) {
      try {
        const chat = await fetchJSON("/chat", {
          method: "POST",
          body: JSON.stringify({
            modelId: selectedModel,
            projectId: selectedProject,
          }),
        });
        setActiveChat(chat);
        chatId = chat.id;
      } catch (err) {
        setError("Failed to create chat: " + err.message);
        return;
      }
    }

    const content = enhanceResult?.enhanced || input;
    const isEnhanced = !!enhanceResult;

    setMessages((prev) => [...prev, { role: "user", content, enhanced: isEnhanced, created_at: new Date().toISOString() }]);
    setInput("");
    setEnhanceResult(null);
    setEnhanceMode(false);
    setStreaming(true);
    setStreamText("");
    setThinkingStreamText("");
    thinkingRef.current = "";
    setError(null);

    abortRef.current = streamMessage(
      chatId,
      content,
      { model: selectedModel, enhanced: isEnhanced, thinking: thinkingEnabled, fast: fastEnabled },
      (text) => {
        setThinkingStreamText("");
        setStreamText((prev) => prev + text);
      },
      (data) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.fullText,
            thinking: thinkingRef.current || null,
            model_used: data.model,
            tokens_in: data.usage.input_tokens,
            tokens_out: data.usage.output_tokens,
            cost_usd: data.cost,
            duration_ms: data.durationMs,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreamText("");
        setThinkingStreamText("");
        setStreaming(false);
        loadChats();
      },
      (err) => {
        setError(err.message);
        setStreaming(false);
        setStreamText("");
        setThinkingStreamText("");
      },
      (text) => {
        if (text !== null) {
          thinkingRef.current += text;
          setThinkingStreamText((prev) => prev + text);
        }
      }
    );
  }, [input, streaming, activeChat, selectedModel, selectedProject, enhanceResult, thinkingEnabled, fastEnabled]);

  async function handleRegenerate() {
    if (streaming || !activeChat?.id) return;
    const lastAssistantIdx = messages.length - 1;
    if (lastAssistantIdx < 0 || messages[lastAssistantIdx].role !== "assistant") return;

    setMessages((prev) => prev.slice(0, -1));
    setStreaming(true);
    setStreamText("");
    setThinkingStreamText("");
    thinkingRef.current = "";
    setError(null);

    abortRef.current = streamMessage(
      activeChat.id,
      null,
      { model: selectedModel, thinking: thinkingEnabled, fast: fastEnabled, regenerate: true },
      (text) => {
        setThinkingStreamText("");
        setStreamText((prev) => prev + text);
      },
      (data) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.fullText,
            thinking: thinkingRef.current || null,
            model_used: data.model,
            tokens_in: data.usage.input_tokens,
            tokens_out: data.usage.output_tokens,
            cost_usd: data.cost,
            duration_ms: data.durationMs,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreamText("");
        setThinkingStreamText("");
        setStreaming(false);
        loadChats();
      },
      (err) => {
        setError(err.message);
        setStreaming(false);
        setStreamText("");
        setThinkingStreamText("");
      },
      (text) => {
        if (text !== null) {
          thinkingRef.current += text;
          setThinkingStreamText((prev) => prev + text);
        }
      }
    );
  }

  async function handleEditSubmit(idx) {
    if (streaming || !activeChat?.id) return;
    const trimmed = editMessageValue.trim();
    if (!trimmed) return;
    const msg = messages[idx];
    const messagesAfter = messages.length - idx - 1;

    // Truncate messages in state to just up to and including the edited message
    setMessages((prev) => prev.slice(0, idx).concat([{ ...prev[idx], content: trimmed }]));
    setEditingMessageIdx(null);
    setStreaming(true);
    setStreamText("");
    setThinkingStreamText("");
    thinkingRef.current = "";
    setError(null);

    abortRef.current = streamMessage(
      activeChat.id,
      null,
      {
        model: selectedModel,
        thinking: thinkingEnabled,
        fast: fastEnabled,
        editMessageId: msg.id,
        editContent: trimmed,
      },
      (text) => {
        setThinkingStreamText("");
        setStreamText((prev) => prev + text);
      },
      (data) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.fullText,
            thinking: thinkingRef.current || null,
            model_used: data.model,
            tokens_in: data.usage.input_tokens,
            tokens_out: data.usage.output_tokens,
            cost_usd: data.cost,
            duration_ms: data.durationMs,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreamText("");
        setThinkingStreamText("");
        setStreaming(false);
        loadChats();
      },
      (err) => {
        setError(err.message);
        setStreaming(false);
        setStreamText("");
        setThinkingStreamText("");
      },
      (text) => {
        if (text !== null) {
          thinkingRef.current += text;
          setThinkingStreamText((prev) => prev + text);
        }
      }
    );
  }

  async function handleEnhance() {
    if (!input.trim() || enhancing) return;
    setEnhancing(true);
    setError(null);
    try {
      const result = await fetchJSON("/enhance", {
        method: "POST",
        body: JSON.stringify({ prompt: input, projectId: selectedProject }),
      });
      setEnhanceResult(result);
      setEnhanceMode(true);
    } catch (err) {
      setError("Enhancement failed: " + err.message);
    } finally {
      setEnhancing(false);
    }
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current();
      setStreaming(false);
      if (streamText) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: streamText + "\n\n[Stopped]", created_at: new Date().toISOString() },
        ]);
        setStreamText("");
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const filteredChats = chats.filter((c) => {
    if (!c.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedProject && !showAllChats) return c.project_id === selectedProject;
    return true;
  });

  const projectName = (id) => projects.find((p) => p.id === id)?.name;
  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div style={styles.container}>
      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h1 style={styles.logo}>NEXUS</h1>
            <button onClick={() => setSidebarOpen(false)} style={styles.iconBtn} title="Close sidebar">
              &laquo;
            </button>
          </div>

          {/* Tab switcher */}
          <div style={styles.tabBar}>
            <button
              onClick={() => setSidebarTab("chats")}
              style={{ ...styles.tab, ...(sidebarTab === "chats" ? styles.tabActive : {}) }}
            >
              Chats
            </button>
            <button
              onClick={() => setSidebarTab("projects")}
              style={{ ...styles.tab, ...(sidebarTab === "projects" ? styles.tabActive : {}) }}
            >
              Projects
            </button>
          </div>

          {/* Chats tab */}
          {sidebarTab === "chats" && (
            <>
              <button onClick={createNewChat} style={styles.newChatBtn}>
                + New Chat
              </button>

              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />

              {selectedProject && (
                <div style={styles.filterBar}>
                  <span style={styles.filterLabel}>
                    {showAllChats ? "All chats" : `Filtered: ${projectName(selectedProject) || "project"}`}
                  </span>
                  <button
                    onClick={() => setShowAllChats((v) => !v)}
                    style={styles.filterToggle}
                  >
                    {showAllChats ? "filter" : "show all"}
                  </button>
                </div>
              )}

              <div style={styles.chatList}>
                {filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => { if (renamingChatId !== chat.id) loadChat(chat.id); }}
                    onMouseEnter={() => setHoveredChatId(chat.id)}
                    onMouseLeave={() => { setHoveredChatId(null); if (chatMenuId === chat.id) setChatMenuId(null); }}
                    style={{
                      ...styles.chatItem,
                      ...(activeChat?.id === chat.id ? styles.chatItemActive : {}),
                      position: "relative",
                    }}
                  >
                    {renamingChatId === chat.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameChat(chat.id, renameValue);
                          if (e.key === "Escape") setRenamingChatId(null);
                        }}
                        onBlur={() => renameChat(chat.id, renameValue)}
                        autoFocus
                        maxLength={100}
                        style={{ ...styles.searchInput, margin: 0, width: "100%", fontSize: 13, padding: "4px 8px" }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        style={styles.chatTitle}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingChatId(chat.id);
                          setRenameValue(chat.title);
                        }}
                      >
                        {chat.title}
                      </div>
                    )}
                    <div style={styles.chatMeta}>
                      {chat.message_count || 0} messages
                      {hoveredChatId === chat.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setChatMenuId(chatMenuId === chat.id ? null : chat.id); }}
                          style={styles.overflowBtn}
                          title="Chat options"
                        >
                          {"\u22EF"}
                        </button>
                      )}
                    </div>
                    {chatMenuId === chat.id && (
                      <div style={styles.chatMenu}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatMenuId(null);
                            setRenamingChatId(chat.id);
                            setRenameValue(chat.title);
                          }}
                          style={styles.chatMenuItem}
                        >
                          Rename
                        </button>
                        {confirmDeleteId === chat.id ? (
                          <div style={{ display: "flex", alignItems: "center", padding: "6px 12px", gap: 6, fontSize: 12 }}>
                            <span style={{ color: "var(--danger)" }}>Delete?</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setChatMenuId(null); deleteChat(chat.id); }}
                              style={{ ...styles.chatMenuItem, padding: "4px 8px", color: "var(--danger)", fontWeight: 600 }}
                            >
                              Yes
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                              style={{ ...styles.chatMenuItem, padding: "4px 8px" }}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(chat.id); }}
                            style={{ ...styles.chatMenuItem, color: "var(--danger)" }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                    {chat.project_id && (
                      <div style={styles.chatProjectBadge}>{projectName(chat.project_id) || "project"}</div>
                    )}
                  </div>
                ))}
                {filteredChats.length === 0 && (
                  <div style={styles.emptyState}>
                    {selectedProject && !showAllChats ? "No chats in this project" : "No chats yet"}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Projects tab */}
          {sidebarTab === "projects" && (
            <>
              <button onClick={() => setShowNewProjectForm((v) => !v)} style={styles.newChatBtn}>
                + New Project
              </button>

              {showNewProjectForm && (
                <div style={styles.projectForm}>
                  <input
                    type="text"
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    style={styles.searchInput}
                  />
                  <input
                    type="text"
                    placeholder="Goal (optional)"
                    value={newProjectGoal}
                    onChange={(e) => setNewProjectGoal(e.target.value)}
                    style={styles.searchInput}
                  />
                  <div style={styles.projectFormActions}>
                    <button
                      onClick={createProject}
                      disabled={!newProjectName.trim() || creatingProject}
                      style={{
                        ...styles.sendBtn,
                        fontSize: 12,
                        padding: "6px 12px",
                        opacity: newProjectName.trim() && !creatingProject ? 1 : 0.4,
                      }}
                    >
                      {creatingProject ? "Creating..." : "Create"}
                    </button>
                    <button
                      onClick={() => { setShowNewProjectForm(false); setNewProjectName(""); setNewProjectGoal(""); }}
                      style={{ ...styles.secondaryBtn, fontSize: 12, padding: "6px 12px" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div style={styles.chatList}>
                {projects.map((p) => {
                  const isExpanded = expandedProject === p.id;
                  const projectChats = chats.filter((c) => c.project_id === p.id);
                  return (
                    <div key={p.id}>
                      <div
                        onClick={() => {
                          setSelectedProject(selectedProject === p.id ? null : p.id);
                          setExpandedProject(isExpanded ? null : p.id);
                          setShowAllChats(false);
                        }}
                        style={{
                          ...styles.chatItem,
                          ...(selectedProject === p.id ? styles.chatItemActive : {}),
                        }}
                      >
                        <div style={styles.chatTitle}>
                          <span style={styles.expandArrow}>{isExpanded ? "\u25BE" : "\u25B8"}</span>
                          {p.name}
                        </div>
                        <div style={styles.chatMeta}>
                          <span>
                            <span style={styles.projectStatusDot(p.status)} />
                            {p.status || "active"}
                          </span>
                          <span style={styles.projectMetaRight}>
                            <button
                              onClick={(e) => { e.stopPropagation(); openProjectEditor(p.id); }}
                              style={styles.editBtn}
                              title="Edit project"
                            >
                              {"\u270E"}
                            </button>
                            {Number(p.chat_count) || 0} chats
                          </span>
                        </div>
                        {p.goal && (
                          <div style={styles.projectGoal}>{p.goal}</div>
                        )}
                      </div>
                      {isExpanded && (
                        <div style={styles.subChatList}>
                          {projectChats.map((chat) => (
                            <div
                              key={chat.id}
                              onClick={() => { loadChat(chat.id); setSidebarTab("chats"); setShowAllChats(false); }}
                              style={{
                                ...styles.subChatItem,
                                ...(activeChat?.id === chat.id ? styles.chatItemActive : {}),
                              }}
                            >
                              <div style={styles.chatTitle}>{chat.title}</div>
                              <div style={{ ...styles.chatMeta, marginTop: 2 }}>
                                {chat.message_count || 0} messages
                              </div>
                            </div>
                          ))}
                          {projectChats.length === 0 && (
                            <div style={styles.subChatEmpty}>No chats yet</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div style={styles.emptyState}>No projects yet</div>
                )}
              </div>
            </>
          )}

          {/* Selected project indicator */}
          {selectedProject && (
            <div style={styles.projectIndicator}>
              <span style={styles.projectIndicatorLabel}>Project:</span>
              <span style={styles.projectIndicatorName}>
                {projects.find((p) => p.id === selectedProject)?.name || "Unknown"}
              </span>
              <button
                onClick={() => setSelectedProject(null)}
                style={styles.projectIndicatorClose}
                title="Deselect project"
              >
                &#x2715;
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main ── */}
      <div style={styles.main}>
        {/* Top bar */}
        <div style={styles.topBar}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} style={styles.iconBtn} title="Open sidebar">
              &raquo;
            </button>
          )}

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={styles.modelSelect}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — ${Number(m.input_price)}/${Number(m.output_price)} per MTok
              </option>
            ))}
          </select>

          {currentModel && (
            <span style={styles.modelBadge}>{currentModel.tier}</span>
          )}

          {currentModel?.supports_thinking && (
            <button
              onClick={() => { setThinkingEnabled((v) => !v); setFastEnabled(false); }}
              style={thinkingEnabled ? styles.capToggleThinkingActive : styles.capToggle}
              title={thinkingEnabled ? "Disable extended thinking" : "Enable extended thinking"}
            >
              {"🧠"}
            </button>
          )}

          {currentModel?.supports_fast && (
            <button
              onClick={() => { setFastEnabled((v) => !v); setThinkingEnabled(false); }}
              style={fastEnabled ? styles.capToggleFastActive : styles.capToggle}
              title={fastEnabled ? "Disable fast mode" : "Enable fast mode (~2.5x speed)"}
            >
              {"⚡"}
            </button>
          )}

          {activeChat?.project_id && (
            <span style={styles.projectBadge}>
              {projects.find((p) => p.id === activeChat.project_id)?.name || "Project"}
            </span>
          )}
        </div>

        {/* Messages area */}
        <div style={{ ...styles.messagesArea, position: "relative" }} ref={messagesAreaRef}>
          {messages.length === 0 && !streaming && (
            <div style={styles.welcome}>
              <h2 style={styles.welcomeTitle}>Nexus</h2>
              <p style={styles.welcomeText}>
                Claude Operations Platform — persistent chat, project context, prompt enhancement.
              </p>
              <p style={styles.welcomeHint}>
                Select a model above and start typing.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{ ...styles.message, ...(msg.role === "user" ? styles.userMessage : styles.assistantMessage), position: "relative" }}
              onMouseEnter={() => setHoveredMessageIdx(i)}
              onMouseLeave={() => setHoveredMessageIdx(null)}
            >
              <div style={styles.messageRole}>
                {msg.role === "user" ? "You" : "Claude"}
                {msg.enhanced && <span style={styles.enhancedBadge}>enhanced</span>}
              </div>
              {msg.thinking && (
                <details style={styles.thinkingBlock}>
                  <summary style={styles.thinkingSummary}>
                    {"🧠"} Thinking ({msg.thinking.length} chars)
                  </summary>
                  <div style={styles.thinkingContent}>
                    {msg.thinking}
                  </div>
                </details>
              )}
              {editingMessageIdx === i ? (
                <div>
                  <textarea
                    value={editMessageValue}
                    onChange={(e) => setEditMessageValue(e.target.value)}
                    style={{ ...styles.textarea, width: "100%", minHeight: 80 }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button onClick={() => handleEditSubmit(i)} style={{ ...styles.sendBtn, fontSize: 12, padding: "6px 12px" }}>
                      Save & Submit
                    </button>
                    <button onClick={() => setEditingMessageIdx(null)} style={{ ...styles.secondaryBtn, fontSize: 12, padding: "6px 12px" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={styles.messageContent}
                  onClick={handleCodeCopyClick}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )}
              {msg.role === "assistant" && msg.tokens_in && (
                <div style={styles.messageMeta}>
                  {msg.model_used} | {msg.tokens_in?.toLocaleString()} in / {msg.tokens_out?.toLocaleString()} out | {formatCost(msg.cost_usd)} | {formatTime(msg.duration_ms)}
                </div>
              )}
              {hoveredMessageIdx === i && editingMessageIdx !== i && (
                <div style={styles.messageActions}>
                  {msg.role === "user" && (
                    <button
                      onClick={() => { setEditingMessageIdx(i); setEditMessageValue(msg.content); }}
                      style={styles.actionBtn}
                      title="Edit message"
                    >
                      {"\u270E"}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(msg.content);
                      setCopiedMessageIdx(i);
                      setTimeout(() => setCopiedMessageIdx(null), 2000);
                    }}
                    style={styles.actionBtn}
                    title="Copy message"
                  >
                    {copiedMessageIdx === i ? "\u2713" : "\u2398"}
                  </button>
                </div>
              )}
              {msg.role === "assistant" && i === messages.length - 1 && !streaming && (
                <button
                  onClick={handleRegenerate}
                  style={styles.regenerateBtn}
                >
                  {"\uD83D\uDD04"} Regenerate
                </button>
              )}
            </div>
          ))}

          {streaming && streamText && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.messageRole}>Claude</div>
              <div
                style={styles.messageContent}
                onClick={handleCodeCopyClick}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }}
              />
              <div style={styles.streamingDot} />
            </div>
          )}

          {streaming && !streamText && (
            <div style={{ ...styles.message, ...styles.assistantMessage }}>
              <div style={styles.messageRole}>Claude</div>
              {thinkingEnabled
                ? <>
                    <div style={styles.thinkingText}>{"🧠"} Thinking...</div>
                    {thinkingStreamText && (
                      <details open style={styles.thinkingBlock}>
                        <summary style={styles.thinkingSummary}>
                          {"🧠"} Thinking ({thinkingStreamText.length} chars)
                        </summary>
                        <div style={styles.thinkingContent}>
                          {thinkingStreamText}
                        </div>
                      </details>
                    )}
                  </>
                : <div style={styles.pulseDots}>{"●●●"}</div>
              }
            </div>
          )}

          <div ref={endRef} />
        </div>

        {!isAtBottom && (
          <button
            onClick={() => {
              endRef.current?.scrollIntoView({ behavior: "smooth" });
              setIsAtBottom(true);
            }}
            style={styles.scrollToBottom}
            aria-label="Scroll to bottom"
          >
            {"\u2193"}
          </button>
        )}

        {/* Error banner */}
        {error && (
          <div style={styles.errorBanner}>
            {error}
            <button onClick={() => setError(null)} style={styles.errorClose}>x</button>
          </div>
        )}

        {/* Enhancement panel */}
        {enhanceMode && enhanceResult && (
          <div style={styles.enhancePanel}>
            <div style={styles.enhanceHeader}>
              <span>Enhanced Prompt</span>
              <div>
                {enhanceResult.analysis && (
                  <span style={styles.analysisBadge}>
                    {enhanceResult.analysis.taskType} | complexity {enhanceResult.analysis.complexity}/5 | rec: {enhanceResult.analysis.recommendedModel}
                  </span>
                )}
                <button onClick={() => { setEnhanceMode(false); setEnhanceResult(null); }} style={styles.iconBtn}>x</button>
              </div>
            </div>
            <div style={styles.enhanceComparison}>
              <div style={styles.enhanceCol}>
                <div style={styles.enhanceLabel}>Original</div>
                <div style={styles.enhanceText}>{enhanceResult.original}</div>
              </div>
              <div style={styles.enhanceCol}>
                <div style={styles.enhanceLabel}>Enhanced</div>
                <div style={styles.enhanceText}>{enhanceResult.enhanced}</div>
              </div>
            </div>
            <div style={styles.enhanceActions}>
              <button onClick={handleSend} style={styles.sendBtn}>Send Enhanced</button>
              <button onClick={() => { setEnhanceResult(null); setEnhanceMode(false); }} style={styles.secondaryBtn}>
                Use Original
              </button>
              {enhanceResult.enhancement && (
                <span style={styles.enhanceMeta}>
                  {formatCost(enhanceResult.enhancement.cost)} | {formatTime(enhanceResult.enhancement.durationMs)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Input area */}
        <div style={styles.inputArea}>
          <div style={styles.inputRow}>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? "Waiting for response..." : "Message Claude..."}
              disabled={streaming}
              style={styles.textarea}
              rows={1}
            />
            <div style={styles.inputActions}>
              {!streaming ? (
                <>
                  <button
                    onClick={handleEnhance}
                    disabled={!input.trim() || enhancing}
                    style={{
                      ...styles.enhanceBtn,
                      opacity: input.trim() && !enhancing ? 1 : 0.4,
                    }}
                    title="Enhance prompt"
                  >
                    {enhancing ? "..." : "Enhance"}
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      ...styles.sendBtn,
                      opacity: input.trim() ? 1 : 0.4,
                    }}
                  >
                    Send
                  </button>
                </>
              ) : (
                <button onClick={handleStop} style={styles.stopBtn}>
                  Stop
                </button>
              )}
            </div>
          </div>
          <div style={styles.inputFooter}>
            {currentModel && (
              <span>
                {currentModel.label} | ${Number(currentModel.input_price)} in / ${Number(currentModel.output_price)} out per MTok
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Project Editor Slide-over ── */}
      {editingProject && (
        <>
          <div style={styles.editorOverlay} onClick={closeProjectEditor} />
          <div style={styles.editorPanel}>
            <div style={styles.editorHeader}>
              <h2 style={styles.editorTitle}>Edit Project</h2>
              <button onClick={closeProjectEditor} style={styles.iconBtn} title="Close">
                &#x2715;
              </button>
            </div>

            <div style={styles.editorBody}>
              <label style={styles.editorLabel}>Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={styles.editorInput}
              />

              <label style={styles.editorLabel}>Goal</label>
              <textarea
                value={editGoal}
                onChange={(e) => setEditGoal(e.target.value)}
                style={{ ...styles.editorInput, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
                rows={2}
              />

              <label style={styles.editorLabel}>Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={styles.select}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>

              <label style={{ ...styles.editorLabel, marginTop: 16 }}>Context Text</label>
              <div style={styles.editorHelp}>
                This text is injected into Claude&apos;s system prompt for every chat in this project.
                Include key decisions, constraints, architecture details, and anything Claude should know.
              </div>
              <textarea
                value={editContext}
                onChange={(e) => setEditContext(e.target.value)}
                style={styles.editorContextTextarea}
                rows={15}
                placeholder="Project context..."
              />

              {editContextVersion && (
                <div style={styles.editorVersionInfo}>
                  Version {editContextVersion}
                  {editContextUpdatedAt && ` · ${new Date(editContextUpdatedAt).toLocaleDateString()}`}
                </div>
              )}
            </div>

            <div style={styles.editorFooter}>
              <button
                onClick={saveProject}
                disabled={savingProject}
                style={{ ...styles.sendBtn, opacity: savingProject ? 0.5 : 1 }}
              >
                {savingProject ? "Saving..." : "Save"}
              </button>
              <button onClick={closeProjectEditor} style={styles.secondaryBtn}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ──

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    background: "var(--bg-primary)",
  },

  // Sidebar
  sidebar: {
    width: 280,
    minWidth: 280,
    background: "var(--bg-secondary)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 8px",
  },
  logo: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 3,
    color: "var(--accent)",
  },
  newChatBtn: {
    margin: "8px 16px",
    padding: "10px",
    background: "var(--accent)",
    color: "var(--bg-primary)",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
  searchInput: {
    margin: "0 16px 8px",
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  },
  chatList: {
    flex: 1,
    overflowY: "auto",
    padding: "0 8px",
  },
  chatItem: {
    padding: "10px 12px",
    borderRadius: 6,
    cursor: "pointer",
    marginBottom: 2,
    transition: "background 0.15s",
  },
  chatItemActive: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-active)",
  },
  chatTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chatMeta: {
    fontSize: 11,
    color: "var(--text-muted)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 12,
    padding: "0 4px",
    opacity: 0.5,
  },
  overflowBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 16,
    padding: "0 4px",
    lineHeight: 1,
  },
  chatMenu: {
    position: "absolute",
    top: "100%",
    right: 4,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    zIndex: 20,
    minWidth: 100,
    overflow: "hidden",
  },
  chatMenuItem: {
    display: "block",
    width: "100%",
    padding: "8px 12px",
    background: "none",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: 12,
    textAlign: "left",
  },
  emptyState: {
    color: "var(--text-muted)",
    fontSize: 13,
    textAlign: "center",
    padding: 20,
  },
  tabBar: {
    display: "flex",
    margin: "0 16px 8px",
    borderRadius: 6,
    background: "var(--bg-tertiary)",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    padding: "8px 0",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "var(--bg-elevated)",
    color: "var(--accent)",
    fontWeight: 600,
  },
  projectForm: {
    padding: "0 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  projectFormActions: {
    display: "flex",
    gap: 6,
    marginTop: 2,
  },
  projectGoal: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chatProjectBadge: {
    fontSize: 10,
    color: "var(--accent)",
    background: "var(--accent-glow)",
    padding: "1px 6px",
    borderRadius: 3,
    marginTop: 4,
    display: "inline-block",
    fontWeight: 500,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "0 16px 6px",
    padding: "4px 8px",
    background: "var(--accent-glow)",
    borderRadius: 4,
    fontSize: 11,
  },
  filterLabel: {
    color: "var(--accent)",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  filterToggle: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 11,
    textDecoration: "underline",
    flexShrink: 0,
    padding: "0 2px",
  },
  expandArrow: {
    marginRight: 4,
    fontSize: 10,
    display: "inline-block",
    width: 12,
  },
  subChatList: {
    paddingLeft: 16,
    borderLeft: "1px solid var(--border)",
    marginLeft: 18,
    marginBottom: 4,
  },
  subChatItem: {
    padding: "6px 10px",
    borderRadius: 5,
    cursor: "pointer",
    marginBottom: 1,
    transition: "background 0.15s",
  },
  subChatEmpty: {
    fontSize: 11,
    color: "var(--text-muted)",
    padding: "6px 10px",
    fontStyle: "italic",
  },
  projectStatusDot: (status) => ({
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginRight: 4,
    background: status === "completed" ? "var(--success, #4ade80)" : status === "archived" ? "var(--text-muted)" : "var(--accent)",
  }),
  projectIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 16px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    marginTop: "auto",
  },
  projectIndicatorLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    flexShrink: 0,
  },
  projectIndicatorName: {
    fontSize: 12,
    color: "var(--accent)",
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  projectIndicatorClose: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "2px 4px",
    flexShrink: 0,
  },

  // Main
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-secondary)",
  },
  modelSelect: {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  },
  select: {
    width: "100%",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
  },
  modelBadge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    background: "var(--accent-glow)",
    color: "var(--accent)",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: 600,
  },
  projectBadge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    background: "rgba(255, 170, 51, 0.15)",
    color: "var(--warning)",
  },
  capToggle: {
    padding: "4px 8px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--bg-tertiary)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    opacity: 0.5,
    transition: "all 0.15s",
  },
  capToggleThinkingActive: {
    padding: "4px 8px",
    borderRadius: 5,
    border: "1px solid rgba(168, 85, 247, 0.5)",
    background: "rgba(168, 85, 247, 0.15)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    opacity: 1,
    transition: "all 0.15s",
  },
  capToggleFastActive: {
    padding: "4px 8px",
    borderRadius: 5,
    border: "1px solid rgba(245, 158, 11, 0.5)",
    background: "rgba(245, 158, 11, 0.15)",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    opacity: 1,
    transition: "all 0.15s",
  },
  iconBtn: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 16,
    padding: "4px 8px",
  },

  // Messages
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 0",
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "var(--text-secondary)",
    padding: 40,
    textAlign: "center",
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: "var(--accent)",
    marginBottom: 12,
    letterSpacing: 2,
  },
  welcomeText: {
    fontSize: 14,
    maxWidth: 500,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  welcomeHint: {
    fontSize: 13,
    color: "var(--text-muted)",
  },
  message: {
    padding: "16px 24px",
    maxWidth: 800,
    margin: "0 auto 8px",
    width: "100%",
  },
  userMessage: {
    background: "var(--bg-tertiary)",
    borderRadius: 8,
    maxWidth: 780,
    marginLeft: "auto",
    marginRight: "auto",
  },
  assistantMessage: {
    background: "transparent",
  },
  messageRole: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  enhancedBadge: {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 3,
    background: "var(--accent-glow)",
    color: "var(--accent)",
    fontWeight: 500,
  },
  messageContent: {
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--text-primary)",
    wordBreak: "break-word",
  },
  messageMeta: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 8,
    fontFamily: "monospace",
  },
  streamingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--accent)",
    marginTop: 8,
    animation: "pulse 1s ease-in-out infinite",
  },
  scrollToBottom: {
    position: "absolute",
    bottom: 80,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "50%",
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: 18,
    color: "var(--text-primary)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 10,
    transition: "all 0.15s",
  },
  regenerateBtn: {
    marginTop: 8,
    padding: "4px 12px",
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 5,
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 12,
    transition: "all 0.15s",
  },
  messageActions: {
    position: "absolute",
    top: 8,
    right: 8,
    display: "flex",
    gap: 4,
  },
  actionBtn: {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "4px 8px",
    lineHeight: 1,
    transition: "all 0.15s",
  },
  thinkingText: {
    color: "var(--text-muted)",
    fontStyle: "italic",
    fontSize: 13,
  },
  pulseDots: {
    color: "var(--accent)",
    fontSize: 16,
    letterSpacing: 3,
    animation: "pulse 1.2s ease-in-out infinite",
  },
  thinkingBlock: {
    marginBottom: 8,
  },
  thinkingSummary: {
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: "var(--text-muted)",
  },
  thinkingContent: {
    marginTop: 6,
    padding: 10,
    borderRadius: 6,
    fontSize: 12,
    whiteSpace: "pre-wrap",
    background: "rgba(139, 92, 246, 0.08)",
    border: "1px solid rgba(139, 92, 246, 0.2)",
    color: "var(--text-muted)",
    maxHeight: 300,
    overflowY: "auto",
    fontFamily: "monospace",
  },

  // Error
  errorBanner: {
    padding: "8px 16px",
    background: "rgba(255, 68, 102, 0.1)",
    color: "var(--danger)",
    fontSize: 13,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorClose: {
    background: "none",
    border: "none",
    color: "var(--danger)",
    cursor: "pointer",
    fontSize: 14,
  },

  // Enhancement panel
  enhancePanel: {
    background: "var(--bg-secondary)",
    borderTop: "1px solid var(--border)",
    padding: "12px 16px",
  },
  enhanceHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    marginBottom: 10,
  },
  enhanceComparison: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 10,
  },
  enhanceCol: {},
  enhanceLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  enhanceText: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-tertiary)",
    padding: 10,
    borderRadius: 6,
    maxHeight: 120,
    overflowY: "auto",
    lineHeight: 1.5,
  },
  enhanceActions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  analysisBadge: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginRight: 10,
  },
  enhanceMeta: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginLeft: "auto",
  },

  // Input
  inputArea: {
    padding: "12px 16px 16px",
    borderTop: "1px solid var(--border)",
    background: "var(--bg-secondary)",
  },
  inputRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    padding: "10px 14px",
    fontSize: 14,
    lineHeight: 1.5,
    outline: "none",
    fontFamily: "inherit",
    minHeight: 42,
    maxHeight: 200,
  },
  inputActions: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
  },
  sendBtn: {
    padding: "8px 16px",
    background: "var(--accent)",
    color: "var(--bg-primary)",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  enhanceBtn: {
    padding: "8px 12px",
    background: "var(--bg-elevated)",
    color: "var(--accent)",
    border: "1px solid var(--border-active)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  stopBtn: {
    padding: "8px 16px",
    background: "var(--danger)",
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  secondaryBtn: {
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
  },
  inputFooter: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 6,
    paddingLeft: 2,
  },

  // Project editor
  editBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 13,
    padding: "2px 4px",
    opacity: 0.6,
    transition: "opacity 0.15s",
  },
  projectMetaRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  editorOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.4)",
    zIndex: 100,
  },
  editorPanel: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "45%",
    minWidth: 380,
    maxWidth: 640,
    background: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    zIndex: 101,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
    margin: 0,
  },
  editorBody: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  editorLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
  },
  editorInput: {
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  },
  editorHelp: {
    fontSize: 11,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginBottom: 4,
  },
  editorContextTextarea: {
    padding: "10px 12px",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
    resize: "vertical",
    fontFamily: "monospace",
    lineHeight: 1.6,
    minHeight: 280,
  },
  editorVersionInfo: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "monospace",
    marginTop: 4,
  },
  editorFooter: {
    display: "flex",
    gap: 8,
    padding: "16px 20px",
    borderTop: "1px solid var(--border)",
  },
};
