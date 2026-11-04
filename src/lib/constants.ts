// Shared option lists used across logging screens

export const FLOW_OPTIONS = ['Spotting', 'Light', 'Medium', 'Heavy'] as const;
export type FlowValue = (typeof FLOW_OPTIONS)[number];

/** Extra flow details (tags) — e.g. clots. Stored alongside the daily log. */
export const FLOW_DETAIL_OPTIONS = ['Clots', 'Flooding', 'Period-free day'] as const;

// Physical symptoms (Module 1: holistic symptom logging)
export const SYMPTOM_OPTIONS = [
  'Cramps',
  'Headache',
  'Migraine',
  'Fatigue',
  'Bloating',
  'Acne',
  'Tender breasts',
  'Back pain',
  'Nausea',
  'Dizziness',
  'Cravings',
  'Insomnia',
  'Joint pain',
  'Libido changes',
];

// Emotional / mood tags — kept separate so they can be filtered & correlated on their own
export const EMOTIONAL_SYMPTOM_OPTIONS = [
  'Anxiety',
  'Irritability',
  'Sadness',
  'Euphoria',
  'Low focus',
  'Mood swings',
];

/** All taggable symptoms (physical + emotional). */
export const ALL_SYMPTOM_OPTIONS = [...SYMPTOM_OPTIONS, ...EMOTIONAL_SYMPTOM_OPTIONS];

export const MOOD_OPTIONS = [
  { emoji: '😊', label: 'Happy' },
  { emoji: '😌', label: 'Calm' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😤', label: 'Irritable' },
  { emoji: '😰', label: 'Anxious' },
  { emoji: '🥱', label: 'Tired' },
  { emoji: '💪', label: 'Energetic' },
  { emoji: '🎭', label: 'Moody' },
  { emoji: '🤩', label: 'Euphoric' },
  { emoji: '🎯', label: 'Focused' },
];

export const INTENSITY_OPTIONS = ['Mild', 'Moderate', 'Severe'] as const;
export type IntensityValue = (typeof INTENSITY_OPTIONS)[number];

export const DISCHARGE_OPTIONS = [
  'Dry',
  'Creamy',
  'Watery',
  'Egg white',
  'Spotting',
] as const;
export type DischargeValue = (typeof DISCHARGE_OPTIONS)[number];

export const PAIN_SITES = ['Abdomen', 'Lower back', 'Head', 'Breasts', 'Legs / joints'] as const;

/** Map the 1–10 pain slider value to the stored intensity label. */
export function painLevelToIntensity(level: number | null): string | null {
  if (level == null) return null;
  if (level <= 3) return 'Mild';
  if (level <= 6) return 'Moderate';
  return 'Severe';
}

export function intensityToPainLevel(intensity: string | null): number | null {
  switch (intensity) {
    case 'Mild':
      return 2;
    case 'Moderate':
      return 5;
    case 'Severe':
      return 8;
    default:
      return null;
  }
}
