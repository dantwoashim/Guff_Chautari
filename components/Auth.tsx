import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowRight, Loader2, Sparkles } from './Icons';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          throw signUpError;
        }
        setError('Verification link sent. Please check your inbox.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw signInError;
        }
      }
    } catch (authError: any) {
      const message = authError?.message || 'Authentication failed.';
      if (message.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password. Please verify your credentials and try again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });

      if (googleError) {
        throw googleError;
      }
    } catch (googleSignInError: any) {
      setError(googleSignInError?.message || 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-[28px] border border-[color:var(--color-border)] bg-[color:rgba(8,19,31,0.9)] backdrop-blur-2xl shadow-[0_30px_80px_rgba(1,7,16,0.64)] p-7 md:p-9">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="h-16 w-16 rounded-2xl border border-[color:var(--color-border)] bg-[color:rgba(18,43,67,0.86)] inline-flex items-center justify-center text-[color:var(--color-accent)] shadow-[0_12px_28px_rgba(6,14,27,0.55)]">
            <Sparkles size={22} />
          </div>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[color:var(--color-text)]">Ashim</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">Evolutionary AI Interface</p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full premium-button h-11 inline-flex items-center justify-center gap-3 text-sm font-semibold"
        >
          {googleLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <GoogleIcon />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[color:var(--color-border)]" />
          <span className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-soft)]">or email</span>
          <div className="h-px flex-1 bg-[color:var(--color-border)]" />
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-soft)] font-semibold">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="name@example.com"
              className="premium-input"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-text-soft)] font-semibold">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              className="premium-input"
            />
          </div>

          {error ? (
            <div
              className={`rounded-xl border px-3 py-2 text-sm ${
                error.toLowerCase().includes('verification')
                  ? 'border-[color:rgba(77,225,210,0.45)] text-[color:var(--color-accent-2)] bg-[color:rgba(12,48,59,0.35)]'
                  : 'border-[color:rgba(255,107,107,0.45)] text-[color:var(--color-danger)] bg-[color:rgba(69,21,24,0.3)]'
              }`}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full h-11 rounded-xl border border-[color:rgba(108,199,255,0.46)] bg-[color:rgba(108,199,255,0.2)] text-[color:var(--color-text)] font-semibold inline-flex items-center justify-center gap-2 transition-all hover:bg-[color:rgba(108,199,255,0.3)]"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[color:var(--color-border)] text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp((prev) => !prev);
              setError(null);
            }}
            className="text-sm text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]"
          >
            {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
