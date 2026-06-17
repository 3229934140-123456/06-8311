const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const progressRoutes = require('./routes/progress');
const inspectionRoutes = require('./routes/inspection');
const notificationRoutes = require('./routes/notifications');
const exportRoutes = require('./routes/export');
const { initData } = require('./data/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

initData();

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/inspection', inspectionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/export', exportRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`建筑施工项目进度管理平台已启动: http://localhost:${PORT}`);
  console.log('默认账号:');
  console.log('  项目经理: admin / 123456');
  console.log('  班组长: worker1 / 123456');
  console.log('  监理: supervisor1 / 123456');
  console.log('  业主: owner1 / 123456');
});
