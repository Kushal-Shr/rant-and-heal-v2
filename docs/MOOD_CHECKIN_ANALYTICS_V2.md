# Mood Check-in + Dashboard Analytics V2

## Repository audit

Before V2, the patient dashboard contained one check-in form and a seven-record snapshot. Mood, anxiety, and energy were required numeric values on the existing 1–10 scale; a note was optional. Records lived at `users/{uid}/health_metrics/{entryId}` with `createdAt`, and the dashboard queried the latest seven records. The chart was a repository-native SVG component rather than a chart-library dependency. It spaced check-ins equally and connected every point.

The previous dashboard derived a simple mean for mood, anxiety, and energy across the seven fetched records. It did not have 7/30/90-day selection, daily aggregation, weekly comparison, variability, context/helpful-factor analytics, time-of-day patterns, or sparse-data gates. The separate weekly support report could send the week's raw mood/anxiety/energy rows to its LLM.

Raw health metrics were and remain readable only by the owning user under Firestore rules. Therapists cannot read the collection directly. Momo does not query health metrics or receive them in its ordinary conversation context. A patient-initiated, consent-gated therapy weekly report can use derived mood metrics. Journal plaintext stays in the encrypted journal flow; mood notes are separate health-metric fields and are not used by mood analytics or included in AI weekly inputs.

## Data model and compatibility

V1 records remain valid without migration:

```ts
{
  moodScore: number;       // 1–10
  anxietyScore: number;    // 1–10
  energyScore: number;     // 1–10
  note: string;
  createdAt: Timestamp;
}
```

V2 keeps the collection and `moodScore` field/scale:

```ts
{
  userId: string;
  moodScore: number;                 // required, 1–10
  anxietyScore?: number;             // optional, 1–10
  energyScore?: number;
  stressScore?: number;
  sleepQualityScore?: number;
  focusScore?: number;
  socialConnectionScore?: number;
  physicalWellbeingScore?: number;
  contexts?: string[];
  helpfulFactors?: string[];
  note?: string;                     // separate from encrypted journal
  timezone: string;
  localDate: string;                 // YYYY-MM-DD
  schemaVersion: 2;
  createdAt: Timestamp;
}
```

The UI presents five accessible choices for each score, mapped to 2/4/6/8/10 on the established scale. Mood is the only required answer. Supporting fields are omitted rather than stored as synthetic defaults. Rules continue to accept the legacy shape for older clients and validate the V2 allowlists, ranges, owner ID, tag limits, note length, local date, timestamp, and schema version.

## Analytics and quality gates

- Trend ranges: 7, 30, and 90 days. Seven days shows individual check-ins; longer ranges use observed daily averages. No missing day is fabricated, and chart lines break across material gaps.
- Weekly snapshot: mean mood, optional stress/energy means, check-in count, distinct days, high/low day, and population standard deviation described as “fairly steady,” “gently varied,” or “more varied.”
- Week comparison: at least 4 check-ins in each week.
- Context pattern: at least 3 occurrences of a tag.
- Helpful-factor pattern: at least 3 occurrences of a factor.
- Time-of-day pattern: at least 3 observations in each displayed bucket and at least two eligible buckets before comparison copy appears.
- Sleep/mood association: at least 4 paired observations and two distinct sides of the observed sleep mean.
- All insight copy uses “appeared,” “occurred alongside,” or “tended”; it does not make diagnostic or causal claims.

The dashboard loads at most 500 records from a 90-day Firestore range query. This query uses a single `createdAt` range/order and needs no composite index.

## UI and accessibility

The core mood control and submit action stay above progressive disclosure. Energy and stress are quick optional controls; the remaining dimensions, context tags, helpful factors, and note live under “Add more context.” Controls have text labels, `aria-pressed`, visible keyboard focus, and 44px minimum touch targets. Emoji/color are never the only mood label. Empty and sparse states explain that more check-ins will reveal patterns without framing the user clinically or shaming missed days.

## Safety and privacy boundaries

No safety state, target, threshold, crisis flow, or human-review behavior changed. Mood scores do not invoke safety classification. Journal schemas, encryption, access rules, and semantic boundaries are unchanged. Mood analytics read only health-metric records authorized to the signed-in owner. The consent-gated weekly AI flow now receives structured derived mood metrics instead of raw check-ins.

## Verification scenarios

Automated fixtures cover: zero check-ins, two check-ins, a 5–7 check-in week, 30+ check-ins, sparse check-ins spanning two months, and mixed V1/V2 records. They also cover missing fields/days, all analytics gates, copy guardrails, responsive/accessibility markers, and cross-user Firestore denial. Browser screenshots were not captured because the dashboard requires an authenticated Firebase user session.
