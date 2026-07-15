const nodemailer = require('nodemailer');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const CompanySettings = require('../models/CompanySettings');
const { decrypt } = require('../utils/encryption');
const { renderAssignmentEmail, renderDigestEmail } = require('../utils/emailTemplates');

const RENDER_SMTP_HINT =
  'Render blocks outbound Gmail SMTP. Use AWS SES or Resend (HTTPS providers).';

const sendViaSes = async ({
  accessKeyId,
  secretAccessKey,
  region,
  fromEmail,
  fromName,
  to,
  subject,
  html
}) => {
  if (!fromEmail) {
    throw new Error('SES From email is required. Use a verified identity in AWS SES (email or domain).');
  }

  const client = new SESClient({
    region: region || 'ap-south-1',
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  const source = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  try {
    const result = await client.send(new SendEmailCommand({
      Source: source,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' }
        }
      }
    }));
    return { sent: true, messageId: result.MessageId, provider: 'ses' };
  } catch (error) {
    const msg = error.message || String(error);
    if (/not verified|Email address is not verified|MessageRejected/i.test(msg)) {
      throw new Error(
        `AWS SES rejected the send: ${msg}. ` +
        'Verify the From email (or domain) in AWS SES console, and if your account is still in Sandbox, ' +
        'verify the recipient email too (or request production access).'
      );
    }
    throw new Error(`AWS SES failed: ${msg}`);
  }
};

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
    const raw = data?.message || `Resend failed with status ${response.status}`;
    if (/only send testing emails to your own email/i.test(raw) || /verify a domain/i.test(raw)) {
      throw new Error(
        'Resend test mode can only send to your Resend account email. ' +
        'Verify your domain at https://resend.com/domains, set From email to an address on that domain, then Save.'
      );
    }
    throw new Error(raw);
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
          `Gmail login failed: ${error.response || error.message}. Use a 16-character Gmail App Password.`
        );
      }
    }
  }

  throw new Error(`${RENDER_SMTP_HINT} (Last error: ${lastError?.message || 'connection timeout'})`);
};

const requireEncryption = () => {
  if (!process.env.ENCRYPTION_KEY) {
    return 'ENCRYPTION_KEY is missing on the server (Render Environment).';
  }
  return null;
};

const sendWithCompany = async (companyId, message) => {
  const settings = await CompanySettings.findOne({ company: companyId });
  if (!settings?.email?.enabled) {
    return { skipped: true, reason: 'Email is disabled. Enable it in Settings and Save.' };
  }

  const fromName = settings.email.fromName || 'ProjectFlow';
  const provider = settings.email.provider || 'ses';
  const encError = requireEncryption();

  if (provider === 'ses') {
    if (encError) return { skipped: true, reason: encError };
    if (!settings.email.sesAccessKeyId || !settings.email.sesSecretAccessKeyEncrypted) {
      return {
        skipped: true,
        reason: 'AWS SES Access Key / Secret Key missing. Paste them in Settings and Save.'
      };
    }
    if (!settings.email.fromEmail) {
      return {
        skipped: true,
        reason: 'SES From email is required (must be verified in AWS SES).'
      };
    }

    let secretAccessKey;
    try {
      secretAccessKey = decrypt(settings.email.sesSecretAccessKeyEncrypted);
    } catch (_) {
      return {
        skipped: true,
        reason: 'Could not decrypt SES secret. ENCRYPTION_KEY may have changed — paste secret again and Save.'
      };
    }

    return sendViaSes({
      accessKeyId: settings.email.sesAccessKeyId,
      secretAccessKey,
      region: settings.email.sesRegion || 'ap-south-1',
      fromEmail: settings.email.fromEmail,
      fromName,
      to: message.to,
      subject: message.subject,
      html: message.html
    });
  }

  if (provider === 'resend') {
    if (encError) return { skipped: true, reason: encError };
    if (!settings.email.resendApiKeyEncrypted) {
      return { skipped: true, reason: 'Resend API key is missing. Paste it in Settings and Save.' };
    }

    let apiKey;
    try {
      apiKey = decrypt(settings.email.resendApiKeyEncrypted);
    } catch (_) {
      return {
        skipped: true,
        reason: 'Could not decrypt Resend API key. ENCRYPTION_KEY may have changed — paste key again and Save.'
      };
    }

    const fromEmail = settings.email.fromEmail || 'onboarding@resend.dev';
    return sendViaResend({
      apiKey,
      from: `${fromName} <${fromEmail}>`,
      to: message.to,
      subject: message.subject,
      html: message.html
    });
  }

  // Gmail SMTP
  if (!settings.email.gmailUser || !settings.email.appPasswordEncrypted) {
    return {
      skipped: true,
      reason: 'Gmail address or App Password is missing. Prefer AWS SES on Render.'
    };
  }
  if (encError) return { skipped: true, reason: encError };

  let appPassword;
  try {
    appPassword = decrypt(settings.email.appPasswordEncrypted);
  } catch (_) {
    return {
      skipped: true,
      reason: 'Could not decrypt Gmail App Password. Paste it again and Save.'
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

  const rendered = renderAssignmentEmail(settings, {
    assignee,
    task,
    project,
    assignedBy,
    companyName: 'ProjectFlow'
  });

  return sendWithCompany(companyId, {
    to: assignee.email,
    subject: rendered.subject,
    html: rendered.html
  });
};

const sendDigestEmail = async ({ companyId, recipient, companyName, localDate, rows }) => {
  if (!recipient?.email || recipient.emailNotifications === false) {
    return { skipped: true, reason: 'Recipient email unavailable or disabled' };
  }

  const settings = await CompanySettings.findOne({ company: companyId });
  const rendered = renderDigestEmail(settings, {
    recipient,
    companyName,
    localDate,
    rows
  });

  return sendWithCompany(companyId, {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html
  });
};

module.exports = { sendWithCompany, sendAssignmentEmail, sendDigestEmail };
