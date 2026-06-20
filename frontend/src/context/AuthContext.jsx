import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';
import { syncUser } from '../api/client';

const notConfigured = () => Promise.reject(new Error('Authentication is not configured.'));

/* ===========================================================================
   Global authentication state via React Context.
   Subscribes to Firebase onAuthStateChanged, exposes the current user + auth
   actions, and upserts the backend user profile (/auth/sync) on every sign-in.
   =========================================================================== */
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Map Firebase's raw error codes to human-readable copy.
export const authErrorMessage = (err) => {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account found with those credentials.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in window closed before completing.',
    'auth/too-many-requests': 'Too many attempts. Please try again shortly.',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[code] || err?.message || 'Authentication failed. Please try again.';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) { setLoading(false); return; }   // auth disabled, stay anonymous
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Upsert the Firestore profile (non-fatal if the backend is briefly down).
        try { await syncUser(); } catch (e) { /* ignore — UI still works */ }
      }
    });
    return unsub;
  }, []);

  const signupEmail = async (email, password, displayName) => {
    if (!isFirebaseConfigured) return notConfigured();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    return cred.user;
  };
  const loginEmail = (email, password) =>
    isFirebaseConfigured ? signInWithEmailAndPassword(auth, email, password) : notConfigured();
  const loginGoogle = () =>
    isFirebaseConfigured ? signInWithPopup(auth, googleProvider) : notConfigured();
  const logout = () => (isFirebaseConfigured ? signOut(auth) : Promise.resolve());

  const value = { user, loading, isFirebaseConfigured, signupEmail, loginEmail, loginGoogle, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
