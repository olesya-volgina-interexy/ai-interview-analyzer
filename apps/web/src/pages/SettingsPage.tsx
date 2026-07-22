import { useState, useRef } from 'react';
import axios from 'axios';
import { User, Lock, KeyRound, Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/api/client';
import { cn } from '@/lib/utils';
import { useAuth } from '../context/AuthContext';

function errorMessage(err: unknown, fallback: string) {
  return axios.isAxiosError(err) ? err.response?.data?.error ?? fallback : fallback;
}

function initialsOf(value: string) {
  return value.split(/[\s@.]+/).filter(Boolean).map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

const INPUT_CLASS =
  'w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm outline-none focus:border-[#5067F4] focus:ring-2 focus:ring-[#5067F4]/20 transition-colors';
const PRIMARY_BTN =
  'h-10 px-5 rounded-lg text-sm font-medium text-white bg-[#5067F4] hover:bg-[#3d52d9] transition-colors disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, minLength }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        required
        className={cn(INPUT_CLASS, 'pr-10')}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function StatusText({ status }: { status: { type: 'error' | 'success'; text: string } | null }) {
  if (!status) return null;
  return <p className={cn('text-sm', status.type === 'error' ? 'text-red-500' : 'text-green-600')}>{status.text}</p>;
}

function Card({ title, description, children, footer }: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{description}</p>
        </div>
        {children}
      </div>
      <div className="flex justify-end px-6 py-4 border-t border-slate-100">{footer}</div>
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const dirty = name.trim() !== (user?.name ?? '') || jobTitle.trim() !== (user?.jobTitle ?? '');
  const avatarSource = name || user?.email || '?';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const r = await authApi.updateProfile({ name: name.trim(), jobTitle: jobTitle.trim() || undefined });
      setUser(r.data);
      setStatus({ type: 'success', text: 'Profile updated' });
    } catch (err) {
      setStatus({ type: 'error', text: errorMessage(err, 'Could not update profile') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card
        title="Profile"
        description="This information is shown to your team on interviews and analyses you create."
        footer={
          <button type="submit" disabled={loading || !dirty} className={PRIMARY_BTN}>
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        }
      >
        <StatusText status={status} />
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5067F4] to-[#8b5cf6] ring-4 ring-[#5067F4]/10 shadow-sm flex items-center justify-center text-white text-2xl font-semibold">
          {initialsOf(avatarSource)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name">
            <input value={name} onChange={e => setName(e.target.value)} required className={INPUT_CLASS} />
          </Field>
          <Field label="Job title">
            <input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="e.g. Senior Technical Recruiter"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="Email">
          <input
            value={user?.email ?? ''}
            readOnly
            className={cn(INPUT_CLASS, 'bg-slate-50 text-slate-500 cursor-not-allowed focus:ring-0 focus:border-slate-200')}
          />
        </Field>
      </Card>
    </form>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      setStatus({ type: 'error', text: 'New password must be at least 8 characters and include a number' });
      return;
    }
    if (newPassword !== confirm) {
      setStatus({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setStatus({ type: 'success', text: 'Password updated successfully' });
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
    } catch (err) {
      setStatus({ type: 'error', text: errorMessage(err, 'Could not change password') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card
        title="Change password"
        description="Update the password for your own account. You'll stay signed in on this device."
        footer={
          <button type="submit" disabled={loading} className={PRIMARY_BTN}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        }
      >
        <StatusText status={status} />
        <Field label="Current password">
          <PasswordInput value={currentPassword} onChange={setCurrentPassword} placeholder="Enter your current password" />
        </Field>
        <div className="space-y-1.5">
          <Field label="New password">
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Enter a new password" minLength={8} />
          </Field>
          <p className="text-xs text-slate-400">Use at least 8 characters, including a number.</p>
        </div>
        <Field label="Confirm new password">
          <PasswordInput value={confirm} onChange={setConfirm} placeholder="Re-enter the new password" minLength={8} />
        </Field>
      </Card>
    </form>
  );
}

function AdminResetSection() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const r = await authApi.adminResetPassword({ email, newPassword });
      setStatus({ type: 'success', text: `Password reset for ${r.data.email}` });
      setEmail(''); setNewPassword('');
    } catch (err) {
      setStatus({ type: 'error', text: errorMessage(err, 'Could not reset password') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card
        title="Reset a user's password"
        description="Admin only. Set a new password for any user, then share it with them."
        footer={
          <button type="submit" disabled={loading} className={PRIMARY_BTN}>
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        }
      >
        <StatusText status={status} />
        <Field label="User's email">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={INPUT_CLASS} />
        </Field>
        <Field label="New password">
          <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Enter a new password" minLength={8} />
        </Field>
      </Card>
    </form>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [active, setActive] = useState('profile');
  const refs = {
    profile: useRef<HTMLDivElement>(null),
    password: useRef<HTMLDivElement>(null),
    admin: useRef<HTMLDivElement>(null),
  };

  const navItems = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'password', label: 'Change password', icon: Lock },
    ...(isAdmin ? [{ key: 'admin', label: 'Reset user password', icon: KeyRound }] : []),
  ] as const;

  const goTo = (key: keyof typeof refs) => {
    setActive(key);
    refs[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="p-4 md:p-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your account, security, and workspace preferences.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        <nav className="w-full md:w-56 flex-shrink-0 md:sticky md:top-20 self-start flex md:flex-col gap-1 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 md:bg-transparent md:p-0 md:overflow-visible">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => goTo(item.key as keyof typeof refs)}
                className={cn(
                  'flex md:flex-none items-center justify-center md:justify-start gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap flex-shrink-0',
                  active === item.key
                    ? 'bg-white shadow-sm text-[#5067F4] md:bg-[#5067F4]/10 md:shadow-none'
                    : 'text-slate-600 hover:text-slate-900 md:hover:bg-slate-100'
                )}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 flex md:justify-center">
          <div className="w-full max-w-3xl space-y-6">
            <div ref={refs.profile}><ProfileSection /></div>
            <div ref={refs.password}><ChangePasswordSection /></div>
            {isAdmin && <div ref={refs.admin}><AdminResetSection /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
