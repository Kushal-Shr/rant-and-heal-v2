import type { MoodEntry } from "@/src/types/database";
import type { MoodEmotion } from "./schema.ts";

export const MOOD_ANALYTICS_MINIMUMS = {
  trendComparison: 4,
  tagPattern: 3,
  timeBucket: 3,
  weeklyComparison: 4,
  metricAssociation: 4,
  emotionFrequency: 3,
  emotionIntensity: 2,
  beforeAfter: 3,
} as const;

export type MoodMetricKey =
  | "moodScore"
  | "stressScore"
  | "energyScore"
  | "sleepQualityScore"
  | "anxietyScore"
  | "focusScore"
  | "socialConnectionScore"
  | "physicalWellbeingScore";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

const DAY_MS = 86_400_000;

export function moodEntryDate(entry: MoodEntry): Date | null {
  const value = entry.createdAt as unknown;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 10;
}

export function entriesWithinDays(entries: MoodEntry[], days: number, now = new Date()) {
  const cutoff = now.getTime() - days * DAY_MS;
  return entries.filter((entry) => {
    const date = moodEntryDate(entry);
    return date && date.getTime() >= cutoff && date.getTime() <= now.getTime();
  });
}

export function calculateMetricAverage(entries: MoodEntry[], metric: MoodMetricKey) {
  const values = entries.map((entry) => entry[metric]).filter(validScore);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function calculateVariability(entries: MoodEntry[]) {
  const values = entries.map((entry) => entry.moodScore).filter(validScore);
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return {
    value: Math.round(deviation * 10) / 10,
    label: deviation < 1.25 ? "fairly steady" : deviation < 2.5 ? "gently varied" : "more varied",
  } as const;
}

function localDateKey(entry: MoodEntry, date: Date) {
  if (entry.localDate && /^\d{4}-\d{2}-\d{2}$/.test(entry.localDate)) return entry.localDate;
  return date.toLocaleDateString("en-CA");
}

export function calculateMoodTrend(entries: MoodEntry[], days: 7 | 30 | 90, now = new Date()) {
  const relevant = entriesWithinDays(entries, days, now)
    .map((entry) => ({ entry, date: moodEntryDate(entry) }))
    .filter((item): item is { entry: MoodEntry; date: Date } => Boolean(item.date) && validScore(item.entry.moodScore))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (days === 7) {
    return relevant.map(({ entry, date }) => ({
      id: entry.id ?? `${date.getTime()}`,
      date,
      localDate: localDateKey(entry, date),
      moodScore: entry.moodScore,
      sourceCount: 1,
      entry,
    }));
  }

  const byDay = new Map<string, { dates: Date[]; entries: MoodEntry[] }>();
  for (const item of relevant) {
    const key = localDateKey(item.entry, item.date);
    const bucket = byDay.get(key) ?? { dates: [], entries: [] };
    bucket.dates.push(item.date);
    bucket.entries.push(item.entry);
    byDay.set(key, bucket);
  }
  return [...byDay.entries()].map(([localDate, bucket]) => ({
    id: localDate,
    date: new Date(Math.min(...bucket.dates.map((date) => date.getTime()))),
    localDate,
    moodScore: calculateMetricAverage(bucket.entries, "moodScore")!,
    sourceCount: bucket.entries.length,
    entry: bucket.entries[0],
  })).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function calculateWeeklySnapshot(entries: MoodEntry[], now = new Date()) {
  const currentStart = now.getTime() - 7 * DAY_MS;
  const previousStart = now.getTime() - 14 * DAY_MS;
  const current = entries.filter((entry) => {
    const time = moodEntryDate(entry)?.getTime();
    return time !== undefined && time >= currentStart && time <= now.getTime();
  });
  const previous = entries.filter((entry) => {
    const time = moodEntryDate(entry)?.getTime();
    return time !== undefined && time >= previousStart && time < currentStart;
  });
  const dated = current
    .map((entry) => ({ entry, date: moodEntryDate(entry) }))
    .filter((item): item is { entry: MoodEntry; date: Date } => Boolean(item.date) && validScore(item.entry.moodScore));
  const previousMoodEntries = previous.filter((entry) => validScore(entry.moodScore));
  const highest = dated.length ? dated.reduce((best, item) => item.entry.moodScore! > best.entry.moodScore! ? item : best) : null;
  const lowest = dated.length ? dated.reduce((best, item) => item.entry.moodScore! < best.entry.moodScore! ? item : best) : null;
  const averageMood = calculateMetricAverage(current, "moodScore");
  const previousAverageMood = calculateMetricAverage(previous, "moodScore");
  const comparison = dated.length >= MOOD_ANALYTICS_MINIMUMS.weeklyComparison && previousMoodEntries.length >= MOOD_ANALYTICS_MINIMUMS.weeklyComparison && averageMood !== null && previousAverageMood !== null
    ? averageMood - previousAverageMood
    : null;
  return {
    averageMood,
    averageStress: calculateMetricAverage(current, "stressScore"),
    averageEnergy: calculateMetricAverage(current, "energyScore"),
    checkIns: current.length,
    daysCheckedIn: new Set(dated.map(({ entry, date }) => localDateKey(entry, date))).size,
    highest,
    lowest,
    variability: calculateVariability(current),
    comparison: comparison === null ? null : Math.round(comparison * 10) / 10,
    previousCheckIns: previous.length,
  };
}

type TagField = "contexts" | "helpfulFactors";

function calculateTagPatterns(entries: MoodEntry[], field: TagField, minimum: number = MOOD_ANALYTICS_MINIMUMS.tagPattern) {
  const overall = calculateMetricAverage(entries, "moodScore");
  const grouped = new Map<string, MoodEntry[]>();
  for (const entry of entries) {
    for (const tag of entry[field] ?? []) grouped.set(tag, [...(grouped.get(tag) ?? []), entry]);
  }
  return [...grouped.entries()]
    .map(([tag, taggedEntries]) => {
      const averageMood = calculateMetricAverage(taggedEntries, "moodScore");
      return {
        tag,
        count: taggedEntries.length,
        averageMood,
        differenceFromOverall: overall === null || averageMood === null ? null : Math.round((averageMood - overall) * 10) / 10,
      };
    })
    .filter((pattern) => pattern.count >= minimum)
    .sort((a, b) => b.count - a.count || (b.averageMood ?? -1) - (a.averageMood ?? -1));
}

export function calculateContextPatterns(entries: MoodEntry[], minimum?: number) {
  return calculateTagPatterns(entries, "contexts", minimum);
}

export function calculateHelpfulFactorPatterns(entries: MoodEntry[], minimum?: number) {
  return calculateTagPatterns(entries, "helpfulFactors", minimum).sort((a, b) => (b.averageMood ?? -1) - (a.averageMood ?? -1) || b.count - a.count);
}

function hourInTimezone(date: Date, timezone?: string) {
  if (!timezone) return date.getHours();
  try {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: timezone }).formatToParts(date).find((part) => part.type === "hour")?.value;
    const numeric = Number(hour);
    return numeric === 24 ? 0 : numeric;
  } catch {
    return date.getHours();
  }
}

