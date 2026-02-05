'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secret.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Authentication failed');
        setIsLoading(false);
        return;
      }

      // Success — redirect to admin dashboard
      router.push('/admin');
    } catch (err) {
      setError('Connection error. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-100">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">SciBLIND Admin</h1>
            <p className="text-sm text-slate-500 mt-1">Enter your admin credentials</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Admin secret"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-center bg-slate-50 text-slate-900"
                disabled={isLoading}
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !secret.trim()}
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold transition-all disabled:opacity-40 active:scale-[0.98]"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Keycloak SSO coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
