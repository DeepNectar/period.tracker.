import { useState } from 'react';
import { useToast } from './Toast';
import { signUpEmail, signInEmail, sendOtp, verifyOtp, resetPassword } from '../hooks/useAuth';
import { Mail, Lock, KeyRound, ArrowLeft, Sparkles } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'otp-send' | 'otp-verify' | 'forgot';

interface Props {
  onContinueAsGuest: () => void;
  onAuthed: () => void;
}

export function AuthScreen({ onContinueAsGuest, onAuthed }: Props) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const validEmail = /\S+@\S+\.\S+/.test(email);

  const run = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(successMsg, 'success');
      onAuthed();
    } catch (err: any) {
      showToast(err?.message || 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dvh-screen flex items-center justify-center bg-gradient-to-br from-pink-100 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-purple-950/30 dark:to-gray-900 p-4 sm:p-6 safe-area-top safe-area-bottom overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌸</div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            Period Tracker
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your data, your privacy. Secure your account.
          </p>
        </div>

        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl p-6 shadow-xl border border-pink-100 dark:border-gray-800">
          {mode === 'signin' && (
            <div className="space-y-4">
              <Field icon={<Mail size={16} />} label="Email" value={email} onChange={setEmail} type="email" />
              <Field icon={<Lock size={16} />} label="Password" value={password} onChange={setPassword} type="password" />
              <button
                disabled={!validEmail || password.length < 6 || busy}
                onClick={() => run(() => signInEmail(email, password), 'Welcome back!')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm disabled:opacity-40 transition-all"
              >
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
              <button onClick={() => setMode('forgot')} className="w-full text-xs text-gray-400 hover:text-pink-500">
                Forgot password?
              </button>
            </div>
          )}

          {mode === 'signup' && (
            <div className="space-y-4">
              <Field icon={<Mail size={16} />} label="Email" value={email} onChange={setEmail} type="email" />
              <Field icon={<Lock size={16} />} label="Password (min 6 chars)" value={password} onChange={setPassword} type="password" />
              <button
                disabled={!validEmail || password.length < 6 || busy}
                onClick={() =>
                  run(async () => {
                    await signUpEmail(email, password);
                    showToast('Check your inbox to confirm your email, then sign in.', 'info');
                  }, 'Account created!')
                }
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {busy ? 'Creating…' : 'Create Account'}
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                If email confirmation is disabled in your Supabase project, you can sign in immediately.
              </p>
            </div>
          )}

          {mode === 'otp-send' && (
            <div className="space-y-4">
              <Field icon={<Mail size={16} />} label="Email" value={email} onChange={setEmail} type="email" />
              <button
                disabled={!validEmail || busy}
                onClick={() =>
                  run(async () => {
                    await sendOtp(email);
                    setMode('otp-verify');
                  }, 'Code sent to your email!')
                }
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send Login Code'}
              </button>
            </div>
          )}

          {mode === 'otp-verify' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                We emailed a 6-digit code to <b>{email}</b>
              </p>
              <Field icon={<KeyRound size={16} />} label="6-digit code" value={otp} onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} type="text" />
              <button
                disabled={otp.length !== 6 || busy}
                onClick={() => run(() => verifyOtp(email, otp), 'Verified!')}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {busy ? 'Verifying…' : 'Verify & Sign In'}
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="space-y-4">
              <Field icon={<Mail size={16} />} label="Email" value={email} onChange={setEmail} type="email" />
              <button
                disabled={!validEmail || busy}
                onClick={() =>
                  run(async () => {
                    await resetPassword(email);
                    setMode('signin');
                  }, 'Reset link sent!')
                }
                className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send Reset Link'}
              </button>
            </div>
          )}

          {/* Mode switcher */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-5 text-xs">
            {mode !== 'signin' && (
              <button onClick={() => setMode('signin')} className="text-pink-500 font-medium">Sign in</button>
            )}
            {mode !== 'signup' && (
              <button onClick={() => setMode('signup')} className="text-pink-500 font-medium">Sign up</button>
            )}
            {mode !== 'otp-send' && mode !== 'otp-verify' && (
              <button onClick={() => setMode('otp-send')} className="text-purple-500 font-medium">Email code</button>
            )}
          </div>
        </div>

        <button
          onClick={onContinueAsGuest}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 text-sm font-medium border border-pink-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 transition-colors"
        >
          <Sparkles size={14} /> Continue as guest (data not linked to an account)
        </button>

        {mode === 'signin' && (
          <button onClick={() => setMode('signup')} className="sr-only">go to signup</button>
        )}
        <div className="mt-4 text-center">
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-[11px] text-gray-400 underline decoration-dotted">
            {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>
        {(mode === 'forgot' || mode === 'otp-send' || mode === 'otp-verify') && (
          <button onClick={() => setMode('signin')} className="mt-4 mx-auto flex items-center gap-1 text-xs text-gray-400">
            <ArrowLeft size={12} /> Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 focus-within:border-pink-300">
        <span className="text-pink-400">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 dark:text-gray-100"
          autoComplete={type === 'password' ? 'current-password' : 'email'}
        />
      </div>
    </label>
  );
}
