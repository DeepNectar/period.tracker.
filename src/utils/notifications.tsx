import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PeriodEntry } from '../lib/supabase';
import { calculateCycleStats } from '../utils/dates';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { Bell, BellRing, BellOff, Share2, Users, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const NOTIF_PREFS_KEY = 'pt_notification_prefs_v1';

interface NotificationPrefs {
  enabled: boolean;
  periodStart: boolean;
  ovulation: boolean;
  pms: boolean;
  lastFiredDates: Record<string, string>; // type -> yyyy-MM-dd of last fired notification
}

function loadPrefs(): NotificationPrefs {
  try {
    return {
      enabled: false,
      periodStart: true,
      ovulation: true,
      pms: true,
      lastFiredDates: {},
      ...JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}'),
    };
  } catch {
    return { enabled: false, periodStart: true, ovulation: true, pms: true, lastFiredDates: {} };
  }
}

function savePrefs(p: NotificationPrefs) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(p));
}

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array<ArrayBuffer>> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** Register web-push subscription (stored in Supabase table `push_subscriptions`). */
export async function enablePushNotifications(userId: string | null): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (!VAPID_PUBLIC_KEY) {
    // No server key configured → fall back to local notifications only
    const prefs = loadPrefs();
    prefs.enabled = true;
    savePrefs(prefs);
    return true;
  }
  const reg = await navigator.serviceWorker.ready;
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: await urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch {
    // Push subscription failed (e.g. invalid key / push unsupported) —
    // fall back to local notifications only instead of throwing.
    const prefs = loadPrefs();
    prefs.enabled = true;
    savePrefs(prefs);
    return false;
  }
  if (userId && sub) {
    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      created_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
  }
  const prefs = loadPrefs();
  prefs.enabled = true;
  savePrefs(prefs);
  return true;
}

export async function disablePushNotifications(endpoint?: string) {
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
  const prefs = loadPrefs();
  prefs.enabled = false;
  savePrefs(prefs);
}

/** Fire a local notification (works without a push server). */
export function notifyLocal(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: title });
  } catch {
    /* mobile browsers may not support constructor notifications; PWA push covers that case */
  }
}

/** Core scheduler: checks predictions once per session and fires due reminders. */
export function runReminderCheck(entries: PeriodEntry[]) {
  const prefs = loadPrefs();
  if (!prefs.enabled || entries.length === 0) return;
  const stats = calculateCycleStats(entries);
  const sorted = [...entries].sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
  const lastStart = sorted[0]?.start_datetime;
  if (!lastStart) return;

  const todayK = format(new Date(), 'yyyy-MM-dd');
  const fire = (type: string, title: string, body: string) => {
    if (prefs.lastFiredDates[type] === todayK) return;
    prefs.lastFiredDates[type] = todayK;
    savePrefs(prefs);
    notifyLocal(title, body);
  };

  // Period starting soon / due
  const nextStart = addDays(parseISO(lastStart), stats.avgCycleLength);
  const daysToPeriod = differenceInCalendarDays(nextStart, new Date());
  if (daysToPeriod === 1) fire('period', '🌸 Period tomorrow', 'Get your supplies ready — your period is predicted for tomorrow.');
  else if (daysToPeriod === 0) fire('period', '🩸 Period expected today', 'Track it in the app when it starts!');

  // Ovulation window
  const ovu = addDays(parseISO(lastStart), stats.avgCycleLength - 14);
  const daysToOvu = differenceInCalendarDays(ovu, new Date());
  if (daysToOvu === 1 && prefs.ovulation) fire('ovulation', '🥚 Ovulation tomorrow', 'Your most fertile day is approaching.');
  else if (daysToOvu === 0 && prefs.ovulation) fire('ovulation', '🥚 Ovulation today', 'Today is your most fertile predicted day.');

  // PMS heads-up (3 days before predicted period)
  if (daysToPeriod === 3 && prefs.pms) fire('pms', '💜 PMS window ahead', 'Cramps or mood shifts may appear soon — rest, hydrate, and be kind to yourself.');
}

