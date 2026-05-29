import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import {
  Download, Users, FolderKanban, User, Calendar,
  FileSpreadsheet, Shield
} from 'lucide-react';

const REPORT_TYPES = [
  { id: 'users', label: 'All Users Summary', icon: Users, desc: 'Task counts per team member' },
  { id: 'projects', label: 'All Projects Summary', icon: FolderKanban, desc: 'Task breakdown per project' },
  { id: 'user', label: 'User Task Report', icon: User, desc: 'Detailed tasks for one user' },
  { id: 'project', label: 'Project Task Report', icon: FolderKanban, desc: 'Detailed tasks for one project' },
];

const PERIODS = [
  { id: 'all', label: 'All Time' },
  { id: 'weekly', label: 'This Week (last 7 days)' },
  { id: 'monthly', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
];

const downloadCsv = async (url, filename) => {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('users');
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/users').then((r) => setUsers(r.data)).catch(() => {});
    api.get('/api/projects').then((r) => setProjects(r.data)).catch(() => {});
  }, []);

  const buildQuery = () => {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    return params.toString();
  };

  const handleDownload = async () => {
    if (period === 'custom' && (!startDate || !endDate)) {
      toast.error('Please select start and end dates');
      return;
    }
    if (reportType === 'user' && !userId) {
      toast.error('Please select a user');
      return;
    }
    if (reportType === 'project' && !projectId) {
      toast.error('Please select a project');
      return;
    }

    setLoading(true);
    try {
      const q = buildQuery();
      let url;
      let filename;

      switch (reportType) {
        case 'users':
          url = `/api/reports/users?${q}`;
          filename = `users-report.csv`;
          break;
        case 'projects':
          url = `/api/reports/projects?${q}`;
          filename = `projects-report.csv`;
          break;
        case 'user': {
          const u = users.find((x) => x._id === userId);
          url = `/api/reports/user/${userId}?${q}`;
          filename = `user-${u?.username || 'report'}-tasks.csv`;
          break;
        }
        case 'project': {
          const p = projects.find((x) => x._id === projectId);
          url = `/api/reports/project/${projectId}?${q}`;
          filename = `project-${(p?.title || 'report').replace(/\s+/g, '-')}-tasks.csv`;
          break;
        }
        default:
          return;
      }

      await downloadCsv(url, filename);
      toast.success('Report downloaded!');
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          toast.error(json.message || 'Failed to download report');
        } catch {
          toast.error('Failed to download report');
        }
      } else {
        toast.error(err.response?.data?.message || 'Failed to download report');
      }
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <FileSpreadsheet size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Download Reports</h2>
            <p className="text-slate-500 text-sm">Export CSV data by user, project, or date range</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
        {/* Report type */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
            Report Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REPORT_TYPES.map((rt) => {
              const Icon = rt.icon;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => setReportType(rt.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    reportType === rt.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={16} className={reportType === rt.id ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className={`text-sm font-semibold ${reportType === rt.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {rt.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{rt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* User / Project selector */}
        {reportType === 'user' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Select User
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Choose a user…</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.username} ({u.role})</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'project' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Select Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date period */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide flex items-center gap-1">
            <Calendar size={12} /> Date Range
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  period === p.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-slate-200 text-slate-600 hover:border-indigo-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-all shadow-sm disabled:opacity-60"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Download size={18} />
                Download CSV Report
              </>
            )}
          </button>
          <p className="text-xs text-slate-400 text-center mt-3">
            Opens in Excel, Google Sheets, or any spreadsheet app
          </p>
        </div>
      </div>
    </div>
  );
}
