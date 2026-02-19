
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sparkles, Loader2, ArrowRight } from './Icons';
// Google Icon SVG Component
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);
const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            // Force account selection to avoid auto-login to unauthorized accounts
            prompt: 'select_account'
          }
        }
      });
      if (error) throw error;
      // Redirect happens automatically
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-surface/30">
        <div className="w-full max-w-md panel specular p-8 md:p-9 shadow-xl rounded-[32px] border border-stroke/50 backdrop-blur-xl bg-surface/80">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-3xl flex items-center justify-center border border-stroke/70 bg-gradient-to-br from-accent/20 to-accent2/20 shadow-liftSoft mb-6">
            <Sparkles size={28} className="text-accent" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            Ashim
          </h1>
          <p className="mt-2 text-[14px] font-medium text-muted">
            Evolutionary AI Interface
          </p>
        </div>
        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className={`
            w-full flex items-center justify-center gap-3
            py-3.5 px-4 rounded-2xl
            border border-stroke/80 bg-surface
            text-[14px] font-semibold text-ink
            transition-all duration-200
            hover:bg-surface2 hover:border-stroke hover:-translate-y-0.5 hover:shadow-md
            active:translate-y-0
            disabled:opacity-60 disabled:cursor-not-allowed
            group
          `}
        >
          {googleLoading ? (
            <>
              <Loader2 className="animate-spin text-muted" size={20} />
              <span className="text-muted">Connecting...</span>
            </>
          ) : (
            <>
              <GoogleIcon />
              <span className="group-hover:text-ink">Continue with Google</span>
            </>
          )}
        </button>
        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-stroke/60" />
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">or email</span>
          <div className="flex-1 h-px bg-stroke/60" />
        </div>
        {/* Email Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wide ml-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full px-4 py-3 rounded-xl bg-surface/50 border border-stroke/60 focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all outline-none"
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wide ml-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full px-4 py-3 rounded-xl bg-surface/50 border border-stroke/60 focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          {error && (
            <div className="p-4 rounded-xl bg-danger/5 border border-danger/20 text-danger text-[13px] font-medium text-center animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || googleLoading}
            className={`
              btn btn-primary w-full py-3.5 rounded-xl
              bg-accent hover:bg-accent/90 text-white font-semibold
              shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30
              transition-all transform hover:-translate-y-0.5 active:translate-y-0
              flex items-center justify-center gap-2
              ${loading ? 'opacity-80 cursor-not-allowed' : ''}
            `}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span className="text-[14px]">Processing...</span>
              </>
            ) : (
              <>
                <span className="text-[14px]">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        {/* Switch Mode */}
        <div className="mt-8 pt-6 border-t border-stroke/40 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-[13px] text-muted hover:text-accent font-medium transition-colors"
            type="button"
          >
            {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
};
export default Auth;
