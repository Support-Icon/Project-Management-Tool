import React, { useState } from 'react';
import { useNavigate, useOutletContext, Navigate } from 'react-router-dom';
import { FolderKanban, Plus, Calendar, ArrowRight, Trash2, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canViewTeamAnalytics, canManageUsers, canSeeAll } from '../utils/roles';
import ProjectModal from '../components/ProjectModal';
import PageLoader from '../components/PageLoader';

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { projects, setProjects, projectsReady } = useOutletContext();
  const canLead = canViewTeamAnalytics(user);
  const canManage = canManageUsers(user);
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);

  if (!canLead) return <Navigate to="/" replace />;
  if (!projectsReady) return <PageLoader label="Loading projects…" />;

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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-brand-ink flex items-center gap-2">
            <FolderKanban size={22} className="text-brand-green" /> Projects
          </h1>
          <p className="text-sm text-slate-500 mt-1">All company projects. Open one to see the board.</p>
        </div>
        {canSeeAll(user) && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-brand-green text-brand-ink text-sm font-semibold px-4 py-2 rounded-xl"
          >
            <Plus size={16} /> New project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <FolderKanban size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No projects yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p._id}
              onClick={() => navigate(`/kanban/${p._id}`)}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:border-brand-green cursor-pointer relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-ink text-brand-green flex items-center justify-center">
                  <FolderKanban size={18} />
                </div>
                {canManage && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p._id ? null : p._id); }}
                      className="text-slate-300 hover:text-slate-600 p-1"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === p._id && (
                      <div className="absolute right-0 top-7 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-10 w-36">
                        <button
                          type="button"
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
              <p className="text-slate-500 text-xs mb-4 line-clamp-2">{p.description || 'No description'}</p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={12} />
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-brand-blue">
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
            setProjects((list) => [proj, ...list]);
            navigate(`/kanban/${proj._id}`);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
