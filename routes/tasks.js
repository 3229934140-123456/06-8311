const express = require('express');
const router = express.Router();
const store = require('../data/store');
const { authenticateToken, requireRole } = require('../middleware/auth');

function updatePhaseProgress(phaseId) {
  const tasks = store.find('tasks', t => t.phaseId === phaseId);
  if (tasks.length === 0) return;
  
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
  const weightedProgress = tasks.reduce((sum, t) => sum + (t.progress || 0) * (t.weight || 1), 0);
  const phaseProgress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight * 100) / 100 : 0;
  
  let actualStartDate = null;
  let actualEndDate = null;
  let status = 'pending';
  
  const startedTasks = tasks.filter(t => t.actualStartDate);
  if (startedTasks.length > 0) {
    actualStartDate = startedTasks.reduce((earliest, t) => 
      new Date(t.actualStartDate) < new Date(earliest) ? t.actualStartDate : earliest, 
      startedTasks[0].actualStartDate
    );
    status = 'in_progress';
  }
  
  if (phaseProgress >= 100) {
    const completedTasks = tasks.filter(t => t.actualEndDate);
    if (completedTasks.length === tasks.length) {
      actualEndDate = completedTasks.reduce((latest, t) => 
        new Date(t.actualEndDate) > new Date(latest) ? t.actualEndDate : latest, 
        completedTasks[0].actualEndDate
      );
      status = 'completed';
    }
  }
  
  store.update('phases', phaseId, {
    progress: phaseProgress,
    actualStartDate,
    actualEndDate,
    status
  });
}

function checkAndCreateDelayNotification(taskId, task) {
  if (!task.plannedEndDate || task.progress >= 100) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plannedEnd = new Date(task.plannedEndDate);
  plannedEnd.setHours(0, 0, 0, 0);
  
  const phase = store.getById('phases', task.phaseId);
  if (!phase) return;
  const project = store.getById('projects', phase.projectId);
  if (!project) return;
  const manager = store.getById('users', project.managerId);
  if (!manager) return;

  const timeDiff = plannedEnd - today;
  const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    const existingNotification = store.findOne('notifications', n => 
      n.taskId === taskId && n.type === 'delay' && n.read === false
    );
    
    if (!existingNotification) {
      store.create('notifications', {
        userId: manager.id,
        type: 'delay',
        title: '工期延误预警',
        message: `任务"${task.name}"已超出计划完成日期${Math.abs(daysDiff)}天，请及时处理。`,
        projectId: project.id,
        phaseId: phase.id,
        taskId: taskId,
        read: false
      });
    }
  }

  if (task.plannedStartDate) {
    const plannedStart = new Date(task.plannedStartDate);
    plannedStart.setHours(0, 0, 0, 0);
    
    const totalDuration = (plannedEnd - plannedStart) / (1000 * 60 * 60 * 24);
    const elapsedDuration = (today - plannedStart) / (1000 * 60 * 60 * 24);
    
    if (elapsedDuration > 0 && totalDuration > 0) {
      const expectedProgress = Math.min(100, (elapsedDuration / totalDuration) * 100);
      const progressLag = expectedProgress - (task.progress || 0);
      
      if (progressLag > 10) {
        const existingNotification = store.findOne('notifications', n => 
          n.taskId === taskId && n.type === 'progress_lag' && n.read === false
        );
        
        if (!existingNotification) {
          store.create('notifications', {
            userId: manager.id,
            type: 'progress_lag',
            title: '进度滞后预警',
            message: `任务"${task.name}"进度滞后，当前进度${task.progress}%，预期应达${Math.round(expectedProgress)}%，差距${Math.round(progressLag)}%，请关注。`,
            projectId: project.id,
            phaseId: phase.id,
            taskId: taskId,
            read: false
          });
        }
      }
    }
  }
}

router.get('/', authenticateToken, (req, res) => {
  let tasks = store.getAll('tasks');
  
  if (req.user.role === 'foreman') {
    tasks = tasks.filter(t => t.assigneeId === req.user.id);
  } else if (req.query.phaseId) {
    tasks = tasks.filter(t => t.phaseId === req.query.phaseId);
  }
  
  const tasksWithDetails = tasks.map(task => ({
    ...task,
    assignee: task.assigneeId ? store.getById('users', task.assigneeId) : null,
    phase: store.getById('phases', task.phaseId),
    progressRecords: store.find('progressRecords', r => r.taskId === task.id)
      .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate))
      .slice(0, 5)
  }));
  
  res.json(tasksWithDetails.sort((a, b) => (a.order || 0) - (b.order || 0)));
});

router.get('/:id', authenticateToken, (req, res) => {
  const task = store.getById('tasks', req.params.id);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (req.user.role === 'foreman' && task.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '无权限查看此任务' });
  }
  
  const progressRecords = store.find('progressRecords', r => r.taskId === task.id)
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate));
  
  const photos = store.find('photos', p => p.taskId === task.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    ...task,
    assignee: task.assigneeId ? store.getById('users', task.assigneeId) : null,
    phase: store.getById('phases', task.phaseId),
    progressRecords,
    photos
  });
});

router.post('/', authenticateToken, requireRole('project_manager'), (req, res) => {
  const { phaseId, name, description, plannedStartDate, plannedEndDate, assigneeId, weight, order } = req.body;
  
  if (!phaseId || !name) {
    return res.status(400).json({ error: '阶段ID和任务名称不能为空' });
  }
  
  const phase = store.getById('phases', phaseId);
  if (!phase) {
    return res.status(404).json({ error: '阶段不存在' });
  }
  
  const task = store.create('tasks', {
    phaseId,
    name,
    description: description || '',
    plannedStartDate: plannedStartDate || phase.plannedStartDate,
    plannedEndDate: plannedEndDate || phase.plannedEndDate,
    actualStartDate: null,
    actualEndDate: null,
    assigneeId: assigneeId || null,
    progress: 0,
    weight: weight || 1,
    order: order || 0,
    status: 'pending'
  });
  
  updatePhaseProgress(phaseId);
  
  res.json(task);
});

