import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ArrowRight, User, Lock } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

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
      className="w-full pl-10 pr-10 py-3 rounded-xl border border-white/15 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-transparent transition"
    />
    {rightElement && (
      <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>
    )}
  </div>
);

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    username: '', email: '', password: '', companyName: '', role: 'admin',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Something went wrong');
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
    <div className="min-h-screen bg-brand-ink flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-brand-green/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-blue/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="text-center mb-8">
          <BrandLogo className="h-16 w-auto max-w-[340px] mx-auto mb-4" />
          <p className="text-brand-blue text-sm font-medium">Work, chat, and delivery — in one place</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8">
          <p className="text-center text-white font-semibold mb-6">Sign in</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <InputField
                icon={Lock}
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
                value={form.password}
                onChange={set('password')}
                rightElement={eyeBtn}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-green hover:bg-brand-greenDark text-brand-ink font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-brand-green/30 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
            This workspace is for Supporticon only. Ask your admin to create your account.
          </p>
        </div>
      </div>
    </div>
  );
}
