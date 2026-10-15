# Mood Check-in + Dashboard Analytics V2

## Repository audit

Before V2, the patient dashboard contained one check-in form and a seven-record snapshot. Mood, anxiety, and energy were required numeric values on the existing 1–10 scale; a note was optional. Records lived at `users/{uid}/health_metrics/{entryId}` with `createdAt`, and the dashboard queried the latest seven records. The chart was a repository-native SVG component rather than a chart-library dependency. It spaced check-ins equally and connected every point.

The previous dashboard derived a simple mean for mood, anxiety, and energy across the seven fetched records. It did not have 7/30/90-day selection, daily aggregation, weekly comparison, variability, context/helpful-factor analytics, time-of-day patterns, or sparse-data gates. The separate weekly support report could send the week's raw mood/anxiety/energy rows to its LLM.

Raw health metrics are readable only by the owning user under Firestore rules. Therapists cannot read the collection directly. After a manual check-in, the patient may explicitly open Momo with that check-in; the server then reads only the selected structured emotions and contexts for one turn. It never forwards the note, journal data, or a transcript. A patient-initiated weekly therapy report can use derived mood metrics only when `shareMoodSummaryWithTherapist` is explicitly on. Journal plaintext stays in the encrypted journal flow; mood notes are separate health-metric fields and are not used by analytics or AI weekly inputs.

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

V2 keeps the collection and existing score fields while adding structured emotion check-ins:

```ts
{
  userId: string;
  moodScore?: number;                // optional explicit overall score, 1–10
  emotions?: {
    emotion: "happy" | "sad" | "anxious" | "angry" | "calm" | "tired" |
      "lonely" | "stressed" | "hopeful" | "overwhelmed" | "excited" | "neutral";
    intensity?: number;              // optional, 1–10
  }[];                               // one to five when present
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
  source?: "MANUAL_CHECKIN" | "POST_SESSION";
  usefulnessRating?: number;         // post-session only, optional 1–5
  conversationId?: string;           // post-session linkage
  baselineCheckInId?: string;        // enables non-causal before/after aggregation
  timezone: string;
  localDate: string;                 // YYYY-MM-DD
  schemaVersion: 2;
  createdAt: Timestamp;
}
```

New check-ins require at least one selected emotion. Intensity, contexts, note, helpful factors, and the established overall 2/4/6/8/10 mood scale remain optional; omitted values are not synthesized. Old score-only V2 records and the original V1 shape still render without migration. Rules validate the emotion/context allowlists, intensity and rating ranges, owner ID, tag limits, note length, linkage lengths, local date, timestamp, and schema version.

## Analytics and quality gates

- Trend ranges: 7, 30, and 90 days. Seven days shows individual check-ins; longer ranges use observed daily averages. No missing day is fabricated, and chart lines break across material gaps.
- Weekly snapshot: mean mood, optional stress/energy means, check-in count, distinct days, high/low day, and population standard deviation described as “fairly steady,” “gently varied,” or “more varied.”
- Week comparison: at least 4 check-ins in each week.
- Context pattern: at least 3 occurrences of a tag.
- Helpful-factor pattern: at least 3 occurrences of a factor.
- Time-of-day pattern: at least 3 observations in each displayed bucket and at least two eligible buckets before comparison copy appears.
- Sleep/mood association: at least 4 paired observations and two distinct sides of the observed sleep mean.
- Emotion frequency: at least 3 emotion check-ins; percentage is the share of eligible check-ins in which the emotion was selected.
- Emotion intensity average: at least 2 explicit ratings for the displayed emotion.
- Before/after pattern: at least 3 linked, same-emotion comparisons. The result is described as an observed change, never a causal effect.
- All insight copy uses “appeared,” “occurred alongside,” or “tended”; it does not make diagnostic or causal claims.

The dashboard loads at most 500 records from a 90-day Firestore range query. This query uses a single `createdAt` range/order and needs no composite index.

## UI and accessibility

The emotion grid, optional per-emotion intensity sliders, self-reported context tags, and short note form the fast path. The existing overall mood scale and helpful factors remain under progressive disclosure. After save, the user can choose “Talk to Momo” or “Maybe later.” A post-Momo check-in appears only after three user turns and can be skipped. Controls have text labels, `aria-pressed`, visible keyboard focus, and at least 44px touch targets. Color and icons are never the only labels. Detailed emotion analytics and daily history are progressively disclosed below the existing dashboard summary.

Reusable implementation pieces include `MoodCheckInForm`, `EmotionSelector`, `EmotionIntensityControl`, `MoodContextSelector`, `PostMomoCheckIn`, `MoodAnalyticsDashboard`, and `MoodTrend`. Existing `Card`, `Button`, `Textarea`, dashboard layout, navigation, typography, color tokens, and responsive breakpoints remain unchanged.

## Safety and privacy boundaries

No safety state, target, threshold, crisis flow, or human-review behavior changed. Emotion names and intensities do not invoke safety classification. Journal schemas, encryption, access rules, and semantic boundaries are unchanged. Personal analytics read only owner-authorized health metrics. Momo receives a verified structured handoff only when the patient chooses it and is instructed not to announce ratings or treat them as diagnosis, cause, or safety evidence. Therapist sharing defaults off and exposes only aggregates through the existing authorized relationship report; raw check-ins, notes, journal content, Momo transcripts, and safety records remain excluded. Turning sharing off also withholds older therapist summaries that may contain mood-derived content, while leaving them available to the patient.

## Verification scenarios

Automated fixtures cover: zero check-ins, two check-ins, a 5–7 check-in week, 30+ check-ins, multiple same-day check-ins, sparse histories, mixed V1/V2 records, emotion frequency and intensity, context frequency, post-session linkage, minimum-data gates, consent on/off, and cross-user Firestore denial. Browser screenshots require an authenticated Firebase user session and are tracked separately from deterministic component and rule tests.