export function timeOfDayForEntry(entry: MoodEntry): TimeOfDay | null {
  const date = moodEntryDate(entry);
  if (!date) return null;
  const hour = hourInTimezone(date, entry.timezone);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function calculateTimeOfDayPatterns(entries: MoodEntry[], minimum: number = MOOD_ANALYTICS_MINIMUMS.timeBucket) {
  const buckets = new Map<TimeOfDay, MoodEntry[]>();
  for (const entry of entries) {
    if (!validScore(entry.moodScore)) continue;
    const bucket = timeOfDayForEntry(entry);
    if (bucket) buckets.set(bucket, [...(buckets.get(bucket) ?? []), entry]);
  }
  return [...buckets.entries()].map(([period, bucketEntries]) => ({
    period,
    count: bucketEntries.length,
    averageMood: calculateMetricAverage(bucketEntries, "moodScore")!,
    averageStress: calculateMetricAverage(bucketEntries, "stressScore"),
  })).filter((pattern) => pattern.count >= minimum).sort((a, b) => b.averageMood - a.averageMood);
}

export function calculateMetricAssociation(entries: MoodEntry[], metric: MoodMetricKey, minimum: number = MOOD_ANALYTICS_MINIMUMS.metricAssociation) {
  const pairs = entries
    .map((entry) => ({ mood: entry.moodScore, metric: entry[metric] }))
    .filter((pair): pair is { mood: number; metric: number } => validScore(pair.mood) && validScore(pair.metric));
  if (pairs.length < minimum) return null;
  const metricMean = pairs.reduce((sum, pair) => sum + pair.metric, 0) / pairs.length;
  const lower = pairs.filter((pair) => pair.metric < metricMean);
  const higher = pairs.filter((pair) => pair.metric >= metricMean);
  if (!lower.length || !higher.length) return null;
  const lowerMood = lower.reduce((sum, pair) => sum + pair.mood, 0) / lower.length;
  const higherMood = higher.reduce((sum, pair) => sum + pair.mood, 0) / higher.length;
  return { count: pairs.length, difference: Math.round((higherMood - lowerMood) * 10) / 10 };
}

export function weeklyComparisonText(change: number | null) {
  if (change === null || Math.abs(change) < 0.4) return change === null ? null : "Your mood check-ins were fairly similar to last week.";
  return change > 0
    ? "Your mood check-ins were a little higher this week than last week."
    : "Your mood check-ins were a little lower this week than last week.";
}

export function calculateEmotionFrequency(
  entries: MoodEntry[],
  minimumCheckIns: number = MOOD_ANALYTICS_MINIMUMS.emotionFrequency
) {
  const reported = entries.filter((entry) => entry.emotions?.length);
  if (reported.length < minimumCheckIns) return [];
  const counts = new Map<MoodEmotion, number>();
  for (const entry of reported) {
    for (const emotion of new Set(entry.emotions!.map((item) => item.emotion))) {
      counts.set(emotion, (counts.get(emotion) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([emotion, count]) => ({
    emotion,
    count,
    checkInCount: reported.length,
    percentage: Math.round((count / reported.length) * 100),
  })).sort((a, b) => b.count - a.count || a.emotion.localeCompare(b.emotion));
}

export function calculateEmotionAverageIntensity(
  entries: MoodEntry[],
  minimumObservations: number = MOOD_ANALYTICS_MINIMUMS.emotionIntensity
) {
  const values = new Map<MoodEmotion, number[]>();
  for (const entry of entries) {
    for (const item of entry.emotions ?? []) {
      if (!validScore(item.intensity)) continue;
      values.set(item.emotion, [...(values.get(item.emotion) ?? []), item.intensity]);
    }
  }
  return [...values.entries()].map(([emotion, intensities]) => ({
    emotion,
    observations: intensities.length,
    averageIntensity: Math.round((intensities.reduce((sum, value) => sum + value, 0) / intensities.length) * 10) / 10,
  })).filter((item) => item.observations >= minimumObservations)
    .sort((a, b) => b.averageIntensity - a.averageIntensity || b.observations - a.observations);
}

export function calculateContextFrequency(entries: MoodEntry[], minimum = 1) {
  const relevant = entries.filter((entry) => entry.contexts?.length);
  const counts = new Map<string, number>();
  for (const entry of relevant) {
    for (const context of new Set(entry.contexts ?? [])) {
      counts.set(context, (counts.get(context) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([context, count]) => ({
    context,
    count,
    checkInCount: relevant.length,
    percentage: relevant.length ? Math.round((count / relevant.length) * 100) : 0,
  })).filter((item) => item.count >= minimum)
    .sort((a, b) => b.count - a.count || a.context.localeCompare(b.context));
}

export function calculateDailyMoodHistory(entries: MoodEntry[], limit = 30) {
  return entries.map((entry) => ({ entry, date: moodEntryDate(entry) }))
    .filter((item): item is { entry: MoodEntry; date: Date } => Boolean(item.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit)
    .map(({ entry, date }) => ({
      id: entry.id ?? `${date.getTime()}`,
      date,
      moodScore: validScore(entry.moodScore) ? entry.moodScore : null,
      emotions: entry.emotions ?? [],
      contexts: entry.contexts ?? [],
      source: entry.source ?? "MANUAL_CHECKIN",
    }));
}

export function calculateWeeklyMoodSummary(entries: MoodEntry[], now = new Date()) {
  const relevant = entriesWithinDays(entries, 7, now);
  return {
    dateRange: {
      start: new Date(now.getTime() - 7 * DAY_MS),
      end: now,
    },
    ...calculateWeeklySnapshot(entries, now),
    emotionFrequency: calculateEmotionFrequency(relevant),
    emotionAverages: calculateEmotionAverageIntensity(relevant),
    contextFrequency: calculateContextFrequency(relevant, MOOD_ANALYTICS_MINIMUMS.tagPattern),
    history: calculateDailyMoodHistory(relevant),
  };
}

export function calculatePersonalMoodInsights(entries: MoodEntry[], now = new Date()) {
  const recent = entriesWithinDays(entries, 30, now);
  const insights: string[] = [];
  const emotion = calculateEmotionFrequency(recent)[0];
  if (emotion) {
    insights.push(`${emotion.emotion.charAt(0).toUpperCase()}${emotion.emotion.slice(1)} appeared in ${emotion.count} of your ${emotion.checkInCount} emotion check-ins.`);
  }
  const time = calculateTimeOfDayPatterns(recent);
  if (time.length >= 2 && time[0].averageMood - time.at(-1)!.averageMood >= 0.5) {
    insights.push(`Your ${time[0].period} check-ins tended to be higher than your ${time.at(-1)!.period} check-ins.`);
  }
  const context = calculateContextFrequency(recent, MOOD_ANALYTICS_MINIMUMS.tagPattern)[0];
  if (context) {
    insights.push(`${context.context.split("-").join(" ")} appeared in ${context.count} recent check-ins.`);
  }
  return insights;
}

export function compareBeforeAfterCheckIn(entries: MoodEntry[]) {
  const byId = new Map(entries.flatMap((entry) => entry.id ? [[entry.id, entry] as const] : []));
  const comparisons: number[] = [];
  for (const after of entries) {
    if (after.source !== "POST_SESSION" || !after.baselineCheckInId) continue;
    const before = byId.get(after.baselineCheckInId);
    if (!before) continue;
    const beforeByEmotion = new Map((before.emotions ?? []).flatMap((item) => validScore(item.intensity) ? [[item.emotion, item.intensity] as const] : []));
    for (const item of after.emotions ?? []) {
      const previous = beforeByEmotion.get(item.emotion);
      if (previous !== undefined && validScore(item.intensity)) comparisons.push(item.intensity - previous);
    }
  }
  if (comparisons.length < MOOD_ANALYTICS_MINIMUMS.beforeAfter) return null;
  return {
    comparisons: comparisons.length,
    averageIntensityChange: Math.round((comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length) * 10) / 10,
  };
}
