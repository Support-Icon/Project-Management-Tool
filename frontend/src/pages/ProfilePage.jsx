import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import ImageCropper from '../components/ImageCropper';
import { ROLE_LABELS } from '../utils/roles';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cropFile, setCropFile] = useState(null);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropFile(file);
  };

  const savePhoto = async (avatar) => {
    setCropFile(null);
    setBusy(true);
    try {
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
          Crop the photo to a square, then we save it under 10 KB.
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
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>
      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(data) => savePhoto(data).catch((err) => toast.error(err.message))}
        />
      )}
    </div>
  );
}
