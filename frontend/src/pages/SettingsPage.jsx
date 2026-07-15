import React, { useEffect, useState } from 'react';
import { Mail, Clock, ShieldCheck, Send, Save, Eye, EyeOff, Info, Trash2, Bot } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const timezones = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const sesRegions = [
  'ap-south-1',
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [testRecipient, setTestRecipient] = useState(user?.email || '');
  const [aiForm, setAiForm] = useState({
    enabled: false,
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    apiKey: '',
    hasApiKey: false,
    providers: [],
  });
  const [form, setForm] = useState({
    email: {
      enabled: false,
      provider: 'ses',
      gmailUser: '',
      fromEmail: '',
      appPassword: '',
      resendApiKey: '',
      sesAccessKeyId: '',
      sesSecretAccessKey: '',
      sesRegion: 'ap-south-1',
      hasAppPassword: false,
      hasResendApiKey: false,
      hasSesSecret: false,
      fromName: 'ProjectFlow',
      assignmentEnabled: true,
    },
    digest: {
      enabled: false,
      time: '10:00',
      timezone: 'Asia/Kolkata',
    },
    emailTemplates: {
      brandColor: '#4f46e5',
      logoUrl: '',
      assignmentSubject: '',
      assignmentHtml: '',
      digestSubject: '',
      digestHtml: '',
      footerText: 'Sent by ProjectFlow',
    },
  });

  useEffect(() => {
    Promise.all([
      api.get('/api/settings'),
      api.get('/api/ai/settings'),
    ])
      .then(([emailRes, aiRes]) => {
        setForm((current) => ({
          email: {
            ...current.email,
            ...emailRes.data.email,
            appPassword: '',
            resendApiKey: '',
            sesSecretAccessKey: '',
            provider: emailRes.data.email?.provider || 'ses',
          },
          digest: { ...current.digest, ...emailRes.data.digest },
          emailTemplates: { ...current.emailTemplates, ...emailRes.data.emailTemplates },
        }));
        setAiForm((current) => ({
          ...current,
          ...aiRes.data,
          apiKey: '',
        }));
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const updateEmail = (key, value) =>
    setForm((current) => ({ ...current, email: { ...current.email, [key]: value } }));
  const updateDigest = (key, value) =>
    setForm((current) => ({ ...current, digest: { ...current.digest, [key]: value } }));
  const updateTemplate = (key, value) =>
    setForm((current) => ({
      ...current,
      emailTemplates: { ...current.emailTemplates, [key]: value },
    }));
  const updateAi = (key, value) =>
    setAiForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/api/settings', form);
      setForm((current) => ({
        email: {
          ...current.email,
          ...res.data.email,
          appPassword: '',
          resendApiKey: '',
          sesSecretAccessKey: '',
        },
        digest: { ...current.digest, ...res.data.digest },
        emailTemplates: { ...current.emailTemplates, ...res.data.emailTemplates },
      }));
      toast.success('Email settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async () => {
    setSavingAi(true);
    try {
      const res = await api.put('/api/ai/settings', aiForm);
      setAiForm((current) => ({ ...current, ...res.data, apiKey: '' }));
      toast.success('AI settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save AI settings');
    } finally {
      setSavingAi(false);
    }
  };

  const deleteEmailConfig = async () => {
    if (!window.confirm('Delete all saved email service settings?')) return;
    setDeleting(true);
    try {
      const res = await api.delete('/api/settings/email');
      setForm({
        email: {
          enabled: false,
          provider: 'ses',
          gmailUser: '',
          fromEmail: '',
          appPassword: '',
          resendApiKey: '',
          sesAccessKeyId: '',
          sesSecretAccessKey: '',
          sesRegion: 'ap-south-1',
          hasAppPassword: false,
          hasResendApiKey: false,
          hasSesSecret: false,
          fromName: 'ProjectFlow',
          assignmentEnabled: true,
        },
        digest: {
          enabled: false,
          time: '10:00',
          timezone: 'Asia/Kolkata',
        },
      });
      toast.success(res.data.message || 'Email configuration deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete email settings');
    } finally {
      setDeleting(false);
    }
  };

  const sendTest = async () => {
    if (!testRecipient.trim()) {
      toast.error('Enter a test recipient email first');
      return;
    }
    if (!form.email.enabled) {
      toast.error('Enable email, save settings, then send a test');
      return;
    }
    if (form.email.provider === 'ses') {
      if (!form.email.fromEmail) {
        toast.error('Enter SES From email and Save Settings first');
        return;
      }
      if (!form.email.sesAccessKeyId || (!form.email.hasSesSecret && !form.email.sesSecretAccessKey)) {
        toast.error('Enter AWS Access Key + Secret and Save Settings first');
        return;
      }
    }
    if (form.email.provider === 'resend' && !form.email.hasResendApiKey && !form.email.resendApiKey) {
      toast.error('Enter Resend API key and click Save Settings first');
      return;
    }
    if (form.email.provider === 'gmail' && !form.email.hasAppPassword && !form.email.appPassword) {
      toast.error('Enter Gmail App Password and click Save Settings first');
      return;
    }

    setTesting(true);
    try {
      const res = await api.post(
        '/api/settings/test-email',
        { recipient: testRecipient.trim() },
        { timeout: 30000 }
      );
      toast.success(res.data.message);
    } catch (error) {
      const message =
        error.code === 'ECONNABORTED'
          ? 'Request timed out. Prefer AWS SES or Resend on Render (not Gmail SMTP).'
          : error.response?.data?.message
            || error.message
            || 'Test email failed';
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  if (user?.role !== 'admin') return null;
  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings…</div>;
  }

  const provider = form.email.provider;

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Email & Schedule Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Assignment alerts and daily task reminders via AWS SES, Resend, or Gmail.
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info size={18} className="flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p><strong>Recommended on Render: AWS SES</strong> (HTTPS — not blocked like Gmail SMTP).</p>
          <p>
            1) Verify From email / domain in AWS SES → 2) Create IAM user with
            <code className="mx-1 px-1 bg-white/70 rounded">ses:SendEmail</code> →
            3) Paste Access Key + Secret below → 4) Save &amp; Send test.
          </p>
          <p className="text-xs text-sky-800">
            Sandbox accounts can only send to verified recipient emails until you request production access.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-5">
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Email configuration</h3>
                <p className="text-xs text-slate-500 mt-1">Choose your mail provider</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={form.email.enabled}
                onChange={(e) => updateEmail('enabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              Enabled
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-2 mb-4">
            {[
              { id: 'ses', label: 'AWS SES' },
              { id: 'resend', label: 'Resend' },
              { id: 'gmail', label: 'Gmail SMTP' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => updateEmail('provider', option.id)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition ${
                  form.email.provider === option.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Sender name</span>
              <input
                value={form.email.fromName}
                onChange={(e) => updateEmail('fromName', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>

            {provider === 'ses' && (
              <>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">From email *</span>
                  <input
                    type="email"
                    value={form.email.fromEmail}
                    onChange={(e) => updateEmail('fromEmail', e.target.value)}
                    placeholder="noreply@supporticon.com"
                    required={form.email.enabled}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Must be a verified identity in AWS SES
                  </span>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">AWS Region</span>
                  <select
                    value={form.email.sesRegion}
                    onChange={(e) => updateEmail('sesRegion', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {sesRegions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">Access Key ID *</span>
                  <input
                    value={form.email.sesAccessKeyId}
                    onChange={(e) => updateEmail('sesAccessKeyId', e.target.value)}
                    placeholder="AKIA..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </label>
                <label className="sm:col-span-2 text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">
                    Secret Access Key {form.email.hasSesSecret && '(saved — leave blank to keep)'}
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.email.sesSecretAccessKey}
                      onChange={(e) => updateEmail('sesSecretAccessKey', e.target.value)}
                      placeholder={form.email.hasSesSecret ? '••••••••••••' : 'wJalrXUtnFEMI/...'}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-3.5 text-slate-400"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              </>
            )}

            {provider === 'resend' && (
              <>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">From email</span>
                  <input
                    type="email"
                    value={form.email.fromEmail}
                    onChange={(e) => updateEmail('fromEmail', e.target.value)}
                    placeholder="onboarding@resend.dev"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </label>
                <label className="sm:col-span-2 text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">
                    Resend API Key {form.email.hasResendApiKey && '(saved — leave blank to keep)'}
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.email.resendApiKey}
                      onChange={(e) => updateEmail('resendApiKey', e.target.value)}
                      placeholder={form.email.hasResendApiKey ? '••••••••••••' : 're_xxxxxxxx'}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-3.5 text-slate-400"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              </>
            )}

            {provider === 'gmail' && (
              <>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">Gmail address</span>
                  <input
                    type="email"
                    value={form.email.gmailUser}
                    onChange={(e) => updateEmail('gmailUser', e.target.value)}
                    placeholder="company@gmail.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </label>
                <label className="sm:col-span-2 text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">
                    Gmail App Password {form.email.hasAppPassword && '(saved — leave blank to keep)'}
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.email.appPassword}
                      onChange={(e) => updateEmail('appPassword', e.target.value)}
                      placeholder={form.email.hasAppPassword ? '•••• •••• •••• ••••' : '16-character app password'}
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-3.5 text-slate-400"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <span className="text-[11px] text-amber-600 mt-1 block">
                    Often blocked on Render. Prefer AWS SES.
                  </span>
                </label>
              </>
            )}
          </div>

          <label className="flex items-center gap-3 mt-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.email.assignmentEnabled}
              onChange={(e) => updateEmail('assignmentEnabled', e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            Send an email when a task is assigned or reassigned
          </label>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Daily reminder schedule</h3>
                <p className="text-xs text-slate-500 mt-1">Users receive open tasks + update status.</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                checked={form.digest.enabled}
                onChange={(e) => updateDigest('enabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              Enabled
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Send time</span>
              <input
                type="time"
                value={form.digest.time}
                onChange={(e) => updateDigest('time', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </label>
            <label className="text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Timezone</span>
              <select
                value={form.digest.timezone}
                onChange={(e) => updateDigest('timezone', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center">
              <Mail size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Email template design</h3>
              <p className="text-xs text-slate-500 mt-1">
                Brand color, logo image URL, and optional HTML. Use placeholders like
                {' '}&#123;&#123;username&#125;&#125;, &#123;&#123;taskTitle&#125;&#125;, &#123;&#123;projectTitle&#125;&#125;, &#123;&#123;dueDate&#125;&#125;, &#123;&#123;taskRows&#125;&#125;.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Brand color</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.emailTemplates.brandColor || '#4f46e5'}
                  onChange={(e) => updateTemplate('brandColor', e.target.value)}
                  className="h-11 w-14 rounded-lg border border-slate-200 p-1"
                />
                <input
                  value={form.emailTemplates.brandColor}
                  onChange={(e) => updateTemplate('brandColor', e.target.value)}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200"
                />
              </div>
            </label>
            <label className="text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Logo image URL</span>
              <input
                value={form.emailTemplates.logoUrl}
                onChange={(e) => updateTemplate('logoUrl', e.target.value)}
                placeholder="https://…/logo.png"
                className="w-full px-4 py-3 rounded-xl border border-slate-200"
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Footer text</span>
              <input
                value={form.emailTemplates.footerText}
                onChange={(e) => updateTemplate('footerText', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200"
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Assignment subject (optional)</span>
              <input
                value={form.emailTemplates.assignmentSubject}
                onChange={(e) => updateTemplate('assignmentSubject', e.target.value)}
                placeholder="New task: {{taskTitle}}"
                className="w-full px-4 py-3 rounded-xl border border-slate-200"
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Assignment HTML body (optional)</span>
              <textarea
                rows={5}
                value={form.emailTemplates.assignmentHtml}
                onChange={(e) => updateTemplate('assignmentHtml', e.target.value)}
                placeholder={'<h2>Hi {{username}}</h2><p>Task: <strong>{{taskTitle}}</strong></p>'}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-mono text-xs"
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Digest subject (optional)</span>
              <input
                value={form.emailTemplates.digestSubject}
                onChange={(e) => updateTemplate('digestSubject', e.target.value)}
                placeholder="Daily reminder — {{localDate}}"
                className="w-full px-4 py-3 rounded-xl border border-slate-200"
              />
            </label>
            <label className="sm:col-span-2 text-sm text-slate-600">
              <span className="block text-xs font-semibold uppercase mb-1.5">Digest HTML body (optional)</span>
              <textarea
                rows={5}
                value={form.emailTemplates.digestHtml}
                onChange={(e) => updateTemplate('digestHtml', e.target.value)}
                placeholder={'<p>Hello {{username}}</p><table>{{taskRows}}</table>'}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-mono text-xs"
              />
            </label>
          </div>
        </section>

        <section className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold mb-3">
            <ShieldCheck size={18} /> Test configuration
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="test@example.com"
              className="flex-1 px-4 py-2.5 rounded-xl border border-emerald-200 outline-none"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Send size={16} /> {testing ? 'Sending…' : 'Send test'}
            </button>
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save size={17} /> {saving ? 'Saving…' : 'Save Email Settings'}
          </button>
          <button
            type="button"
            onClick={deleteEmailConfig}
            disabled={deleting}
            className="px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete Email Config'}
          </button>
        </div>
      </form>

      <section className="mt-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">AI Assistant (LangGraph)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Chatbot for assign tasks, daily reports, create projects. Admin sees team reports; members see personal reports.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={aiForm.enabled}
              onChange={(e) => updateAi('enabled', e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            Enabled
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm text-slate-600">
            <span className="block text-xs font-semibold uppercase mb-1.5">Provider</span>
            <select
              value={aiForm.provider}
              onChange={(e) => {
                const provider = e.target.value;
                const found = (aiForm.providers || []).find((p) => p.id === provider);
                setAiForm((current) => ({
                  ...current,
                  provider,
                  model: found?.defaultModel || current.model,
                }));
              }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white"
            >
              {(aiForm.providers?.length
                ? aiForm.providers
                : [
                  { id: 'groq', label: 'Groq' },
                  { id: 'openai', label: 'OpenAI' },
                  { id: 'gemini', label: 'Gemini' },
                  { id: 'claude', label: 'Claude' },
                ]
              ).map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <span className="block text-xs font-semibold uppercase mb-1.5">Model</span>
            <input
              value={aiForm.model}
              onChange={(e) => updateAi('model', e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200"
            />
          </label>
          <label className="sm:col-span-2 text-sm text-slate-600">
            <span className="block text-xs font-semibold uppercase mb-1.5">
              API Key {aiForm.hasApiKey && '(saved — leave blank to keep)'}
            </span>
            <div className="relative">
              <input
                type={showAiKey ? 'text' : 'password'}
                value={aiForm.apiKey}
                onChange={(e) => updateAi('apiKey', e.target.value)}
                placeholder={aiForm.hasApiKey ? '••••••••••••' : 'Paste provider API key'}
                className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200"
              />
              <button
                type="button"
                onClick={() => setShowAiKey((v) => !v)}
                className="absolute right-3 top-3.5 text-slate-400"
              >
                {showAiKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-5">
          <button
            type="button"
            onClick={saveAi}
            disabled={savingAi}
            className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save size={17} /> {savingAi ? 'Saving…' : 'Save AI Settings'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Clear AI configuration?')) return;
              try {
                const res = await api.delete('/api/ai/settings');
                setAiForm((current) => ({ ...current, ...res.data, apiKey: '' }));
                toast.success('AI configuration cleared');
              } catch (error) {
                toast.error(error.response?.data?.message || 'Failed to clear AI settings');
              }
            }}
            className="px-4 py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Delete AI Config
          </button>
        </div>
      </section>
    </div>
  );
}
