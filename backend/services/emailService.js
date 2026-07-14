const nodemailer = require('nodemailer');
const CompanySettings = require('../models/CompanySettings');
const { decrypt } = require('../utils/encryption');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const RENDER_SMTP_HINT =
  'Render blocks outbound Gmail SMTP (connection timeout). Use the Resend provider instead (HTTPS). Free signup: https://resend.com';

const sendViaResend = async ({ apiKey, from, to, subject, html }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], subject, html })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Resend failed with status ${response.status}`);
  }
  return { sent: true, messageId: data.id, provider: 'resend' };
};

const createGmailTransport = (user, pass, { port, secure }) =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: { minVersion: 'TLSv1.2' }
  });

const sendViaGmailSmtp = async ({ gmailUser, appPassword, fromName, message }) => {
  const attempts = [
    { port: 465, secure: true },
    { port: 587, secure: false }
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const transport = createGmailTransport(gmailUser, appPassword, attempt);
      await transport.verify();
      const info = await transport.sendMail({
        from: `"${fromName || 'ProjectFlow'}" <${gmailUser}>`,
        ...message
      });
      return { sent: true, messageId: info.messageId, provider: 'gmail' };
    } catch (error) {
      lastError = error;
      const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
      const isTimeout =
        text.includes('timeout') ||
        text.includes('timed out') ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ESOCKET' ||
        error.code === 'ECONNECTION';
      if (!isTimeout) {
        throw new Error(
          `Gmail login failed: ${error.response || error.message}. Use a 16-character Gmail App Password and enable 2-Step Verification.`
        );
      }
    }
  }

  throw new Error(
    `${RENDER_SMTP_HINT} (Last error: ${lastError?.message || 'connection timeout'})`
  );
};

const sendWithCompany = async (companyId, message) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  if (!settings?.email?.enabled) {
    return { skipped: true, reason: 'Email is disabled. Enable it in Settings and Save.' };
  }

  const fromName = settings.email.fromName || 'ProjectFlow';
  const provider = settings.email.provider || 'resend';

  if (provider === 'resend') {
    if (!settings.email.resendApiKeyEncrypted) {
      return {
        skipped: true,
        reason: 'Resend API key is missing. Paste it in Settings and Save.'
      };
    }
    if (!process.env.ENCRYPTION_KEY) {
      return {
        skipped: true,
        reason: 'ENCRYPTION_KEY is missing on the server (Render Environment).'
      };
    }

    let apiKey;
    try {
      apiKey = decrypt(settings.email.resendApiKeyEncrypted);
    } catch (_) {
      return {
        skipped: true,
        reason: 'Could not decrypt Resend API key. ENCRYPTION_KEY may have changed — paste the key again and Save.'
      };
    }

    const fromEmail = settings.email.fromEmail || 'onboarding@resend.dev';
    const from = `${fromName} <${fromEmail}>`;

    return sendViaResend({
      apiKey,
      from,
      to: message.to,
      subject: message.subject,
      html: message.html
    });
  }

  // Gmail SMTP (works locally; usually blocked on Render)
  if (!settings.email.gmailUser || !settings.email.appPasswordEncrypted) {
    return {
      skipped: true,
      reason: 'Gmail address or App Password is missing. Save Settings again, or switch provider to Resend.'
    };
  }
  if (!process.env.ENCRYPTION_KEY) {
    return {
      skipped: true,
      reason: 'ENCRYPTION_KEY is missing on the server (Render Environment).'
    };
  }

  let appPassword;
  try {
    appPassword = decrypt(settings.email.appPasswordEncrypted);
  } catch (_) {
    return {
      skipped: true,
      reason: 'Could not decrypt Gmail App Password. ENCRYPTION_KEY may have changed — paste App Password again and Save.'
    };
  }

  return sendViaGmailSmtp({
    gmailUser: settings.email.gmailUser,
    appPassword,
    fromName,
    message
  });
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
