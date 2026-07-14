import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Layers, ArrowRight, Building2, User, Lock, Mail } from 'lucide-react';

const InputField = ({ icon: Icon, type, placeholder, value, onChange, rightElement }) => (
  <div className="relative">
    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
      <Icon size={17} />
    </div>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      required
      className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-white/70 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
    />
    {rightElement && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
    )}
  </div>
);

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', companyName: '' });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(form.username, form.password);
        toast.success('Welcome back!');
      } else {
        if (!form.companyName.trim()) {
          toast.error('Company name is required');
          setLoading(false);
          return;
        }
        await register(form.username, form.email, form.password, form.companyName);
        toast.success('Account created! Welcome aboard.');
      }
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const eyeBtn = (
    <button type="button" onClick={() => setShowPass((v) => !v)} className="text-slate-400 hover:text-slate-600 transition">
      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl mb-4">
            <Layers size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ProjectFlow</h1>
          <p className="text-slate-400 mt-1 text-sm">Your work, organized beautifully</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8">
          {/* Tabs */}
          <div className="flex bg-white/10 rounded-xl p-1 mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === t
                    ? 'bg-white text-slate-800 shadow-md'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Get Started'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  Company Name
                </label>
                <InputField
                  icon={Building2}
                  type="text"
                  placeholder="e.g. Acme Corp"
                  value={form.companyName}
                  onChange={set('companyName')}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Username
              </label>
              <InputField
                icon={User}
                type="text"
                placeholder="Enter your username"
                value={form.username}
                onChange={set('username')}
              />
            </div>

            {tab === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <InputField
                  icon={Mail}
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={set('email')}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <InputField
                icon={Lock}
                type={showPass ? 'text' : 'password'}
                placeholder={tab === 'register' ? 'Min. 6 characters' : 'Enter your password'}
                value={form.password}
                onChange={set('password')}
                rightElement={eyeBtn}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/30 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {tab === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          {tab === 'register' && (
            <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
              First user for a company automatically becomes the <span className="text-indigo-400 font-medium">Admin</span>.
              Admins can then add more team members.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
