const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname);
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  projects: path.join(DATA_DIR, 'projects.json'),
  phases: path.join(DATA_DIR, 'phases.json'),
  tasks: path.join(DATA_DIR, 'tasks.json'),
  progressRecords: path.join(DATA_DIR, 'progressRecords.json'),
  photos: path.join(DATA_DIR, 'photos.json'),
  rectificationNotices: path.join(DATA_DIR, 'rectificationNotices.json'),
  notifications: path.join(DATA_DIR, 'notifications.json')
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content ? JSON.parse(content) : [];
  } catch (e) {
    return [];
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
  return uuidv4();
}

function initData() {
  ensureDir(DATA_DIR);
  ensureDir(UPLOAD_DIR);
  ensureDir(path.join(UPLOAD_DIR, 'progress'));
  ensureDir(path.join(UPLOAD_DIR, 'rectification'));

  if (readJsonFile(DATA_FILES.users).length === 0) {
    const defaultUsers = [
      {
        id: generateId(),
        username: 'admin',
        password: bcrypt.hashSync('123456', 10),
        name: '张经理',
        role: 'project_manager',
        phone: '13800138001',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'worker1',
        password: bcrypt.hashSync('123456', 10),
        name: '李工头',
        role: 'foreman',
        phone: '13800138002',
        team: '主体结构班组',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'worker2',
        password: bcrypt.hashSync('123456', 10),
        name: '王班长',
        role: 'foreman',
        phone: '13800138003',
        team: '装修班组',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'supervisor1',
        password: bcrypt.hashSync('123456', 10),
        name: '赵监理',
        role: 'supervisor',
        phone: '13800138004',
        company: '诚信监理有限公司',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'owner1',
        password: bcrypt.hashSync('123456', 10),
        name: '刘总',
        role: 'owner',
        phone: '13800138005',
        company: '鑫源置业有限公司',
        createdAt: new Date().toISOString()
      }
    ];
    writeJsonFile(DATA_FILES.users, defaultUsers);
  }

  Object.values(DATA_FILES).forEach(file => {
    if (!fs.existsSync(file)) {
      writeJsonFile(file, []);
    }
  });
}

function getAll(collection) {
  return readJsonFile(DATA_FILES[collection]);
}

function getById(collection, id) {
  const items = readJsonFile(DATA_FILES[collection]);
  return items.find(item => item.id === id);
}

function create(collection, data) {
  const items = readJsonFile(DATA_FILES[collection]);
  const newItem = {
    ...data,
    id: generateId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  items.push(newItem);
  writeJsonFile(DATA_FILES[collection], items);
  return newItem;
}

function update(collection, id, data) {
  const items = readJsonFile(DATA_FILES[collection]);
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return null;
  items[index] = {
    ...items[index],
    ...data,
    updatedAt: new Date().toISOString()
  };
  writeJsonFile(DATA_FILES[collection], items);
  return items[index];
}

function remove(collection, id) {
  const items = readJsonFile(DATA_FILES[collection]);
  const filtered = items.filter(item => item.id !== id);
  writeJsonFile(DATA_FILES[collection], filtered);
  return filtered.length !== items.length;
}

function find(collection, predicate) {
  const items = readJsonFile(DATA_FILES[collection]);
  return items.filter(predicate);
}

function findOne(collection, predicate) {
  const items = readJsonFile(DATA_FILES[collection]);
  return items.find(predicate);
}

module.exports = {
  initData,
  getAll,
  getById,
  create,
  update,
  remove,
  find,
  findOne,
  generateId,
  DATA_FILES,
  UPLOAD_DIR
};
