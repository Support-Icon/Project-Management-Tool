import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import { ROLE_LABELS } from '../utils/roles';

const MAX_BYTES = 10 * 1024;

const compressPhoto = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const tryEncode = (dim, quality) => {
      canvas.width = dim;
      canvas.height = dim;
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
      return canvas.toDataURL('image/jpeg', quality);
    };
    let data = tryEncode(96, 0.72);
    const binLen = (s) => Math.ceil((s.split(',')[1] || '').length * 0.75);
    if (binLen(data) > MAX_BYTES) data = tryEncode(72, 0.55);
    if (binLen(data) > MAX_BYTES) data = tryEncode(56, 0.42);
    if (binLen(data) > MAX_BYTES) data = tryEncode(48, 0.32);
    URL.revokeObjectURL(url);
    if (binLen(data) > MAX_BYTES) reject(new Error('Could not shrink this photo under 10 KB'));
    else resolve(data);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not read that image'));
  };
  img.src = url;
});

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const avatar = await compressPhoto(file);
      const res = await api.put('/api/users/me/avatar', { avatar });
      updateUser({ avatar: res.data.avatar });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not save photo');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    try {
      await api.put('/api/users/me/avatar', { avatar: '' });
      updateUser({ avatar: '' });
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-brand-ink mb-6">Profile</h1>
      <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <UserAvatar user={user} size={72} className="rounded-2xl" />
          <div className="min-w-0">
            <p className="font-bold text-slate-800">{user?.username}</p>
            <p className="text-sm text-brand-blue">{ROLE_LABELS[user?.role] || user?.role}</p>
            <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Square photo, stored under 10 KB. We shrink it automatically.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold text-sm disabled:opacity-50"
          >
            <Camera size={16} /> {user?.avatar ? 'Change photo' : 'Set photo'}
          </button>
          {user?.avatar && (
            <button
              type="button"
              disabled={busy}
              onClick={removePhoto}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}
