const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const store = require('../data/store');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/project/:projectId/log', authenticateToken, requireRole('project_manager', 'supervisor', 'owner'), (req, res) => {
  const project = store.getById('projects', req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  
  if (req.user.role === 'owner' && project.ownerId !== req.user.id) {
    return res.status(403).json({ error: '无权限导出此项目的施工日志' });
  }
  
  const phases = store.find('phases', p => p.projectId === project.id)
    .sort((a, b) => new Date(a.plannedStartDate) - new Date(b.plannedStartDate));
  
  const phaseIds = phases.map(p => p.id);
  const allRecords = store.find('progressRecords', r => phaseIds.includes(r.phaseId))
    .sort((a, b) => new Date(a.recordDate) - new Date(b.recordDate));
  
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
      taskName: task?.name || '',
      phaseName: phase?.name || '',
      reportedByName: reportedBy?.name || '',
      reportedByTeam: reportedBy?.team || '',
      photoCount: photos.length,
      photoUrls: photos.map(p => p.url).join(', ')
    });
  });
  
  const { format } = req.query;
  
  if (format === 'json') {
    const logData = {
      project: {
        name: project.name,
        description: project.description,
        location: project.location,
        plannedStartDate: project.plannedStartDate,
        plannedEndDate: project.plannedEndDate,
        manager: project.managerId ? store.getById('users', project.managerId)?.name : ''
      },
      phases: phases.map(p => ({
        name: p.name,
        description: p.description,
        plannedStartDate: p.plannedStartDate,
        plannedEndDate: p.plannedEndDate,
        actualStartDate: p.actualStartDate,
        actualEndDate: p.actualEndDate,
        progress: p.progress
      })),
      dailyLog: Object.keys(recordsByDate).sort().map(date => ({
        date,
        weather: recordsByDate[date][0]?.weather || '',
        totalWorkers: recordsByDate[date].reduce((sum, r) => sum + (parseInt(r.workers) || 0), 0),
        records: recordsByDate[date]
      }))
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="施工日志_${project.name}_${new Date().toISOString().split('T')[0]}.json"`);
    return res.json(logData);
  }
  
  const wb = XLSX.utils.book_new();
  
  const projectInfoData = [
    ['项目名称', project.name],
    ['项目描述', project.description || ''],
    ['项目地点', project.location || ''],
    ['计划开始日期', project.plannedStartDate],
    ['计划完成日期', project.plannedEndDate],
    ['项目经理', project.managerId ? store.getById('users', project.managerId)?.name : '']
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(projectInfoData);
  XLSX.utils.book_append_sheet(wb, ws1, '项目信息');
  
  const phaseData = [
    ['阶段名称', '描述', '计划开始', '计划完成', '实际开始', '实际完成', '进度(%)']
  ];
  phases.forEach(phase => {
    phaseData.push([
      phase.name,
      phase.description || '',
      phase.plannedStartDate,
      phase.plannedEndDate,
      phase.actualStartDate || '',
      phase.actualEndDate || '',
      phase.progress || 0
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(phaseData);
  XLSX.utils.book_append_sheet(wb, ws2, '施工阶段');
  
  const logData = [
    ['日期', '天气', '阶段', '任务', '施工内容', '进度(%)', '施工人数', '班组长', '班组', '照片数量', '照片链接', '备注']
  ];
  
  Object.keys(recordsByDate).sort().forEach(date => {
    const dayRecords = recordsByDate[date];
    dayRecords.forEach(record => {
      logData.push([
        date,
        record.weather || '',
        record.phaseName,
        record.taskName,
        record.workContent || '',
        record.progress,
        record.workers || 0,
        record.reportedByName,
        record.reportedByTeam,
        record.photoCount,
        record.photoUrls,
        record.notes || ''
      ]);
    });
  });
  
  const ws3 = XLSX.utils.aoa_to_sheet(logData);
  ws3['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 10 },
    { wch: 40 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, ws3, '施工日志');
  
  const notices = store.find('rectificationNotices', n => n.projectId === project.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  if (notices.length > 0) {
    const noticeData = [
      ['创建日期', '标题', '问题描述', '优先级', '截止日期', '状态', '创建人', '整改人', '整改回复', '整改日期', '审核结果', '审核意见']
    ];
    notices.forEach(notice => {
      noticeData.push([
        notice.createdAt.split('T')[0],
        notice.title,
        notice.description,
        notice.priority,
        notice.deadline || '',
        getStatusText(notice.status),
        notice.createdBy ? store.getById('users', notice.createdBy)?.name : '',
        notice.assigneeId ? store.getById('users', notice.assigneeId)?.name : '',
        notice.replyContent || '',
        notice.replyDate ? notice.replyDate.split('T')[0] : '',
        notice.reviewResult === 'pass' ? '通过' : notice.reviewResult === 'fail' ? '未通过' : '',
        notice.reviewComment || ''
      ]);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(noticeData);
    ws4['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 12 },
      { wch: 10 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws4, '整改记录');
  }
  
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `施工日志_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

function getStatusText(status) {
  const statusMap = {
    'pending': '待处理',
    'replied': '已回复',
    'approved': '已通过',
    'rejected': '未通过',
    'completed': '已完成'
  };
  return statusMap[status] || status;
}

module.exports = router;
