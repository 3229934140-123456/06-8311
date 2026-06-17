const API_BASE = '/api';
let currentUser = null;
let currentPage = 'projects';
let usersCache = [];

const roleNames = {
    'project_manager': '项目经理',
    'foreman': '班组长',
    'supervisor': '监理',
    'owner': '业主'
};

const roleNavItems = {
    'project_manager': [
        { id: 'projects', icon: '🏗️', label: '项目管理' },
        { id: 'notifications', icon: '🔔', label: '通知中心' },
        { id: 'daily-log', icon: '📋', label: '施工日志' }
    ],
    'foreman': [
        { id: 'my-tasks', icon: '📝', label: '我的任务' },
        { id: 'notifications', icon: '🔔', label: '通知中心' }
    ],
    'supervisor': [
        { id: 'projects', icon: '🏗️', label: '项目查看' },
        { id: 'rectification', icon: '⚠️', label: '整改通知' },
        { id: 'notifications', icon: '🔔', label: '通知中心' },
        { id: 'daily-log', icon: '📋', label: '施工日志' }
    ],
    'owner': [
        { id: 'projects', icon: '🏗️', label: '项目查看' },
        { id: 'notifications', icon: '🔔', label: '通知中心' },
        { id: 'daily-log', icon: '📋', label: '施工日志' }
    ]
};

function apiRequest(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return fetch(API_BASE + url, {
        ...options,
        headers
    }).then(response => {
        if (response.status === 401) {
            logout();
            throw new Error('未授权');
        }
        return response.json().then(data => {
            if (!response.ok) {
                throw new Error(data.error || '请求失败');
            }
            return data;
        });
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === 'error' ? '#f5222d' : type === 'success' ? '#52c41a' : '#1890ff'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal(content, title = '') {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="closeModal()">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') {
            closeModal();
        }
    });
}

function closeModal() {
    document.getElementById('modal-container').innerHTML = '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}

function getRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return formatDate(dateStr);
}

function getStatusClass(status) {
    const statusMap = {
        'active': 'status-active',
        'in_progress': 'status-active',
        'delayed': 'status-delayed',
        'completed': 'status-completed',
        'pending': 'status-pending'
    };
    return statusMap[status] || 'status-active';
}

function getStatusText(status) {
    const statusMap = {
        'active': '进行中',
        'in_progress': '进行中',
        'delayed': '已延误',
        'completed': '已完成',
        'pending': '待开始',
        'replied': '已回复',
        'approved': '已通过',
        'rejected': '未通过'
    };
    return statusMap[status] || status;
}

function initLoginPage() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        login(username, password);
    });
    
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.dataset.username;
            const password = btn.dataset.password;
            document.getElementById('username').value = username;
            document.getElementById('password').value = password;
            
            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function login(username, password) {
    apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    }).then(data => {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        initMainApp();
        showToast(`欢迎回来，${currentUser.name}！`, 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    showPage('login-page');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
}

function initMainApp() {
    showPage('main-app');
    renderSidebar();
    renderUserInfo();
    updateNotificationBadge();
    loadUsersCache();
    loadPage('projects');
    
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('notification-bell').addEventListener('click', () => {
        loadPage('notifications');
    });
    
    setInterval(updateNotificationBadge, 30000);
}

function renderSidebar() {
    const nav = document.getElementById('sidebar-nav');
    const navItems = roleNavItems[currentUser.role] || [];
    
    nav.innerHTML = navItems.map(item => `
        <div class="nav-item ${currentPage === item.id ? 'active' : ''}" data-page="${item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
        </div>
    `).join('');
    
    nav.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            loadPage(item.dataset.page);
        });
    });
}

function renderUserInfo() {
    document.getElementById('user-info').innerHTML = `
        <div class="user-name">${currentUser.name}</div>
        <div class="user-role">${roleNames[currentUser.role]}</div>
    `;
}

function updateNotificationBadge() {
    apiRequest('/notifications/unread-count').then(data => {
        const badge = document.getElementById('notification-badge');
        if (data.unreadCount > 0) {
            badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }).catch(() => {});
}

function loadPage(pageId) {
    currentPage = pageId;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });
    
    const titles = {
        'projects': '项目管理',
        'my-tasks': '我的任务',
        'notifications': '通知中心',
        'rectification': '整改通知',
        'daily-log': '施工日志'
    };
    document.getElementById('page-title').textContent = titles[pageId] || '项目管理';
    
    switch(pageId) {
        case 'projects':
            loadProjectsPage();
            break;
        case 'my-tasks':
            loadMyTasksPage();
            break;
        case 'notifications':
            loadNotificationsPage();
            break;
        case 'rectification':
            loadRectificationPage();
            break;
        case 'daily-log':
            loadDailyLogPage();
            break;
        default:
            loadProjectsPage();
    }
}

