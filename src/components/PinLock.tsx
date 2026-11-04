import { useEffect, useState } from 'react';
import {
  verifyPrivacyPin,
  markSessionUnlocked,
  hasPrivacyPin,
  usePrivacyLock,
  enablePrivacyLock,
  disablePrivacyLock,
  refreshPrivacyLock,
  subscribePrivacyLock,
  getLockTimeout,
  setLockTimeout,
  getLockOwnerName,
  updateLockOwnerName,
  setLocalProfileName,
} from '../hooks/usePrivacyLock';
import { Lock, Unlock, ShieldCheck, ShieldOff, Timer, UserRound } from 'lucide-react';

/** Full-screen PIN gate shown when the privacy lock is active (all devices). */
export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPinVal] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const cfg = usePrivacyLock();
  const ownerName = cfg.owner_name || getLockOwnerName();

  const submit = async (val: string) => {
    if (checking) return;
    setChecking(true);
    // Make sure we have the latest cross-device PIN config before verifying.
    await refreshPrivacyLock();
    const ok = await verifyPrivacyPin(val);
    setChecking(false);
    if (ok) {
      markSessionUnlocked(); // clears armed flag + marks this tab unlocked
      onUnlock();
    } else {
      setError(true);
      setPinVal('');
      setTimeout(() => setError(false), 1200);
    }
  };

  // If the lock was disabled on another device while this gate is open,
  // let the user straight through.
  useEffect(() => {
    return subscribePrivacyLock((cfg) => {
      if (!cfg.enabled && !hasPrivacyPin()) onUnlock();
    });
  }, [onUnlock]);

  return (
    <div className="app-shell fixed inset-0 z-[300] bg-gradient-to-br from-purple-950 via-gray-950 to-pink-950 flex items-center justify-center p-4 sm:p-6 safe-area-top safe-area-bottom app-scroll">
      <div className="text-center max-w-xs w-full mx-auto shrink-0">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-white mb-1">Privacy Lock</h2>
        {ownerName ? (
          <p className="text-sm text-pink-200 font-medium mb-1">
            <UserRound size={13} className="inline -mt-0.5 mr-1" />
            This data belongs to <b>{ownerName}</b>
          </p>
        ) : null}
        <p className="text-xs text-gray-400 mb-6">Enter the PIN to unlock — required on every device</p>
        <input
          autoFocus
          inputMode="numeric"
          type="password"
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 8);
            setPinVal(v);
            if (v.length >= 4) void submit(v);
          }}
          disabled={checking}
          className={`w-40 mx-auto block text-center text-2xl tracking-[0.5em] py-3 rounded-xl bg-white/10 text-white border ${
            error ? 'border-red-400 animate-pulse' : 'border-white/20 focus:border-pink-400'
          } outline-none`}
          placeholder="••••"
        />
        {checking && <p className="text-gray-300 text-xs mt-2">Verifying…</p>}
        {!checking && error && <p className="text-red-400 text-xs mt-2">Wrong PIN — try again</p>}
      </div>
    </div>
  );
}

/** Settings panel for the privacy lock (used inside Tools screen). */
export function PrivacyLockSettings() {
  const cfg = usePrivacyLock();
  const [enabled, setEnabled] = useState(cfg.enabled || hasPrivacyPin());
  const [name, setName] = useState(() => getLockOwnerName() ?? '');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [timeout, setTimeoutVal] = useState<'immediate' | number>(getLockTimeout());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep in sync with the cross-device config (changed on other devices).
  if (cfg.enabled !== enabled && !busy) setEnabled(cfg.enabled || hasPrivacyPin());

  const saveName = async () => {
    if (!name.trim()) return;
    setLocalProfileName(name);
    if (cfg.enabled) await updateLockOwnerName(name); // syncs name to all devices
    setMsg(`✅ Profile name saved${cfg.enabled ? ' and synced to all devices' : ''}. It will appear on the lock screen.`);
  };

  const enable = async () => {
    if (!/^\d{4,8}$/.test(newPin)) {
      setMsg('PIN must be 4–8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setMsg('PINs do not match.');
      return;
    }
    setBusy(true);
    const { synced } = await enablePrivacyLock(newPin, name);
    setBusy(false);
    setEnabled(true);
    setNewPin('');
    setConfirmPin('');
    setMsg(
      synced
        ? '✅ Privacy lock enabled! Your PIN now protects the app on ALL your devices signed into this account.'
        : '✅ Privacy lock enabled on this device. Sign in with the SAME account on your other devices — the lock applies there automatically.'
    );
  };

  const disable = async () => {
    setBusy(true);
    await disablePrivacyLock();
    setBusy(false);
    setEnabled(false);
    setMsg('Privacy lock disabled on all devices.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {enabled ? <ShieldCheck size={20} className="text-emerald-500" /> : <ShieldOff size={20} className="text-gray-400" />}
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {enabled ? 'Privacy lock is ON' : 'Privacy lock is OFF'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Locks instantly whenever the app or site is closed, reloaded, or sent to the background — on every
            device signed into your account, using the same PIN.
          </p>
        </div>
      </div>

      {/* Whose data is this — shown on the lock screen of every device */}
      <div className="space-y-2 rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-3 border border-gray-100 dark:border-gray-700">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
          <UserRound size={14} className="text-pink-400" /> This data belongs to (shown on the lock screen)
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="e.g. Priya"
            className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm outline-none focus:border-pink-300"
          />
          <button
            onClick={() => void saveName()}
            disabled={!name.trim() || busy}
            className="px-3 py-2 rounded-xl bg-purple-500 text-white text-xs font-medium disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="New PIN (4–8 digits)"
              className="flex-1 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm outline-none focus:border-pink-300"
            />
            <input
              inputMode="numeric"
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Confirm"
              className="flex-1 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm outline-none focus:border-pink-300"
            />
          </div>
          <button
            onClick={() => void enable()}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-pink-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Lock size={14} /> {busy ? 'Enabling…' : 'Enable Lock (all devices)'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void disable()}
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Unlock size={14} /> {busy ? 'Disabling…' : 'Disable Lock (all devices)'}
        </button>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <Timer size={16} className="text-purple-400" />
        <label className="text-xs text-gray-600 dark:text-gray-300 flex-1">Auto-lock when app is closed / backgrounded</label>
        <select
          value={timeout === 'immediate' ? 'immediate' : String(timeout)}
          onChange={(e) => {
            const v = e.target.value === 'immediate' ? ('immediate' as const) : Number(e.target.value);
            setTimeoutVal(v);
            setLockTimeout(v);
          }}
          className="px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs"
        >
          <option value="immediate">Immediately</option>
          {[1, 5, 15, 60].map((m) => (
            <option key={m} value={String(m)}>{`${m} min`}</option>
          ))}
        </select>
      </div>

      {msg && <p className="text-xs text-gray-500 dark:text-gray-400">{msg}</p>}
    </div>
  );
}
