import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ── List projects ──
router.get('/', async (req, res) => {
  const { status } = req.query;
  let where = '';
  const params = {};
  if (status) { where = 'WHERE status = @status'; params.status = status; }

  const r = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM nexus.tasks WHERE project_id = p.id AND status = 'todo') AS tasks_todo,
       (SELECT COUNT(*) FROM nexus.tasks WHERE project_id = p.id AND status = 'in_progress') AS tasks_active,
       (SELECT COUNT(*) FROM nexus.tasks WHERE project_id = p.id AND status = 'blocked') AS tasks_blocked,
       (SELECT COUNT(*) FROM nexus.tasks WHERE project_id = p.id AND status = 'done') AS tasks_done
     FROM nexus.projects p ${where} ORDER BY p.updated_at DESC`,
    params
  );
  res.json(r.recordset);
});

// ── Create project ──
router.post('/new', async (req, res) => {
  const { name, goal, timelineStart, timelineTarget, parentProjectId = null, contextBudget = 2000 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const r = await query(
    `INSERT INTO nexus.projects (name, goal, timeline_start, timeline_target, parent_project_id, context_budget)
     OUTPUT INSERTED.*
     VALUES (@name, @goal, @start, @target, @parent, @budget)`,
    { name, goal, start: timelineStart || null, target: timelineTarget || null, parent: parentProjectId, budget: contextBudget }
  );

  // Create initial context
  const project = r.recordset[0];
  const initialContext = JSON.stringify({
    project_id: project.id,
    meta: { goal, timeline: { start: timelineStart, target: timelineTarget }, status: 'active', health: 'on_track', context_budget_tokens: contextBudget },
    decisions: [], discoveries: [], constraints: [], sub_projects: [], progress_log: [], task_summary: { total: 0, todo: 0, in_progress: 0, blocked: 0, done: 0 },
  });
  await query(
    `INSERT INTO nexus.project_context (project_id, context_json, version)
     VALUES (@pid, @ctx, 1)`,
    { pid: project.id, ctx: initialContext }
  );

  res.status(201).json(project);
});

// ── Get project ──
router.get('/:id', async (req, res) => {
  const pid = parseInt(req.params.id);
  const p = await query('SELECT * FROM nexus.projects WHERE id = @id', { id: pid });
  if (!p.recordset.length) return res.status(404).json({ error: 'Project not found' });

  const [tasks, milestones, decisions, discoveries] = await Promise.all([
    query('SELECT * FROM nexus.tasks WHERE project_id = @id ORDER BY sort_order', { id: pid }),
    query('SELECT * FROM nexus.milestones WHERE project_id = @id ORDER BY target_date', { id: pid }),
    query('SELECT * FROM nexus.project_decisions WHERE project_id = @id ORDER BY created_at DESC', { id: pid }),
    query('SELECT * FROM nexus.project_discoveries WHERE project_id = @id ORDER BY created_at DESC', { id: pid }),
  ]);

  res.json({
    ...p.recordset[0],
    tasks: tasks.recordset,
    milestones: milestones.recordset,
    decisions: decisions.recordset,
    discoveries: discoveries.recordset,
  });
});

// ── Update project ──
router.patch('/:id', async (req, res) => {
  const { name, goal, status, health, contextBudget, timelineStart, timelineTarget } = req.body;
  const sets = ['updated_at = SYSUTCDATETIME()'];
  const params = { id: parseInt(req.params.id) };

  if (name !== undefined) { sets.push('name = @name'); params.name = name; }
  if (goal !== undefined) { sets.push('goal = @goal'); params.goal = goal; }
  if (status !== undefined) { sets.push('status = @status'); params.status = status; }
  if (health !== undefined) { sets.push('health = @health'); params.health = health; }
  if (contextBudget !== undefined) { sets.push('context_budget = @budget'); params.budget = contextBudget; }
  if (timelineStart !== undefined) { sets.push('timeline_start = @start'); params.start = timelineStart; }
  if (timelineTarget !== undefined) { sets.push('timeline_target = @target'); params.target = timelineTarget; }

  await query(`UPDATE nexus.projects SET ${sets.join(', ')} WHERE id = @id`, params);
  const r = await query('SELECT * FROM nexus.projects WHERE id = @id', { id: params.id });
  res.json(r.recordset[0]);
});

// ── Context ──
router.get('/:id/context', async (req, res) => {
  const r = await query(
    'SELECT TOP 1 * FROM nexus.project_context WHERE project_id = @id ORDER BY version DESC',
    { id: parseInt(req.params.id) }
  );
  res.json(r.recordset[0] || null);
});

// ── Decisions ──
router.post('/:id/decision', async (req, res) => {
  const { decision, rationale, revisitTrigger } = req.body;
  const r = await query(
    `INSERT INTO nexus.project_decisions (project_id, decision, rationale, revisit_trigger)
     OUTPUT INSERTED.* VALUES (@pid, @decision, @rationale, @trigger)`,
    { pid: parseInt(req.params.id), decision, rationale, trigger: revisitTrigger }
  );
  res.status(201).json(r.recordset[0]);
});

// ── Discoveries ──
router.post('/:id/discovery', async (req, res) => {
  const { finding, impact, source } = req.body;
  const r = await query(
    `INSERT INTO nexus.project_discoveries (project_id, finding, impact, source)
     OUTPUT INSERTED.* VALUES (@pid, @finding, @impact, @source)`,
    { pid: parseInt(req.params.id), finding, impact, source }
  );
  res.status(201).json(r.recordset[0]);
});

// ── Progress ──
router.post('/:id/progress', async (req, res) => {
  const { summary, nextSteps, reassessmentNotes } = req.body;
  const r = await query(
    `INSERT INTO nexus.project_progress (project_id, summary, next_steps, reassessment_notes)
     OUTPUT INSERTED.* VALUES (@pid, @summary, @next, @notes)`,
    { pid: parseInt(req.params.id), summary, next: nextSteps, notes: reassessmentNotes }
  );
  res.status(201).json(r.recordset[0]);
});

// ── Artifacts ──
router.post('/:id/artifact', async (req, res) => {
  const { name, artifactType, pathOrRef, description } = req.body;
  const r = await query(
    `INSERT INTO nexus.project_artifacts (project_id, name, artifact_type, path_or_ref, description)
     OUTPUT INSERTED.* VALUES (@pid, @name, @type, @path, @desc)`,
    { pid: parseInt(req.params.id), name, type: artifactType, path: pathOrRef, desc: description }
  );
  res.status(201).json(r.recordset[0]);
});

// ═══ TASKS ═══

// List tasks for project
router.get('/:id/tasks', async (req, res) => {
  const { status, priority, tag } = req.query;
  let where = 'WHERE project_id = @pid';
  const params = { pid: parseInt(req.params.id) };

  if (status) { where += ' AND status = @status'; params.status = status; }
  if (priority) { where += ' AND priority = @priority'; params.priority = priority; }
  if (tag) { where += ' AND tags LIKE @tag'; params.tag = `%${tag}%`; }

  const r = await query(`SELECT * FROM nexus.tasks ${where} ORDER BY sort_order, created_at`, params);
  res.json(r.recordset);
});

// Create task
router.post('/:id/task', async (req, res) => {
  const { title, description, priority = 'medium', effort, dueDate, blockedBy, dependsOn, tags, parentTaskId } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  // Get max sort_order
  const maxSort = await query(
    'SELECT ISNULL(MAX(sort_order), 0) + 1 AS next_sort FROM nexus.tasks WHERE project_id = @pid',
    { pid: parseInt(req.params.id) }
  );

  const r = await query(
    `INSERT INTO nexus.tasks (project_id, parent_task_id, title, description, priority, effort, due_date, blocked_by, depends_on, tags, sort_order)
     OUTPUT INSERTED.*
     VALUES (@pid, @parent, @title, @desc, @priority, @effort, @due, @blocked, @depends, @tags, @sort)`,
    {
      pid: parseInt(req.params.id), parent: parentTaskId || null, title, desc: description,
      priority, effort, due: dueDate || null, blocked: blockedBy, depends: dependsOn, tags,
      sort: maxSort.recordset[0].next_sort,
    }
  );
  res.status(201).json(r.recordset[0]);
});

// Update task
router.patch('/task/:taskId', async (req, res) => {
  const { title, description, status, priority, effort, dueDate, blockedBy, dependsOn, tags, sortOrder } = req.body;
  const sets = ['updated_at = SYSUTCDATETIME()'];
  const params = { id: parseInt(req.params.taskId) };

  if (title !== undefined) { sets.push('title = @title'); params.title = title; }
  if (description !== undefined) { sets.push('description = @desc'); params.desc = description; }
  if (status !== undefined) {
    sets.push('status = @status');
    params.status = status;
    if (status === 'done') sets.push('completed_at = SYSUTCDATETIME()');
    else sets.push('completed_at = NULL');
  }
  if (priority !== undefined) { sets.push('priority = @priority'); params.priority = priority; }
  if (effort !== undefined) { sets.push('effort = @effort'); params.effort = effort; }
  if (dueDate !== undefined) { sets.push('due_date = @due'); params.due = dueDate; }
  if (blockedBy !== undefined) { sets.push('blocked_by = @blocked'); params.blocked = blockedBy; }
  if (dependsOn !== undefined) { sets.push('depends_on = @depends'); params.depends = dependsOn; }
  if (tags !== undefined) { sets.push('tags = @tags'); params.tags = tags; }
  if (sortOrder !== undefined) { sets.push('sort_order = @sort'); params.sort = sortOrder; }

  await query(`UPDATE nexus.tasks SET ${sets.join(', ')} WHERE id = @id`, params);
  const r = await query('SELECT * FROM nexus.tasks WHERE id = @id', { id: params.id });
  res.json(r.recordset[0]);
});

// Delete task
router.delete('/task/:taskId', async (req, res) => {
  await query('DELETE FROM nexus.tasks WHERE id = @id', { id: parseInt(req.params.taskId) });
  res.json({ deleted: true });
});

// Cross-project focus view
router.get('/tasks/focus', async (req, res) => {
  const r = await query(
    `SELECT t.*, p.name AS project_name
     FROM nexus.tasks t
     JOIN nexus.projects p ON t.project_id = p.id
     WHERE t.status IN ('in_progress', 'blocked')
        OR t.priority = 'critical'
     ORDER BY
       CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END`
  );
  res.json(r.recordset);
});

// ═══ MILESTONES ═══

router.get('/:id/milestones', async (req, res) => {
  const r = await query(
    'SELECT * FROM nexus.milestones WHERE project_id = @pid ORDER BY target_date',
    { pid: parseInt(req.params.id) }
  );
  res.json(r.recordset);
});

router.post('/:id/milestone', async (req, res) => {
  const { title, description, targetDate } = req.body;
  const r = await query(
    `INSERT INTO nexus.milestones (project_id, title, description, target_date)
     OUTPUT INSERTED.* VALUES (@pid, @title, @desc, @date)`,
    { pid: parseInt(req.params.id), title, desc: description, date: targetDate }
  );
  res.status(201).json(r.recordset[0]);
});

router.patch('/milestone/:milestoneId', async (req, res) => {
  const { title, description, targetDate, status } = req.body;
  const sets = [];
  const params = { id: parseInt(req.params.milestoneId) };

  if (title !== undefined) { sets.push('title = @title'); params.title = title; }
  if (description !== undefined) { sets.push('description = @desc'); params.desc = description; }
  if (targetDate !== undefined) { sets.push('target_date = @date'); params.date = targetDate; }
  if (status !== undefined) {
    sets.push('status = @status');
    params.status = status;
    if (status === 'reached') sets.push('reached_at = SYSUTCDATETIME()');
  }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  await query(`UPDATE nexus.milestones SET ${sets.join(', ')} WHERE id = @id`, params);
  const r = await query('SELECT * FROM nexus.milestones WHERE id = @id', { id: params.id });
  res.json(r.recordset[0]);
});

export default router;
