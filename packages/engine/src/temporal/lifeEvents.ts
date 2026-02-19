import type { LifeEvent } from './types';

const toIsoDate = (timestamp: number): string => {
  return new Date(timestamp).toISOString().slice(0, 10);
};

export const createDefaultLifeEvents = (referenceTimestamp: number): LifeEvent[] => {
  const referenceDate = new Date(referenceTimestamp);
  const referenceIso = toIsoDate(referenceTimestamp);

  const holiday = new Date(referenceDate);
  holiday.setDate(referenceDate.getDate() + 3);

  const birthday = new Date(referenceDate);
  birthday.setDate(referenceDate.getDate() + 12);

  return [
    {
      id: 'event-weekend',
      title: 'Weekend Reset',
      dateIso: referenceIso,
      type: 'weekend',
      moodShift: 0.08,
      note: 'More reflective and relaxed tone on weekends.',
    },
    {
      id: 'event-holiday',
      title: 'Upcoming Holiday',
      dateIso: holiday.toISOString().slice(0, 10),
      type: 'holiday',
      moodShift: 0.05,
      note: 'Slightly optimistic tone due to nearby holiday.',
    },
    {
      id: 'event-birthday',
      title: 'Birthday Week',
      dateIso: birthday.toISOString().slice(0, 10),
      type: 'birthday',
      moodShift: 0.12,
      note: 'Higher warmth and nostalgia.',
    },
  ];
};

export const getActiveLifeEvents = (events: ReadonlyArray<LifeEvent>, timestamp: number): LifeEvent[] => {
  const dayIso = toIsoDate(timestamp);
  return events.filter((event) => event.dateIso === dayIso);
};

export const applyLifeEventMoodShift = (baselineMood: number, events: ReadonlyArray<LifeEvent>): number => {
  const shift = events.reduce((sum, event) => sum + event.moodShift, 0);
  const adjusted = baselineMood + shift;
  if (adjusted < -1) return -1;
  if (adjusted > 1) return 1;
  return Number(adjusted.toFixed(3));
};
