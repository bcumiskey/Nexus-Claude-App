/**
 * Nexus API Client
 * All backend communication in one module.
 */

const API = import.meta.env.VITE_API_URL || 'http://localhost:3100/api';

async function fetchJSON(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Health ──
export const health = () => fetchJSON('/health');

// ── Chat ──
export const listChats = () => fetchJSON('/chat');
export const createChat = (title, modelId, projectId) =>
  fetchJSON('/chat/new', { method: 'POST', body: JSON.stringify({ title, modelId, projectId }) });
export const getChat = (id) => fetchJSON(`/chat/${id}`);
export const getChatMessages = (id) => fetchJSON(`/chat/${id}/messages`);
export const updateChat = (id, data) =>
  fetchJSON(`/chat/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteChat = (id) =>
  fetchJSON(`/chat/${id}`, { method: 'DELETE' });

/**
 * Send a message and stream the response via SSE.
 * @param {number} chatId
 * @param {string} content
 * @param {object} opts - { model, enhanced }
 * @param {function} onText - Called with each text chunk
 * @param {function} onDone - Called with final metadata { usage, cost, durationMs, model }
 * @param {function} onError - Called with error
 * @returns {function} abort - Call to cancel the stream
 */
export function sendMessage(chatId, content, opts = {}, onText, onDone, onError) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API}/chat/${chatId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, model: opts.model, enhanced: opts.enhanced || false }),
        signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'text') onText(data.text);
          else if (data.type === 'done') onDone(data);
          else if (data.type === 'error') onError(new Error(data.error));
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError(err);
    }
  })();

  return () => controller.abort();
}

// ── Enhance ──
export const enhancePrompt = (prompt, projectId) =>
  fetchJSON('/enhance', { method: 'POST', body: JSON.stringify({ prompt, projectId }) });
export const analyzePrompt = (prompt) =>
  fetchJSON('/enhance/analyze', { method: 'POST', body: JSON.stringify({ prompt }) });
export const logEnhancement = (data) =>
  fetchJSON('/enhance/log', { method: 'POST', body: JSON.stringify(data) });

// ── Projects ──
export const listProjects = (status) =>
  fetchJSON(`/project${status ? `?status=${status}` : ''}`);
export const createProject = (data) =>
  fetchJSON('/project/new', { method: 'POST', body: JSON.stringify(data) });
export const getProject = (id) => fetchJSON(`/project/${id}`);
export const updateProject = (id, data) =>
  fetchJSON(`/project/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const getProjectContext = (id) => fetchJSON(`/project/${id}/context`);

export const addDecision = (projectId, data) =>
  fetchJSON(`/project/${projectId}/decision`, { method: 'POST', body: JSON.stringify(data) });
export const addDiscovery = (projectId, data) =>
  fetchJSON(`/project/${projectId}/discovery`, { method: 'POST', body: JSON.stringify(data) });
export const addProgress = (projectId, data) =>
  fetchJSON(`/project/${projectId}/progress`, { method: 'POST', body: JSON.stringify(data) });
export const addArtifact = (projectId, data) =>
  fetchJSON(`/project/${projectId}/artifact`, { method: 'POST', body: JSON.stringify(data) });

// ── Tasks ──
export const listTasks = (projectId, filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return fetchJSON(`/project/${projectId}/tasks${params ? `?${params}` : ''}`);
};
export const createTask = (projectId, data) =>
  fetchJSON(`/project/${projectId}/task`, { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (taskId, data) =>
  fetchJSON(`/project/task/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTask = (taskId) =>
  fetchJSON(`/project/task/${taskId}`, { method: 'DELETE' });
export const getMyFocus = () => fetchJSON('/project/tasks/focus');

// ── Milestones ──
export const listMilestones = (projectId) => fetchJSON(`/project/${projectId}/milestones`);
export const createMilestone = (projectId, data) =>
  fetchJSON(`/project/${projectId}/milestone`, { method: 'POST', body: JSON.stringify(data) });
export const updateMilestone = (milestoneId, data) =>
  fetchJSON(`/project/milestone/${milestoneId}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Usage ──
export const getBudget = () => fetchJSON('/usage/budget');
export const updateBudget = (id, data) =>
  fetchJSON(`/usage/budget/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const getUsageSummary = (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return fetchJSON(`/usage/summary${params ? `?${params}` : ''}`);
};
export const getUsageBreakdown = (period = 'month') =>
  fetchJSON(`/usage/breakdown?period=${period}`);
export const logExternalUsage = (data) =>
  fetchJSON('/usage/log-external', { method: 'POST', body: JSON.stringify(data) });

// ── Settings ──
export const getSettings = () => fetchJSON('/usage/settings');
export const updateSetting = (key, value) =>
  fetchJSON(`/usage/settings/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) });
