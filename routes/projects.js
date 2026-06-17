const express = require('express');
const router = express.Router();
const store = require('../data/store');
const { authenticateToken, requireRole } = require('../middleware/auth');

function calculateProjectProgress(projectId) {
  const phases = store.find('phases', p => p.projectId === projectId);
  if (phases.length === 0) return 0;

  let totalWeight = 0;
  let weightedProgress = 0;

  phases.forEach(phase => {
    const tasks = store.find('tasks', t => t.phaseId === phase.id);
    let phaseProgress = 0;
    
    if (tasks.length > 0) {
      const totalTaskWeight = tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
      phaseProgress = tasks.reduce((sum, t) => sum + (t.progress || 0) * (t.weight || 1), 0) / totalTaskWeight;
    }
    
    const phaseWeight = phase.weight || 1;
    totalWeight += phaseWeight;
    weightedProgress += phaseProgress * phaseWeight;
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight * 100) / 100 : 0;
}

function checkPhaseDelay(phase) {
  if (!phase.plannedEndDate || phase.progress >= 100) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plannedEnd = new Date(phase.plannedEndDate);
  plannedEnd.setHours(0, 0, 0, 0);
  
  const timeDiff = plannedEnd - today;
  const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) return true;
  
  const progress = phase.progress || 0;
  const totalDays = Math.ceil((new Date(phase.plannedEndDate) - new Date(phase.plannedStartDate)) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.ceil((today - new Date(phase.plannedStartDate)) / (1000 * 60 * 60 * 24));
  
  if (totalDays > 0 && elapsedDays > 0) {
    const expectedProgress = Math.min(100, (elapsedDays / totalDays) * 100);
    return progress < (expectedProgress - 10);
  }
  
  return false;
}

router.get('/', authenticateToken, (req, res) => {
  let projects = store.getAll('projects');
  
  if (req.user.role === 'foreman') {
    const userTasks = store.find('tasks', t => t.assigneeId === req.user.id);
    const phaseIds = [...new Set(userTasks.map(t => t.phaseId))];
    const projectIds = [...new Set(store.find('phases', p => phaseIds.includes(p.id)).map(p => p.projectId))];
    projects = projects.filter(p => projectIds.includes(p.id));
  } else if (req.user.role === 'owner') {
    projects = projects.filter(p => p.ownerId === req.user.id || p.status !== 'draft');
  }
  
  const projectsWithProgress = projects.map(project => ({
    ...project,
    progress: calculateProjectProgress(project.id)
  }));
  
  res.json(projectsWithProgress.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.get('/:id', authenticateToken, (req, res) => {
  const project = store.getById('projects', req.params.id);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const phases = store.find('phases', p => p.projectId === project.id)
    .sort((a, b) => new Date(a.plannedStartDate) - new Date(b.plannedStartDate))
    .map(phase => {
      const tasks = store.find('tasks', t => t.phaseId === phase.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(task => ({
          ...task,
          assignee: task.assigneeId ? store.getById('users', task.assigneeId) : null
        }));

      let phaseProgress = phase.progress || 0;
      if (tasks.length > 0) {
        const totalTaskWeight = tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
        phaseProgress = tasks.reduce((sum, t) => sum + (t.progress || 0) * (t.weight || 1), 0) / totalTaskWeight;
      }

      const recalculatedPhase = { ...phase, progress: phaseProgress };
      return {
        ...recalculatedPhase,
        isDelayed: checkPhaseDelay(recalculatedPhase),
        tasks
      };
    });
  
  const progress = calculateProjectProgress(project.id);
  const isDelayed = phases.some(p => p.isDelayed);
  
  res.json({
    ...project,
    progress,
    isDelayed,
    phases
  });
});

router.post('/', authenticateToken, requireRole('project_manager'), (req, res) => {
  const { name, description, location, plannedStartDate, plannedEndDate, ownerId } = req.body;
  
  if (!name || !plannedStartDate || !plannedEndDate) {
    return res.status(400).json({ error: '项目名称、计划开始和结束日期不能为空' });
  }
  
  const project = store.create('projects', {
    name,
    description: description || '',
    location: location || '',
    plannedStartDate,
    plannedEndDate,
    ownerId: ownerId || null,
    managerId: req.user.id,
    status: 'active',
    progress: 0
  });
  
  res.json(project);
});

router.put('/:id', authenticateToken, requireRole('project_manager'), (req, res) => {
  const project = store.getById('projects', req.params.id);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const updated = store.update('projects', req.params.id, req.body);
  res.json(updated);
});

router.delete('/:id', authenticateToken, requireRole('project_manager'), (req, res) => {
  const project = store.getById('projects', req.params.id);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const phases = store.find('phases', p => p.projectId === req.params.id);
  phases.forEach(phase => {
    const tasks = store.find('tasks', t => t.phaseId === phase.id);
    tasks.forEach(task => {
      const records = store.find('progressRecords', r => r.taskId === task.id);
      records.forEach(r => store.remove('progressRecords', r.id));
      const photos = store.find('photos', p => p.taskId === task.id);
      photos.forEach(p => store.remove('photos', p.id));
      store.remove('tasks', task.id);
    });
    store.remove('phases', phase.id);
  });
  
  const notices = store.find('rectificationNotices', n => n.projectId === req.params.id);
  notices.forEach(n => store.remove('rectificationNotices', n.id));
  
  store.remove('projects', req.params.id);
  res.json({ message: '项目已删除' });
});

router.post('/:id/phases', authenticateToken, requireRole('project_manager'), (req, res) => {
  const project = store.getById('projects', req.params.id);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const { name, description, plannedStartDate, plannedEndDate, weight } = req.body;
  
  if (!name || !plannedStartDate || !plannedEndDate) {
    return res.status(400).json({ error: '阶段名称、计划开始和结束日期不能为空' });
  }
  
  const phase = store.create('phases', {
    projectId: req.params.id,
    name,
    description: description || '',
    plannedStartDate,
    plannedEndDate,
    actualStartDate: null,
    actualEndDate: null,
    progress: 0,
    weight: weight || 1,
    status: 'pending'
  });
  
  res.json(phase);
});

router.put('/phases/:phaseId', authenticateToken, requireRole('project_manager'), (req, res) => {
  const phase = store.getById('phases', req.params.phaseId);
  if (!phase) {
    return res.status(404).json({ error: '阶段不存在' });
  }
  
  const updated = store.update('phases', req.params.phaseId, req.body);
  res.json(updated);
});

router.delete('/phases/:phaseId', authenticateToken, requireRole('project_manager'), (req, res) => {
  const phase = store.getById('phases', req.params.phaseId);
  if (!phase) {
    return res.status(404).json({ error: '阶段不存在' });
  }
  
  const tasks = store.find('tasks', t => t.phaseId === req.params.phaseId);
  tasks.forEach(task => {
    const records = store.find('progressRecords', r => r.taskId === task.id);
    records.forEach(r => store.remove('progressRecords', r.id));
    const photos = store.find('photos', p => p.taskId === task.id);
    photos.forEach(p => store.remove('photos', p.id));
    store.remove('tasks', task.id);
  });
  
  store.remove('phases', req.params.phaseId);
  res.json({ message: '阶段已删除' });
});

router.get('/:id/gantt', authenticateToken, (req, res) => {
  const project = store.getById('projects', req.params.id);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const phases = store.find('phases', p => p.projectId === project.id)
    .sort((a, b) => new Date(a.plannedStartDate) - new Date(b.plannedStartDate));
  
  const tasks = store.find('tasks', t => {
    const phase = phases.find(p => p.id === t.phaseId);
    return phase !== undefined;
  }).sort((a, b) => {
    const phaseA = phases.find(p => p.id === a.phaseId);
    const phaseB = phases.find(p => p.id === b.phaseId);
    const phaseOrderA = phases.indexOf(phaseA);
    const phaseOrderB = phases.indexOf(phaseB);
    if (phaseOrderA !== phaseOrderB) return phaseOrderA - phaseOrderB;
    return (a.order || 0) - (b.order || 0);
  });
  
  res.json({
    phases: phases.map(phase => ({
      id: phase.id,
      name: phase.name,
      plannedStartDate: phase.plannedStartDate,
      plannedEndDate: phase.plannedEndDate,
      actualStartDate: phase.actualStartDate,
      actualEndDate: phase.actualEndDate,
      progress: phase.progress || 0,
      weight: phase.weight || 1
    })),
    tasks: tasks.map(task => ({
      id: task.id,
      phaseId: task.phaseId,
      name: task.name,
      plannedStartDate: task.plannedStartDate,
      plannedEndDate: task.plannedEndDate,
      actualStartDate: task.actualStartDate,
      actualEndDate: task.actualEndDate,
      progress: task.progress || 0,
      assigneeId: task.assigneeId,
      weight: task.weight || 1
    }))
  });
});

module.exports = router;
