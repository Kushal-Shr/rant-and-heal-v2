export const MOOD_CONTEXTS = [
  "work",
  "academics",
  "relationships",
  "family",
  "finances",
  "health",
  "sleep",
  "social-life",
  "loneliness",
  "future-uncertainty",
  "self-esteem",
  "workload",
  "major-event",
  "good-conversation",
  "exercise",
  "achievement",
  "rest",
  "hobbies",
  "time-outside",
  "friends",
  "therapy",
  "momo-conversation",
  "relaxation",
  "good-sleep",
  "other",
] as const;

export const HELPFUL_FACTORS = [
  "talking-to-someone",
  "rest",
  "music",
  "exercise",
  "grounding",
  "breathing",
  "journaling",
  "going-outside",
  "taking-a-break",
  "planning-tasks",
  "therapy",
  "momo",
  "nothing-yet",
  "other",
] as const;

export type MoodContext = (typeof MOOD_CONTEXTS)[number];
export type HelpfulFactor = (typeof HELPFUL_FACTORS)[number];

export const MOOD_CONTEXT_LABELS: Record<MoodContext, string> = {
  work: "Work",
  academics: "Academics",
  relationships: "Relationships",
  family: "Family",
  finances: "Finances",
  health: "Health",
  sleep: "Sleep",
  "social-life": "Social life",
  loneliness: "Loneliness",
  "future-uncertainty": "Future / uncertainty",
  "self-esteem": "Self-esteem",
  workload: "Workload",
  "major-event": "Major event",
  "good-conversation": "Good conversation",
  exercise: "Exercise",
  achievement: "Achievement",
  rest: "Rest",
  hobbies: "Hobbies",
  "time-outside": "Time outside",
  friends: "Friends",
  therapy: "Therapy",
  "momo-conversation": "Momo conversation",
  relaxation: "Relaxation",
  "good-sleep": "Good sleep",
  other: "Other",
};

export const HELPFUL_FACTOR_LABELS: Record<HelpfulFactor, string> = {
  "talking-to-someone": "Talking to someone",
  rest: "Rest",
  music: "Music",
  exercise: "Exercise",
  grounding: "Grounding",
  breathing: "Breathing",
  journaling: "Journaling",
  "going-outside": "Going outside",
  "taking-a-break": "Taking a break",
  "planning-tasks": "Planning tasks",
  therapy: "Therapy",
  momo: "Momo",
  "nothing-yet": "Nothing yet",
  other: "Other",
};

export function friendlyTag(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
