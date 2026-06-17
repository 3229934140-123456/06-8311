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
    const uploadPath = path.join(UPLOAD_DIR, 'rectification');
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

router.get('/', authenticateToken, (req, res) => {
  let notices = store.getAll('rectificationNotices');
  
  if (req.user.role === 'owner') {
    notices = notices.filter(n => n.projectId && store.getById('projects', n.projectId)?.ownerId === req.user.id);
  } else if (req.user.role === 'foreman') {
    notices = notices.filter(n => n.assigneeId === req.user.id);
  }
  
  const noticesWithDetails = notices
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(notice => ({
      ...notice,
      project: notice.projectId ? store.getById('projects', notice.projectId) : null,
      phase: notice.phaseId ? store.getById('phases', notice.phaseId) : null,
      task: notice.taskId ? store.getById('tasks', notice.taskId) : null,
      createdByName: notice.createdBy ? store.getById('users', notice.createdBy)?.name : '',
      assignee: notice.assigneeId ? store.getById('users', notice.assigneeId) : null,
      replyByName: notice.replyBy ? store.getById('users', notice.replyBy)?.name : '',
      photos: store.find('photos', p => p.recordId === notice.id && p.description?.includes('整改'))
    }));
  
  res.json(noticesWithDetails);
});

router.get('/:id', authenticateToken, (req, res) => {
  const notice = store.getById('rectificationNotices', req.params.id);
  if (!notice) {
    return res.status(404).json({ error: '整改通知单不存在' });
  }
  
  if (req.user.role === 'foreman' && notice.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '无权限查看此整改通知单' });
  }
  
  if (req.user.role === 'owner') {
    const project = store.getById('projects', notice.projectId);
    if (project?.ownerId !== req.user.id) {
      return res.status(403).json({ error: '无权限查看此整改通知单' });
    }
  }
  
  const photos = store.find('photos', p => p.recordId === notice.id);
  
  res.json({
    ...notice,
    project: notice.projectId ? store.getById('projects', notice.projectId) : null,
    phase: notice.phaseId ? store.getById('phases', notice.phaseId) : null,
    task: notice.taskId ? store.getById('tasks', notice.taskId) : null,
    createdByName: notice.createdBy ? store.getById('users', notice.createdBy)?.name : '',
    assignee: notice.assigneeId ? store.getById('users', notice.assigneeId) : null,
    replyByName: notice.replyBy ? store.getById('users', notice.replyBy)?.name : '',
    photos
  });
});

