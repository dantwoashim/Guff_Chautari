import type { EmotionalTrend, PatternInsight } from './types';

const average = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const weekday = (iso: string): number => new Date(iso).getDay();

const mkInsight = (
  id: string,
  label: string,
  description: string,
  confidence: number,
  severity: PatternInsight['severity']
): PatternInsight => ({
  id,
  label,
  description,
  confidence: Number(confidence.toFixed(3)),
  severity,
});

export const detectEmotionalPatterns = (trend: EmotionalTrend): PatternInsight[] => {
  const insights: PatternInsight[] = [];
  if (trend.points.length < 5) {
    return [
      mkInsight(
        'insufficient-data',
        'Not enough data yet',
        'Need at least five active days to detect temporal emotional patterns.',
        0.55,
        'low'
      ),
    ];
  }

  const allValence = trend.points.map((point) => point.valence);
  const baseline = average(allValence);

  const mondayValence = trend.points
    .filter((point) => weekday(point.dateIso) === 1)
    .map((point) => point.valence);

  if (mondayValence.length > 0) {
    const mondayAvg = average(mondayValence);
    if (mondayAvg + 0.08 < baseline) {
      insights.push(
        mkInsight(
          'monday-stress',
          'Monday stress spike',
          `Monday average valence (${mondayAvg.toFixed(2)}) is below baseline (${baseline.toFixed(2)}).`,
          0.79,
          'medium'
        )
      );
    }
  }

  const weekendValence = trend.points
    .filter((point) => {
      const day = weekday(point.dateIso);
      return day === 0 || day === 6;
    })
    .map((point) => point.valence);

  if (weekendValence.length > 0) {
    const weekendAvg = average(weekendValence);
    if (weekendAvg > baseline + 0.06) {
      insights.push(
        mkInsight(
          'weekend-calm',
          'Weekend calm pattern',
          `Weekend valence (${weekendAvg.toFixed(2)}) trends above baseline (${baseline.toFixed(2)}).`,
          0.74,
          'low'
        )
      );
    }
  }

  const volatility = Math.max(...allValence) - Math.min(...allValence);
  if (volatility > 0.35) {
    insights.push(
      mkInsight(
        'high-volatility',
        'High emotional volatility',
        `Valence range is ${volatility.toFixed(2)} over the window; consider smoothing workload intensity.`,
        0.82,
        'high'
      )
    );
  }

  return insights.length > 0
    ? insights
    : [
        mkInsight(
          'stable-pattern',
          'Stable emotional rhythm',
          'No strong weekly anomalies detected; emotional continuity appears stable.',
          0.66,
          'low'
        ),
      ];
};