function loadProjectsPage() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;">加载中...</div></div>';
    
    apiRequest('/projects').then(projects => {
        const canCreate = currentUser.role === 'project_manager';
        
        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">项目总数</div>
                    <div class="stat-value">${projects.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">进行中</div>
                    <div class="stat-value" style="color: #1890ff;">${projects.filter(p => p.status === 'active').length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已延误</div>
                    <div class="stat-value" style="color: #f5222d;">${projects.filter(p => p.progress < 100 && p.isDelayed).length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已完成</div>
                    <div class="stat-value" style="color: #52c41a;">${projects.filter(p => p.progress >= 100).length}</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h2>项目列表</h2>
                    <div class="card-actions">
                        ${canCreate ? '<button class="btn btn-primary" onclick="showCreateProjectModal()">+ 新建项目</button>' : ''}
                    </div>
                </div>
                ${projects.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">🏗️</div>
                        <div class="empty-state-text">暂无项目</div>
                    </div>
                ` : `
                    <div class="project-list">
                        ${projects.map(project => {
                            const isDelayed = project.progress < 100 && project.isDelayed;
                            const isCompleted = project.progress >= 100;
                            const progressClass = isDelayed ? 'danger' : (isCompleted ? 'success' : '');
                            
                            return `
                                <div class="project-card ${isDelayed ? 'delayed' : ''} ${isCompleted ? 'completed' : ''}" onclick="openProjectDetail('${project.id}')">
                                    <div class="project-header">
                                        <div>
                                            <div class="project-name">${project.name}</div>
                                            <div class="project-location">📍 ${project.location || '未设置地点'}</div>
                                        </div>
                                        <span class="project-status ${getStatusClass(isDelayed ? 'delayed' : (isCompleted ? 'completed' : project.status))}">
                                            ${getStatusText(isDelayed ? 'delayed' : (isCompleted ? 'completed' : project.status))}
                                        </span>
                                    </div>
                                    <div class="progress-bar">
                                        <div class="progress-fill ${progressClass}" style="width: ${project.progress}%"></div>
                                    </div>
                                    <div class="progress-info">
                                        <span>进度: ${project.progress.toFixed(1)}%</span>
                                        <span>${formatDate(project.plannedStartDate)} ~ ${formatDate(project.plannedEndDate)}</span>
                                    </div>
                                    <div class="project-meta">
                                        <div>📅 计划工期: ${getDaysDiff(project.plannedStartDate, project.plannedEndDate)}天</div>
                                        ${project.managerId ? `<div>👔 项目经理: ${getUserName(project.managerId)}</div>` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;
    }).catch(err => {
        content.innerHTML = `<div class="card"><div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div></div>`;
    });
}

function getDaysDiff(start, end) {
    if (!start || !end) return 0;
    return Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
}

async function loadUsersCache() {
    try {
        usersCache = await apiRequest('/auth/users');
    } catch (e) {
        usersCache = [];
    }
}

function getUserName(userId) {
    if (!userId) return '-';
    return usersCache.find(u => u.id === userId)?.name || '-';
}

function openProjectDetail(projectId) {
    window.currentProjectId = projectId;
    apiRequest(`/projects/${projectId}`).then(project => {
        const canEdit = currentUser.role === 'project_manager';
        
        showModal(`
            <div class="tabs">
                <div class="tab active" data-tab="overview">概览</div>
                <div class="tab" data-tab="gantt">甘特图</div>
                <div class="tab" data-tab="phases">施工阶段</div>
                <div class="tab" data-tab="photos">照片存档</div>
            </div>
            
            <div id="tab-overview" class="tab-content active">
                <div style="margin-bottom:20px;">
                    <h3 style="margin-bottom:8px;">${project.name}</h3>
                    <p style="color:#8c8c8c;">${project.description || '暂无描述'}</p>
                    <p style="color:#8c8c8c;">📍 ${project.location || '未设置地点'}</p>
                </div>
                
                <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);">
                    <div class="stat-card" style="padding:16px;">
                        <div class="stat-label" style="font-size:12px;">总进度</div>
                        <div class="stat-value" style="font-size:24px;">${project.progress.toFixed(1)}%</div>
                    </div>
                    <div class="stat-card" style="padding:16px;">
                        <div class="stat-label" style="font-size:12px;">施工阶段</div>
                        <div class="stat-value" style="font-size:24px;">${project.phases.length}</div>
                    </div>
                    <div class="stat-card" style="padding:16px;">
                        <div class="stat-label" style="font-size:12px;">计划工期</div>
                        <div class="stat-value" style="font-size:24px;">${getDaysDiff(project.plannedStartDate, project.plannedEndDate)}天</div>
                    </div>
                    <div class="stat-card" style="padding:16px;">
                        <div class="stat-label" style="font-size:12px;">状态</div>
                        <div class="stat-value" style="font-size:24px;color:${project.isDelayed ? '#f5222d' : '#1890ff'};">
                            ${project.isDelayed ? '已延误' : '正常'}
                        </div>
                    </div>
                </div>
                
                <div style="margin-top:20px;">
                    <h4 style="margin-bottom:12px;">项目进度</h4>
                    <div class="progress-bar" style="height:12px;">
                        <div class="progress-fill ${project.isDelayed ? 'danger' : ''}" style="width:${project.progress}%"></div>
                    </div>
                </div>
                
                ${canEdit ? `
                    <div style="margin-top:20px;display:flex;gap:8px;">
                        <button class="btn btn-primary" onclick="showEditProjectModal('${project.id}')">编辑项目</button>
                        <button class="btn btn-success" onclick="exportProjectLog('${project.id}')">导出日志</button>
                        <button class="btn btn-danger" onclick="deleteProject('${project.id}')">删除项目</button>
                    </div>
                ` : `
                    ${currentUser.role !== 'owner' ? `<div style="margin-top:20px;"><button class="btn btn-success" onclick="exportProjectLog('${project.id}')">导出日志</button></div>` : ''}
                `}
            </div>
            
            <div id="tab-gantt" class="tab-content">
                <div id="gantt-chart-container"></div>
            </div>
            
            <div id="tab-phases" class="tab-content">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h4>施工阶段</h4>
                    ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="showCreatePhaseModal('${project.id}')">+ 添加工期</button>` : ''}
                </div>
                <div class="phase-list">
                    ${project.phases.map(phase => renderPhaseCard(phase, project, canEdit)).join('')}
                </div>
            </div>
            
            <div id="tab-photos" class="tab-content">
                <div id="project-photos-container">加载中...</div>
            </div>
        `, '项目详情');
        
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
                
                if (tab.dataset.tab === 'gantt') {
                    loadGanttChart(projectId);
                } else if (tab.dataset.tab === 'photos') {
                    loadProjectPhotos(projectId);
                }
            });
        });

        setTimeout(() => loadGanttChart(projectId), 100);
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function renderPhaseCard(phase, project, canEdit) {
    const isDelayed = phase.isDelayed && phase.progress < 100;
    const isCompleted = phase.progress >= 100;
    const progressClass = isDelayed ? 'danger' : (isCompleted ? 'success' : '');
    
    return `
        <div class="phase-card">
            <div class="phase-header">
                <div class="phase-name">
                    ${phase.name}
                    ${isDelayed ? '<span class="phase-delayed">⚠️ 已延误</span>' : ''}
                </div>
                <div style="display:flex;gap:8px;">
                    ${canEdit ? `
                        <button class="btn btn-default btn-sm" onclick="event.stopPropagation();showCreateTaskModal('${phase.id}')">+ 添加工序</button>
                        <button class="btn btn-default btn-sm" onclick="event.stopPropagation();showEditPhaseModal('${phase.id}')">编辑</button>
                        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deletePhase('${phase.id}')">删除</button>
                    ` : ''}
                </div>
            </div>
            
            <div class="progress-bar">
                <div class="progress-fill ${progressClass}" style="width:${phase.progress}%"></div>
            </div>
            <div class="progress-info">
                <span>进度: ${phase.progress.toFixed(1)}%</span>
                <span>${formatDate(phase.plannedStartDate)} ~ ${formatDate(phase.plannedEndDate)}</span>
            </div>
            
            ${phase.tasks.length > 0 ? `
                <div class="task-list" style="margin-top:16px;">
                    ${phase.tasks.map(task => renderTaskItem(task, canEdit)).join('')}
                </div>
            ` : '<p style="color:#8c8c8c;margin-top:12px;">暂无工序任务</p>'}
        </div>
    `;
}

function renderTaskItem(task, canEdit) {
    const progressClass = task.progress >= 100 ? 'success' : '';
    
    return `
        <div class="task-item">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-meta">
                    ${task.assignee ? `<span>👷 ${task.assignee.name}</span>` : '<span>未分配</span>'}
                    <span>📅 ${formatDate(task.plannedStartDate)} ~ ${formatDate(task.plannedEndDate)}</span>
                </div>
            </div>
            <div class="task-progress">
                <div class="progress-bar">
                    <div class="progress-fill ${progressClass}" style="width:${task.progress}%"></div>
                </div>
                <span class="task-progress-value">${task.progress.toFixed(0)}%</span>
            </div>
            <div style="display:flex;gap:4px;margin-left:12px;">
                ${canEdit ? `
                    <button class="btn btn-default btn-sm" onclick="event.stopPropagation();showEditTaskModal('${task.id}')">编辑</button>
                    ${task.assigneeId ? '' : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();showAssignTaskModal('${task.id}')">分配</button>`}
                ` : ''}
                <button class="btn btn-default btn-sm" onclick="event.stopPropagation();openTaskDetail('${task.id}')">详情</button>
            </div>
        </div>
    `;
}

function openTaskDetail(taskId) {
    apiRequest(`/tasks/${taskId}`).then(task => {
        const isForeman = currentUser.role === 'foreman' && task.assigneeId === currentUser.id;
        
        showModal(`
            <div class="tabs">
                <div class="tab active" data-tab="task-info">任务信息</div>
                <div class="tab" data-tab="task-progress">进度记录</div>
                <div class="tab" data-tab="task-photos">施工照片</div>
            </div>
            
            <div id="tab-task-info" class="tab-content active">
                <h3 style="margin-bottom:12px;">${task.name}</h3>
                <p style="color:#8c8c8c;margin-bottom:16px;">${task.description || '暂无描述'}</p>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>所属阶段</label>
                        <div>${task.phase?.name || '-'}</div>
                    </div>
                    <div class="form-group">
                        <label>负责人</label>
                        <div>${task.assignee?.name || '未分配'}</div>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>计划开始</label>
                        <div>${formatDate(task.plannedStartDate)}</div>
                    </div>
                    <div class="form-group">
                        <label>计划完成</label>
                        <div>${formatDate(task.plannedEndDate)}</div>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>实际开始</label>
                        <div>${formatDate(task.actualStartDate) || '-'}</div>
                    </div>
                    <div class="form-group">
                        <label>实际完成</label>
                        <div>${formatDate(task.actualEndDate) || '-'}</div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>当前进度</label>
                    <div class="progress-bar">
                        <div class="progress-fill ${task.progress >= 100 ? 'success' : ''}" style="width:${task.progress}%"></div>
                    </div>
                    <div style="text-align:right;font-weight:600;">${task.progress.toFixed(1)}%</div>
                </div>
                
                ${isForeman ? `
                    <div style="margin-top:20px;">
                        <button class="btn btn-primary btn-block" onclick="showUpdateProgressModal('${task.id}')">更新今日进度</button>
                    </div>
                ` : ''}
            </div>
            
            <div id="tab-task-progress" class="tab-content">
                ${task.progressRecords.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-text">暂无进度记录</div>
                    </div>
                ` : `
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        ${task.progressRecords.map(record => `
                            <div style="padding:16px;background:#f5f5f5;border-radius:8px;">
                                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                                    <span style="font-weight:600;">${formatDate(record.recordDate)}</span>
                                    <span style="color:#1890ff;font-weight:600;">${record.progress}%</span>
                                </div>
                                ${record.workContent ? `<p style="margin-bottom:8px;">${record.workContent}</p>` : ''}
                                <div style="font-size:12px;color:#8c8c8c;display:flex;gap:16px;">
                                    ${record.weather ? `<span>🌤️ ${record.weather}</span>` : ''}
                                    ${record.workers ? `<span>👷 ${record.workers}人</span>` : ''}
                                    <span>✍️ ${record.reportedByName || '-'}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            
            <div id="tab-task-photos" class="tab-content">
                ${task.photos.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">📷</div>
                        <div class="empty-state-text">暂无施工照片</div>
                    </div>
                ` : `
                    <div class="photo-gallery">
                        ${task.photos.map(photo => `
                            <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')">
                                <img src="${photo.url}" alt="${photo.filename}">
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `, '任务详情');
        
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            });
        });
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function viewPhoto(url) {
    showModal(`
        <div style="text-align:center;">
            <img src="${url}" style="max-width:100%;max-height:70vh;border-radius:8px;">
        </div>
    `, '照片查看');
}

function loadMyTasksPage() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;">加载中...</div></div>';
    
    apiRequest('/tasks/my/tasks').then(tasks => {
        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">任务总数</div>
                    <div class="stat-value">${tasks.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">进行中</div>
                    <div class="stat-value" style="color:#1890ff;">${tasks.filter(t => t.progress > 0 && t.progress < 100).length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已延误</div>
                    <div class="stat-value" style="color:#f5222d;">${tasks.filter(t => t.isDelayed).length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已完成</div>
                    <div class="stat-value" style="color:#52c41a;">${tasks.filter(t => t.progress >= 100).length}</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h2>我的任务</h2>
                </div>
                ${tasks.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-text">暂无分配的任务</div>
                    </div>
                ` : `
                    <div class="phase-list">
                        ${tasks.map(task => {
                            const isDelayed = task.isDelayed;
                            const isCompleted = task.progress >= 100;
                            const progressClass = isDelayed ? 'danger' : (isCompleted ? 'success' : '');
                            
                            return `
                                <div class="phase-card">
                                    <div class="phase-header">
                                        <div>
                                            <div class="phase-name">
                                                ${task.name}
                                                ${isDelayed ? '<span class="phase-delayed">⚠️ 已延误</span>' : ''}
                                            </div>
                                            <div style="font-size:13px;color:#8c8c8c;margin-top:4px;">
                                                ${task.projectName} / ${task.phaseName}
                                            </div>
                                        </div>
                                        <div style="text-align:right;">
                                            ${task.daysRemaining < 0 ? 
                                                `<div style="color:#f5222d;font-weight:600;">已超期 ${Math.abs(task.daysRemaining)} 天</div>` :
                                                `<div style="color:#8c8c8c;">剩余 ${task.daysRemaining} 天</div>`
                                            }
                                        </div>
                                    </div>
                                    
                                    <div class="progress-bar">
                                        <div class="progress-fill ${progressClass}" style="width:${task.progress}%"></div>
                                    </div>
                                    <div class="progress-info">
                                        <span>进度: ${task.progress.toFixed(1)}%</span>
                                        <span>${formatDate(task.plannedStartDate)} ~ ${formatDate(task.plannedEndDate)}</span>
                                    </div>
                                    
                                    <div style="margin-top:16px;display:flex;gap:8px;">
                                        <button class="btn btn-primary btn-sm" onclick="openTaskDetail('${task.id}')">查看详情</button>
                                        ${!isCompleted ? '<button class="btn btn-success btn-sm" onclick="showUpdateProgressModal(\'' + task.id + '\')">更新进度</button>' : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;
    }).catch(err => {
        content.innerHTML = `<div class="card"><div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div></div>`;
    });
}

function loadNotificationsPage() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;">加载中...</div></div>';
    
    const loadNotifications = () => {
        apiRequest('/notifications').then(notifications => {
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>通知中心</h2>
                    <div class="card-actions">
                        ${notifications.some(n => !n.read) ? '<button class="btn btn-default" onclick="markAllRead()">全部标为已读</button>' : ''}
                    </div>
                </div>
                ${notifications.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔔</div>
                        <div class="empty-state-text">暂无通知</div>
                    </div>
                ` : `
                    <div class="notification-list">
                        ${notifications.map(n => `
                            <div class="notification-item ${n.read ? '' : 'unread'} ${n.type}" onclick="markNotificationRead('${n.id}')">
                                <div class="notification-header">
                                    <span class="notification-title">${n.title}</span>
                                    <span class="notification-time">${getRelativeTime(n.createdAt)}</span>
                                </div>
                                <div class="notification-message">${n.message}</div>
                                ${n.project ? `<div style="margin-top:8px;font-size:12px;color:#8c8c8c;">📁 ${n.project.name}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }).catch(err => {
        content.innerHTML = `<div class="card"><div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div></div>`;
    });
    };

    if (currentUser.role === 'project_manager') {
        apiRequest('/tasks/check-delays', { method: 'POST' })
            .then(() => loadNotifications())
            .catch(() => loadNotifications());
    } else {
        loadNotifications();
    }
}

function markNotificationRead(id) {
    apiRequest(`/notifications/${id}/read`, { method: 'POST' }).then(() => {
        updateNotificationBadge();
        loadNotificationsPage();
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function markAllRead() {
    apiRequest('/notifications/read-all', { method: 'POST' }).then(() => {
        updateNotificationBadge();
        loadNotificationsPage();
        showToast('已全部标为已读', 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function loadRectificationPage() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;">加载中...</div></div>';
    
    Promise.all([
        apiRequest('/inspection'),
        apiRequest('/projects')
    ]).then(([notices, projects]) => {
        const canCreate = currentUser.role === 'supervisor';
        
        content.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">整改通知总数</div>
                    <div class="stat-value">${notices.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">待处理</div>
                    <div class="stat-value" style="color:#faad14;">${notices.filter(n => n.status === 'pending').length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已回复</div>
                    <div class="stat-value" style="color:#1890ff;">${notices.filter(n => n.status === 'replied').length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已通过</div>
                    <div class="stat-value" style="color:#52c41a;">${notices.filter(n => n.status === 'approved').length}</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h2>整改通知单</h2>
                    <div class="card-actions">
                        ${canCreate ? '<button class="btn btn-warning" onclick="showCreateNoticeModal()">+ 发起整改</button>' : ''}
                    </div>
                </div>
                ${notices.length === 0 ? `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <div class="empty-state-text">暂无整改通知</div>
                    </div>
                ` : `
                    <div>
                        ${notices.map(notice => renderNoticeCard(notice)).join('')}
                    </div>
                `}
            </div>
        `;
        
        window.currentProjects = projects;
    }).catch(err => {
        content.innerHTML = `<div class="card"><div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div></div>`;
    });
}

function renderNoticeCard(notice) {
    const isMine = currentUser.role === 'foreman' && notice.assigneeId === currentUser.id;
    const isCreator = currentUser.role === 'supervisor' && notice.createdBy === currentUser.id;
    const canReply = isMine && notice.status === 'pending';
    const canReview = isCreator && notice.status === 'replied';
    
    return `
        <div class="notice-card ${notice.status}">
            <div class="notice-header">
                <div>
                    <div class="notice-title">${notice.title}</div>
                    <div style="font-size:12px;color:#8c8c8c;margin-top:4px;">
                        ${notice.project?.name || '-'} / ${notice.phase?.name || '-'} / ${notice.task?.name || '-'}
                    </div>
                </div>
                <span class="notice-priority priority-${notice.priority}">
                    ${notice.priority === 'high' ? '高优先级' : notice.priority === 'low' ? '低优先级' : '普通'}
                </span>
            </div>
            
            <div class="notice-content">
                <strong>问题描述：</strong>${notice.description}
            </div>
            
            ${notice.replyContent ? `
                <div class="notice-reply">
                    <strong>整改回复：</strong>${notice.replyContent}
                    <div style="margin-top:8px;font-size:12px;color:#8c8c8c;">
                        回复人: ${notice.replyByName || '-'} | ${formatDateTime(notice.replyDate)}
                    </div>
                </div>
            ` : ''}
            
            ${notice.reviewResult ? `
                <div style="background:${notice.reviewResult === 'pass' ? '#f6ffed' : '#fff1f0'};padding:12px;border-radius:8px;margin-bottom:12px;border-left:3px solid ${notice.reviewResult === 'pass' ? '#52c41a' : '#f5222d'};">
                    <strong>审核结果：</strong>${notice.reviewResult === 'pass' ? '通过' : '未通过'}
                    ${notice.reviewComment ? `<div style="margin-top:8px;">${notice.reviewComment}</div>` : ''}
                    <div style="margin-top:8px;font-size:12px;color:#8c8c8c;">
                        审核人: ${notice.replyByName || '-'} | ${formatDateTime(notice.reviewDate)}
                    </div>
                </div>
            ` : ''}
            
            ${notice.photos && notice.photos.length > 0 ? `
                <div style="margin-bottom:12px;">
                    <div style="font-size:12px;color:#8c8c8c;margin-bottom:8px;">相关照片：</div>
                    <div class="photo-gallery">
                        ${notice.photos.map(photo => `
                            <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')">
                                <img src="${photo.url}" alt="${photo.filename}">
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="notice-footer">
                <div>
                    <span>创建人: ${notice.createdByName || '-'}</span>
                    <span style="margin:0 8px;">|</span>
                    <span>${formatDateTime(notice.createdAt)}</span>
                    ${notice.deadline ? `<span style="margin:0 8px;">|</span><span>截止日期: ${formatDate(notice.deadline)}</span>` : ''}
                </div>
                <div style="display:flex;gap:8px;">
                    <span class="project-status ${getStatusClass(notice.status)}">${getStatusText(notice.status)}</span>
                    ${canReply ? `<button class="btn btn-primary btn-sm" onclick="showReplyNoticeModal('${notice.id}')">回复整改</button>` : ''}
                    ${canReview ? `<button class="btn btn-primary btn-sm" onclick="showReviewNoticeModal('${notice.id}')">审核</button>` : ''}
                    <button class="btn btn-default btn-sm" onclick="openNoticeDetail('${notice.id}')">详情</button>
                </div>
            </div>
        </div>
    `;
}

function openNoticeDetail(noticeId) {
    apiRequest(`/inspection/${noticeId}`).then(notice => {
        const isMine = currentUser.role === 'foreman' && notice.assigneeId === currentUser.id;
        const isCreator = currentUser.role === 'supervisor' && notice.createdBy === currentUser.id;
        const canReply = isMine && notice.status === 'pending';
        const canReview = isCreator && notice.status === 'replied';
        
        showModal(`
            <div class="notice-card ${notice.status}" style="box-shadow:none;margin:0;">
                <div class="notice-header">
                    <div>
                        <div class="notice-title">${notice.title}</div>
                        <div style="font-size:12px;color:#8c8c8c;margin-top:4px;">
                            ${notice.project?.name || '-'} / ${notice.phase?.name || '-'} / ${notice.task?.name || '-'}
                        </div>
                    </div>
                    <span class="notice-priority priority-${notice.priority}">
                        ${notice.priority === 'high' ? '高优先级' : notice.priority === 'low' ? '低优先级' : '普通'}
                    </span>
                </div>
                
                <div class="notice-content">
                    <strong>问题描述：</strong>${notice.description}
                </div>
                
                ${notice.photos && notice.photos.length > 0 ? `
                    <div style="margin-bottom:12px;">
                        <div style="font-size:12px;color:#8c8c8c;margin-bottom:8px;">问题照片：</div>
                        <div class="photo-gallery">
                            ${notice.photos.filter(p => p.description === '整改问题照片').map(photo => `
                                <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')">
                                    <img src="${photo.url}" alt="${photo.filename}">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${notice.replyContent ? `
                    <div class="notice-reply">
                        <strong>整改回复：</strong>${notice.replyContent}
                        <div style="margin-top:8px;font-size:12px;color:#8c8c8c;">
                            回复人: ${notice.replyByName || '-'} | ${formatDateTime(notice.replyDate)}
                        </div>
                        ${notice.photos && notice.photos.some(p => p.description === '整改回复照片') ? `
                            <div style="margin-top:12px;">
                                <div style="font-size:12px;color:#8c8c8c;margin-bottom:8px;">整改照片：</div>
                                <div class="photo-gallery">
                                    ${notice.photos.filter(p => p.description === '整改回复照片').map(photo => `
                                        <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')">
                                            <img src="${photo.url}" alt="${photo.filename}">
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                ${notice.reviewResult ? `
                    <div style="background:${notice.reviewResult === 'pass' ? '#f6ffed' : '#fff1f0'};padding:12px;border-radius:8px;margin-bottom:12px;border-left:3px solid ${notice.reviewResult === 'pass' ? '#52c41a' : '#f5222d'};">
                        <strong>审核结果：</strong>${notice.reviewResult === 'pass' ? '通过' : '未通过'}
                        ${notice.reviewComment ? `<div style="margin-top:8px;">${notice.reviewComment}</div>` : ''}
                        <div style="margin-top:8px;font-size:12px;color:#8c8c8c;">
                            审核人: ${notice.replyByName || '-'} | ${formatDateTime(notice.reviewDate)}
                        </div>
                    </div>
                ` : ''}
                
                <div class="notice-footer">
                    <div>
                        <span>创建人: ${notice.createdByName || '-'}</span>
                        <span style="margin:0 8px;">|</span>
                        <span>${formatDateTime(notice.createdAt)}</span>
                        ${notice.deadline ? `<span style="margin:0 8px;">|</span><span>截止日期: ${formatDate(notice.deadline)}</span>` : ''}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <span class="project-status ${getStatusClass(notice.status)}">${getStatusText(notice.status)}</span>
                        ${canReply ? `<button class="btn btn-primary btn-sm" onclick="closeModal();showReplyNoticeModal('${notice.id}')">回复整改</button>` : ''}
                        ${canReview ? `<button class="btn btn-primary btn-sm" onclick="closeModal();showReviewNoticeModal('${notice.id}')">审核</button>` : ''}
                    </div>
                </div>
            </div>
        `, '整改通知单详情');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function loadDailyLogPage() {
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;">加载中...</div></div>';
    
    apiRequest('/projects').then(projects => {
        if (projects.length === 0) {
            content.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <div class="empty-state-text">暂无项目，无法查看施工日志</div>
                    </div>
                </div>
            `;
            return;
        }
        
        const firstProjectId = projects[0].id;
        
        content.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>施工日志</h2>
                    <div class="card-actions">
                        <select id="log-project-select" class="form-control" style="padding:8px 12px;border-radius:8px;border:1px solid #d9d9d9;">
                            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                        <button class="btn btn-success" onclick="exportCurrentProjectLog()">导出Excel</button>
                    </div>
                </div>
                <div id="daily-log-content">加载中...</div>
            </div>
        `;
        
        document.getElementById('log-project-select').addEventListener('change', (e) => {
            loadDailyLogContent(e.target.value);
        });
        
        loadDailyLogContent(firstProjectId);
    }).catch(err => {
        content.innerHTML = `<div class="card"><div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div></div>`;
    });
}

function loadDailyLogContent(projectId) {
    const content = document.getElementById('daily-log-content');
    content.innerHTML = '<div style="text-align:center;padding:40px;">加载中...</div>';
    
    apiRequest(`/progress/project/${projectId}/daily-log`).then(dailyLog => {
        if (dailyLog.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-text">暂无施工日志记录</div>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div class="daily-log-list">
                ${dailyLog.map(day => `
                    <div class="daily-log-card">
                        <div class="daily-log-header">
                            <div class="daily-log-date">${formatDate(day.date)}</div>
                            <div class="daily-log-stats">
                                ${day.weather ? `<span>🌤️ ${day.weather}</span>` : ''}
                                <span>👷 ${day.totalWorkers} 人施工</span>
                                <span>📋 ${day.taskCount} 项任务</span>
                            </div>
                        </div>
                        <div class="daily-log-body">
                            ${day.records.map(record => `
                                <div class="daily-log-record">
                                    <div class="daily-log-record-header">
                                        <span class="daily-log-task">${record.phaseName} - ${record.taskName}</span>
                                        <span class="daily-log-progress">${record.progress}%</span>
                                    </div>
                                    <p style="color:#595959;margin-bottom:8px;">${record.workContent || '无施工内容描述'}</p>
                                    <div style="font-size:12px;color:#8c8c8c;display:flex;gap:16px;flex-wrap:wrap;">
                                        <span>👷 ${record.reportedByName} (${record.reportedByTeam || '-'})</span>
                                        ${record.workers ? `<span>出勤: ${record.workers}人</span>` : ''}
                                        ${record.notes ? `<span>备注: ${record.notes}</span>` : ''}
                                    </div>
                                    ${record.photos && record.photos.length > 0 ? `
                                        <div class="photo-gallery" style="margin-top:12px;">
                                            ${record.photos.map(photo => `
                                                <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')">
                                                    <img src="${photo.url}" alt="施工照片">
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).catch(err => {
        content.innerHTML = `<div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div>`;
    });
}

function exportCurrentProjectLog() {
    const projectId = document.getElementById('log-project-select').value;
    exportProjectLog(projectId);
}

function exportProjectLog(projectId) {
    const token = localStorage.getItem('token');
    showToast('正在导出施工日志...', 'info');
    fetch(`${API_BASE}/export/project/${projectId}/log`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || '导出失败'); });
        }
        const filename = decodeURIComponent(
            response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || '施工日志.xlsx'
        );
        return response.blob().then(blob => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('导出成功', 'success');
    })
    .catch(err => {
        showToast('导出失败: ' + err.message, 'error');
    });
}

function showCreateProjectModal() {
    const today = new Date().toISOString().split('T')[0];
    const defaultEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    apiRequest('/auth/users').then(users => {
        const owners = users.filter(u => u.role === 'owner');
        
        showModal(`
            <form id="create-project-form">
                <div class="form-group">
                    <label>项目名称 *</label>
                    <input type="text" name="name" required placeholder="请输入项目名称">
                </div>
                <div class="form-group">
                    <label>项目地点</label>
                    <input type="text" name="location" placeholder="请输入项目地点">
                </div>
                <div class="form-group">
                    <label>项目描述</label>
                    <textarea name="description" placeholder="请输入项目描述"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>计划开始日期 *</label>
                        <input type="date" name="plannedStartDate" required value="${today}">
                    </div>
                    <div class="form-group">
                        <label>计划完成日期 *</label>
                        <input type="date" name="plannedEndDate" required value="${defaultEnd}">
                    </div>
                </div>
                <div class="form-group">
                    <label>关联业主</label>
                    <select name="ownerId">
                        <option value="">请选择</option>
                        ${owners.map(o => `<option value="${o.id}">${o.name} (${o.company || ''})</option>`).join('')}
                    </select>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">创建项目</button>
                </div>
            </form>
        `, '新建项目');
        
        document.getElementById('create-project-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(e.target));
            
            apiRequest('/projects', {
                method: 'POST',
                body: JSON.stringify(formData)
            }).then(() => {
                closeModal();
                loadProjectsPage();
                showToast('项目创建成功', 'success');
            }).catch(err => {
                showToast(err.message, 'error');
            });
        });
    });
}

function showEditProjectModal(projectId) {
    apiRequest(`/projects/${projectId}`).then(project => {
        apiRequest('/auth/users').then(users => {
            const owners = users.filter(u => u.role === 'owner');
            
            showModal(`
                <form id="edit-project-form">
                    <div class="form-group">
                        <label>项目名称 *</label>
                        <input type="text" name="name" required value="${project.name}">
                    </div>
                    <div class="form-group">
                        <label>项目地点</label>
                        <input type="text" name="location" value="${project.location || ''}">
                    </div>
                    <div class="form-group">
                        <label>项目描述</label>
                        <textarea name="description">${project.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>计划开始日期 *</label>
                            <input type="date" name="plannedStartDate" required value="${project.plannedStartDate}">
                        </div>
                        <div class="form-group">
                            <label>计划完成日期 *</label>
                            <input type="date" name="plannedEndDate" required value="${project.plannedEndDate}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>关联业主</label>
                        <select name="ownerId">
                            <option value="">请选择</option>
                            ${owners.map(o => `<option value="${o.id}" ${project.ownerId === o.id ? 'selected' : ''}>${o.name} (${o.company || ''})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>项目状态</label>
                        <select name="status">
                            <option value="active" ${project.status === 'active' ? 'selected' : ''}>进行中</option>
                            <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>已完成</option>
                            <option value="suspended" ${project.status === 'suspended' ? 'selected' : ''}>已暂停</option>
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存修改</button>
                    </div>
                </form>
            `, '编辑项目');
            
            document.getElementById('edit-project-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = Object.fromEntries(new FormData(e.target));
                
                apiRequest(`/projects/${projectId}`, {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                }).then(() => {
                    closeModal();
                    openProjectDetail(projectId);
                    showToast('项目更新成功', 'success');
                }).catch(err => {
                    showToast(err.message, 'error');
                });
            });
        });
    });
}

function deleteProject(projectId) {
    if (!confirm('确定要删除此项目吗？删除后无法恢复，所有相关数据都将被清除。')) {
        return;
    }
    
    apiRequest(`/projects/${projectId}`, { method: 'DELETE' }).then(() => {
        closeModal();
        loadProjectsPage();
        showToast('项目已删除', 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function showCreatePhaseModal(projectId) {
    showModal(`
        <form id="create-phase-form">
            <div class="form-group">
                <label>阶段名称 *</label>
                <input type="text" name="name" required placeholder="如：基础工程、主体结构、装修工程等">
            </div>
            <div class="form-group">
                <label>阶段描述</label>
                <textarea name="description" placeholder="请输入阶段描述"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>计划开始日期 *</label>
                    <input type="date" name="plannedStartDate" required>
                </div>
                <div class="form-group">
                    <label>计划完成日期 *</label>
                    <input type="date" name="plannedEndDate" required>
                </div>
            </div>
            <div class="form-group">
                <label>权重（影响项目总进度计算）</label>
                <input type="number" name="weight" value="1" min="1" max="10">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">添加工期</button>
            </div>
        </form>
    `, '添加工期');
    
    document.getElementById('create-phase-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target));
        formData.weight = parseFloat(formData.weight) || 1;
        
        apiRequest(`/projects/${projectId}/phases`, {
            method: 'POST',
            body: JSON.stringify(formData)
        }).then(() => {
            closeModal();
            openProjectDetail(projectId);
            showToast('工期添加成功', 'success');
        }).catch(err => {
            showToast(err.message, 'error');
        });
    });
}

function showEditPhaseModal(phaseId) {
    const projectId = window.currentProjectId;
    if (!projectId) {
        showToast('无法确定所属项目', 'error');
        return;
    }

    apiRequest(`/projects/${projectId}`).then(project => {
        const phase = project.phases?.find(p => p.id === phaseId);
        if (!phase) {
            showToast('工期不存在', 'error');
            return;
        }
        
        showModal(`
            <form id="edit-phase-form">
                <div class="form-group">
                    <label>阶段名称 *</label>
                    <input type="text" name="name" required value="${phase.name}">
                </div>
                <div class="form-group">
                    <label>阶段描述</label>
                    <textarea name="description">${phase.description || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>计划开始日期 *</label>
                        <input type="date" name="plannedStartDate" required value="${phase.plannedStartDate || ''}">
                    </div>
                    <div class="form-group">
                        <label>计划完成日期 *</label>
                        <input type="date" name="plannedEndDate" required value="${phase.plannedEndDate || ''}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>实际开始日期</label>
                        <input type="date" name="actualStartDate" value="${phase.actualStartDate || ''}">
                    </div>
                    <div class="form-group">
                        <label>实际完成日期</label>
                        <input type="date" name="actualEndDate" value="${phase.actualEndDate || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label>权重</label>
                    <input type="number" name="weight" value="${phase.weight}" min="1" max="10">
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">保存修改</button>
                </div>
            </form>
        `, '编辑工期');
        
        document.getElementById('edit-phase-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(e.target));
            formData.weight = parseFloat(formData.weight) || 1;
            
            apiRequest(`/projects/phases/${phaseId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            }).then(() => {
                closeModal();
                showToast('工期更新成功', 'success');
                openProjectDetail(window.currentProjectId);
            }).catch(err => {
                showToast(err.message, 'error');
            });
        });
    });
}

function deletePhase(phaseId) {
    if (!confirm('确定要删除此工期吗？删除后所有相关任务也将被清除。')) {
        return;
    }
    
    apiRequest(`/projects/phases/${phaseId}`, { method: 'DELETE' }).then(() => {
        closeModal();
        showToast('工期已删除', 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function showCreateTaskModal(phaseId) {
    apiRequest('/auth/users').then(users => {
        const foremen = users.filter(u => u.role === 'foreman');
        
        showModal(`
            <form id="create-task-form">
                <div class="form-group">
                    <label>工序名称 *</label>
                    <input type="text" name="name" required placeholder="请输入工序名称">
                </div>
                <div class="form-group">
                    <label>工序描述</label>
                    <textarea name="description" placeholder="请输入工序描述"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>计划开始日期</label>
                        <input type="date" name="plannedStartDate">
                    </div>
                    <div class="form-group">
                        <label>计划完成日期</label>
                        <input type="date" name="plannedEndDate">
                    </div>
                </div>
                <div class="form-group">
                    <label>分配给班组长</label>
                    <select name="assigneeId">
                        <option value="">请选择</option>
                        ${foremen.map(f => `<option value="${f.id}">${f.name} - ${f.team || ''}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>权重</label>
                        <input type="number" name="weight" value="1" min="1" max="10">
                    </div>
                    <div class="form-group">
                        <label>排序</label>
                        <input type="number" name="order" value="0">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">添加工序</button>
                </div>
            </form>
        `, '添加工序');
        
        document.getElementById('create-task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(e.target));
            formData.phaseId = phaseId;
            formData.weight = parseFloat(formData.weight) || 1;
            formData.order = parseInt(formData.order) || 0;
            
            apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(formData)
            }).then(() => {
                closeModal();
                showToast('工序添加成功', 'success');
                openProjectDetail(window.currentProjectId);
            }).catch(err => {
                showToast(err.message, 'error');
            });
        });
    });
}

function showEditTaskModal(taskId) {
    apiRequest(`/tasks/${taskId}`).then(task => {
        apiRequest('/auth/users').then(users => {
            const foremen = users.filter(u => u.role === 'foreman');
            
            showModal(`
                <form id="edit-task-form">
                    <div class="form-group">
                        <label>工序名称 *</label>
                        <input type="text" name="name" required value="${task.name}">
                    </div>
                    <div class="form-group">
                        <label>工序描述</label>
                        <textarea name="description">${task.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>计划开始日期</label>
                            <input type="date" name="plannedStartDate" value="${task.plannedStartDate || ''}">
                        </div>
                        <div class="form-group">
                            <label>计划完成日期</label>
                            <input type="date" name="plannedEndDate" value="${task.plannedEndDate || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>分配给班组长</label>
                        <select name="assigneeId">
                            <option value="">请选择</option>
                            ${foremen.map(f => `<option value="${f.id}" ${task.assigneeId === f.id ? 'selected' : ''}>${f.name} - ${f.team || ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>权重</label>
                            <input type="number" name="weight" value="${task.weight}" min="1" max="10">
                        </div>
                        <div class="form-group">
                            <label>排序</label>
                            <input type="number" name="order" value="${task.order || 0}">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                        <button type="submit" class="btn btn-primary">保存修改</button>
                    </div>
                </form>
            `, '编辑工序');
            
            document.getElementById('edit-task-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = Object.fromEntries(new FormData(e.target));
                formData.weight = parseFloat(formData.weight) || 1;
                formData.order = parseInt(formData.order) || 0;
                
                apiRequest(`/tasks/${taskId}`, {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                }).then(() => {
                    closeModal();
                    showToast('工序更新成功', 'success');
                    openProjectDetail(window.currentProjectId);
                }).catch(err => {
                    showToast(err.message, 'error');
                });
            });
        });
    });
}

function showAssignTaskModal(taskId) {
    apiRequest('/auth/users').then(users => {
        const foremen = users.filter(u => u.role === 'foreman');
        
        showModal(`
            <form id="assign-task-form">
                <div class="form-group">
                    <label>选择班组长</label>
                    <select name="assigneeId" required>
                        <option value="">请选择</option>
                        ${foremen.map(f => `<option value="${f.id}">${f.name} - ${f.team || ''}</option>`).join('')}
                    </select>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                    <button type="submit" class="btn btn-primary">分配任务</button>
                </div>
            </form>
        `, '分配任务');
        
        document.getElementById('assign-task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = Object.fromEntries(new FormData(e.target));
            
            apiRequest(`/tasks/${taskId}/assign`, {
                method: 'POST',
                body: JSON.stringify(formData)
            }).then(() => {
                closeModal();
                showToast('任务分配成功', 'success');
            }).catch(err => {
                showToast(err.message, 'error');
            });
        });
    });
}

let selectedPhotos = [];

function showUpdateProgressModal(taskId) {
    selectedPhotos = [];
    
    showModal(`
        <form id="update-progress-form">
            <div class="form-group">
                <label>今日进度 (%) *</label>
                <input type="range" id="progress-slider" name="progress" min="0" max="100" value="0" style="width:100%;">
                <div style="text-align:center;font-size:24px;font-weight:700;color:#1890ff;" id="progress-display">0%</div>
            </div>
            <div class="form-group">
                <label>今日施工内容</label>
                <textarea name="workContent" placeholder="请描述今日完成的施工内容"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>天气情况</label>
                    <select name="weather">
                        <option value="">请选择</option>
                        <option value="晴">晴 ☀️</option>
                        <option value="多云">多云 ⛅</option>
                        <option value="阴">阴 ☁️</option>
                        <option value="小雨">小雨 🌧️</option>
                        <option value="中雨">中雨 🌧️</option>
                        <option value="大雨">大雨 ⛈️</option>
                        <option value="雪">雪 ❄️</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>出勤人数</label>
                    <input type="number" name="workers" min="0" placeholder="请输入出勤人数">
                </div>
            </div>
            <div class="form-group">
                <label>备注</label>
                <textarea name="notes" placeholder="其他需要说明的情况"></textarea>
            </div>
            <div class="form-group">
                <label>上传施工照片 (最多9张)</label>
                <div class="photo-upload-area" onclick="document.getElementById('photo-input').click()">
                    <div style="font-size:48px;margin-bottom:8px;">📷</div>
                    <div>点击选择照片或拖拽到此处</div>
                    <div style="font-size:12px;color:#8c8c8c;margin-top:4px;">支持 JPG、PNG、GIF 格式</div>
                </div>
                <input type="file" id="photo-input" accept="image/*" multiple style="display:none;" onchange="handlePhotoSelect(event)">
                <div class="photo-preview-grid" id="photo-preview-grid"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">提交进度</button>
            </div>
        </form>
    `, '更新今日进度');
    
    const slider = document.getElementById('progress-slider');
    const display = document.getElementById('progress-display');
    slider.addEventListener('input', (e) => {
        display.textContent = e.target.value + '%';
    });
    
    document.getElementById('update-progress-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitProgress(taskId);
    });
}

function handlePhotoSelect(event) {
    const files = Array.from(event.target.files);
    const remainingSlots = 9 - selectedPhotos.length;
    const filesToAdd = files.slice(0, remainingSlots);
    
    filesToAdd.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedPhotos.push({
                file,
                preview: e.target.result
            });
            renderPhotoPreview();
        };
        reader.readAsDataURL(file);
    });
    
    if (files.length > remainingSlots) {
        showToast(`最多只能上传9张照片，已自动选择前${remainingSlots}张`, 'warning');
    }
}

function renderPhotoPreview() {
    const grid = document.getElementById('photo-preview-grid');
    if (!grid) return;
    
    grid.innerHTML = selectedPhotos.map((photo, index) => `
        <div class="photo-preview-item">
            <img src="${photo.preview}" alt="预览">
            <button type="button" class="photo-preview-remove" onclick="removePhoto(${index})">×</button>
        </div>
    `).join('');
}

function removePhoto(index) {
    selectedPhotos.splice(index, 1);
    renderPhotoPreview();
}

function submitProgress(taskId) {
    const form = document.getElementById('update-progress-form');
    const formData = new FormData(form);
    
    selectedPhotos.forEach(photo => {
        formData.append('photos', photo.file);
    });
    
    fetch(API_BASE + `/progress/${taskId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    }).then(response => response.json()).then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        closeModal();
        showToast('进度更新成功', 'success');
        if (currentPage === 'my-tasks') {
            loadMyTasksPage();
        }
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

async function loadGanttChart(projectId) {
    const container = document.getElementById('gantt-chart-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;padding:40px;">加载中...</div>';
    
    try {
        const ganttData = await apiRequest(`/projects/${projectId}/gantt`);
        
        if (!ganttData.phases || ganttData.phases.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-text">暂无甘特图数据，请先添加施工阶段</div>
                </div>
            `;
            return;
        }
        
        const ganttChart = new GanttChart('gantt-chart-container', {
            rowHeight: 48,
            barHeight: 28,
            dayWidth: 40
        });
        
        await ganttChart.loadUsers();
        ganttChart.setData(ganttData);
        ganttChart.render();
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <div class="empty-state-text">加载甘特图失败：${err.message}</div>
            </div>
        `;
    }
}

function loadProjectPhotos(projectId) {
    const container = document.getElementById('project-photos-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;padding:40px;">加载中...</div>';
    
    apiRequest(`/progress/project/${projectId}/records`).then(records => {
        const allPhotos = [];
        records.forEach(record => {
            if (record.photos) {
                record.photos.forEach(photo => {
                    allPhotos.push({
                        ...photo,
                        recordDate: record.recordDate,
                        taskName: record.taskName,
                        phaseName: record.phaseName
                    });
                });
            }
        });
        
        if (allPhotos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📷</div>
                    <div class="empty-state-text">暂无施工照片</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div style="margin-bottom:16px;color:#8c8c8c;">共 ${allPhotos.length} 张照片</div>
            <div class="photo-gallery">
                ${allPhotos.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).map(photo => `
                    <div class="photo-gallery-item" onclick="viewPhoto('${photo.url}')" style="position:relative;">
                        <img src="${photo.url}" alt="${photo.filename}">
                        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;padding:4px 8px;font-size:11px;">
                            <div>${formatDate(photo.recordDate)}</div>
                            <div style="opacity:0.8;">${photo.phaseName} - ${photo.taskName}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).catch(err => {
        container.innerHTML = `<div style="color:#f5222d;text-align:center;padding:40px;">加载失败: ${err.message}</div>`;
    });
}

function showCreateNoticeModal() {
    const projects = window.currentProjects || [];
    const today = new Date().toISOString().split('T')[0];
    const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    showModal(`
        <form id="create-notice-form">
            <div class="form-group">
                <label>选择项目 *</label>
                <select name="projectId" id="notice-project-select" required onchange="loadProjectPhases(this.value)">
                    <option value="">请选择项目</option>
                    ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>选择阶段</label>
                <select name="phaseId" id="notice-phase-select" onchange="loadPhaseTasks(this.value)">
                    <option value="">请选择阶段</option>
                </select>
            </div>
            <div class="form-group">
                <label>选择工序</label>
                <select name="taskId" id="notice-task-select" onchange="onNoticeTaskChange(this.value)">
                    <option value="">请选择工序</option>
                </select>
            </div>
            <div class="form-group">
                <label>指定班组长</label>
                <select name="assigneeId" id="notice-assignee-select">
                    <option value="">请选择班组长</option>
                </select>
            </div>
            <div class="form-group">
                <label>整改标题 *</label>
                <input type="text" name="title" required placeholder="请输入整改标题">
            </div>
            <div class="form-group">
                <label>问题描述 *</label>
                <textarea name="description" required placeholder="请详细描述发现的问题"></textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>整改期限</label>
                    <input type="date" name="deadline" value="${defaultDeadline}">
                </div>
                <div class="form-group">
                    <label>优先级</label>
                    <select name="priority">
                        <option value="low">低</option>
                        <option value="normal" selected>普通</option>
                        <option value="high">高</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>上传问题照片 (最多9张)</label>
                <div class="photo-upload-area" onclick="document.getElementById('notice-photo-input').click()">
                    <div style="font-size:48px;margin-bottom:8px;">📷</div>
                    <div>点击选择照片</div>
                </div>
                <input type="file" id="notice-photo-input" accept="image/*" multiple style="display:none;" onchange="handleNoticePhotoSelect(event)">
                <div class="photo-preview-grid" id="notice-photo-preview-grid"></div>
            </div>
            <div clas pe="bu
        </form>
    `, '发起整改通知');
    
    window.noticePhotos = [];
    
    document.getElementById('create-notice-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitNotice();
    });
}

function handleNoticePhotoSelect(event) {
    const files = Array.from(event.target.files);
    const remainingSlots = 9 - (window.noticePhotos?.length || 0);
    const filesToAdd = files.slice(0, remainingSlots);
    
    window.noticePhotos = window.noticePhotos || [];
    
    filesToAdd.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            window.noticePhotos.push({
                file,
                preview: e.target.result
            });
            renderNoticePhotoPreview();
        };
        reader.readAsDataURL(file);
    });
}

function renderNoticePhotoPreview() {
    const grid = document.getElementById('notice-photo-preview-grid');
    if (!grid || !window.noticePhotos) return;
    
    grid.innerHTML = window.noticePhotos.map((photo, index) => `
        <div class="photo-preview-item">
            <img src="${photo.preview}" alt="预览">
            <button type="button" class="photo-preview-remove" onclick="removeNoticePhoto(${index})">×</button>
        </div>
    `).join('');
}

function removeNoticePhoto(index) {
    if (window.noticePhotos) {
        window.noticePhotos.splice(index, 1);
        renderNoticePhotoPreview();
    }
}

function loadProjectPhases(projectId) {
    if (!projectId) {
        document.getElementById('notice-phase-select').innerHTML = '<option value="">请选择阶段</option>';
        document.getElementById('notice-task-select').innerHTML = '<option value="">请选择工序</option>';
        document.getElementById('notice-assignee-select').value = '';
        window.noticePhaseTasks = [];
        return;
    }
    
    apiRequest(`/projects/${projectId}`).then(project => {
        document.getElementById('notice-phase-select').innerHTML = `
            <option value="">请选择阶段</option>
            ${project.phases.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        `;
        document.getElementById('notice-task-select').innerHTML = '<option value="">请选择工序</option>';
        document.getElementById('notice-assignee-select').value = '';
        window.noticePhaseTasks = [];
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function loadPhaseTasks(phaseId) {
    if (!phaseId) {
        document.getElementById('notice-task-select').innerHTML = '<option value="">请选择工序</option>';
        document.getElementById('notice-assignee-select').value = '';
        window.noticePhaseTasks = [];
        return;
    }
    
    apiRequest(`/tasks?phaseId=${phaseId}`).then(tasks => {
        window.noticePhaseTasks = tasks;
        document.getElementById('notice-task-select').innerHTML = `
            <option value="">请选择工序</option>
            ${tasks.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        `;
        document.getElementById('notice-assignee-select').value = '';
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function loadNoticeAssignees() {
    apiRequest('/auth/users').then(users => {
        const foremen = users.filter(u => u.role === 'foreman');
        const select = document.getElementById('notice-assignee-select');
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = `
            <option value="">请选择班组长</option>
            ${foremen.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
        `;
        if (currentVal) select.value = currentVal;
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function onNoticeTaskChange(taskId) {
    const tasks = window.noticePhaseTasks || [];
    const task = tasks.find(t => t.id === taskId);
    const select = document.getElementById('notice-assignee-select');
    if (!select) return;
    if (task && task.assigneeId) {
        select.value = task.assigneeId;
    }
}

function submitNotice() {
    const form = document.getElementById('create-notice-form');
    const formData = new FormData(form);
    
    if (window.noticePhotos) {
        window.noticePhotos.forEach(photo => {
            formData.append('photos', photo.file);
        });
    }
    
    fetch(API_BASE + '/inspection', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    }).then(response => response.json()).then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        closeModal();
        loadRectificationPage();
        showToast('整改通知已发送', 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function showReplyNoticeModal(noticeId) {
    window.replyPhotos = [];
    
    showModal(`
        <form id="reply-notice-form">
            <div class="form-group">
                <label>整改回复 *</label>
                <textarea name="replyContent" required placeholder="请详细描述整改情况"></textarea>
            </div>
            <div class="form-group">
                <label>上传整改后照片 (最多9张)</label>
                <div class="photo-upload-area" onclick="document.getElementById('reply-photo-input').click()">
                    <div style="font-size:48px;margin-bottom:8px;">📷</div>
                    <div>点击选择照片</div>
                </div>
                <input type="file" id="reply-photo-input" accept="image/*" multiple style="display:none;" onchange="handleReplyPhotoSelect(event)">
                <div class="photo-preview-grid" id="reply-photo-preview-grid"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">提交回复</button>
            </div>
        </form>
    `, '回复整改通知');
    
    document.getElementById('reply-notice-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitReply(noticeId);
    });
}

function handleReplyPhotoSelect(event) {
    const files = Array.from(event.target.files);
    const remainingSlots = 9 - (window.replyPhotos?.length || 0);
    const filesToAdd = files.slice(0, remainingSlots);
    
    window.replyPhotos = window.replyPhotos || [];
    
    filesToAdd.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            window.replyPhotos.push({
                file,
                preview: e.target.result
            });
            renderReplyPhotoPreview();
        };
        reader.readAsDataURL(file);
    });
}

function renderReplyPhotoPreview() {
    const grid = document.getElementById('reply-photo-preview-grid');
    if (!grid || !window.replyPhotos) return;
    
    grid.innerHTML = window.replyPhotos.map((photo, index) => `
        <div class="photo-preview-item">
            <img src="${photo.preview}" alt="预览">
            <button type="button" class="photo-preview-remove" onclick="removeReplyPhoto(${index})">×</button>
        </div>
    `).join('');
}

function removeReplyPhoto(index) {
    if (window.replyPhotos) {
        window.replyPhotos.splice(index, 1);
        renderReplyPhotoPreview();
    }
}

function submitReply(noticeId) {
    const form = document.getElementById('reply-notice-form');
    const formData = new FormData(form);
    
    if (window.replyPhotos) {
        window.replyPhotos.forEach(photo => {
            formData.append('photos', photo.file);
        });
    }
    
    fetch(API_BASE + `/inspection/${noticeId}/reply`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
    }).then(response => response.json()).then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        closeModal();
        loadRectificationPage();
        showToast('整改回复已提交', 'success');
    }).catch(err => {
        showToast(err.message, 'error');
    });
}

function showReviewNoticeModal(noticeId) {
    showModal(`
        <form id="review-notice-form">
            <div class="form-group">
                <label>审核结果 *</label>
                <select name="reviewResult" required>
                    <option value="">请选择</option>
                    <option value="pass">通过</option>
                    <option value="fail">未通过，需重新整改</option>
                </select>
            </div>
            <div class="form-group">
                <label>审核意见</label>
                <textarea name="reviewComment" placeholder="请输入审核意见"></textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" onclick="closeModal()">取消</button>
                <button type="submit" class="btn btn-primary">提交审核</button>
            </div>
        </form>
    `, '审核整改');
    
    document.getElementById('review-notice-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target));
        
        apiRequest(`/inspection/${noticeId}/review`, {
            method: 'POST',
            body: JSON.stringify(formData)
        }).then(() => {
            closeModal();
            loadRectificationPage();
            showToast('审核完成', 'success');
        }).catch(err => {
            showToast(err.message, 'error');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initLoginPage();
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});
