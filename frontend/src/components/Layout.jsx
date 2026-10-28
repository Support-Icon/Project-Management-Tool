import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { withMineOnly } from '../utils/apiQuery';
import {
  LayoutDashboard, Users, FolderKanban, Plus, LogOut,
  ChevronRight, Menu, X, Building2, Briefcase, FileSpreadsheet, UserCheck,
  BarChart3, Settings, Bot, MessageSquare, CalendarDays, Video, Palmtree
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProjectModal from './ProjectModal';
import AiChatWidget from './AiChatWidget';
import NotificationBell from './NotificationBell';
import DayStatusBar from './DayStatusBar';
import BrandLogo from './BrandLogo';
import { canSeeAll, canManageUsers, canViewTeamAnalytics, ROLE_LABELS } from '../utils/roles';
import { useNotifications } from '../context/NotificationContext';

export default function Layout() {
  const { user, logout, adminMineOnly, toggleAdminMineOnly } = useAuth();
  const isAdmin = canSeeAll(user);
  const canManage = canManageUsers(user);
  const canLead = canViewTeamAnalytics(user);
  const { unreadMessages } = useNotifications() || {};
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  const closeMobileNav = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
  };

  const fetchProjects = async () => {
    try {
      const res = await api.get(`/api/projects${withMineOnly(isAdmin, adminMineOnly)}`);
      setProjects(res.data);
    } catch (_) {}
  };

  useEffect(() => { fetchProjects(); }, [isAdmin, adminMineOnly]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-brand-green text-brand-ink shadow-lg shadow-brand-green/20'
        : 'text-slate-400 hover:bg-white/10 hover:text-white'
    }`;

  const inMeetRoom = /^\/meet\/[^/]+$/.test(location.pathname);
  const fillPage = location.pathname.startsWith('/messages') || location.pathname.startsWith('/kanban');

  const projectsNav = canLead && (
    <div className="pt-2 pb-2">
      <div className="flex items-center justify-between px-3 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Projects
        </span>
        {isAdmin && (
          <button
            onClick={() => setShowProjectModal(true)}
            className="w-5 h-5 rounded-md bg-white/10 hover:bg-brand-green hover:text-brand-ink flex items-center justify-center text-slate-400 transition-all"
            title="New project"
          >
            <Plus size={13} />
          </button>
        )}
      </div>
      {projects.length === 0 ? (
        <div className="text-center py-3 px-2">
          <Briefcase size={22} className="text-slate-600 mx-auto mb-1" />
          <p className="text-xs text-slate-500">
            {canManage ? 'No projects yet' : 'No projects assigned'}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {projects.map((p) => (
            <NavLink
              key={p._id}
              to={`/kanban/${p._id}`}
              onClick={closeMobileNav}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group ${
                  isActive
                    ? 'bg-brand-green text-brand-ink'
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
  );

  if (inMeetRoom) {
    return (
      <>
        <Outlet context={{ projects, setProjects, refetchProjects: fetchProjects }} />
        {showProjectModal && (
          <ProjectModal
            onClose={() => setShowProjectModal(false)}
            onCreated={handleProjectCreated}
          />
        )}
      </>
    );
  }
  const tabClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
      isActive ? 'text-brand-green' : 'text-slate-400'
    }`;

  return (
    <div className="flex h-screen bg-[#eef3f0] overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-brand-ink shadow-2xl transition-transform duration-300 w-64
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${!sidebarOpen ? 'md:w-0 md:overflow-hidden' : ''}
        `}
      >
        <div className="p-4 border-b border-white/10 flex items-start justify-between gap-2">
          <div>
            <BrandLogo className="h-9 w-auto max-w-[200px]" />
            <div className="flex items-center gap-1 text-brand-blue text-xs mt-2 px-0.5">
              <Building2 size={10} />
              <span className="truncate max-w-[200px]">{user?.company?.name}</span>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden text-slate-400 p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin space-y-1">
          <NavLink to="/" end className={navClass} onClick={closeMobileNav}>
            <LayoutDashboard size={17} />
            Dashboard
          </NavLink>
          {projectsNav}
          <NavLink to="/ai-chat" className={navClass} onClick={closeMobileNav}>
            <Bot size={17} />
            AI Chat
          </NavLink>
          <NavLink to="/messages" className={navClass} onClick={closeMobileNav}>
            <MessageSquare size={17} />
            <span className="flex-1">Messages</span>
            {unreadMessages > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-bold flex items-center justify-center">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </NavLink>
          <NavLink to="/meet" className={navClass} onClick={closeMobileNav}>
            <Video size={17} />
            Live Meet
          </NavLink>
          <NavLink to="/leaves" className={navClass} onClick={closeMobileNav}>
            <Palmtree size={17} />
            Leave
          </NavLink>
          <NavLink to="/analytics" className={navClass} onClick={closeMobileNav}>
            <BarChart3 size={17} />
            Analytics
          </NavLink>

          {canLead && (
            <NavLink to="/attendance" className={navClass} onClick={closeMobileNav}>
              <CalendarDays size={17} />
              Attendance
            </NavLink>
          )}
          {canLead && (
            <NavLink to="/team-work" className={navClass} onClick={closeMobileNav}>
              <Users size={17} />
              Team Work
            </NavLink>
          )}
          {canManage && (
            <NavLink to="/users" className={navClass} onClick={closeMobileNav}>
              <Users size={17} />
              Team Members
            </NavLink>
          )}
          {isAdmin && (
            <>
              <NavLink to="/reports" className={navClass} onClick={closeMobileNav}>
                <FileSpreadsheet size={17} />
                Reports
              </NavLink>
              <NavLink to="/settings" className={navClass} onClick={closeMobileNav}>
                <Settings size={17} />
                Settings
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-xl bg-brand-green text-brand-ink flex items-center justify-center font-bold text-sm flex-shrink-0">
              {avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.username}</p>
              <p className="text-brand-blue text-xs">{ROLE_LABELS[user?.role] || user?.role}</p>
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

      <div className="flex-1 flex flex-col min-w-0">
        {!inMeetRoom && (
          <header className="h-14 bg-white border-b border-slate-200 flex items-center px-3 sm:px-4 gap-2 sm:gap-4 flex-shrink-0 shadow-sm">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-slate-500 hover:text-slate-700 transition-colors p-1"
              aria-label="Toggle menu"
            >
              {sidebarOpen
                ? <X size={20} className="hidden md:block" />
                : <Menu size={20} className="hidden md:block" />}
              <Menu size={20} className="md:hidden" />
            </button>
            <div className="flex-1 min-w-0 overflow-x-auto">
              <DayStatusBar />
            </div>
            <NotificationBell />
            {isAdmin && (
              <button
                type="button"
                onClick={toggleAdminMineOnly}
                className={`hidden sm:flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  adminMineOnly
                    ? 'bg-brand-green text-brand-ink border-brand-green shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-brand-green hover:text-brand-greenDark'
                }`}
                title={adminMineOnly ? 'Showing only your tasks — click for all tasks' : 'Show only tasks assigned to you'}
              >
                <UserCheck size={16} />
                <span className="hidden lg:inline">{adminMineOnly ? 'My Tasks' : 'My Tasks Only'}</span>
              </button>
            )}
            <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500">
              <Building2 size={14} />
              <span className="font-medium text-slate-700">{user?.company?.name}</span>
            </div>
          </header>
        )}

        <main className={`flex-1 min-h-0 ${inMeetRoom ? 'overflow-hidden' : fillPage ? 'overflow-hidden pb-16 md:pb-0' : 'overflow-auto pb-16 md:pb-0'}`}>
          <Outlet context={{ projects, setProjects, refetchProjects: fetchProjects }} />
        </main>
      </div>

      {!inMeetRoom && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-brand-ink border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 h-14">
            <NavLink to="/" end className={tabClass}>
              <LayoutDashboard size={18} />
              Home
            </NavLink>
            <NavLink to="/messages" className={tabClass}>
              <span className="relative">
                <MessageSquare size={18} />
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </span>
              Chat
            </NavLink>
            <NavLink to="/meet" className={tabClass}>
              <Video size={18} />
              Meet
            </NavLink>
            <NavLink to="/leaves" className={tabClass}>
              <Palmtree size={18} />
              Leave
            </NavLink>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-slate-400"
            >
              <Menu size={18} />
              Menu
            </button>
          </div>
        </nav>
      )}

      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreated={handleProjectCreated}
        />
      )}

      <AiChatWidget />
    </div>
  );
}
