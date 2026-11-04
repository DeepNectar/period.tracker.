import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Global safety net: if any screen throws while rendering (bad data from the
 * database, a browser API that isn't available, etc.) React used to unmount
 * the whole tree and leave a BLANK page. This boundary catches the crash and
 * shows a friendly "Reload" card instead — so the app is never blank.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep a trace in the console for debugging + in localStorage so the
    // problem can be inspected after a reload.
    console.error('[PeriodTracker] render crash:', error);
    try {
      localStorage.setItem('pt_last_crash', `${new Date().toISOString()} ${error.message}`);
    } catch {
      /* ignore */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="dvh-screen app-shell flex items-center justify-center bg-pink-50 dark:bg-gray-950 p-4">
        <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-lg text-center">
          <div className="text-4xl mb-3">🌸</div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            The app hit an unexpected error and stopped rendering. Your data is safe — reloading usually fixes it.
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4 break-words">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-sm transition-colors"
          >
            Reload the app
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium"
          >
            Try to continue anyway
          </button>
        </div>
      </div>
    );
  }
}
