import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { withMineOnly } from '../utils/apiQuery';
import {
  Plus, FolderKanban, Users, CheckSquare, TrendingUp,
  Calendar, ArrowRight, Trash2, MoreVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProjectModal from '../components/ProjectModal';

const StatCard = ({ icon: Icon, label, value, color, bg }) => (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
    <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={22} className={color} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const { user, adminMineOnly } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const { projects, setProjects, refetchProjects } = useOutletContext();
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 });
  const [userCount, setUserCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (user?.role === 'admin') {
          const usersRes = await api.get('/api/users');
          setUserCount(usersRes.data.length);
        }

        if (projects.length > 0) {
          let total = 0, done = 0;
          await Promise.all(
            projects.map(async (p) => {
              const res = await api.get(`/api/tasks/${p._id}${withMineOnly(isAdmin, adminMineOnly)}`);
              total += res.data.length;
              done += res.data.filter((t) => t.column === 'done').length;
            })
          );
          setTaskStats({ total, done });
        }
      } catch (_) {}
    };
    fetchStats();
  }, [projects, user, isAdmin, adminMineOnly]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project and all its tasks?')) return;
    try {
      await api.delete(`/api/projects/${id}`);
      setProjects((p) => p.filter((pr) => pr._id !== id));
      toast.success('Project deleted');
    } catch (_) {
      toast.error('Failed to delete project');
    }
    setMenuOpen(null);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const completionPct = taskStats.total > 0
    ? Math.round((taskStats.done / taskStats.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">
          {greeting()}, {user?.username} 👋
        </h2>
        <p className="text-slate-500 mt-1">Here's what's happening at <span className="font-semibold text-indigo-600">{user?.company?.name}</span> today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FolderKanban} label="Total Projects" value={projects.length} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard icon={CheckSquare} label="Total Tasks" value={taskStats.total} color="text-violet-600" bg="bg-violet-50" />
        <StatCard icon={TrendingUp} label="Completed" value={taskStats.done} color="text-emerald-600" bg="bg-emerald-50" />
        {user?.role === 'admin' && (
          <StatCard icon={Users} label="Team Members" value={userCount} color="text-amber-600" bg="bg-amber-50" />
        )}
      </div>

      {/* Progress bar */}
      {taskStats.total > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Overall Progress</p>
            <span className="text-sm font-bold text-indigo-600">{completionPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {taskStats.done} of {taskStats.total} tasks completed
            {user?.role === 'admin' && !adminMineOnly ? ' across all projects' : ' (your assigned tasks)'}
          </p>
        </div>
      )}

      {/* Projects grid */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">Projects</h3>
        {user?.role === 'admin' && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md"
          >
            <Plus size={16} />
            New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <FolderKanban size={40} className="text-slate-300 mx-auto mb-3" />
          <h4 className="text-slate-600 font-semibold mb-1">
            {user?.role === 'admin' ? 'No projects yet' : 'No projects assigned to you'}
          </h4>
          <p className="text-slate-400 text-sm mb-4">
            {user?.role === 'admin'
              ? 'Create your first project to get started'
              : 'Ask your admin to assign you tasks in a project'}
          </p>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
            >
              <Plus size={16} /> Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p._id}
              onClick={() => navigate(`/kanban/${p._id}`)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <FolderKanban size={18} className="text-white" />
                </div>
                {user?.role === 'admin' && (
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p._id ? null : p._id); }}
                      className="text-slate-300 hover:text-slate-600 transition-colors p-1"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === p._id && (
                      <div className="absolute right-0 top-7 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-10 w-36">
                        <button
                          onClick={(e) => handleDelete(e, p._id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <h4 className="font-bold text-slate-800 mb-1">{p.title}</h4>
              <p className="text-slate-500 text-xs mb-4 line-clamp-2">
                {p.description || 'No description'}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={12} />
                  {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 group-hover:gap-2 transition-all">
                  Open <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ProjectModal
          onClose={() => setShowModal(false)}
          onCreated={(proj) => {
            setProjects((p) => [proj, ...p]);
            navigate(`/kanban/${proj._id}`);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