export function NotificationSettings({ entries, userId }: { entries: PeriodEntry[]; userId: string | null }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [prefs, setPrefs] = useState(loadPrefs);
  const [subscribedEndpoint, setSubscribedEndpoint] = useState<string | undefined>();
  const [pushAvailable] = useState('serviceWorker' in navigator && 'PushManager' in window);
  const checkedRef = useRef(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    // run reminder check shortly after load
    const t = setTimeout(() => {
      if (!checkedRef.current) {
        checkedRef.current = true;
        runReminderCheck(entries);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestAndEnable = async () => {
    if (permission === 'unsupported') return;
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === 'granted') {
      try {
        const ok = await enablePushNotifications(userId);
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setSubscribedEndpoint(sub?.endpoint);
        }
        const p = { ...loadPrefs(), enabled: true };
        setPrefs(p);
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 } });
        if (!ok) throw new Error('Could not subscribe for push');
      } catch {
        // local-only mode still works
        const p = { ...loadPrefs(), enabled: true };
        setPrefs(p);
      }
      runReminderCheck(entries);
    }
  };

  const toggleType = (key: 'periodStart' | 'ovulation' | 'pms') => {
    const p = { ...prefs, [key]: !prefs[key] };
    setPrefs(p);
    savePrefs(p);
  };

  const disableAll = async () => {
    await disablePushNotifications(subscribedEndpoint);
    setPrefs(loadPrefs());
    setSubscribedEndpoint(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {prefs.enabled ? <BellRing size={20} className="text-pink-500" /> : <Bell size={20} className="text-gray-400" />}
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Reminders & Notifications</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {permission === 'unsupported'
              ? 'This browser does not support notifications.'
              : prefs.enabled
              ? 'Active — we’ll remind you based on your predictions.'
              : 'Get notified about upcoming periods, ovulation & PMS.'}
          </p>
        </div>
      </div>

      {permission !== 'unsupported' && !prefs.enabled && (
        <button
          onClick={requestAndEnable}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium flex items-center justify-center gap-2"
        >
          <Bell size={14} /> Enable Notifications {pushAvailable ? '(with offline push)' : ''}
        </button>
      )}

      {prefs.enabled && (
        <>
          <div className="space-y-2">
            {(
              [
                ['periodStart', '🩸 Period starting (1 day before + day of)'],
                ['ovulation', '🥚 Ovulation & fertile window'],
                ['pms', '💜 PMS heads-up (3 days before)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => toggleType(key)}
                  className="accent-pink-500 w-4 h-4"
                />
                <span className="text-xs text-gray-700 dark:text-gray-200">{label}</span>
              </label>
            ))}
          </div>
          <button
            onClick={disableAll}
            className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-medium flex items-center justify-center gap-1.5"
          >
            <BellOff size={12} /> Turn off all notifications
          </button>
        </>
      )}
    </div>
  );
}

// ---------- Partner Mode (read-only share link) ----------
export function PartnerShare({ entries, userId }: { entries: PeriodEntry[]; userId: string | null }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('pt_share_token'));
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const shareUrl = token ? `${window.location.origin}${window.location.pathname}#/view/${token}` : null;

  const createLink = async () => {
    setCreating(true);
    try {
      const t = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      if (userId) {
        const expires = addDays(new Date(), 30).toISOString();
        const { error } = await supabase.from('share_tokens').insert({
          user_id: userId,
          token: t,
          label: 'partner',
          created_at: new Date().toISOString(),
          expires_at: expires,
        });
        if (error) throw error;
      }
      localStorage.setItem('pt_share_token', t);
      setToken(t);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (token && userId) {
      await supabase.from('share_tokens').delete().eq('token', token);
    }
    localStorage.removeItem('pt_share_token');
    setToken(null);
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can long-press the URL */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Users size={20} className="text-purple-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Partner Mode</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Share a read-only link showing current phase & next period. No symptoms or notes are exposed.
          </p>
        </div>
      </div>

      {!token ? (
        <button
          onClick={createLink}
          disabled={creating}
          className="w-full py-2.5 rounded-xl bg-purple-500 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Share2 size={14} /> {creating ? 'Creating…' : 'Create Read-Only Link'}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1 truncate">{shareUrl}</span>
            <button onClick={copy} className="p-1.5 rounded-lg bg-white dark:bg-gray-700 text-pink-500">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={revoke} className="text-xs text-red-400 underline decoration-dotted">
            Revoke link
          </button>
        </>
      )}
      {!userId && token && (
        <p className="text-[10px] text-amber-500">
          Note: sign in with an account so the link works across devices (guest links only open on this device).
        </p>
      )}
    </div>
  );
}
