import React, { useState } from 'react';
import { Mail, Lock, User, UserPlus, Loader2 } from 'lucide-react';
import { useAuth, authErrorMessage } from '../../context/AuthContext';
import GoogleButton from './GoogleButton';
import { Field } from './LoginPage';

/* Email/password account creation (+ Google). onSwitch flips to the login view. */
const SignupPage = ({ onSwitch, onSuccess }) => {
  const { signupEmail } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password should be at least 6 characters.'); return; }
    setBusy(true);
    setError(null);
    try {
      await signupEmail(email.trim(), password, name.trim());
      onSuccess?.();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="font-serif text-3xl font-semibold tracking-tight text-dhanam-text-hi">Create your account</h2>
      <p className="mt-1 mb-6 text-sm text-dhanam-text-mid">Save analyses, build watchlists, track intrinsic value over time.</p>

      <GoogleButton onSuccess={onSuccess} setError={setError} label="Sign up with Google" />

      <div className="my-5 flex items-center gap-3 text-xs text-dhanam-text-lo">
        <div className="h-px flex-1 bg-white/10" /> OR <div className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field icon={<User className="h-4 w-4" />} type="text" placeholder="Full name"
          value={name} onChange={setName} autoFocus />
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@email.com"
          value={email} onChange={setEmail} />
        <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password (min 6 chars)"
          value={password} onChange={setPassword} />

        {error && <div className="rounded-lg border border-rose-900/30 bg-rose-900/10 px-3 py-2 text-sm text-dhanam-neg">{error}</div>}

        <button type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-dhanam-primary py-3 font-semibold text-white transition-colors hover:bg-[#1B4D2B] disabled:opacity-50">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Create Account</>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-dhanam-text-mid">
        Already have an account?{' '}
        <button onClick={onSwitch} className="font-medium text-dhanam-accent hover:underline">Sign in</button>
      </p>
    </div>
  );
};

export default SignupPage;
