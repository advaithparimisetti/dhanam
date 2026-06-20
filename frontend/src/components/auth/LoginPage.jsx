import React, { useState } from 'react';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import { useAuth, authErrorMessage } from '../../context/AuthContext';
import GoogleButton from './GoogleButton';

/* Email/password sign-in form. Presentational — the AuthModal hosts it and
   handles open/close; onSwitch flips to the signup view. */
const LoginPage = ({ onSwitch, onSuccess }) => {
  const { loginEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginEmail(email.trim(), password);
      onSuccess?.();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="font-serif text-3xl font-semibold tracking-tight text-dhanam-text-hi">Welcome back</h2>
      <p className="mt-1 mb-6 text-sm text-dhanam-text-mid">Sign in to access your watchlist and saved valuations.</p>

      <GoogleButton onSuccess={onSuccess} setError={setError} />

      <div className="my-5 flex items-center gap-3 text-xs text-dhanam-text-lo">
        <div className="h-px flex-1 bg-white/10" /> OR <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@email.com"
          value={email} onChange={setEmail} autoFocus />
        <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password"
          value={password} onChange={setPassword} />

        {error && <div className="rounded-lg border border-rose-900/30 bg-rose-900/10 px-3 py-2 text-sm text-dhanam-neg">{error}</div>}

        <button type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-dhanam-primary py-3 font-semibold text-white transition-colors hover:bg-[#1B4D2B] disabled:opacity-50">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><LogIn className="h-4 w-4" /> Sign In</>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-dhanam-text-mid">
        New to Dhanaṁ?{' '}
        <button onClick={onSwitch} className="font-medium text-dhanam-accent hover:underline">Create an account</button>
      </p>
    </div>
  );
};

export const Field = ({ icon, value, onChange, ...rest }) => (
  <div className="relative">
    <span className="absolute left-3.5 top-3.5 text-dhanam-text-lo">{icon}</span>
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-4 text-dhanam-text-hi transition-colors focus:border-dhanam-primary focus:outline-none"
    />
  </div>
);

export default LoginPage;
