import { useState, useEffect, createContext, useContext, useCallback } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

type ToastContextType = {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[90%] max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-2xl shadow-lg text-sm font-medium animate-slide-down backdrop-blur-md ${
              toast.type === 'success' ? 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/90 dark:text-emerald-200' :
              toast.type === 'error' ? 'bg-red-100/90 text-red-800 dark:bg-red-900/90 dark:text-red-200' :
              'bg-blue-100/90 text-blue-800 dark:bg-blue-900/90 dark:text-blue-200'
            }`}
          >
            {toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '✗ ' : 'ℹ '}{toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
