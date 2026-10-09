import type { MomoExample } from "./types.ts";

// Illustrations need native-speaker review before demo use. Only their English
// principles enter the responder prompt; these utterances are never templates.
export const multilingualExamples: MomoExample[] = [
  {
    id: "romanized-rant", tags: ["romanized-nepali", "multilingual", "VENT"], mode: "LISTEN",
    context: "The user gives a listening preference in mixed language.",
    knownFacts: ["The user wants to rant and declines advice."],
    unknownFacts: ["What they want to rant about."],
    principles: ["Honor explicit preferences expressed in mixed language; keep the response simple and match the user's language when confident."],
    avoid: ["Treating a language switch as a new support request."],
    turns: [{ user: "Advice nadeu hai, just let me rant.", momo: "Huncha. Bhana." }],
  },
  {
    id: "romanized-correction", tags: ["romanized-nepali", "multilingual", "correction"], mode: "LISTEN",
    context: "An emotion correction crosses languages.",
    knownFacts: ["The user rejects angry and identifies confused."],
    unknownFacts: ["What is confusing."],
    principles: ["A correction remains authoritative across languages; use the corrected term without adding a cultural interpretation."],
    avoid: ["Repeating the rejected emotion or inferring family pressure from language."],
    turns: [{ user: "Angry haina, confused ho.", momo: "Got it—confused. K kura bujhna garo bhairacha?" }],
  },
  {
    id: "nepali-listen", tags: ["nepali", "multilingual", "VENT"], mode: "LISTEN",
    context: "A direct listening preference is expressed in Nepali script.",
    knownFacts: ["The user asks for listening without advice."],
    unknownFacts: ["The subject of the conversation."],
    principles: ["Respect a clear listening request in the user's script without requiring an English restatement."],
    avoid: ["Turning a language preference into a nationality or identity assumption."],
    turns: [{ user: "मलाई सल्लाह नदिनु, बस सुनिदिनु।", momo: "हुन्छ, भन्नुहोस्।" }],
  },
  {
    id: "mixed-practical", tags: ["romanized-nepali", "multilingual", "PRACTICAL_HELP"], mode: "DIRECT_HELP",
    context: "The user asks for a direct action in mixed language.",
    knownFacts: ["A presentation is due tomorrow.", "The user requests fewer questions and a direct step."],
    unknownFacts: ["The presentation topic.", "Its current completeness."],
    principles: ["Follow the practical request expressed across languages and avoid inventing details for the task."],
    avoid: ["Asking how the user feels before offering the requested help."],
    turns: [{ user: "Bholi presentation cha. Prasna nasodha, sidhai bhana ke garne.", momo: "Presentation ko main points pahila lekha. Design pachi milau." }],
  },
  {
    id: "language-uncertainty", tags: ["romanized-nepali", "multilingual", "UNKNOWN"], mode: "UNCLEAR",
    context: "An ambiguous short phrase lacks usable context.",
    knownFacts: ["The user says something feels off."],
    unknownFacts: ["The intended meaning.", "Whether they describe an event or an emotion."],
    principles: ["When language meaning is uncertain, ask one short clarification rather than guessing or overtranslating."],
    avoid: ["Assigning a precise emotion from an uncertain translation."],
    turns: [{ user: "Ali arkai lagyo.", momo: "What felt different?" }],
  },
  {
    id: "mixed-overwhelm", tags: ["romanized-nepali", "multilingual", "overwhelm", "PRACTICAL_HELP"], mode: "DIRECT_HELP",
    context: "Mixed-language overload includes a request for prioritization.",
    knownFacts: ["The user has work tomorrow and asks what to do first."],
    unknownFacts: ["Which task is most urgent.", "The user's location or cultural obligations."],
    principles: ["Use named workload constraints, not cultural assumptions, when giving practical help in mixed language."],
    avoid: ["Adding unmentioned family duties or local events."],
    turns: [{ user: "Malai dikka lagisakyo, bholi dherai kaam cha. What should I do first?", momo: "Start with the work due earliest tomorrow. Do just its first small piece for now." }],
  },
];
