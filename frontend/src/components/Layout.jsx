import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import {
  LayoutDashboard, Users, FolderKanban, Plus, LogOut,
  ChevronRight, Layers, Menu, X, Building2, Briefcase, FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProjectModal from './ProjectModal';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/api/projects');
      setProjects(res.data);
    } catch (_) {}
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const handleProjectCreated = (proj) => {
    setProjects((p) => [proj, ...p]);
    navigate(`/kanban/${proj._id}`);
  };

  const avatar = user?.username?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        } transition-all duration-300 bg-gradient-to-b from-slate-900 to-indigo-950 flex flex-col flex-shrink-0 shadow-2xl`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
              <Layers size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">ProjectFlow</h1>
              <div className="flex items-center gap-1 text-indigo-300 text-xs">
                <Building2 size={10} />
                <span className="truncate max-w-[110px]">{user?.company?.name}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <LayoutDashboard size={17} />
            Dashboard
          </NavLink>

          {user?.role === 'admin' && (
            <>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Users size={17} />
                Team Members
              </NavLink>
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <FileSpreadsheet size={17} />
                Reports
              </NavLink>
            </>
          )}

          {/* Projects section */}
          <div className="pt-3">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Projects
              </span>
              {user?.role === 'admin' && (
                <button
                  onClick={() => setShowProjectModal(true)}
                  className="w-5 h-5 rounded-md bg-white/10 hover:bg-indigo-600 flex items-center justify-center text-slate-400 hover:text-white transition-all"
                  title="New project"
                >
                  <Plus size={13} />
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-4 px-2">
                <Briefcase size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">
                  {user?.role === 'admin' ? 'No projects yet' : 'No projects assigned to you'}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {projects.map((p) => (
                  <NavLink
                    key={p._id}
                    to={`/kanban/${p._id}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <FolderKanban size={15} className="flex-shrink-0" />
                    <span className="truncate flex-1">{p.title}</span>
                    <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition" />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.username}</p>
              <p className="text-indigo-300 text-xs capitalize">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors p-1"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-4 flex-shrink-0 shadow-sm">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-slate-500 hover:text-slate-700 transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Building2 size={14} />
            <span className="font-medium text-slate-700">{user?.company?.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet context={{ projects, setProjects, refetchProjects: fetchProjects }} />
        </main>
      </div>

      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
