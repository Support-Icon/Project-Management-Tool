const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sanitizeHtml = (html) => String(html || '')
  .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  .replace(/\son\w+="[^"]*"/gi, '')
  .replace(/\son\w+='[^']*'/gi, '');

const applyVars = (template, vars) => {
  let out = String(template || '');
  Object.entries(vars).forEach(([key, value]) => {
    out = out.split(`{{${key}}}`).join(value == null ? '' : String(value));
  });
  return out;
};

const wrapShell = ({ brandColor, logoUrl, bodyHtml, footerText }) => {
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="max-height:48px;margin-bottom:12px" />`
    : '';
  return `
  <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:${escapeHtml(brandColor || '#4f46e5')};padding:20px 24px;color:#fff">
        ${logo}
        <div style="font-size:18px;font-weight:700;letter-spacing:0.2px">ProjectFlow</div>
      </div>
      <div style="padding:24px;color:#0f172a;line-height:1.55;font-size:14px">
        ${bodyHtml}
      </div>
      <div style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
        ${escapeHtml(footerText || 'Sent by ProjectFlow')}
      </div>
    </div>
  </div>`;
};

const defaultAssignmentBody = ({ username, assignedBy, projectTitle, taskTitle, taskDescription, priority, dueDate }) => `
  <h2 style="margin:0 0 12px;color:#0f172a">New task assigned</h2>
  <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
  <p><strong>${escapeHtml(assignedBy)}</strong> assigned you a task in <strong>${escapeHtml(projectTitle)}</strong>.</p>
  <div style="padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;margin:16px 0">
    <h3 style="margin:0 0 8px">${escapeHtml(taskTitle)}</h3>
    <p style="margin:0 0 8px">${escapeHtml(taskDescription || 'No description')}</p>
    <p style="margin:0"><strong>Priority:</strong> ${escapeHtml(priority)}</p>
    <p style="margin:6px 0 0"><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>
  </div>
  <p>Please add a daily update until the task is completed.</p>
`;

const defaultDigestBody = ({ username, companyName, localDate, rowsHtml }) => `
  <h2 style="margin:0 0 12px;color:#0f172a">${escapeHtml(companyName)} daily reminder</h2>
  <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
  <p>Open tasks for <strong>${escapeHtml(localDate)}</strong>. Add today's progress update before completion.</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr>
        <th style="padding:10px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc">Task</th>
        <th style="padding:10px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc">Project</th>
        <th style="padding:10px;border:1px solid #e2e8f0;text-align:left;background:#f8fafc">Today</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
`;

const renderAssignmentEmail = (settings, data) => {
  const tpl = settings?.emailTemplates || {};
  const brandColor = tpl.brandColor || '#4f46e5';
  const logoUrl = tpl.logoUrl || '';
  const footerText = tpl.footerText || 'Sent by ProjectFlow';
  const dueDate = data.task.dueDate
    ? new Date(data.task.dueDate).toLocaleDateString()
    : 'Not set';

  const vars = {
    username: escapeHtml(data.assignee.username),
    assignedBy: escapeHtml(data.assignedBy?.username || 'An administrator'),
    projectTitle: escapeHtml(data.project.title),
    taskTitle: escapeHtml(data.task.title),
    taskDescription: escapeHtml(data.task.description || 'No description'),
    priority: escapeHtml(data.task.priority),
    dueDate: escapeHtml(dueDate),
    brandColor: escapeHtml(brandColor),
    logoUrl: escapeHtml(logoUrl),
    companyName: escapeHtml(data.companyName || 'ProjectFlow')
  };

  const subject = tpl.assignmentSubject
    ? applyVars(tpl.assignmentSubject, {
      username: data.assignee.username,
      taskTitle: data.task.title,
      projectTitle: data.project.title
    })
    : `New task assigned: ${data.task.title}`;

  const body = tpl.assignmentHtml
    ? sanitizeHtml(applyVars(tpl.assignmentHtml, vars))
    : defaultAssignmentBody({
      username: data.assignee.username,
      assignedBy: data.assignedBy?.username || 'An administrator',
      projectTitle: data.project.title,
      taskTitle: data.task.title,
      taskDescription: data.task.description,
      priority: data.task.priority,
      dueDate
    });

  return {
    subject,
    html: wrapShell({ brandColor, logoUrl, bodyHtml: body, footerText })
  };
};

const renderDigestEmail = (settings, data) => {
  const tpl = settings?.emailTemplates || {};
  const brandColor = tpl.brandColor || '#4f46e5';
  const logoUrl = tpl.logoUrl || '';
  const footerText = tpl.footerText || 'Sent by ProjectFlow';

  const rowsHtml = data.rows.map((row) => `
    <tr>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.task)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.project)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.status)}</td>
    </tr>`).join('');

  const vars = {
    username: escapeHtml(data.recipient.username),
    companyName: escapeHtml(data.companyName),
    localDate: escapeHtml(data.localDate),
    taskRows: rowsHtml,
    brandColor: escapeHtml(brandColor),
    logoUrl: escapeHtml(logoUrl)
  };

  const subject = tpl.digestSubject
    ? applyVars(tpl.digestSubject, {
      username: data.recipient.username,
      companyName: data.companyName,
      localDate: data.localDate
    })
    : `Daily task reminder — ${data.localDate}`;

  const body = tpl.digestHtml
    ? sanitizeHtml(applyVars(tpl.digestHtml, vars))
    : defaultDigestBody({
      username: data.recipient.username,
      companyName: data.companyName,
      localDate: data.localDate,
      rowsHtml
    });

  return {
    subject,
    html: wrapShell({ brandColor, logoUrl, bodyHtml: body, footerText })
  };
};

module.exports = {
  escapeHtml,
  renderAssignmentEmail,
  renderDigestEmail,
  wrapShell
};
