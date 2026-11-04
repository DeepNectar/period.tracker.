import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PeriodEntry } from '../lib/supabase';
import { calculateCycleStats, getCyclePhase, getPhaseInfo } from '../utils/dates';
import { format, parseISO, addDays, differenceInCalendarDays } from 'date-fns';
import { Eye, ShieldQuestion } from 'lucide-react';

/**
 * Partner Mode viewer — read-only page opened via #/view/<token>.
 * Shows ONLY: current phase, next predicted period, fertile window.
 * Never shows symptoms, notes, or full history.
 */

type SharePayload = {
  ownerLabel?: string;
  lastPeriodStart: string | null;
  avgCycleLength: number;
  avgPeriodDuration: number;
};

export function SharedView({ token }: { token: string }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 1) Validate the share token (if Supabase reachable)
        const { data: tok, error: tokErr } = await supabase
          .from('share_tokens')
          .select('user_id, expires_at')
          .eq('token', token)
          .maybeSingle();
        if (tokErr) throw new Error('Sharing service unavailable right now.');
        if (!tok) throw new Error('This link is invalid or has been revoked.');
        if (tok.expires_at && new Date(tok.expires_at) < new Date()) throw new Error('This link has expired.');

        // 2) Fetch only period start dates for that owner (RLS must allow read via token policy)
        const { data: entries, error: entErr } = await supabase
          .from('period_entries')
          .select('start_datetime, end_datetime, status, user_id')
          .eq('user_id', tok.user_id)
          .order('start_datetime', { ascending: false })
          .limit(12);
        if (entErr) throw new Error('Could not load cycle data.');

        const list = (entries || []) as unknown as PeriodEntry[];
        const stats = calculateCycleStats(list);
        if (mounted) {
          setPayload({
            lastPeriodStart: list[0]?.start_datetime ?? null,
            avgCycleLength: stats.avgCycleLength,
            avgPeriodDuration: stats.avgPeriodDuration,
          });
        }
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Unable to load this shared view.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-purple-50 dark:bg-gray-950">
        <div className="animate-spin w-10 h-10 border-3 border-purple-200 border-t-purple-500 rounded-full" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-purple-50 dark:bg-gray-950">
        <div className="max-w-sm text-center bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-lg">
          <ShieldQuestion size={40} className="mx-auto text-purple-400 mb-3" />
          <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">Link not available</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const lastStart = payload.lastPeriodStart ? parseISO(payload.lastPeriodStart) : null;
  const nextPeriod = lastStart ? addDays(lastStart, payload.avgCycleLength) : null;
  const ovulation = lastStart ? addDays(lastStart, payload.avgCycleLength - 14) : null;
  const fertileStart = ovulation ? addDays(ovulation, -5) : null;
  const fertileEnd = ovulation ? addDays(ovulation, 1) : null;
  const daysToNext = nextPeriod ? differenceInCalendarDays(nextPeriod, new Date()) : null;

  const phase = lastStart
    ? getCyclePhase(new Date(), payload.lastPeriodStart!, payload.avgCycleLength, payload.avgPeriodDuration)
    : null;
  const info = phase ? getPhaseInfo(phase.phase) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 dark:from-gray-950 dark:via-purple-950/20 dark:to-gray-900 p-6">
      <div className="max-w-sm mx-auto pt-10">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">{info?.emoji || '🌸'}</div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Cycle Update</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Shared privately • read only</p>
        </div>

        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur rounded-3xl p-6 shadow-lg border border-purple-100 dark:border-gray-800 space-y-4">
          {info && (
            <div className={`rounded-2xl p-4 ${info.color}`}>
              <p className="text-sm font-semibold">{info.label}</p>
              <p className="text-xs opacity-80 mt-1">{info.description}</p>
            </div>
          )}

          <Row label="Next period expected" value={nextPeriod ? format(nextPeriod, 'EEE, MMM d') : 'Not enough data'} />
          <Row
            label="Countdown"
            value={
              daysToNext === null
                ? '—'
                : daysToNext > 0
                ? `${daysToNext} day${daysToNext === 1 ? '' : 's'} to go`
                : daysToNext === 0
                ? 'Today 🩸'
                : `Late by ${Math.abs(daysToNext)} days`
            }
          />
          {ovulation && <Row label="Ovulation (est.)" value={format(ovulation, 'EEE, MMM d')} />}
          {fertileStart && fertileEnd && (
            <Row label="Fertile window" value={`${format(fertileStart, 'MMM d')} – ${format(fertileEnd, 'MMM d')}`} />
          )}
        </div>

        <p className="text-[10px] text-center text-gray-400 mt-6 flex items-center justify-center gap-1">
          <Eye size={12} /> Symptoms, notes & full history are hidden from this view.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-purple-50 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}
