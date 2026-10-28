import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { withMineOnly } from '../utils/apiQuery';
import { canSeeAll, canManageUsers } from '../utils/roles';
import {
  Plus, FolderKanban, Users, CheckSquare, TrendingUp,
  Calendar, ArrowRight, Trash2, MoreVertical, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProjectModal from '../components/ProjectModal';
import PageLoader from '../components/PageLoader';
import PersonName from '../components/PersonName';

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
  const isAdmin = canSeeAll(user);
  const canManage = canManageUsers(user);
  const navigate = useNavigate();
  const { projects, setProjects, projectsReady } = useOutletContext();
  const [taskStats, setTaskStats] = useState({ total: 0, done: 0 });
  const [userCount, setUserCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [pendingUpdates, setPendingUpdates] = useState({ date: '', tasks: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [pendingRes, statsRes, usersRes] = await Promise.all([
          api.get('/api/task-updates/pending/mine'),
          api.get(`/api/tasks/summary${withMineOnly(isAdmin, adminMineOnly)}`),
          canManage ? api.get('/api/users') : Promise.resolve({ data: [] }),
        ]);
        setPendingUpdates(pendingRes.data);
        setTaskStats({ total: statsRes.data.total || 0, done: statsRes.data.done || 0 });
        if (canManage) setUserCount(usersRes.data.length);
      } catch (_) {}
      finally { setReady(true); }
    };
    fetchStats();
  }, [user, isAdmin, adminMineOnly, canManage]);

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

  if (!ready || !projectsReady) return <PageLoader label="Loading dashboard…" />;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">
          <span className="inline-flex items-center gap-3">
            {greeting()}, <PersonName user={user} size={32} nameClassName="font-bold" /> 👋
          </span>
        </h2>
        <p className="text-slate-500 mt-1">Here's what's happening at <span className="font-semibold text-brand-blue">{user?.company?.name}</span> today.</p>
      </div>

      {canManage && userCount <= 1 && (
        <div className="mb-6 bg-brand-green/10 border border-brand-green/30 rounded-2xl p-5">
          <h3 className="font-bold text-brand-ink">Set up Manager and Team Lead</h3>
          <p className="text-sm text-brand-ink mt-1">
            Next, add the other roles from Team Members: <strong>Admin</strong>, <strong>Manager</strong>,
            and <strong>Team Lead</strong>. Managers see everyone’s work; team leads see only their members.
          </p>
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="mt-3 px-4 py-2 rounded-xl bg-brand-ink text-white text-sm font-semibold"
          >
            Add Manager / Team Lead
          </button>
        </div>
      )}

      {pendingUpdates.tasks.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Activity size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-amber-900">
                {pendingUpdates.tasks.length} daily update{pendingUpdates.tasks.length !== 1 ? 's' : ''} pending
              </h3>
              <p className="text-xs text-amber-700 mt-1">
                Add today’s progress before completing your assigned tasks.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {pendingUpdates.tasks.slice(0, 5).map((task) => (
                  <button
                    key={task._id}
                    onClick={() => navigate(`/kanban/${task.project._id}`)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-amber-800 hover:border-amber-400"
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FolderKanban} label="Total Projects" value={projects.length} color="text-brand-blue" bg="bg-brand-green/10" />
        <StatCard icon={CheckSquare} label="Total Tasks" value={taskStats.total} color="text-brand-blue" bg="bg-brand-blue/10" />
        <StatCard icon={TrendingUp} label="Completed" value={taskStats.done} color="text-emerald-600" bg="bg-emerald-50" />
        {canManage && (
          <StatCard icon={Users} label="Team Members" value={userCount} color="text-amber-600" bg="bg-amber-50" />
        )}
      </div>

      {/* Progress bar */}
      {taskStats.total > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Overall Progress</p>
            <span className="text-sm font-bold text-brand-blue">{completionPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-ink to-brand-blue rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {taskStats.done} of {taskStats.total} tasks completed
            {isAdmin && !adminMineOnly ? ' across all projects' : ' (your assigned tasks)'}
          </p>
        </div>
      )}

      {/* Projects grid */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">Projects</h3>
        {canManage && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-brand-ink hover:bg-black text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow-md"
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
            {canManage ? 'No projects yet' : 'No projects assigned to you'}
          </h4>
          <p className="text-slate-400 text-sm mb-4">
            {canManage
              ? 'Create your first project to get started'
              : 'Ask your admin to assign you tasks in a project'}
          </p>
          {canManage && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 bg-brand-ink hover:bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
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
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-brand-green cursor-pointer transition-all group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-ink to-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm">
                  <FolderKanban size={18} className="text-white" />
                </div>
                {canManage && (
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
                <span className="flex items-center gap-1 text-xs font-medium text-brand-blue group-hover:gap-2 transition-all">
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
