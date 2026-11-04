import { useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { formatShortDateTime, formatDuration } from '../utils/dates';
import { useToast } from './Toast';
import { Droplets, Edit3, Trash2, StopCircle, AlertTriangle, Smile, Plus, ChevronDown, Search } from 'lucide-react';

const SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Back pain', 'Acne', 'Nausea', 'Insomnia', 'Cravings', 'Breast tenderness', 'Dizziness'];
const MOODS = ['😊 Happy', '😢 Sad', '😤 Irritable', '😰 Anxious', '😴 Tired', '🥰 Loving', '😐 Neutral', '🤢 Sick'];

type Props = {
  entries: PeriodEntry[];
  onEndPeriod: (id: string) => Promise<any>;
  onUpdateEntry: (id: string, updates: Partial<PeriodEntry>) => Promise<any>;
  onDeleteEntry: (id: string) => Promise<void>;
  onStartPeriod: (flow: string | null, symptoms: string[], notes: string | null, options?: { startDatetime?: string; endDatetime?: string | null }) => Promise<any>;
};

// Convert an ISO datetime string to the value format used by <input type="datetime-local">
const toLocalInputValue = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInputValue = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
};

export function HistoryScreen({ entries, onEndPeriod, onUpdateEntry, onDeleteEntry, onStartPeriod }: Props) {
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFlow, setEditFlow] = useState('');
  const [editSymptoms, setEditSymptoms] = useState<string[]>([]);
  const [editMood, setEditMood] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // Manual entry "Add" form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStart, setAddStart] = useState('');
  const [addEnd, setAddEnd] = useState('');
  const [addFlow, setAddFlow] = useState('Medium');
  const [addSymptoms, setAddSymptoms] = useState<string[]>([]);
  const [addMood, setAddMood] = useState('');
  const [addNotes, setAddNotes] = useState('');
  // Accordion state for history entry boxes: expanding one collapses the previously open one.
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Tab state: 'active' shows ongoing periods, 'complete' shows finished ones.
  const [historyTab, setHistoryTab] = useState<'active' | 'complete'>('active');
  // Search & sort for the Complete tab
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'longest' | 'shortest'>('newest');
  const { showToast } = useToast();

  const handleEnd = async (id: string) => {
    try {
      await onEndPeriod(id);
      showToast(`Period ended at ${formatShortDateTime(new Date().toISOString())}`);
      setConfirmEnd(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to end period', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteEntry(id);
      showToast('Entry deleted');
      setConfirmDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete', 'error');
    }
  };

  const startEdit = (entry: PeriodEntry) => {
    setEditingId(entry.id);
    setEditFlow(entry.flow || 'Medium');
    // Extract mood from symptoms if present
    const moodSymptom = (entry.symptoms || []).find(s => s.startsWith('Mood:'));
    const regularSymptoms = (entry.symptoms || []).filter(s => !s.startsWith('Mood:'));
    setEditSymptoms(regularSymptoms);
    setEditMood(moodSymptom ? moodSymptom.replace('Mood: ', '') : '');
    setEditNotes(entry.notes || '');
    setEditStart(toLocalInputValue(entry.start_datetime));
    setEditEnd(toLocalInputValue(entry.end_datetime));
  };

  const saveEdit = async (id: string) => {
    try {
      const startISO = fromLocalInputValue(editStart);
      const endISO = fromLocalInputValue(editEnd);
      if (!startISO) {
        showToast('Please enter a valid start date & time', 'error');
        return;
      }
      if (endISO && new Date(endISO) <= new Date(startISO)) {
        showToast('End date must be after start date', 'error');
        return;
      }
      const allSymptoms = editMood ? [...editSymptoms, `Mood: ${editMood}`] : editSymptoms;
      const updates: Partial<PeriodEntry> = {
        flow: editFlow as any,
        symptoms: allSymptoms,
        notes: editNotes || null,
        start_datetime: startISO,
        end_datetime: endISO,
      };
      if (endISO) {
        updates.status = 'completed';
        updates.ended_by = endISO;
      } else {
        updates.status = 'active';
        updates.ended_by = null;
      }
      await onUpdateEntry(id, updates);
      showToast('Entry updated');
      setEditingId(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setAddStart('');
    setAddEnd('');
    setAddFlow('Medium');
    setAddSymptoms([]);
    setAddMood('');
    setAddNotes('');
  };

  const handleManualAdd = async () => {
    try {
      const startISO = fromLocalInputValue(addStart);
      const endISO = fromLocalInputValue(addEnd);
      if (!startISO) {
        showToast('Please enter a valid start date & time', 'error');
        return;
      }
      if (endISO && new Date(endISO) <= new Date(startISO)) {
        showToast('End date must be after start date', 'error');
        return;
      }
      const allSymptoms = addMood ? [...addSymptoms, `Mood: ${addMood}`] : addSymptoms;
      await onStartPeriod(addFlow as any, allSymptoms, addNotes || null, {
        startDatetime: startISO,
        endDatetime: endISO,
      });
      showToast(endISO ? 'Period entry added' : 'Ongoing period entry added');
      resetAddForm();
    } catch (err: any) {
      showToast(err.message || 'Failed to add entry', 'error');
    }
  };

  const extractMood = (symptoms: string[] | null): string | null => {
    if (!symptoms) return null;
    const moodSymptom = symptoms.find(s => s.startsWith('Mood:'));
    return moodSymptom ? moodSymptom.replace('Mood: ', '') : null;
  };

  // Split entries into Active and Complete tabs
  const activeEntries = entries.filter(e => e.status === 'active');
  const completeEntries = entries.filter(e => e.status !== 'active');

  // Search + sort applied to the Complete tab
  const durationMs = (entry: PeriodEntry) => {
    const start = new Date(entry.start_datetime).getTime();
    const end = entry.end_datetime ? new Date(entry.end_datetime).getTime() : Date.now();
    return end - start;
  };

  const filteredCompleteEntries = (() => {
    const q = searchQuery.trim().toLowerCase();
    let list = completeEntries;
    if (q) {
      list = list.filter(e => {
        const mood = extractMood(e.symptoms);
        const haystack = [
          formatShortDateTime(e.start_datetime),
          e.end_datetime ? formatShortDateTime(e.end_datetime) : '',
          e.flow || '',
          mood || '',
          ...(e.symptoms || []),
          e.notes || '',
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...list];
    switch (sortOrder) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
        break;
      case 'longest':
        sorted.sort((a, b) => durationMs(b) - durationMs(a));
        break;
      case 'shortest':
        sorted.sort((a, b) => durationMs(a) - durationMs(b));
        break;
    }
    return sorted;
  })();

  const visibleEntries = historyTab === 'active' ? activeEntries : filteredCompleteEntries;

  const addForm = (
    <div className="rounded-2xl p-4 border bg-white dark:bg-gray-800 border-pink-200 dark:border-pink-800 shadow-sm mb-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">New Manual Entry</h3>
      <div className="grid grid-cols-1 gap-3 mb-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Start Date &amp; Time *</label>
          <input type="datetime-local" value={addStart} onChange={e => setAddStart(e.target.value)}
            className="mt-1 w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">End Date &amp; Time (leave empty if ongoing)</label>
          <input type="datetime-local" value={addEnd} onChange={e => setAddEnd(e.target.value)}
            className="mt-1 w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 focus:outline-none" />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Flow</label>
        <div className="flex gap-2 mt-1">
          {['Light', 'Medium', 'Heavy'].map(f => (
            <button key={f} onClick={() => setAddFlow(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${addFlow === f ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-300 dark:border-pink-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-transparent'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Mood</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {MOODS.map(m => (
            <button key={m} onClick={() => setAddMood(addMood === m ? '' : m)}
              className={`px-2 py-1 rounded-full text-[10px] font-medium ${addMood === m ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symptoms</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {SYMPTOMS.map(sy => (
            <button key={sy} onClick={() => setAddSymptoms(prev => prev.includes(sy) ? prev.filter(x => x !== sy) : [...prev, sy])}
              className={`px-2 py-1 rounded-full text-[10px] font-medium ${addSymptoms.includes(sy) ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {sy}
            </button>
          ))}
        </div>
      </div>
      <textarea value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Notes (optional)"
        className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 resize-none h-16 mb-3 focus:outline-none" />
      <div className="flex gap-2">
        <button onClick={resetAddForm} className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium">Cancel</button>
        <button onClick={handleManualAdd} className="flex-1 py-2 rounded-lg bg-pink-400 text-white text-xs font-medium">Add Entry</button>
      </div>
    </div>
  );

  if (entries.length === 0) {
    return (
      <div className="px-4 pb-24 pt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">History</h1>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-400 text-white text-xs font-medium hover:bg-pink-500 transition-colors"
            >
              <Plus size={14} /> Add Entry
            </button>
          )}
        </div>
        {showAddForm && addForm}
        {!showAddForm && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300">No entries yet</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 text-center">Start tracking your period or add a manual entry to see your history here</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pb-24 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">History</h1>
        <button
          onClick={() => setShowAddForm(prev => !prev)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-400 text-white text-xs font-medium hover:bg-pink-500 transition-colors"
        >
          <Plus size={14} /> {showAddForm ? 'Close' : 'Add Entry'}
        </button>
      </div>

      {showAddForm && addForm}

      {/* Active / Complete tabs */}
      <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
        <button
          onClick={() => setHistoryTab('active')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
            historyTab === 'active'
              ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-300 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Active {activeEntries.length > 0 && `(${activeEntries.length})`}
        </button>
        <button
          onClick={() => setHistoryTab('complete')}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
            historyTab === 'complete'
              ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-300 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Complete {completeEntries.length > 0 && `(${completeEntries.length})`}
        </button>
      </div>

      {/* Search & sort controls (Complete tab only) */}
      {historyTab === 'complete' && completeEntries.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by date, flow, mood, symptoms or notes..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-pink-300 dark:focus:border-pink-700 shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm font-bold"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {([
              ['newest', 'Newest'],
              ['oldest', 'Oldest'],
              ['longest', 'Longest'],
              ['shortest', 'Shortest'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSortOrder(value)}
                className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                  sortOrder === value
                    ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-300 dark:border-pink-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14">
          <div className="text-5xl mb-3">{historyTab === 'active' ? '🩸' : '📋'}</div>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            {historyTab === 'active'
              ? 'No active periods right now'
              : searchQuery.trim()
                ? `No completed entries match "${searchQuery.trim()}"`
                : 'No completed entries yet'}
          </p>
        </div>
      ) : (
      <div className="space-y-3">
        {visibleEntries.map(entry => {
          const mood = extractMood(entry.symptoms);
          const regularSymptoms = (entry.symptoms || []).filter(s => !s.startsWith('Mood:'));
          const isOpen = openEntryId === entry.id;

          return (
          <div
            key={entry.id}
            className={`rounded-2xl border shadow-sm transition-all overflow-hidden ${
              entry.status === 'active'
                ? 'bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border-pink-200 dark:border-pink-800'
                : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
            }`}
          >
            {editingId === entry.id ? (
              <div className="p-4">
                <div className="grid grid-cols-1 gap-3 mb-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Start Date &amp; Time *</label>
                    <input type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)}
                      className="mt-1 w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">End Date &amp; Time (leave empty if ongoing)</label>
                    <input type="datetime-local" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      className="mt-1 w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 focus:outline-none" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Flow</label>
                  <div className="flex gap-2 mt-1">
                    {['Light', 'Medium', 'Heavy'].map(f => (
                      <button key={f} onClick={() => setEditFlow(f)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${editFlow === f ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border border-pink-300 dark:border-pink-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-transparent'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Mood</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {MOODS.map(m => (
                      <button key={m} onClick={() => setEditMood(editMood === m ? '' : m)}
                        className={`px-2 py-1 rounded-full text-[10px] font-medium ${editMood === m ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Symptoms</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {SYMPTOMS.map(s => (
                      <button key={s} onClick={() => setEditSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                        className={`px-2 py-1 rounded-full text-[10px] font-medium ${editSymptoms.includes(s) ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                  className="w-full p-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 resize-none h-16 mb-3 focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium">Cancel</button>
                  <button onClick={() => saveEdit(entry.id)} className="flex-1 py-2 rounded-lg bg-pink-400 text-white text-xs font-medium">Save</button>
                </div>
              </div>
            ) : (
              <div>
                {/* Compact header — clicking toggles this box (accordion behaviour) */}
                <button
                  type="button"
                  onClick={() => setOpenEntryId(isOpen ? null : entry.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 p-3 text-left select-none active:opacity-80 transition-colors"
                >
                  {entry.status === 'active' ? (
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-200 dark:bg-pink-800 text-pink-800 dark:text-pink-200 animate-pulse">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      Completed
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {formatShortDateTime(entry.start_datetime)}
                    </span>
                    <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {entry.end_datetime
                        ? `End: ${formatShortDateTime(entry.end_datetime)} · ${formatDuration(entry.start_datetime, entry.end_datetime)}`
                        : `Ongoing · ${formatDuration(entry.start_datetime, entry.end_datetime)}`}
                    </span>
                  </span>
                  {entry.flow && (
                    <span className="shrink-0 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Droplets size={12} /> {entry.flow}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-pink-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div className="px-3 pb-3">
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            Start: {formatShortDateTime(entry.start_datetime)}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            End: {entry.end_datetime ? formatShortDateTime(entry.end_datetime) : '— Ongoing —'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Duration: {formatDuration(entry.start_datetime, entry.end_datetime)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {entry.flow && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Droplets size={12} /> {entry.flow}
                            </div>
                          )}
                          {mood && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Smile size={12} /> {mood}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Symptoms chips */}
                      {regularSymptoms.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {regularSymptoms.map(s => (
                            <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {entry.notes && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">"{entry.notes}"</p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        {entry.status === 'active' && (
                          <button
                            onClick={() => setConfirmEnd(entry.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                          >
                            <StopCircle size={12} /> End Period
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(entry)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(entry.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
      )}

      {/* Confirm End Dialog */}
      {confirmEnd && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">End Period?</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This will record the current time as the end of your period. This action captures the exact timestamp.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmEnd(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm">
                Cancel
              </button>
              <button onClick={() => handleEnd(confirmEnd)} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium text-sm">
                End Period
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">Delete Entry?</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              This entry will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
