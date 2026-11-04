import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-2">
      <p className="text-xs font-medium text-pink-400 dark:text-pink-300 tracking-wide uppercase">
        {format(now, 'EEEE, d MMMM yyyy')}
      </p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
        {format(now, 'hh:mm:ss a')}
      </p>
    </div>
  );
}
