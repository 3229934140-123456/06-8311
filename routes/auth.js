const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const store = require('../data/store');
const { authenticateToken, generateToken } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const user = store.findOne('users', u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  const { password: _, ...userWithoutPassword } = user;

  res.json({
    token,
    user: userWithoutPassword
  });
});

router.get('/profile', authenticateToken, (req, res) => {
  const user = store.getById('users', req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

router.post('/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = store.getById('users', req.user.id);

  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  store.update('users', req.user.id, { password: hashedPassword });
  res.json({ message: '密码修改成功' });
});

router.get('/users', authenticateToken, (req, res) => {
  const users = store.getAll('users').map(u => {
    const { password: _, ...userWithoutPassword } = u;
    return userWithoutPassword;
  });
  res.json(users);
});

module.exports = router;