router.put('/:id', authenticateToken, (req, res) => {
  const task = store.getById('tasks', req.params.id);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (req.user.role === 'project_manager' || 
      (req.user.role === 'foreman' && task.assigneeId === req.user.id)) {
    const updated = store.update('tasks', req.params.id, req.body);
    updatePhaseProgress(task.phaseId);
    checkAndCreateDelayNotification(req.params.id, updated);
    res.json(updated);
  } else {
    return res.status(403).json({ error: '无权限修改此任务' });
  }
});

router.delete('/:id', authenticateToken, requireRole('project_manager'), (req, res) => {
  const task = store.getById('tasks', req.params.id);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  const records = store.find('progressRecords', r => r.taskId === req.params.id);
  records.forEach(r => store.remove('progressRecords', r.id));
  
  const photos = store.find('photos', p => p.taskId === req.params.id);
  photos.forEach(p => store.remove('photos', p.id));
  
  store.remove('tasks', req.params.id);
  updatePhaseProgress(task.phaseId);
  
  res.json({ message: '任务已删除' });
});

router.post('/:id/assign', authenticateToken, requireRole('project_manager'), (req, res) => {
  const task = store.getById('tasks', req.params.id);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  const { assigneeId } = req.body;
  const assignee = store.getById('users', assigneeId);
  
  if (!assignee || assignee.role !== 'foreman') {
    return res.status(400).json({ error: '无效的班组长ID' });
  }
  
  const updated = store.update('tasks', req.params.id, { assigneeId });
  
  store.create('notifications', {
    userId: assigneeId,
    type: 'assignment',
    title: '新任务分配',
    message: `您已被分配到新任务"${task.name}"`,
    taskId: task.id,
    phaseId: task.phaseId,
    read: false
  });
  
  res.json(updated);
});

router.post('/check-delays', authenticateToken, requireRole('project_manager'), (req, res) => {
  const tasks = store.find('tasks', t => t.progress < 100 && t.plannedEndDate);
  let delayCount = 0;
  let lagCount = 0;

  tasks.forEach(task => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plannedEnd = new Date(task.plannedEndDate);
    plannedEnd.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((plannedEnd - today) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      const existing = store.findOne('notifications', n =>
        n.taskId === task.id && n.type === 'delay' && n.read === false
      );
      if (!existing) {
        const phase = store.getById('phases', task.phaseId);
        if (!phase) return;
        const project = store.getById('projects', phase.projectId);
        if (!project) return;
        const manager = store.getById('users', project.managerId);
        if (!manager) return;
        store.create('notifications', {
          userId: manager.id,
          type: 'delay',
          title: '工期延误预警',
          message: `任务"${task.name}"已超出计划完成日期${Math.abs(daysDiff)}天，请及时处理。`,
          projectId: project.id,
          phaseId: phase.id,
          taskId: task.id,
          read: false
        });
        delayCount++;
      }
    }

    if (task.plannedStartDate) {
      const plannedStart = new Date(task.plannedStartDate);
      plannedStart.setHours(0, 0, 0, 0);
      const totalDuration = (plannedEnd - plannedStart) / (1000 * 60 * 60 * 24);
      const elapsedDuration = (today - plannedStart) / (1000 * 60 * 60 * 24);

      if (elapsedDuration > 0 && totalDuration > 0) {
        const expectedProgress = Math.min(100, (elapsedDuration / totalDuration) * 100);
        const progressLag = expectedProgress - (task.progress || 0);

        if (progressLag > 10) {
          const existing = store.findOne('notifications', n =>
            n.taskId === task.id && n.type === 'progress_lag' && n.read === false
          );
          if (!existing) {
            const phase = store.getById('phases', task.phaseId);
            if (!phase) return;
            const project = store.getById('projects', phase.projectId);
            if (!project) return;
            const manager = store.getById('users', project.managerId);
            if (!manager) return;
            store.create('notifications', {
              userId: manager.id,
              type: 'progress_lag',
              title: '进度滞后预警',
              message: `任务"${task.name}"进度滞后，当前进度${task.progress}%，预期应达${Math.round(expectedProgress)}%，差距${Math.round(progressLag)}%，请关注。`,
              projectId: project.id,
              phaseId: phase.id,
              taskId: task.id,
              read: false
            });
            lagCount++;
          }
        }
      }
    }
  });

  res.json({ delayCount, lagCount, message: `检查完成：新增${delayCount}条工期延误预警，${lagCount}条进度滞后预警` });
});

router.get('/my/tasks', authenticateToken, requireRole('foreman'), (req, res) => {
  const tasks = store.find('tasks', t => t.assigneeId === req.user.id)
    .sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      return new Date(a.plannedEndDate) - new Date(b.plannedEndDate);
    });
  
  const tasksWithDetails = tasks.map(task => {
    const phase = store.getById('phases', task.phaseId);
    const project = phase ? store.getById('projects', phase.projectId) : null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const plannedEnd = new Date(task.plannedEndDate);
    plannedEnd.setHours(0, 0, 0, 0);
    const daysDiff = Math.ceil((plannedEnd - today) / (1000 * 60 * 60 * 24));
    
    return {
      ...task,
      phaseName: phase?.name,
      projectName: project?.name,
      daysRemaining: daysDiff,
      isDelayed: daysDiff < 0 && task.progress < 100
    };
  });
  
  res.json(tasksWithDetails);
});

module.exports = router;
