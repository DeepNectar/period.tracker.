import { Home, History, Calendar, Lightbulb, Sparkles, Sun, Wrench } from 'lucide-react';

type Screen = 'home' | 'today' | 'history' | 'calendar' | 'predictions' | 'tools' | 'insights';

export function BottomNav({ current, onChange }: { current: Screen; onChange: (s: Screen) => void }) {
  const items: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home size={20} /> },
    { id: 'today', label: 'Today', icon: <Sun size={20} /> },
    { id: 'history', label: 'History', icon: <History size={20} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={20} /> },
    { id: 'predictions', label: 'Predictions', icon: <Sparkles size={20} /> },
    { id: 'tools', label: 'Tools', icon: <Wrench size={20} /> },
    { id: 'insights', label: 'Insights', icon: <Lightbulb size={20} /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-pink-100 dark:border-gray-800 safe-area-bottom">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-all duration-200 ${
              current === item.id
                ? 'text-pink-500 dark:text-pink-400 scale-105'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
            {current === item.id && (
              <div className="w-1 h-1 rounded-full bg-pink-500 dark:bg-pink-400 mt-0.5" />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
