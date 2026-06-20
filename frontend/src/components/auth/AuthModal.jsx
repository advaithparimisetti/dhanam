import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';

/* Modal host that toggles Login ↔ Signup. `initial` sets the starting view. */
const AuthModal = ({ open, initial = 'login', onClose }) => {
  const [mode, setMode] = useState(initial);
  useEffect(() => { if (open) setMode(initial); }, [open, initial]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 text-dhanam-text-lo transition-colors hover:text-dhanam-text-hi">
          <X className="h-5 w-5" />
        </button>
        {mode === 'login'
          ? <LoginPage onSwitch={() => setMode('signup')} onSuccess={onClose} />
          : <SignupPage onSwitch={() => setMode('login')} onSuccess={onClose} />}
      </div>
    </div>
  );
};

export default AuthModal;
