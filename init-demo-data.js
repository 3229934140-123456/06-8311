const store = require('./data/store');
const { v4: uuidv4 } = require('uuid');

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function initDemoData() {
  console.log('开始创建示例数据...\n');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const users = store.getAll('users');
  const admin = users.find(u => u.username === 'admin');
  const worker1 = users.find(u => u.username === 'worker1');
  const worker2 = users.find(u => u.username === 'worker2');
  const supervisor1 = users.find(u => u.username === 'supervisor1');
  const owner1 = users.find(u => u.username === 'owner1');
  
  const projects = store.getAll('projects');
  if (projects.length > 0) {
    console.log('⚠️  已存在项目数据，跳过初始化');
    console.log('\n请访问 http://localhost:3000 查看效果');
    return;
  }
  
  const project1 = {
    id: uuidv4(),
    name: '市民文化中心项目',
    description: '总建筑面积25000平方米，包含图书馆、展览馆、多功能厅等',
    location: '市中心区文化广场',
    plannedStartDate: formatDate(today),
    plannedEndDate: formatDate(addDays(today, 365)),
    actualStartDate: null,
    actualEndDate: null,
    budget: 85000000,
    progress: 0,
    status: 'pending',
    managerId: admin.id,
    ownerId: owner1.id,
    supervisorId: supervisor1.id,
    createdAt: new Date().toISOString()
  };
  const createdProject1 = store.create('projects', project1);
  console.log('✅ 创建项目: 市民文化中心项目');
  
  const phases = [
    { name: '基础工程', weight: 15, days: 60 },
    { name: '主体结构', weight: 35, days: 120 },
    { name: '机电安装', weight: 20, days: 90 },
    { name: '装饰装修', weight: 20, days: 60 },
    { name: '室外配套', weight: 10, days: 45 }
  ];
  
  const createdPhases = [];
  let phaseStartDate = new Date(today);
  
  for (const phase of phases) {
    const phaseEndDate = addDays(phaseStartDate, phase.days);
    const createdPhase = {
      id: uuidv4(),
      projectId: project1.id,
      name: phase.name,
      weight: phase.weight,
      plannedStartDate: formatDate(phaseStartDate),
      plannedEndDate: formatDate(phaseEndDate),
      actualStartDate: null,
      actualEndDate: null,
      progress: 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    store.create('phases', createdPhase);
    createdPhases.push(createdPhase);
    console.log(`  ✅ 创建阶段: ${phase.name}`);
    
    phaseStartDate = addDays(phaseEndDate, 1);
  }
  
  const tasks = [
    { phaseIndex: 0, name: '场地平整', weight: 20, days: 10, assignee: worker1 },
    { phaseIndex: 0, name: '桩基施工', weight: 40, days: 25, assignee: worker1 },
    { phaseIndex: 0, name: '土方开挖', weight: 20, days: 15, assignee: worker2 },
    { phaseIndex: 0, name: '垫层施工', weight: 20, days: 10, assignee: worker2 },
    
    { phaseIndex: 1, name: '地下一层结构', weight: 25, days: 25, assignee: worker1 },
    { phaseIndex: 1, name: '地上1-3层结构', weight: 35, days: 40, assignee: worker1 },
    { phaseIndex: 1, name: '地上4-6层结构', weight: 25, days: 35, assignee: worker2 },
    { phaseIndex: 1, name: '屋面结构', weight: 15, days: 20, assignee: worker2 },
    
    { phaseIndex: 2, name: '给排水管道', weight: 30, days: 30, assignee: worker1 },
    { phaseIndex: 2, name: '强电系统', weight: 30, days: 30, assignee: worker2 },
    { phaseIndex: 2, name: '弱电系统', weight: 20, days: 20, assignee: worker1 },
    { phaseIndex: 2, name: '暖通空调', weight: 20, days: 25, assignee: worker2 },
    
    { phaseIndex: 3, name: '外墙装饰', weight: 30, days: 30, assignee: worker1 },
    { phaseIndex: 3, name: '内墙抹灰', weight: 25, days: 20, assignee: worker2 },
    { phaseIndex: 3, name: '地面铺装', weight: 25, days: 15, assignee: worker1 },
    { phaseIndex: 3, name: '门窗安装', weight: 20, days: 15, assignee: worker2 },
    
    { phaseIndex: 4, name: '道路绿化', weight: 40, days: 20, assignee: worker1 },
    { phaseIndex: 4, name: '室外管网', weight: 30, days: 15, assignee: worker2 },
    { phaseIndex: 4, name: '景观照明', weight: 30, days: 10, assignee: worker1 }
  ];
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const phase = createdPhases[task.phaseIndex];
    
    const taskStartDate = new Date(phase.plannedStartDate);
    const taskEndDate = addDays(taskStartDate, task.days);
    
    const createdTask = {
      id: uuidv4(),
      phaseId: phase.id,
      projectId: project1.id,
      name: task.name,
      weight: task.weight,
      order: i,
      assigneeId: task.assignee.id,
      plannedStartDate: formatDate(taskStartDate),
      plannedEndDate: formatDate(taskEndDate),
      actualStartDate: null,
      actualEndDate: null,
      progress: 0,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    store.create('tasks', createdTask);
    console.log(`    ✅ 创建任务: ${task.name} (分配给: ${task.assignee.name})`);
  }
  
  const project2 = {
    id: uuidv4(),
    name: '城东住宅小区3号楼',
    description: '高层住宅，地上28层，地下2层，总建筑面积32000平方米',
    location: '城东区新兴路',
    plannedStartDate: formatDate(addDays(today, -30)),
    plannedEndDate: formatDate(addDays(today, 600)),
    actualStartDate: formatDate(addDays(today, -30)),
    actualEndDate: null,
    budget: 120000000,
    progress: 18,
    status: 'in_progress',
    managerId: admin.id,
    ownerId: owner1.id,
    supervisorId: supervisor1.id,
    createdAt: new Date().toISOString()
  };
  store.create('projects', project2);
  console.log('\n✅ 创建项目: 城东住宅小区3号楼');
  
  const phases2 = [
    { name: '基础工程', weight: 12, days: 75, actualStart: -30, progress: 80 },
    { name: '主体结构', weight: 40, days: 240, actualStart: -10, progress: 15 },
    { name: '机电安装', weight: 18, days: 150, progress: 0 },
    { name: '装饰装修', weight: 20, days: 120, progress: 0 },
    { name: '室外配套', weight: 10, days: 60, progress: 0 }
  ];
  
  const createdPhases2 = [];
  let phaseStartDate2 = addDays(today, -30);
  
  for (let i = 0; i < phases2.length; i++) {
    const phase = phases2[i];
    const phaseEndDate = addDays(phaseStartDate2, phase.days);
    
    const createdPhase = {
      id: uuidv4(),
      projectId: project2.id,
      name: phase.name,
      weight: phase.weight,
      plannedStartDate: formatDate(phaseStartDate2),
      plannedEndDate: formatDate(phaseEndDate),
      actualStartDate: phase.actualStart !== undefined ? formatDate(addDays(today, phase.actualStart)) : null,
      actualEndDate: null,
      progress: phase.progress,
      status: phase.progress >= 100 ? 'completed' : (phase.progress > 0 ? 'in_progress' : 'pending'),
      createdAt: new Date().toISOString()
    };
    store.create('phases', createdPhase);
    createdPhases2.push(createdPhase);
    console.log(`  ✅ 创建阶段: ${phase.name} (进度: ${phase.progress}%)`);
    
    phaseStartDate2 = addDays(phaseEndDate, 1);
  }
  
  const tasks2 = [
    { phaseIndex: 0, name: '支护桩施工', weight: 25, days: 15, assignee: worker1, progress: 100 },
    { phaseIndex: 0, name: '土方开挖', weight: 30, days: 20, assignee: worker2, progress: 100 },
    { phaseIndex: 0, name: '地下室底板', weight: 25, days: 20, assignee: worker1, progress: 80 },
    { phaseIndex: 0, name: '地下室结构', weight: 20, days: 20, assignee: worker2, progress: 30 },
    
    { phaseIndex: 1, name: '1-5层结构', weight: 20, days: 50, assignee: worker1, progress: 40 },
    { phaseIndex: 1, name: '6-15层结构', weight: 35, days: 60, assignee: worker2, progress: 10 },
    { phaseIndex: 1, name: '16-25层结构', weight: 30, days: 60, assignee: worker1, progress: 0 },
    { phaseIndex: 1, name: '26-28层及屋面', weight: 15, days: 70, assignee: worker2, progress: 0 }
  ];
  
  for (let i = 0; i < tasks2.length; i++) {
    const task = tasks2[i];
    const phase = createdPhases2[task.phaseIndex];
    
    const taskStartDate = new Date(phase.plannedStartDate);
    const taskEndDate = addDays(taskStartDate, task.days);
    
    const createdTask = {
      id: uuidv4(),
      phaseId: phase.id,
      projectId: project2.id,
      name: task.name,
      weight: task.weight,
      order: i,
      assigneeId: task.assignee.id,
      plannedStartDate: formatDate(taskStartDate),
      plannedEndDate: formatDate(taskEndDate),
      actualStartDate: task.progress > 0 ? formatDate(addDays(today, -25)) : null,
      actualEndDate: task.progress >= 100 ? formatDate(addDays(today, -5)) : null,
      progress: task.progress,
      status: task.progress >= 100 ? 'completed' : (task.progress > 0 ? 'in_progress' : 'pending'),
      createdAt: new Date().toISOString()
    };
    store.create('tasks', createdTask);
    console.log(`    ✅ 创建任务: ${task.name} (进度: ${task.progress}%)`);
  }
  
  console.log('\n🎉 示例数据创建完成！');
  console.log(`\n项目1: 市民文化中心项目 (新建项目，未开始)`);
  console.log(`项目2: 城东住宅小区3号楼 (已开工30天，进行中)`);
  console.log(`\n请访问 http://localhost:3000 查看效果`);
  console.log(`默认账号: admin / 123456`);
}

initDemoData();
