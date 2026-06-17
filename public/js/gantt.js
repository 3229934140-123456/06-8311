class GanttChart {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            rowHeight: 48,
            barHeight: 28,
            dayWidth: 40,
            monthWidth: 120,
            ...options
        };
        this.data = { phases: [], tasks: [] };
        this.users = [];
        this.scale = 'month';
        this.startDate = null;
        this.endDate = null;
        this.totalDays = 0;
    }

    async loadUsers() {
        try {
            const response = await apiRequest('/api/auth/users');
            this.users = response || [];
        } catch (e) {
            this.users = [];
        }
    }

    getUserName(userId) {
        if (!userId) return '-';
        const user = this.users.find(u => u.id === userId);
        return user ? user.name : '-';
    }

    setData(data) {
        this.data = data;
        this.calculateDateRange();
    }

    calculateDateRange() {
        const allDates = [];
        
        if (this.data.phases) {
            this.data.phases.forEach(phase => {
                if (phase.plannedStartDate) allDates.push(new Date(phase.plannedStartDate));
                if (phase.plannedEndDate) allDates.push(new Date(phase.plannedEndDate));
            });
        }
        
        if (this.data.tasks) {
            this.data.tasks.forEach(task => {
                if (task.plannedStartDate) allDates.push(new Date(task.plannedStartDate));
                if (task.plannedEndDate) allDates.push(new Date(task.plannedEndDate));
            });
        }

        if (allDates.length === 0) {
            const today = new Date();
            this.startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            this.endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0);
        } else {
            this.startDate = new Date(Math.min(...allDates));
            this.endDate = new Date(Math.max(...allDates));
            
            this.startDate.setDate(1);
            this.endDate = new Date(this.endDate.getFullYear(), this.endDate.getMonth() + 1, 0);
        }

        this.startDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth() - 1, 1);
        this.endDate = new Date(this.endDate.getFullYear(), this.endDate.getMonth() + 2, 0);

        this.totalDays = Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
    }

    render() {
        if (!this.container) return;

        const totalRows = (this.data.phases?.length || 0) + (this.data.tasks?.length || 0) + 1;
        const chartHeight = totalRows * this.options.rowHeight + 80;

        this.container.innerHTML = `
            <div class="gantt-controls">
                <div class="gantt-scale-switch">
                    <button class="btn btn-sm ${this.scale === 'month' ? 'btn-primary' : 'btn-secondary'}" data-scale="month">按月</button>
                    <button class="btn btn-sm ${this.scale === 'week' ? 'btn-primary' : 'btn-secondary'}" data-scale="week">按周</button>
                    <button class="btn btn-sm ${this.scale === 'day' ? 'btn-primary' : 'btn-secondary'}" data-scale="day">按日</button>
                </div>
                <div class="gantt-legend">
                    <span class="legend-item"><span class="legend-color bg-primary"></span>进行中</span>
                    <span class="legend-item"><span class="legend-color bg-success"></span>已完成</span>
                    <span class="legend-item"><span class="legend-color bg-warning"></span>未开始</span>
                    <span class="legend-item"><span class="legend-color bg-danger"></span>延误</span>
                </div>
            </div>
            <div class="gantt-container" style="height: ${chartHeight}px;">
                <div class="gantt-header">
                    <div class="gantt-header-label">任务名称</div>
                    <div class="gantt-header-timeline" id="gantt-timeline-header"></div>
                </div>
                <div class="gantt-body">
                    <div class="gantt-body-labels" id="gantt-labels"></div>
                    <div class="gantt-body-timeline" id="gantt-timeline"></div>
                </div>
                <div class="gantt-today-line" id="gantt-today-line"></div>
            </div>
        `;

        this.bindEvents();
        this.renderTimelineHeader();
        this.renderRows();
        this.renderTodayLine();
    }

    bindEvents() {
        this.container.querySelectorAll('[data-scale]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.scale = e.target.dataset.scale;
                this.render();
            });
        });
    }

    renderTimelineHeader() {
        const header = this.container.querySelector('#gantt-timeline-header');
        if (!header) return;

        const months = [];
        const weeks = [];
        const days = [];

        let current = new Date(this.startDate);
        while (current <= this.endDate) {
            const monthKey = `${current.getFullYear()}-${current.getMonth()}`;
            if (!months.find(m => m.key === monthKey)) {
                months.push({
                    key: monthKey,
                    label: `${current.getFullYear()}年${current.getMonth() + 1}月`,
                    start: new Date(current.getFullYear(), current.getMonth(), 1),
                    end: new Date(current.getFullYear(), current.getMonth() + 1, 0)
                });
            }

            const weekStart = new Date(current);
            weekStart.setDate(current.getDate() - current.getDay());
            const weekKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
            if (!weeks.find(w => w.key === weekKey)) {
                weeks.push({
                    key: weekKey,
                    label: `第${this.getWeekNumber(current)}周`,
                    start: weekStart,
                    end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
                });
            }

            days.push({
                date: new Date(current),
                label: current.getDate()
            });

            current.setDate(current.getDate() + 1);
        }

        let html = '<div class="gantt-timeline-months">';
        months.forEach(month => {
            const width = this.getPosition(month.end) - this.getPosition(month.start) + this.getDayWidth();
            html += `<div class="gantt-month" style="left: ${this.getPosition(month.start)}px; width: ${width}px;">${month.label}</div>`;
        });
        html += '</div>';

        if (this.scale === 'week') {
            html += '<div class="gantt-timeline-weeks">';
            weeks.forEach(week => {
                const width = this.getPosition(week.end) - this.getPosition(week.start) + this.getDayWidth();
                html += `<div class="gantt-week" style="left: ${this.getPosition(week.start)}px; width: ${width}px;">${week.label}</div>`;
            });
            html += '</div>';
        }

        if (this.scale === 'day') {
            html += '<div class="gantt-timeline-days">';
            days.forEach(day => {
                const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                html += `<div class="gantt-day ${isWeekend ? 'weekend' : ''}" style="left: ${this.getPosition(day.date)}px; width: ${this.getDayWidth()}px;">${day.label}</div>`;
            });
            html += '</div>';
        }

        header.innerHTML = html;
    }

    getWeekNumber(date) {
        const firstDay = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDay) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7);
    }

    getDayWidth() {
        switch (this.scale) {
            case 'day': return this.options.dayWidth;
            case 'week': return this.options.dayWidth / 2;
            case 'month': return this.options.dayWidth / 4;
            default: return this.options.dayWidth / 4;
        }
    }

    getPosition(date) {
        const dayDiff = Math.ceil((new Date(date) - this.startDate) / (1000 * 60 * 60 * 24));
        return dayDiff * this.getDayWidth();
    }

    renderRows() {
        const labelsContainer = this.container.querySelector('#gantt-labels');
        const timelineContainer = this.container.querySelector('#gantt-timeline');
        
        if (!labelsContainer || !timelineContainer) return;

        let labelsHtml = '';
        let timelineHtml = '';
        let rowIndex = 0;

        if (this.data.phases) {
            this.data.phases.forEach(phase => {
                const isDelay = this.checkDelay(phase);
                labelsHtml += this.renderLabelRow(phase, 'phase', rowIndex, isDelay);
                timelineHtml += this.renderTimelineRow(phase, 'phase', rowIndex, isDelay);
                rowIndex++;

                const phaseTasks = (this.data.tasks || []).filter(t => t.phaseId === phase.id);
                phaseTasks.forEach(task => {
                    const isTaskDelay = this.checkDelay(task);
                    labelsHtml += this.renderLabelRow(task, 'task', rowIndex, isTaskDelay);
                    timelineHtml += this.renderTimelineRow(task, 'task', rowIndex, isTaskDelay);
                    rowIndex++;
                });
            });
        }

        labelsContainer.innerHTML = labelsHtml;
        timelineContainer.innerHTML = timelineHtml;

        const totalWidth = this.getPosition(this.endDate) + this.getDayWidth() + 20;
        this.container.querySelectorAll('.gantt-header-timeline, .gantt-body-timeline').forEach(el => {
            el.style.width = totalWidth + 'px';
        });

        this.syncScroll();
    }

    renderLabelRow(item, type, rowIndex, isDelay) {
        const indent = type === 'task' ? 'padding-left: 32px;' : '';
        const icon = type === 'phase' ? '📦' : '📋';
        const progress = item.progress || 0;
        const assignee = type === 'task' ? this.getUserName(item.assigneeId) : '';

        return `
            <div class="gantt-label-row ${type} ${isDelay ? 'delay' : ''}" 
                 style="top: ${rowIndex * this.options.rowHeight}px; height: ${this.options.rowHeight}px; ${indent}">
                <div class="gantt-label-content">
                    <span class="gantt-icon">${icon}</span>
                    <span class="gantt-name">${item.name}</span>
                    <span class="gantt-progress">${progress.toFixed(1)}%</span>
                    ${assignee ? `<span class="gantt-assignee">👷 ${assignee}</span>` : ''}
                </div>
            </div>
        `;
    }

    renderTimelineRow(item, type, rowIndex, isDelay) {
        const startDate = item.plannedStartDate ? new Date(item.plannedStartDate) : this.startDate;
        const endDate = item.plannedEndDate ? new Date(item.plannedEndDate) : this.endDate;
        const progress = item.progress || 0;

        const left = this.getPosition(startDate);
        const width = Math.max(this.getPosition(endDate) - left + this.getDayWidth(), this.getDayWidth() * 2);
        const progressWidth = (width * progress) / 100;

        let statusClass = 'bg-warning';
        if (progress >= 100) statusClass = 'bg-success';
        else if (progress > 0) statusClass = 'bg-primary';
        if (isDelay) statusClass = 'bg-danger';

        const actualStart = item.actualStartDate ? new Date(item.actualStartDate) : null;
        const actualEnd = item.actualEndDate ? new Date(item.actualEndDate) : null;

        return `
            <div class="gantt-timeline-row ${type}" style="top: ${rowIndex * this.options.rowHeight}px; height: ${this.options.rowHeight}px;">
                <div class="gantt-grid-lines" style="width: 100%;"></div>
                <div class="gantt-bar ${type} ${isDelay ? 'delay' : ''}" 
                     style="left: ${left}px; width: ${width}px; height: ${this.options.barHeight}px; margin-top: ${(this.options.rowHeight - this.options.barHeight) / 2}px;">
                    <div class="gantt-bar-progress ${statusClass}" style="width: ${progressWidth}px;"></div>
                    <div class="gantt-bar-label">
                        ${this.formatDateRange(startDate, endDate)}
                        ${actualStart ? `<span class="actual-dates">实际: ${this.formatDate(actualStart)}${actualEnd ? ' ~ ' + this.formatDate(actualEnd) : ''}</span>` : ''}
                    </div>
                    ${isDelay ? '<span class="gantt-delay-badge">⚠️ 延误</span>' : ''}
                </div>
            </div>
        `;
    }

    checkDelay(item) {
        if (!item.plannedEndDate) return false;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const plannedEnd = new Date(item.plannedEndDate);
        plannedEnd.setHours(0, 0, 0, 0);
        
        const progress = item.progress || 0;
        
        if (today > plannedEnd && progress < 100) {
            return true;
        }
        
        if (item.plannedStartDate) {
            const plannedStart = new Date(item.plannedStartDate);
            plannedStart.setHours(0, 0, 0, 0);
            
            const totalDuration = (plannedEnd - plannedStart) / (1000 * 60 * 60 * 24);
            const elapsedDuration = (today - plannedStart) / (1000 * 60 * 60 * 24);
            
            if (elapsedDuration > 0 && totalDuration > 0) {
                const expectedProgress = Math.min(100, (elapsedDuration / totalDuration) * 100);
                if (expectedProgress - progress > 10) {
                    return true;
                }
            }
        }
        
        return false;
    }

    formatDate(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    formatDateRange(start, end) {
        return `${this.formatDate(start)} - ${this.formatDate(end)}`;
    }

    renderTodayLine() {
        const todayLine = this.container.querySelector('#gantt-today-line');
        const timeline = this.container.querySelector('.gantt-body-timeline');
        if (!todayLine || !timeline) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (today >= this.startDate && today <= this.endDate) {
            const left = this.getPosition(today);
            todayLine.style.left = `calc(240px + ${left}px)`;
            todayLine.style.display = 'block';
        } else {
            todayLine.style.display = 'none';
        }
    }

    syncScroll() {
        const body = this.container.querySelector('.gantt-body');
        const header = this.container.querySelector('.gantt-header-timeline');
        const timeline = this.container.querySelector('.gantt-body-timeline');
        const labels = this.container.querySelector('.gantt-body-labels');

        if (!body || !header || !timeline || !labels) return;

        body.addEventListener('scroll', () => {
            header.scrollLeft = body.scrollLeft;
            labels.scrollTop = body.scrollTop;
        });
    }
}

window.GanttChart = GanttChart;
