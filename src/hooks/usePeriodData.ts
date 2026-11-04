import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, PeriodEntry, MonthlyInsight } from '../lib/supabase';
import { format } from 'date-fns';

export function usePeriodData() {
  const [entries, setEntries] = useState<PeriodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('period_entries')
        .select('*')
        .order('start_datetime', { ascending: false });

      if (fetchError) {
        if (fetchError.message?.includes('does not exist') || fetchError.code === '42P01') {
          setError('TABLE_NOT_FOUND');
        } else {
          setError(fetchError.message);
        }
        return;
      }

      setEntries(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();

    // Set up realtime subscription
    channelRef.current = supabase
      .channel('period_entries_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'period_entries' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setEntries(prev => [payload.new as PeriodEntry, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setEntries(prev => prev.map(e => e.id === (payload.new as PeriodEntry).id ? payload.new as PeriodEntry : e));
        } else if (payload.eventType === 'DELETE') {
          setEntries(prev => prev.filter(e => e.id !== (payload.old as PeriodEntry).id));
        }
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchEntries]);

  const startPeriod = async (
    flow: string | null,
    symptoms: string[],
    notes: string | null,
    options?: { startDatetime?: string; endDatetime?: string | null }
  ) => {
    const now = new Date().toISOString();
    const startDatetime = options?.startDatetime || now;
    const endDatetime = options?.endDatetime ?? null;
    const isCompleted = !!endDatetime && new Date(endDatetime).getTime() <= Date.now();

    const { data, error: insertError } = await supabase
      .from('period_entries')
      .insert({
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        ended_by: isCompleted ? endDatetime : null,
        created_at: now,
        updated_at: now,
        status: isCompleted ? 'completed' : 'active',
        flow,
        symptoms,
        notes
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return data;
  };

  const endPeriod = async (id: string) => {
    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from('period_entries')
      .update({
        end_datetime: now,
        ended_by: now,
        status: 'completed',
        updated_at: now
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;
    return data;
  };

  const updateEntry = async (id: string, updates: Partial<PeriodEntry>) => {
    const { data, error: updateError } = await supabase
      .from('period_entries')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;
    return data;
  };

  const deleteEntry = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('period_entries')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
  };

  const activeEntry = entries.find(e => e.status === 'active') || null;

  return {
    entries,
    loading,
    error,
    activeEntry,
    startPeriod,
    endPeriod,
    updateEntry,
    deleteEntry,
    refetch: fetchEntries
  };
}

export function useMonthlyInsights(entries: PeriodEntry[]) {
  const [insight, setInsight] = useState<MonthlyInsight | null>(null);
  const [loading, setLoading] = useState(true);

  const generateInsight = useCallback(() => {
    const completedEntries = entries
      .filter(e => e.status === 'completed' && e.end_datetime)
      .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());

    if (completedEntries.length === 0) {
      return {
        avgCycleLength: null,
        avgPeriodDuration: null,
        nextPredictions: [],
        commonSymptoms: [],
        trend: null,
        message: 'Not enough data yet. Track a few cycles to see insights!'
      };
    }

    // Calculate cycle lengths
    const cycleLengths: number[] = [];
    for (let i = 0; i < completedEntries.length - 1; i++) {
      const current = new Date(completedEntries[i].start_datetime).getTime();
      const previous = new Date(completedEntries[i + 1].start_datetime).getTime();
      const days = Math.round((current - previous) / (1000 * 60 * 60 * 24));
      if (days > 0 && days < 60) cycleLengths.push(days);
    }

    const avgCycleLength = cycleLengths.length > 0
      ? Math.round(cycleLengths.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(cycleLengths.length, 6))
      : 28;

    // Calculate period durations
    const durations = completedEntries.map(e => {
      const start = new Date(e.start_datetime).getTime();
      const end = new Date(e.end_datetime!).getTime();
      return Math.round((end - start) / (1000 * 60 * 60 * 24));
    });
    const avgPeriodDuration = Math.round(durations.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(durations.length, 6));

    // Next 3 predictions
    const lastStart = new Date(completedEntries[0].start_datetime);
    const nextPredictions = [1, 2, 3].map(i => {
      const next = new Date(lastStart);
      next.setDate(next.getDate() + (avgCycleLength * i));
      return next.toISOString();
    });

    // Common symptoms
    const symptomCounts: Record<string, number> = {};
    completedEntries.forEach(e => {
      (e.symptoms || []).forEach(s => {
        symptomCounts[s] = (symptomCounts[s] || 0) + 1;
      });
    });
    const commonSymptoms = Object.entries(symptomCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Trend
    let trend = null;
    if (cycleLengths.length >= 2) {
      const recent = cycleLengths.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(cycleLengths.length, 3);
      const older = cycleLengths.slice(3, 6);
      if (older.length > 0) {
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const diff = Math.round(recent - olderAvg);
        if (diff > 0) trend = `Your cycle is ${diff} day${diff > 1 ? 's' : ''} longer than before`;
        else if (diff < 0) trend = `Your cycle is ${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} shorter than before`;
        else trend = 'Your cycle length is consistent';
      }
    }

    // Personalized message
    const nextDate = format(new Date(nextPredictions[0]), 'd MMM yyyy');
    const regularity = cycleLengths.length >= 3 ?
      (Math.max(...cycleLengths.slice(0, 6)) - Math.min(...cycleLengths.slice(0, 6)) <= 4 ? 'regular' : 'slightly irregular') :
      'being tracked';

    const message = cycleLengths.length >= 2
      ? `Your cycles appear ${regularity} (${Math.min(...cycleLengths.slice(0, 6))}–${Math.max(...cycleLengths.slice(0, 6))} days). Next period expected around ${nextDate}.`
      : `Tracking your cycle. Average length so far: ${avgCycleLength} days. Next period expected around ${nextDate}.`;

    return { avgCycleLength, avgPeriodDuration, nextPredictions, commonSymptoms, trend, message };
  }, [entries]);

  useEffect(() => {
    const loadInsight = async () => {
      try {
        setLoading(true);
        const currentMonth = format(new Date(), 'yyyy-MM');

        const { data: existing } = await supabase
          .from('monthly_insights')
          .select('*')
          .eq('month', currentMonth)
          .single();

        if (existing) {
          setInsight(existing);
        } else {
          const insightData = generateInsight();
          const { data: newInsight } = await supabase
            .from('monthly_insights')
            .insert({
              month: currentMonth,
              insight_json: insightData,
              generated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (newInsight) setInsight(newInsight);
        }
      } catch (err) {
        // If table doesn't exist, just use generated data
        const insightData = generateInsight();
        setInsight({
          id: 'local',
          month: format(new Date(), 'yyyy-MM'),
          insight_json: insightData,
          generated_at: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };

    if (entries.length > 0) {
      loadInsight();
    } else {
      setLoading(false);
    }
  }, [entries, generateInsight]);

  return { insight, loading, regenerate: generateInsight };
}
