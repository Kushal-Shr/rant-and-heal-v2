import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateContextPatterns,
  calculateHelpfulFactorPatterns,
  calculateMetricAssociation,
  calculateMoodTrend,
  calculateTimeOfDayPatterns,
  calculateVariability,
  calculateWeeklySnapshot,
  entriesWithinDays,
  weeklyComparisonText,
} from "../src/lib/mood/analytics.ts";

const now = new Date("2026-10-13T18:00:00.000Z");
const daysAgo = (days, hour = 18) => {
  const date = new Date(now.getTime() - days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
const entry = (days, moodScore, extra = {}) => ({ id: `${days}-${moodScore}-${extra.localDate ?? "x"}`, moodScore, createdAt: daysAgo(days), ...extra });

test("historical V1 records work without V2 optional fields", () => {
  const legacy = { moodScore: 6, anxietyScore: 4, energyScore: 5, note: "legacy", createdAt: daysAgo(1) };
  assert.equal(calculateWeeklySnapshot([legacy], now).averageMood, 6);
  assert.deepEqual(calculateContextPatterns([legacy]), []);
  assert.equal(calculateMetricAssociation([legacy], "sleepQualityScore"), null);
});

test("V2 records support optional dimensions and missing optional metrics", () => {
  const records = [
    entry(1, 8, { schemaVersion: 2, stressScore: 3, energyScore: 7, contexts: ["work"], helpfulFactors: ["music"], timezone: "UTC", localDate: "2026-10-12" }),
    entry(2, 6, { schemaVersion: 2, timezone: "UTC", localDate: "2026-10-11" }),
  ];
  const snapshot = calculateWeeklySnapshot(records, now);
  assert.equal(snapshot.averageMood, 7);
  assert.equal(snapshot.averageStress, 3);
  assert.equal(snapshot.averageEnergy, 7);
});

test("7, 30 and 90 day trends retain observed dates and never fill missing days", () => {
  const records = [entry(1, 8), entry(5, 4), entry(20, 6), { ...entry(20, 8), id: "same-day" }, entry(60, 7)];
  assert.equal(calculateMoodTrend(records, 7, now).length, 2);
  const month = calculateMoodTrend(records, 30, now);
  assert.equal(month.length, 3);
  assert.equal(month.find((point) => point.sourceCount === 2)?.moodScore, 7);
  assert.equal(calculateMoodTrend(records, 90, now).length, 4);
  assert.equal(entriesWithinDays(records, 7, now).length, 2);
});

test("weekly comparison is gated until both weeks have four relevant check-ins", () => {
  const current = [1, 2, 3, 4].map((day) => entry(day, 7));
  const previous = [8, 9, 10].map((day) => entry(day, 5));
  assert.equal(calculateWeeklySnapshot([...current, ...previous], now).comparison, null);
  const comparison = calculateWeeklySnapshot([...current, ...previous, entry(11, 5)], now).comparison;
  assert.equal(comparison, 2);
  assert.match(weeklyComparisonText(comparison), /higher this week/);
});

test("variability uses descriptive, non-diagnostic labels", () => {
  assert.equal(calculateVariability([entry(1, 6)]), null);
  assert.equal(calculateVariability([entry(1, 6), entry(2, 6), entry(3, 7)])?.label, "fairly steady");
  const label = calculateVariability([entry(1, 2), entry(2, 9), entry(3, 3), entry(4, 10)])?.label;
  assert.equal(label, "more varied");
  assert.doesNotMatch(label, /unstable|manic|bipolar|dysregulated/i);
});

test("context and helpful-factor aggregation require three occurrences", () => {
  const sparse = [entry(1, 4, { contexts: ["work"], helpfulFactors: ["music"] }), entry(2, 8, { contexts: ["work"], helpfulFactors: ["music"] })];
  assert.deepEqual(calculateContextPatterns(sparse), []);
  assert.deepEqual(calculateHelpfulFactorPatterns(sparse), []);
  const enough = [...sparse, entry(3, 9, { contexts: ["work"], helpfulFactors: ["music"] })];
  assert.deepEqual(calculateContextPatterns(enough)[0], { tag: "work", count: 3, averageMood: 7, differenceFromOverall: 0 });
  assert.equal(calculateHelpfulFactorPatterns(enough)[0].tag, "music");
});

test("time-of-day patterns require three check-ins in each displayed bucket", () => {
  const records = [
    ...[1, 2, 3].map((day) => ({ ...entry(day, 8), createdAt: daysAgo(day, 9), timezone: "UTC" })),
    ...[1, 2].map((day) => ({ ...entry(day, 4), createdAt: daysAgo(day, 20), timezone: "UTC" })),
  ];
  assert.deepEqual(calculateTimeOfDayPatterns(records).map((pattern) => pattern.period), ["morning"]);
  records.push({ ...entry(3, 4), createdAt: daysAgo(3, 20), timezone: "UTC" });
  assert.deepEqual(calculateTimeOfDayPatterns(records).map((pattern) => pattern.period), ["morning", "evening"]);
});

test("sleep association is gated and returns association data without causal claims", () => {
  const sparse = [entry(1, 4, { sleepQualityScore: 3 }), entry(2, 7, { sleepQualityScore: 8 })];
  assert.equal(calculateMetricAssociation(sparse, "sleepQualityScore"), null);
  const enough = [...sparse, entry(3, 5, { sleepQualityScore: 4 }), entry(4, 9, { sleepQualityScore: 9 })];
  assert.deepEqual(calculateMetricAssociation(enough, "sleepQualityScore"), { count: 4, difference: 3.5 });
});

test("dashboard copy is accessible, responsive and avoids diagnostic or causal overclaims", async () => {
  const [dashboard, form, analytics] = await Promise.all([
    readFile(new URL("../app/(patient)/dashboard/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/mood/MoodCheckInForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/mood/MoodAnalyticsDashboard.tsx", import.meta.url), "utf8"),
  ]);
  const source = `${dashboard}\n${form}\n${analytics}`;
  assert.match(source, /sm:grid-cols-2/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /min-h-11/);
  assert.match(source, /not advice or a clinical assessment/i);
  assert.doesNotMatch(source, /depressed|mentally healthy|unstable|manic|bipolar|dysregulated|causes your|prove it improves/i);
});

test("new, light, weekly, active, sparse and mixed V1/V2 histories remain usable", () => {
  const histories = {
    newUser: [],
    lightUser: [entry(1, 5), entry(2, 7)],
    weekUser: Array.from({ length: 6 }, (_, index) => entry(index, 5 + index % 3)),
    activeUser: Array.from({ length: 35 }, (_, index) => ({ ...entry(index % 30, 4 + index % 6), id: `active-${index}` })),
    sparseUser: [entry(2, 6), entry(28, 8), entry(58, 5)],
    mixedUser: [
      { moodScore: 5, anxietyScore: 6, energyScore: 4, note: "V1", createdAt: daysAgo(5) },
      entry(1, 8, { schemaVersion: 2, stressScore: 3, contexts: ["friends"], timezone: "UTC", localDate: "2026-10-12" }),
    ],
  };
  for (const records of Object.values(histories)) {
    assert.doesNotThrow(() => calculateWeeklySnapshot(records, now));
    assert.doesNotThrow(() => calculateMoodTrend(records, 90, now));
    assert.doesNotThrow(() => calculateContextPatterns(records));
  }
  assert.equal(calculateMoodTrend(histories.newUser, 90, now).length, 0);
  assert.equal(calculateMoodTrend(histories.lightUser, 7, now).length, 2);
  assert.equal(calculateMoodTrend(histories.sparseUser, 90, now).length, 3);
});

test("weekly AI source uses aggregate mood metrics rather than raw check-ins or notes", async () => {
  const route = await readFile(new URL("../app/api/therapy/weekly/route.ts", import.meta.url), "utf8");
  assert.match(route, /averageMood: calculateMetricAverage/);
  assert.match(route, /commonContexts: calculateContextPatterns/);
  assert.doesNotMatch(route, /moodScore: doc\.data\(\)\.moodScore/);
  assert.doesNotMatch(route, /moodTrackerData:[\s\S]{0,400}\bnote\b/);
});
