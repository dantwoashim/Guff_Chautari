import React from 'react';

interface HabitItem {
  id: string;
  name: string;
  streakDays: number;
  adherence: number;
}

interface RoutineItem {
  id: string;
  title: string;
  window: string;
  consistency: number;
}

interface WellnessBoundaryReminder {
  id: string;
  label: string;
  description: string;
}

interface HealthDashboardPanelProps {
  userId: string;
  habits?: HabitItem[];
  routines?: RoutineItem[];
  boundaries?: WellnessBoundaryReminder[];
}

const defaultHabits: HabitItem[] = [
  {
    id: 'habit-1',
    name: 'Morning hydration',
    streakDays: 11,
    adherence: 0.86,
  },
  {
    id: 'habit-2',
    name: 'Evening walk',
    streakDays: 7,
    adherence: 0.72,
  },
  {
    id: 'habit-3',
    name: 'Sleep wind-down routine',
    streakDays: 5,
    adherence: 0.64,
  },
];

const defaultRoutines: RoutineItem[] = [
  {
    id: 'routine-1',
    title: 'Meal prep block',
    window: 'Sunday 5:00 PM',
    consistency: 0.79,
  },
  {
    id: 'routine-2',
    title: 'Bedtime shutdown',
    window: 'Daily 10:30 PM',
    consistency: 0.69,
  },
  {
    id: 'routine-3',
    title: 'Workout cadence',
    window: 'Mon/Wed/Fri 7:00 AM',
    consistency: 0.74,
  },
];

const defaultBoundaries: WellnessBoundaryReminder[] = [
  {
    id: 'boundary-1',
    label: 'Non-medical support only',
    description: 'No diagnosis or medication guidance. Habit planning and reflection only.',
  },
  {
    id: 'boundary-2',
    label: 'Emergency redirect',
    description: 'Potential emergency symptoms should be redirected to local emergency services immediately.',
  },
];

export const HealthDashboardPanel: React.FC<HealthDashboardPanelProps> = ({
  userId,
  habits = defaultHabits,
  routines = defaultRoutines,
  boundaries = defaultBoundaries,
}) => {
  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Health & Habit Dashboard</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Wellness routine overview for user <span className="font-mono text-[#7ed0f3]">{userId}</span>.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Habit Adherence</h3>
            <ul className="space-y-2">
              {habits.map((habit) => (
                <li key={habit.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-1 flex items-center justify-between text-sm text-[#d7e1e7]">
                    <span>{habit.name}</span>
                    <span>{Math.round(habit.adherence * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#24333c]">
                    <div
                      className="h-full bg-[#00a884]"
                      style={{ width: `${Math.round(habit.adherence * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#8fa3af]">{habit.streakDays}-day streak</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Routine Scheduler</h3>
            <ul className="space-y-2 text-sm text-[#d7e1e7]">
              {routines.map((routine) => (
                <li key={routine.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <p>{routine.title}</p>
                  <p className="mt-1 text-xs text-[#8fa3af]">{routine.window}</p>
                  <p className="text-xs text-[#7ed0f3]">Consistency: {Math.round(routine.consistency * 100)}%</p>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Safety Boundaries</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {boundaries.map((boundary) => (
              <article key={boundary.id} className="rounded border border-[#7d4d4f] bg-[#301a1d] p-3 text-sm">
                <p className="text-[#f2c1c3]">{boundary.label}</p>
                <p className="mt-1 text-xs text-[#e9b1b4]">{boundary.description}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
