import { useCallback, useEffect, useState } from 'react';
import { supabase, PeriodEntry } from '../lib/supabase';

/**
 * Offline-first queue. When writes fail (no network / expired session),
 * they are stored in localStorage and replayed when connectivity returns.
 */

const QUEUE_KEY = 'pt_offline_queue_v1';

export interface QueuedOp {
  id: string;
  table: 'period_entries' | 'daily_logs';
  action: 'insert' | 'update' | 'delete';
  payload: Record<string, any>;
  refId?: string; // for update/delete
  queuedAt: string;
}

function loadQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueueOfflineOp(op: Omit<QueuedOp, 'id' | 'queuedAt'>) {
  const q = loadQueue();
  q.push({ ...op, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), queuedAt: new Date().toISOString() });
  saveQueue(q);
}

export function getPendingCount(): number {
  return loadQueue().length;
}

async function replayOp(op: QueuedOp): Promise<boolean> {
  try {
    if (op.action === 'insert') {
      const { error } = await supabase.from(op.table).insert(op.payload);
      if (error) return false;
      return true;
    }
    if (op.action === 'update') {
      const { error } = await supabase.from(op.table).update(op.payload).eq('id', op.refId);
      if (error) return false;
      return true;
    }
    if (op.action === 'delete') {
      const { error } = await supabase.from(op.table).delete().eq('id', op.refId);
      if (error) return false;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Hook that watches connectivity and flushes the queue when back online & authenticated. */
export function useOfflineSync(onSynced?: () => void) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<number>(getPendingCount());
  const [syncing, setSyncing] = useState(false);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const q = loadQueue();
    if (q.length === 0) {
      setPending(0);
      return;
    }
    setSyncing(true);
    const remaining: QueuedOp[] = [];
    let syncedAny = false;
    for (const op of q) {
      const ok = await replayOp(op);
      if (ok) syncedAny = true;
      else remaining.push(op);
    }
    saveQueue(remaining);
    setPending(remaining.length);
    setSyncing(false);
    if (syncedAny && onSynced) onSynced();
  }, [onSynced]);

  useEffect(() => {
    const on = () => {
      setIsOnline(true);
      flush();
    };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Try a flush on mount too (e.g. app reopened while online)
    flush();
    const interval = setInterval(flush, 60_000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      clearInterval(interval);
    };
  }, [flush]);

  return { isOnline, pending, syncing, flush };
}

/** Wrap a write: run it live; on network failure, queue it for later. */
export async function withOfflineQueue<T extends PeriodEntry>(
  action: 'insert' | 'update' | 'delete',
  table: 'period_entries' | 'daily_logs',
  payload: Record<string, any>,
  execute: () => Promise<T>,
  refId?: string
): Promise<{ data: T | null; queued: boolean }> {
  try {
    const data = await execute();
    return { data, queued: false };
  } catch (err: any) {
    // Queue anything that looks like a network / auth outage
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('network') || !navigator.onLine) {
      enqueueOfflineOp({ table, action, payload, refId });
      setPendingBadge();
      return { data: null, queued: true };
    }
    throw err;
  }
}

function setPendingBadge() {
  setPendingBadgeListener?.();
}

let setPendingBadgeListener: (() => void) | null = null;
export function onQueueChanged(cb: () => void) {
  setPendingBadgeListener = cb;
}
