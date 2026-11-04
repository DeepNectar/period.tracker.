import { useEffect, useState } from 'react';
import { BellRing, Check, X, Pill, Trash2, Plus } from 'lucide-react';
import { notifyLocal } from '../utils/notifications';
import {
  Medication,
  loadMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  getMedStatus,
  markMedTaken,
  markMedMissed,
  clearMedStatus,
  adherenceRate,
  runMedReminderCheck,
} from '../utils/medications';

const EMOJIS = ['💊', '🧴', '🌿', '💉', '🩹', '☕'];

/**
 * Module 4 — Medication & supplement reminders with taken/missed tracking.
 * Runs inside the Today screen and as a Tools tab.
 */
export function MedicationReminders({ compact = false }: { compact?: boolean }) {
  const [meds, setMeds] = useState<Medication[]>(loadMedications);
  const [showAdd, setShowAdd] = useState(false);
  const [, setTick] = useState(0); // re-render after status changes

  // Minute-tick scheduler for local notifications
  useEffect(() => {
    runMedReminderCheck(notifyLocal);
    const t = setInterval(() => {
      runMedReminderCheck(notifyLocal);
      setTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = () => setMeds(loadMedications());

  const handleAdd = (m: Omit<Medication, 'id' | 'createdAt'>) => {
    addMedication(m);
    refresh();
    setShowAdd(false);
  };

  const toggleEnabled = (m: Medication) => {
    updateMedication(m.id, { enabled: !m.enabled });
    refresh();
  };

  const remove = (id: string) => {
    deleteMedication(id);
    refresh();
  };

  const dueSoon = meds.filter((m) => m.enabled && !getMedStatus(m.id)?.takenAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Pill size={14} className="text-amber-500" /> Medications & supplements
          {dueSoon.length > 0 && <span className="text-amber-500">· {dueSoon.length} due</span>}
        </p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300"
          title="Add medication"
        >
          <Plus size={14} />
        </button>
      </div>

      {showAdd && <AddMedForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {meds.length === 0 && !showAdd && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          No medications yet. Add pills, vitamins or iron supplements to get daily reminders and track adherence.
        </p>
      )}

      <div className="space-y-2">
        {meds.map((m) => {
          const status = getMedStatus(m.id);
          const adh = adherenceRate(m.id, compact ? 7 : 14);
          return (
            <div
              key={m.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors ${
                status?.takenAt
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : status?.missedMarked
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-700'
              }`}
            >
              <span className="text-lg">{m.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                  {m.name} <span className="font-normal text-gray-400">· {m.dosage}</span>
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  🕐 {m.time} · {adh.pct}% taken (last {compact ? 7 : 14}d)
                </p>
              </div>

              {status?.takenAt ? (
                <button
                  onClick={() => {
                    clearMedStatus(m.id);
                    setTick((n) => n + 1);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500 text-white text-[10px] font-semibold"
                  title="Undo"
                >
                  <Check size={11} /> Taken
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      markMedTaken(m.id);
                      setTick((n) => n + 1);
                    }}
                    className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 hover:bg-green-200"
                    title="Mark taken"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => {
                      markMedMissed(m.id);
                      setTick((n) => n + 1);
                    }}
                    className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-300 hover:bg-red-200"
                    title="Mark missed"
                  >
                    <X size={13} />
                  </button>
                </>
              )}

              {!compact && (
                <button
                  onClick={() => toggleEnabled(m)}
                  className={`p-1.5 rounded-lg ${
                    m.enabled
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }`}
                  title={m.enabled ? 'Pause reminders' : 'Resume reminders'}
                >
                  <BellRing size={13} />
                </button>
              )}
              {!compact && (
                <button onClick={() => remove(m.id)} className="p-1.5 text-gray-300 hover:text-red-400" title="Delete">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddMedForm({
  onAdd,
  onCancel,
}: {
  onAdd: (m: Omit<Medication, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [time, setTime] = useState('09:00');
  const [emoji, setEmoji] = useState('💊');

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), dosage: dosage.trim() || '1 dose', time, emoji, enabled: true });
  };

  const inputCls =
    'w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-2.5 focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-800 dark:text-gray-100';

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
      <div className="flex gap-2">
        {EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            className={`w-8 h-8 rounded-lg text-base ${emoji === e ? 'bg-amber-200 dark:bg-amber-700' : 'bg-white dark:bg-gray-800'}`}
          >
            {e}
          </button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Ibuprofen, Iron)" className={inputCls} />
      <div className="flex gap-2">
        <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Dosage (e.g. 400 mg)" className={inputCls} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputCls} flex-shrink-0 w-28`} />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium">
          Cancel
        </button>
        <button onClick={submit} className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold">
          Add reminder
        </button>
      </div>
    </div>
  );
}
