const express = require('express');
const router = express.Router();
const store = require('../data/store');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  const { read, type } = req.query;
  
  let notifications = store.find('notifications', n => n.userId === req.user.id);
  
  if (read !== undefined) {
    notifications = notifications.filter(n => n.read === (read === 'true'));
  }
  
  if (type) {
    notifications = notifications.filter(n => n.type === type);
  }
  
  const notificationsWithDetails = notifications
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(notification => ({
      ...notification,
      project: notification.projectId ? store.getById('projects', notification.projectId) : null,
      phase: notification.phaseId ? store.getById('phases', notification.phaseId) : null,
      task: notification.taskId ? store.getById('tasks', notification.taskId) : null
    }));
  
  res.json(notificationsWithDetails);
});

router.get('/unread-count', authenticateToken, (req, res) => {
  const unreadCount = store.find('notifications', n => n.userId === req.user.id && n.read === false).length;
  res.json({ unreadCount });
});

router.post('/:id/read', authenticateToken, (req, res) => {
  const notification = store.getById('notifications', req.params.id);
  if (!notification) {
    return res.status(404).json({ error: '通知不存在' });
  }
  
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ error: '无权限操作此通知' });
  }
  
  const updated = store.update('notifications', req.params.id, { read: true });
  res.json(updated);
});

router.post('/read-all', authenticateToken, (req, res) => {
  const notifications = store.find('notifications', n => n.userId === req.user.id && n.read === false);
  notifications.forEach(n => {
    store.update('notifications', n.id, { read: true });
  });
  res.json({ message: `已标记${notifications.length}条通知为已读` });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const notification = store.getById('notifications', req.params.id);
  if (!notification) {
    return res.status(404).json({ error: '通知不存在' });
  }
  
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此通知' });
  }
  
  store.remove('notifications', req.params.id);
  res.json({ message: '通知已删除' });
});

module.exports = router;
