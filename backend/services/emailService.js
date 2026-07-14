const nodemailer = require('nodemailer');
const CompanySettings = require('../models/CompanySettings');
const { decrypt } = require('../utils/encryption');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const getMailer = async (companyId) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  if (!settings) {
    return { error: 'Save email settings first (Save Settings button).' };
  }
  if (!settings.email?.enabled) {
    return { error: 'Turn on "Enabled" under Gmail configuration, then Save Settings.' };
  }
  if (!settings.email.gmailUser) {
    return { error: 'Gmail address is missing. Save settings again.' };
  }
  if (!settings.email.appPasswordEncrypted) {
    return { error: 'Gmail App Password is missing. Paste it and Save Settings again.' };
  }
  if (!process.env.ENCRYPTION_KEY) {
    return { error: 'ENCRYPTION_KEY is missing on the server. Add it in Render Environment, then redeploy.' };
  }

  let appPassword;
  try {
    appPassword = decrypt(settings.email.appPasswordEncrypted);
  } catch (error) {
    return {
      error: 'Could not decrypt Gmail App Password. ENCRYPTION_KEY on Render may have changed — paste the App Password again and Save Settings.'
    };
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: settings.email.gmailUser,
      pass: appPassword
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2' }
  });

  return { transport, settings };
};

const sendWithCompany = async (companyId, message) => {
  const mailer = await getMailer(companyId);
  if (mailer.error) return { skipped: true, reason: mailer.error };
  if (!mailer.transport) return { skipped: true, reason: 'Email is not configured' };

  const { transport, settings } = mailer;

  try {
    await transport.verify();
  } catch (error) {
    const msg = error.response || error.message || 'SMTP connection failed';
    throw new Error(
      `Gmail login failed: ${msg}. Use a 16-character Gmail App Password (not your normal password), and make sure 2-Step Verification is on.`
    );
  }

  const info = await transport.sendMail({
    from: `"${settings.email.fromName || 'ProjectFlow'}" <${settings.email.gmailUser}>`,
    ...message
  });
  return { sent: true, messageId: info.messageId };
};

const sendAssignmentEmail = async ({ companyId, assignee, task, project, assignedBy }) => {
  if (!assignee?.email || assignee.emailNotifications === false) {
    return { skipped: true, reason: 'Recipient email unavailable or disabled' };
  }

  const settings = await CompanySettings.findOne({ company: companyId });
  if (!settings?.email?.assignmentEnabled) {
    return { skipped: true, reason: 'Assignment notifications disabled' };
  }

  return sendWithCompany(companyId, {
    to: assignee.email,
    subject: `New task assigned: ${task.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#4f46e5">New task assigned</h2>
        <p>Hello ${escapeHtml(assignee.username)},</p>
        <p><strong>${escapeHtml(assignedBy?.username || 'An administrator')}</strong>
          assigned you a task in <strong>${escapeHtml(project.title)}</strong>.</p>
        <div style="padding:16px;background:#f8fafc;border-radius:10px">
          <h3 style="margin-top:0">${escapeHtml(task.title)}</h3>
          <p>${escapeHtml(task.description || 'No description')}</p>
          <p><strong>Priority:</strong> ${escapeHtml(task.priority)}</p>
          <p><strong>Due date:</strong> ${task.dueDate
            ? new Date(task.dueDate).toLocaleDateString()
            : 'Not set'}</p>
        </div>
        <p>Please add a daily update until the task is completed.</p>
      </div>`
  });
};

const sendDigestEmail = async ({ companyId, recipient, companyName, localDate, rows }) => {
  if (!recipient?.email || recipient.emailNotifications === false) {
    return { skipped: true, reason: 'Recipient email unavailable or disabled' };
  }

  const tableRows = rows.map((row) => `
    <tr>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.task)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.project)}</td>
      <td style="padding:8px;border:1px solid #e2e8f0">${escapeHtml(row.status)}</td>
    </tr>`).join('');

  return sendWithCompany(companyId, {
    to: recipient.email,
    subject: `Daily task reminder — ${localDate}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto">
        <h2 style="color:#4f46e5">${escapeHtml(companyName)} daily task reminder</h2>
        <p>Hello ${escapeHtml(recipient.username)},</p>
        <p>These open tasks are assigned to you. Add today's progress update before completion.</p>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Task</th>
            <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Project</th>
            <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Today's update</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
  });
};

module.exports = { sendWithCompany, sendAssignmentEmail, sendDigestEmail };
