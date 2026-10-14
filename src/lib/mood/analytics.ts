import type { MoodEntry } from "@/src/types/database";

export const MOOD_ANALYTICS_MINIMUMS = {
  trendComparison: 4,
  tagPattern: 3,
  timeBucket: 3,
  weeklyComparison: 4,
  metricAssociation: 4,
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
  const highest = dated.length ? dated.reduce((best, item) => item.entry.moodScore > best.entry.moodScore ? item : best) : null;
  const lowest = dated.length ? dated.reduce((best, item) => item.entry.moodScore < best.entry.moodScore ? item : best) : null;
  const averageMood = calculateMetricAverage(current, "moodScore");
  const previousAverageMood = calculateMetricAverage(previous, "moodScore");
  const comparison = current.length >= MOOD_ANALYTICS_MINIMUMS.weeklyComparison && previous.length >= MOOD_ANALYTICS_MINIMUMS.weeklyComparison && averageMood !== null && previousAverageMood !== null
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
    .map(([tag, taggedEntries]) => ({
      tag,
      count: taggedEntries.length,
      averageMood: calculateMetricAverage(taggedEntries, "moodScore")!,
      differenceFromOverall: overall === null ? 0 : Math.round((calculateMetricAverage(taggedEntries, "moodScore")! - overall) * 10) / 10,
    }))
    .filter((pattern) => pattern.count >= minimum)
    .sort((a, b) => b.count - a.count || b.averageMood - a.averageMood);
}

export function calculateContextPatterns(entries: MoodEntry[], minimum?: number) {
  return calculateTagPatterns(entries, "contexts", minimum);
}

export function calculateHelpfulFactorPatterns(entries: MoodEntry[], minimum?: number) {
  return calculateTagPatterns(entries, "helpfulFactors", minimum).sort((a, b) => b.averageMood - a.averageMood || b.count - a.count);
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
