const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const store = require('../data/store');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../data/store');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(UPLOAD_DIR, 'progress');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

function updateTaskProgress(taskId, newProgress) {
  const task = store.getById('tasks', taskId);
  if (!task) return;
  
  const updateData = { progress: Math.min(100, Math.max(0, newProgress)) };
  
  if (newProgress > 0 && !task.actualStartDate) {
    updateData.actualStartDate = new Date().toISOString().split('T')[0];
    updateData.status = 'in_progress';
  }
  
  if (newProgress >= 100 && !task.actualEndDate) {
    updateData.actualEndDate = new Date().toISOString().split('T')[0];
    updateData.status = 'completed';
  } else if (newProgress < 100 && newProgress > 0) {
    updateData.status = 'in_progress';
  }
  
  store.update('tasks', taskId, updateData);
  
  const tasks = store.find('tasks', t => t.phaseId === task.phaseId);
  const totalWeight = tasks.reduce((sum, t) => sum + (t.weight || 1), 0);
  const weightedProgress = tasks.reduce((sum, t) => sum + (t.progress || 0) * (t.weight || 1), 0);
  const phaseProgress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight * 100) / 100 : 0;
  
  const phaseUpdate = { progress: phaseProgress };
  const startedTasks = tasks.filter(t => t.actualStartDate);
  if (startedTasks.length > 0 && !store.getById('phases', task.phaseId).actualStartDate) {
    phaseUpdate.actualStartDate = startedTasks.reduce((earliest, t) => 
      new Date(t.actualStartDate) < new Date(earliest) ? t.actualStartDate : earliest, 
      startedTasks[0].actualStartDate
    );
    phaseUpdate.status = 'in_progress';
  }
  
  if (phaseProgress >= 100) {
    const completedTasks = tasks.filter(t => t.actualEndDate);
    if (completedTasks.length === tasks.length) {
      phaseUpdate.actualEndDate = completedTasks.reduce((latest, t) => 
        new Date(t.actualEndDate) > new Date(latest) ? t.actualEndDate : latest, 
        completedTasks[0].actualEndDate
      );
      phaseUpdate.status = 'completed';
    }
  }
  
  store.update('phases', task.phaseId, phaseUpdate);
  
  if (newProgress >= 100) {
    const phase = store.getById('phases', task.phaseId);
    const project = store.getById('projects', phase.projectId);
    const manager = store.getById('users', project.managerId);
    
    if (manager) {
      const existingNotification = store.findOne('notifications', n => 
        n.taskId === taskId && n.type === 'completion' && n.read === false
      );
      
      if (!existingNotification) {
        store.create('notifications', {
          userId: manager.id,
          type: 'completion',
          title: '任务完成',
          message: `任务"${task.name}"已100%完成。`,
          projectId: project.id,
          phaseId: phase.id,
          taskId: taskId,
          read: false
        });
      }
    }
  }
}

function checkDelayNotification(task) {
  if (!task.plannedEndDate || task.progress >= 100) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const plannedEnd = new Date(task.plannedEndDate);
  plannedEnd.setHours(0, 0, 0, 0);
  
  const daysDiff = Math.ceil((plannedEnd - today) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    const existingNotification = store.findOne('notifications', n => 
      n.taskId === task.id && n.type === 'delay' && n.read === false
    );
    
    if (!existingNotification) {
      const phase = store.getById('phases', task.phaseId);
      const project = store.getById('projects', phase.projectId);
      const manager = store.getById('users', project.managerId);
      
      if (manager) {
        store.create('notifications', {
          userId: manager.id,
          type: 'delay',
          title: '工期延误预警',
          message: `任务"${task.name}"已超出计划完成日期${Math.abs(daysDiff)}天，当前进度${task.progress}%。`,
          projectId: project.id,
          phaseId: phase.id,
          taskId: task.id,
          read: false
        });
      }
    }
  }
}

router.post('/:taskId', authenticateToken, requireRole('foreman'), upload.array('photos', 9), (req, res) => {
  const task = store.getById('tasks', req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (task.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '您不是此任务的负责人' });
  }
  
  const { progress, workContent, weather, workers, notes } = req.body;
  const progressNum = parseFloat(progress);
  
  if (isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
    return res.status(400).json({ error: '进度必须是0-100之间的数字' });
  }
  
  if (progressNum < task.progress) {
    return res.status(400).json({ error: '进度不能回退' });
  }
  
  const recordDate = new Date().toISOString().split('T')[0];
  
  const existingRecord = store.findOne('progressRecords', r => 
    r.taskId === req.params.taskId && r.recordDate === recordDate
  );
  
  let record;
  if (existingRecord) {
    record = store.update('progressRecords', existingRecord.id, {
      progress: progressNum,
      workContent: workContent || existingRecord.workContent,
      weather: weather || existingRecord.weather,
      workers: workers || existingRecord.workers,
      notes: notes || existingRecord.notes,
      reportedBy: req.user.id
    });
  } else {
    record = store.create('progressRecords', {
      taskId: req.params.taskId,
      phaseId: task.phaseId,
      recordDate,
      progress: progressNum,
      workContent: workContent || '',
      weather: weather || '',
      workers: workers || 0,
      notes: notes || '',
      reportedBy: req.user.id
    });
  }
  
  if (req.files && req.files.length > 0) {
    req.files.forEach(file => {
      store.create('photos', {
        taskId: req.params.taskId,
        recordId: record.id,
        url: `/uploads/progress/${file.filename}`,
        filename: file.originalname,
        uploadDate: new Date().toISOString(),
        uploadedBy: req.user.id,
        description: ''
      });
    });
  }
  
  updateTaskProgress(req.params.taskId, progressNum);
  checkDelayNotification({ ...task, progress: progressNum });
  
  const updatedTask = store.getById('tasks', req.params.taskId);
  
  res.json({
    message: '进度更新成功',
    record,
    task: updatedTask
  });
});

