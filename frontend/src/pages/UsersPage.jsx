import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import {
  Plus, Trash2, Edit3, Shield, User, Users,
  Eye, EyeOff, X, Check, Building2
} from 'lucide-react';
import toast from 'react-hot-toast';

const roleBadge = (role) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
    role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
  }`}>
    {role === 'admin' ? <Shield size={11} /> : <User size={11} />}
    {role}
  </span>
);

function UserModal({ user: editUser, onClose, onSaved }) {
  const [form, setForm] = useState({
    username: editUser?.username || '',
    password: '',
    role: editUser?.role || 'member',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let res;
      if (editUser) {
        const payload = { role: form.role };
        if (form.username) payload.username = form.username;
        if (form.password) payload.password = form.password;
        res = await api.put(`/api/users/${editUser._id}`, payload);
      } else {
        res = await api.post('/api/users', form);
      }
      toast.success(editUser ? 'User updated' : 'User created');
      onSaved(res.data, !!editUser);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">
            {editUser ? 'Edit User' : 'Create New User'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Username {editUser && <span className="text-slate-400">(leave blank to keep current)</span>}
            </label>
            <input
              type="text"
              value={form.username}
              onChange={set('username')}
              placeholder={editUser ? editUser.username : 'Enter username'}
              required={!editUser}
              minLength={editUser ? undefined : 3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Password {editUser && <span className="text-slate-400">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder={editUser ? '••••••' : 'Min. 6 characters'}
                required={!editUser}
                minLength={form.password ? 6 : undefined}
                className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Role</label>
            <select
              value={form.role}
              onChange={set('role')}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Check size={16} /> {editUser ? 'Update' : 'Create'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | user object

  const fetchUsers = async () => {
    try {
      const res = await api.get('/api/users');
      setUsers(res.data);
    } catch (_) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/api/users/${id}`);
      setUsers((u) => u.filter((x) => x._id !== id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleSaved = (savedUser, isEdit) => {
    if (isEdit) {
      setUsers((u) => u.map((x) => x._id === savedUser._id ? savedUser : x));
    } else {
      setUsers((u) => [...u, savedUser]);
    }
    setModal(null);
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Team Members</h2>
          <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1">
            <Building2 size={14} />
            {currentUser?.company?.name} · {users.length} member{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> Add Member
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Users size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No team members yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Joined</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                        u.role === 'admin'
                          ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                          : 'bg-gradient-to-br from-blue-400 to-cyan-500'
                      }`}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{u.username}</p>
                        {u._id === currentUser._id && (
                          <p className="text-xs text-indigo-500">You</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">{roleBadge(u.role)}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 hidden sm:table-cell">
                    {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setModal(u)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Edit3 size={15} />
                      </button>
                      {u._id !== currentUser._id && (
                        <button
                          onClick={() => handleDelete(u._id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserModal
          user={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
