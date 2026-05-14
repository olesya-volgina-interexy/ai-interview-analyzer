import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate({ to: '/' });
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-8 border rounded-lg bg-card">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <input
          type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          required className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <input
          type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          required className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-primary-foreground rounded px-3 py-2 text-sm font-medium disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
