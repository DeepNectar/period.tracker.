import { useState, useEffect, useRef } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './components/HomeScreen';
import { TodayScreen } from './components/TodayScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { CalendarView } from './components/CalendarView';
import { InsightsScreen } from './components/InsightsScreen';
import { PredictionsScreen } from './components/PredictionsScreen';
import { ToolsScreen } from './components/ToolsScreen';
import { SharedView } from './components/SharedView';
import { PinGate } from './components/PinLock';
import { usePeriodData } from './hooks/usePeriodData';
import { useAuth, getProfileName } from './hooks/useAuth';
import { isLocked, armLock, getLockTimeout, refreshPrivacyLock, subscribePrivacyLock } from './hooks/usePrivacyLock';
import { Moon, Sun, RefreshCw, AlertCircle, Database } from 'lucide-react';

/** Read a Partner-Mode share token from the URL (#/view/<token>). */
function getShareTokenFromUrl(): string | null {
  const m = window.location.hash.match(/#\/view\/([0-9a-fA-F-]{6,})/);
  return m ? m[1] : null;
}

type Screen = 'home' | 'today' | 'history' | 'calendar' | 'predictions' | 'tools' | 'insights';

function AppContent() {
  // Partner Mode: a visitor opening #/view/<token> gets the read-only page.
  // It must NOT be gated by the owner's PIN and must not load app data.
  const [shareToken] = useState<string | null>(() => getShareTokenFromUrl());

  const [screen, setScreen] = useState<Screen>('home');
  const [locked, setLocked] = useState(() => isLocked());
  const [profileTick, setProfileTick] = useState(0); // re-render header when name changes
  // The scrollable content region. We reset it to the top whenever the user
  // switches tabs so every screen always starts fully visible on screen.
  const scrollRef = useRef<HTMLElement | null>(null);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Re-computed on every privacy-lock event (profileTick) so a name changed
  // on another device shows up here without a reload.
  void profileTick;
  const ownerName = getProfileName(user) || localStorage.getItem('pt_profile_name') || null;
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  // Persist theme choice so every reload/device-open starts with the right
  // background color (the inline script in index.html reads this key).
  useEffect(() => {
    try {
      localStorage.setItem('pt_dark_mode', String(darkMode));
    } catch {
      /* storage unavailable (private mode) — ignore */
    }
  }, [darkMode]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { entries, loading, error, activeEntry, startPeriod, endPeriod, updateEntry, deleteEntry, refetch } = usePeriodData();
  const { showToast } = useToast();

  // Privacy Lock: lock immediately whenever the app/site is closed, reloaded,
  // navigated away from, or sent to the background — so reopening always
  // shows the PIN gate. Works on every device; the PIN itself is synced via
  // Supabase so all devices of the account share the same lock.
  useEffect(() => {
    const lockNow = () => {
      armLock();
      sessionStorage.removeItem('pt_unlocked_session');
      setLocked(true);
    };

    // Pull the cross-device lock config (set on any other device) at startup
    // and whenever auth/session changes.
    void refreshPrivacyLock().then((cfg) => {
      if (cfg.enabled) setLocked(true);
    });
    const unsub = subscribePrivacyLock((cfg) => {
      setProfileTick((t) => t + 1); // owner name may have changed on another device
      if (!cfg.enabled) {
        // Disabled remotely (another device) — no PIN required anymore.
        sessionStorage.removeItem('pt_unlocked_session');
        setLocked(false);
      } else {
        setLocked(isLocked());
      }
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const t = getLockTimeout();
        if (t === 'immediate') {
          lockNow();
        } else {
          // Defer locking until the timeout elapses while hidden.
          const ms = t * 60 * 1000;
          window.setTimeout(() => {
            if (document.visibilityState === 'hidden') lockNow();
          }, ms);
        }
      }
    };

    const onHide = () => {
      // Page is being closed/navigated away — always lock immediately.
      armLock();
      sessionStorage.removeItem('pt_unlocked_session');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onVisibilityChange);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
    document.documentElement.classList.toggle('light', !newMode);
  };

  // Keep the layout locked to the real visible viewport height on mobile
  // browsers (their address bar shrinking/growing changes the usable height).
  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    window.visualViewport?.addEventListener('resize', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
      window.visualViewport?.removeEventListener('resize', setVh);
    };
  }, []);

  // ---- Partner Mode read-only page (#/view/<token>) ----
  // Rendered BEFORE the PIN gate so the invited visitor never sees a lock
  // screen or any private data; only phase + next-period estimates show.
  if (shareToken) {
    return <SharedView token={shareToken} />;
  }

  // Privacy Lock gate — shown immediately on reopen/reload/background,
  // BEFORE any app data is rendered.
  if (locked) {
    return <PinGate onUnlock={() => setLocked(false)} />;
  }

  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center dvh-screen bg-pink-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-pink-200 border-t-pink-500 rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading your data...</p>
        </div>
      </div>
    );
  }

  if (error === 'TABLE_NOT_FOUND') {
    return (
      <div className="app-scroll app-shell flex items-center justify-center dvh-screen bg-pink-50 dark:bg-gray-950 p-4 sm:p-6">
        <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg text-center">
          <Database size={40} className="mx-auto text-pink-400 mb-3" />
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Setup Required</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            The database needs to be configured. Please contact the app administrator or run the database migration.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-pink-400 text-white font-medium text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (error && error !== 'TABLE_NOT_FOUND') {
    return (
      <div className="app-scroll app-shell flex items-center justify-center dvh-screen bg-pink-50 dark:bg-gray-950 p-4 sm:p-6">
        <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg text-center">
          <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Connection Error</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={refetch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-400 text-white text-sm font-medium"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell dvh-screen bg-pink-50 dark:bg-gray-950 transition-colors duration-300">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-medium text-center py-1.5 px-4 safe-area-top">
          ⚠️ You're offline. Changes will sync when you reconnect.
        </div>
      )}

      {/* Top bar — always visible, never scrolls away */}
      <header className="shrink-0 z-40 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-pink-100 dark:border-gray-800 safe-area-top">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-6 max-w-xl mx-auto">
          <h1 className="text-sm xs:text-base sm:text-lg font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent truncate">
            🌸 {ownerName ? `${ownerName}'s Tracker` : 'Period Tracker'}
          </h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={refetch}
              className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Toggle dark mode"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Main content — the ONLY region that scrolls (up/down). Everything
          stays inside the screen: header and bottom nav are pinned. */}
      <main ref={scrollRef} key={screen} className="app-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain max-w-xl mx-auto w-full">
        {screen === 'home' && (
          <HomeScreen
            activeEntry={activeEntry}
            entries={entries}
            onStartPeriod={startPeriod}
            onNavigate={(s) => setScreen(s as Screen)}
          />
        )}
        {screen === 'today' && (
          <TodayScreen
            entries={entries}
            onStartPeriod={startPeriod}
          />
        )}
        {screen === 'history' && (
          <HistoryScreen
            entries={entries}
            onEndPeriod={endPeriod}
            onUpdateEntry={updateEntry}
            onDeleteEntry={deleteEntry}
            onStartPeriod={startPeriod}
          />
        )}
        {screen === 'calendar' && (
          <CalendarView entries={entries} onEndPeriod={endPeriod} onUpdateEntry={updateEntry} />
        )}
        {screen === 'predictions' && (
          <PredictionsScreen entries={entries} />
        )}
        {screen === 'tools' && (
          <ToolsScreen entries={entries} userId={userId} />
        )}
        {screen === 'insights' && (
          <InsightsScreen entries={entries} />
        )}
      </main>

      {/* Bottom Navigation — pinned to the bottom of the screen, never scrolls */}
      <BottomNav
        current={screen}
        onChange={(s) => {
          setScreen(s);
          // Always start the new tab at the top so everything is visible.
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