router.get('/:taskId/records', authenticateToken, (req, res) => {
  const task = store.getById('tasks', req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (req.user.role === 'foreman' && task.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '无权限查看此任务的进度记录' });
  }
  
  const records = store.find('progressRecords', r => r.taskId === req.params.taskId)
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate))
    .map(record => ({
      ...record,
      reportedByName: record.reportedBy ? store.getById('users', record.reportedBy)?.name : '',
      photos: store.find('photos', p => p.recordId === record.id)
    }));
  
  res.json(records);
});

router.get('/:taskId/photos', authenticateToken, (req, res) => {
  const task = store.getById('tasks', req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (req.user.role === 'foreman' && task.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '无权限查看此任务的照片' });
  }
  
  const photos = store.find('photos', p => p.taskId === req.params.taskId)
    .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
    .map(photo => ({
      ...photo,
      uploadedByName: photo.uploadedBy ? store.getById('users', photo.uploadedBy)?.name : ''
    }));
  
  res.json(photos);
});

router.get('/project/:projectId/records', authenticateToken, (req, res) => {
  const project = store.getById('projects', req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const phases = store.find('phases', p => p.projectId === req.params.projectId);
  const phaseIds = phases.map(p => p.id);
  
  const { date, startDate, endDate } = req.query;
  
  let records = store.find('progressRecords', r => phaseIds.includes(r.phaseId));
  
  if (date) {
    records = records.filter(r => r.recordDate === date);
  }
  if (startDate) {
    records = records.filter(r => r.recordDate >= startDate);
  }
  if (endDate) {
    records = records.filter(r => r.recordDate <= endDate);
  }
  
  const recordsWithDetails = records
    .sort((a, b) => new Date(b.recordDate) - new Date(a.recordDate))
    .map(record => {
      const task = store.getById('tasks', record.taskId);
      const phase = store.getById('phases', record.phaseId);
      const photos = store.find('photos', p => p.recordId === record.id);
      
      return {
        ...record,
        taskName: task?.name,
        phaseName: phase?.name,
        reportedByName: record.reportedBy ? store.getById('users', record.reportedBy)?.name : '',
        photos
      };
    });
  
  res.json(recordsWithDetails);
});

router.get('/project/:projectId/daily-log', authenticateToken, (req, res) => {
  const project = store.getById('projects', req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  const phases = store.find('phases', p => p.projectId === req.params.projectId);
  const phaseIds = phases.map(p => p.id);
  
  const allRecords = store.find('progressRecords', r => phaseIds.includes(r.phaseId));
  
  const recordsByDate = {};
  allRecords.forEach(record => {
    if (!recordsByDate[record.recordDate]) {
      recordsByDate[record.recordDate] = [];
    }
    
    const task = store.getById('tasks', record.taskId);
    const phase = store.getById('phases', record.phaseId);
    const photos = store.find('photos', p => p.recordId === record.id);
    const reportedBy = record.reportedBy ? store.getById('users', record.reportedBy) : null;
    
    recordsByDate[record.recordDate].push({
      ...record,
      taskName: task?.name,
      phaseName: phase?.name,
      reportedByName: reportedBy?.name,
      reportedByTeam: reportedBy?.team,
      photos
    });
  });
  
  const dailyLog = Object.keys(recordsByDate)
    .sort((a, b) => new Date(b) - new Date(a))
    .map(date => {
      const records = recordsByDate[date];
      const totalWorkers = records.reduce((sum, r) => sum + (parseInt(r.workers) || 0), 0);
      const uniqueTasks = [...new Set(records.map(r => r.taskName))];
      
      return {
        date,
        records,
        totalWorkers,
        taskCount: uniqueTasks.length,
        weather: records[0]?.weather || ''
      };
    });
  
  res.json(dailyLog);
});

router.post('/photos/:photoId/delete', authenticateToken, requireRole('foreman'), (req, res) => {
  const photo = store.getById('photos', req.params.photoId);
  if (!photo) {
    return res.status(404).json({ error: '照片不存在' });
  }
  
  if (photo.uploadedBy !== req.user.id) {
    return res.status(403).json({ error: '只能删除自己上传的照片' });
  }
  
  const filePath = path.join(UPLOAD_DIR, 'progress', path.basename(photo.url));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  store.remove('photos', req.params.photoId);
  res.json({ message: '照片已删除' });
});

module.exports = router;
