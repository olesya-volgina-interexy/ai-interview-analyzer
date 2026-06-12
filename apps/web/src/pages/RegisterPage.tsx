import { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ email, password, name: name || undefined });
      navigate({ to: '/' });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error ?? 'Registration failed'
        : 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-8 border rounded-lg bg-card">
        <h1 className="text-xl font-semibold">Create account</h1>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <input
          type="text" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <input
          type="email" placeholder="Work email" value={email} onChange={e => setEmail(e.target.value)}
          required className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <input
          type="password" placeholder="Password (min. 8 characters)" value={password}
          onChange={e => setPassword(e.target.value)} required minLength={8}
          className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-primary-foreground rounded px-3 py-2 text-sm font-medium disabled:opacity-50">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
