import { useState, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/**
 * A compact, collapsible card for larger content boxes.
 *
 * Behaviour:
 *  - Clicking the header expands the box.
 *  - Expanding a box automatically collapses the previously open one
 *    (accordion behaviour, coordinated via `groupId` + `openId`).
 *  - If no other box was clicked, clicking the same box again collapses it.
 *
 * Controlled usage (recommended when several cards share a screen):
 *   const [openId, setOpenId] = useState<string | null>(null);
 *   <CollapsibleCard id="a" groupId="home" openId={openId} onToggle={setOpenId} ... />
 *
 * Uncontrolled usage (single card):
 *   <CollapsibleCard title="..." ...>...</CollapsibleCard>
 */
type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
  /** Unique id of this card within its group (for controlled accordion behaviour). */
  id?: string;
  /** Shared id for cards that should collapse each other. */
  groupId?: string;
  /** Currently open card id in the group (controlled mode). */
  openId?: string | null;
  onToggle?: (id: string | null, groupId?: string) => void;
};

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  headerRight,
  children,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  defaultOpen = false,
  id,
  groupId,
  openId,
  onToggle,
}: Props) {
  const controlled = typeof openId !== 'undefined' && !!id;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlled ? openId === id : internalOpen;

  const handleToggle = () => {
    if (onToggle) {
      // Accordion semantics: opening this card closes any other open card in
      // the group (handled by the parent setting state); clicking the open
      // card again sets it to null, collapsing it.
      onToggle(isOpen ? null : id!, groupId);
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  return (
    <div className={`overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-3 text-left transition-colors select-none active:opacity-80 ${headerClassName}`}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</span>
          {subtitle && (
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</span>
          )}
        </span>
        <span className="shrink-0 flex items-center gap-2">
          {headerRight}
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-pink-400 flex items-center"
          >
            <ChevronDown size={16} />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
