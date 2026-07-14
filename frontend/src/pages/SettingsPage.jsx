import React, { useEffect, useState } from 'react';
import { Mail, Clock, ShieldCheck, Send, Save, Eye, EyeOff, Info } from 'lucide-react';
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

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testRecipient, setTestRecipient] = useState(user?.email || '');
  const [form, setForm] = useState({
    email: {
      enabled: false,
      provider: 'resend',
      gmailUser: '',
      fromEmail: '',
      appPassword: '',
      resendApiKey: '',
      hasAppPassword: false,
      hasResendApiKey: false,
      fromName: 'ProjectFlow',
      assignmentEnabled: true,
    },
    digest: {
      enabled: false,
      time: '10:00',
      timezone: 'Asia/Kolkata',
    },
  });

  useEffect(() => {
    api.get('/api/settings')
      .then((res) => setForm((current) => ({
        email: {
          ...current.email,
          ...res.data.email,
          appPassword: '',
          resendApiKey: '',
          provider: res.data.email?.provider || 'resend',
        },
        digest: { ...current.digest, ...res.data.digest },
      })))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const updateEmail = (key, value) =>
    setForm((current) => ({ ...current, email: { ...current.email, [key]: value } }));
  const updateDigest = (key, value) =>
    setForm((current) => ({ ...current, digest: { ...current.digest, [key]: value } }));

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
        },
        digest: { ...current.digest, ...res.data.digest },
      }));
      toast.success('Email settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
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
          ? 'Request timed out. On Render, use Resend (not Gmail SMTP).'
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

  const usingResend = form.email.provider === 'resend';

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Email & Schedule Settings</h2>
        <p className="text-sm text-slate-500 mt-1">
          Assignment alerts and daily task reminders.
        </p>
      </div>

      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Info size={18} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong>Render blocks Gmail SMTP</strong> (that’s why you saw Connection timeout).
          Use <strong>Resend</strong> for production emails — it works over HTTPS.
          Sign up free at{' '}
          <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline font-semibold">
            resend.com
          </a>
          , create an API key, then paste it below.
        </p>
      </div>

      <form onSubmit={save} className="space-y-5">
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Email configuration</h3>
                <p className="text-xs text-slate-500 mt-1">Choose Resend for GitHub Pages + Render.</p>
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

          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { id: 'resend', label: 'Resend (recommended on Render)' },
              { id: 'gmail', label: 'Gmail SMTP (local only)' },
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

            {usingResend ? (
              <>
                <label className="text-sm text-slate-600">
                  <span className="block text-xs font-semibold uppercase mb-1.5">
                    From email (optional)
                  </span>
                  <input
                    type="email"
                    value={form.email.fromEmail}
                    onChange={(e) => updateEmail('fromEmail', e.target.value)}
                    placeholder="onboarding@resend.dev"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Leave blank to use onboarding@resend.dev for testing. For custom Gmail-looking from address, verify a domain in Resend.
                  </span>
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
            ) : (
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
                    Usually blocked on Render. Prefer Resend for your live site.
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

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Save size={17} /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
