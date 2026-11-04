import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAnonymous: boolean; // true when no Supabase login yet (guest mode)
}

/** Subscribe to Supabase auth state. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAnonymous: true,
  });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({
        user: data.session?.user ?? null,
        session: data.session,
        loading: false,
        isAnonymous: !data.session,
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAnonymous: !session,
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signUpEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function sendOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#/reset-password`,
  });
  if (error) throw error;
}

// ---------- Privacy Lock ----------
// The PIN logic now lives in src/hooks/usePrivacyLock.ts so it syncs across
// ALL devices of the user's account via Supabase (`user_prefs` table, key
// 'privacy_lock'). Only a PBKDF2-SHA256 hash + random salt is stored — never
// the raw PIN. Re-exported here for backwards compatibility.
export {
  hasPrivacyPin as hasPin,
  verifyPrivacyPin,
  enablePrivacyLock,
  disablePrivacyLock,
  armLock,
  disarmLock,
  isLocked,
  markSessionUnlocked,
  refreshPrivacyLock,
  getLockTimeout,
  setLockTimeout,
} from './usePrivacyLock';

import { getLockTimeout, setLockTimeout } from './usePrivacyLock';

/** Back-compat alias used by existing settings UI. */
export const getLockTimeoutMin = () => (getLockTimeout() === 'immediate' ? 0 : (getLockTimeout() as number));
export const setLockTimeoutMin = (min: number) => setLockTimeout(min <= 0 ? 'immediate' : min);

/**
 * Save the profile display name ("whose data is this"):
 *  - locally (lock screen + header on this device),
 *  - in Supabase auth metadata (synced to every device signed into the account),
 *  - and in the synced privacy-lock config if the lock is enabled.
 */
export async function updateProfileName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  localStorage.setItem('pt_profile_name', trimmed);
  try {
    await supabase.auth.updateUser({ data: { full_name: trimmed } });
  } catch {
    /* offline / guest mode — local copy still saved */
  }
  try {
    const { updateLockOwnerName } = await import('./usePrivacyLock');
    await updateLockOwnerName(trimmed);
  } catch {
    /* ignore */
  }
}

/** Best-effort current display name (synced config > auth metadata > local). */
export function getProfileName(user?: { user_metadata?: Record<string, any> } | null): string | null {
  const meta = (user?.user_metadata?.full_name || user?.user_metadata?.name || '') as string;
  if (meta.trim()) return meta.trim();
  const local = localStorage.getItem('pt_profile_name');
  if (local && local.trim()) return local.trim();
  return null;
}