router.post('/', authenticateToken, requireRole('supervisor'), upload.array('photos', 9), (req, res) => {
  const { projectId, phaseId, taskId, title, description, deadline, priority, assigneeId } = req.body;
  
  if (!projectId || !title || !description) {
    return res.status(400).json({ error: '项目ID、标题和问题描述不能为空' });
  }
  
  const project = store.getById('projects', projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  let resolvedAssigneeId = assigneeId || null;
  if (!resolvedAssigneeId && taskId) {
    const task = store.getById('tasks', taskId);
    if (task && task.assigneeId) {
      resolvedAssigneeId = task.assigneeId;
    }
  }
  
  const notice = store.create('rectificationNotices', {
    projectId,
    phaseId: phaseId || null,
    taskId: taskId || null,
    title,
    description,
    deadline: deadline || null,
    priority: priority || 'normal',
    status: 'pending',
    assigneeId: resolvedAssigneeId,
    createdBy: req.user.id,
    replyContent: null,
    replyDate: null,
    replyBy: null,
    reviewDate: null,
    reviewResult: null,
    reviewedBy: null
  });
  
  if (req.files && req.files.length > 0) {
    req.files.forEach(file => {
      store.create('photos', {
        taskId: taskId || null,
        recordId: notice.id,
        url: `/uploads/rectification/${file.filename}`,
        filename: file.originalname,
        uploadDate: new Date().toISOString(),
        uploadedBy: req.user.id,
        description: '整改问题照片'
      });
    });
  }
  
  if (resolvedAssigneeId) {
    store.create('notifications', {
      userId: resolvedAssigneeId,
      type: 'rectification',
      title: '整改通知',
      message: `您收到新的整改通知单: "${title}"`,
      projectId,
      phaseId,
      taskId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  if (project.managerId) {
    store.create('notifications', {
      userId: project.managerId,
      type: 'rectification',
      title: '监理发出整改通知',
      message: `项目"${project.name}"收到监理整改通知单: "${title}"`,
      projectId,
      phaseId,
      taskId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  res.json(notice);
});

router.post('/:id/reply', authenticateToken, requireRole('foreman'), upload.array('photos', 9), (req, res) => {
  const notice = store.getById('rectificationNotices', req.params.id);
  if (!notice) {
    return res.status(404).json({ error: '整改通知单不存在' });
  }
  
  if (notice.assigneeId && notice.assigneeId !== req.user.id) {
    return res.status(403).json({ error: '您不是此整改通知单的负责人' });
  }
  
  if (notice.status === 'completed' || notice.status === 'approved') {
    return res.status(400).json({ error: '此整改通知单已处理完成' });
  }
  
  const { replyContent } = req.body;
  
  if (!replyContent) {
    return res.status(400).json({ error: '整改回复内容不能为空' });
  }
  
  const updated = store.update('rectificationNotices', req.params.id, {
    replyContent,
    replyDate: new Date().toISOString(),
    replyBy: req.user.id,
    status: 'replied'
  });
  
  if (req.files && req.files.length > 0) {
    req.files.forEach(file => {
      store.create('photos', {
        taskId: notice.taskId || null,
        recordId: notice.id,
        url: `/uploads/rectification/${file.filename}`,
        filename: file.originalname,
        uploadDate: new Date().toISOString(),
        uploadedBy: req.user.id,
        description: '整改回复照片'
      });
    });
  }
  
  const project = store.getById('projects', notice.projectId);
  if (project?.managerId) {
    store.create('notifications', {
      userId: project.managerId,
      type: 'rectification_reply',
      title: '整改回复已提交',
      message: `整改通知单"${notice.title}"已提交回复，请审核。`,
      projectId: notice.projectId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  if (notice.createdBy) {
    store.create('notifications', {
      userId: notice.createdBy,
      type: 'rectification_reply',
      title: '整改回复已提交',
      message: `您发出的整改通知单"${notice.title}"已收到回复。`,
      projectId: notice.projectId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  res.json(updated);
});

router.post('/:id/review', authenticateToken, requireRole('supervisor'), (req, res) => {
  const notice = store.getById('rectificationNotices', req.params.id);
  if (!notice) {
    return res.status(404).json({ error: '整改通知单不存在' });
  }
  
  if (notice.createdBy !== req.user.id) {
    return res.status(403).json({ error: '只有创建此通知单的监理可以审核' });
  }
  
  if (notice.status !== 'replied') {
    return res.status(400).json({ error: '此整改通知单尚未提交回复' });
  }
  
  const { reviewResult, reviewComment } = req.body;
  
  if (!reviewResult) {
    return res.status(400).json({ error: '审核结果不能为空' });
  }
  
  const updated = store.update('rectificationNotices', req.params.id, {
    reviewResult,
    reviewComment: reviewComment || '',
    reviewDate: new Date().toISOString(),
    reviewedBy: req.user.id,
    status: reviewResult === 'pass' ? 'approved' : 'rejected'
  });
  
  if (notice.assigneeId) {
    const resultText = reviewResult === 'pass' ? '通过' : '未通过';
    store.create('notifications', {
      userId: notice.assigneeId,
      type: 'rectification_review',
      title: `整改审核${resultText}`,
      message: `您回复的整改通知单"${notice.title}"审核${resultText}。${reviewResult !== 'pass' ? '请重新整改。' : ''}`,
      projectId: notice.projectId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  const project = store.getById('projects', notice.projectId);
  if (project?.managerId) {
    const resultText = reviewResult === 'pass' ? '通过' : '未通过';
    store.create('notifications', {
      userId: project.managerId,
      type: 'rectification_review',
      title: `整改审核${resultText}`,
      message: `整改通知单"${notice.title}"审核${resultText}。`,
      projectId: notice.projectId,
      rectificationNoticeId: notice.id,
      read: false
    });
  }
  
  res.json(updated);
});

router.put('/:id', authenticateToken, requireRole('supervisor'), (req, res) => {
  const notice = store.getById('rectificationNotices', req.params.id);
  if (!notice) {
    return res.status(404).json({ error: '整改通知单不存在' });
  }
  
  if (notice.createdBy !== req.user.id) {
    return res.status(403).json({ error: '只能修改自己创建的整改通知单' });
  }
  
  if (notice.status !== 'pending') {
    return res.status(400).json({ error: '只能修改待处理状态的整改通知单' });
  }
  
  const updated = store.update('rectificationNotices', req.params.id, req.body);
  res.json(updated);
});

router.delete('/:id', authenticateToken, requireRole('supervisor'), (req, res) => {
  const notice = store.getById('rectificationNotices', req.params.id);
  if (!notice) {
    return res.status(404).json({ error: '整改通知单不存在' });
  }
  
  if (notice.createdBy !== req.user.id) {
    return res.status(403).json({ error: '只能删除自己创建的整改通知单' });
  }
  
  const photos = store.find('photos', p => p.recordId === req.params.id);
  photos.forEach(photo => {
    const filePath = path.join(UPLOAD_DIR, 'rectification', path.basename(photo.url));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    store.remove('photos', photo.id);
  });
  
  store.remove('rectificationNotices', req.params.id);
  res.json({ message: '整改通知单已删除' });
});

module.exports = router;
