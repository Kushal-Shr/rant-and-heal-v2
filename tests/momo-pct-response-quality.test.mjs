import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateMomoTurn } from "../src/lib/momo/orchestrator.ts";
import { planMomoResponse } from "../src/lib/momo/planner.ts";
import { MOMO_BOUNDARIES_PROMPT } from "../src/lib/momo/prompts/boundaries.ts";
import { MOMO_CORE_PROMPT } from "../src/lib/momo/prompts/core.ts";
import { MOMO_PCT_PROMPT } from "../src/lib/momo/prompts/pct.ts";
import {
  composeMomoSystemInstruction,
  momoDecisionInstruction,
} from "../src/lib/momo/responder.ts";
import { evaluateDeterministicSafety } from "../src/lib/safety/detector.ts";
import { safetyResponseFor } from "../src/lib/safety/responses.ts";

const input = (messageText, history = []) => ({ messageText, history });
const baseInstruction = [MOMO_CORE_PROMPT, MOMO_PCT_PROMPT, MOMO_BOUNDARIES_PROMPT].join("\n\n");

const inferenceFor = (supportMode) => ({
  supportMode,
  primaryNeed: supportMode === "LISTEN"
    ? "VENT"
    : supportMode === "WORK_THROUGH"
      ? "UNDERSTAND"
      : supportMode === "DIRECT_HELP"
        ? "PRACTICAL_HELP"
        : supportMode === "REGULATE"
          ? "EMOTIONAL_REGULATION"
          : "UNKNOWN",
  intervention: supportMode === "LISTEN"
    ? "PCT_LISTENING"
    : supportMode === "WORK_THROUGH"
      ? "PCT_EXPLORATION"
      : supportMode === "DIRECT_HELP"
        ? "PROBLEM_SOLVING"
        : supportMode === "REGULATE"
          ? "RELAXATION"
          : "NONE",
  confidence: supportMode === "UNCLEAR" ? "LOW" : "HIGH",
  shouldClarify: supportMode === "UNCLEAR",
  clarificationTarget: supportMode === "UNCLEAR" ? "SUPPORT_PREFERENCE" : null,
});

const decisionFor = (supportMode) => planMomoResponse(
  input("Representative normal-support turn."),
  "NORMAL",
  inferenceFor(supportMode)
);

test("global PCT contract distinguishes stated, suggested, and unknown content", () => {
  const prompt = composeMomoSystemInstruction(baseInstruction, decisionFor("LISTEN"));
  assert.match(prompt, /USER-STATED facts, emotions, concerns, and preferences may be reflected confidently/i);
  assert.match(prompt, /STRONGLY SUGGESTED meaning is not established fact/i);
  assert.match(prompt, /UNKNOWN emotions, motives, diagnoses, meanings, and hidden causes must not be invented/i);
  assert.match(prompt, /Reflect concrete content before interpretation/i);
  assert.match(prompt, /one purposeful clarification when they matter/i);
  assert.match(prompt, /one main job/i);
  assert.match(prompt, /no unnecessary preamble/i);
});

test("grounded reflection adds significance without parroting or unsupported interpretation", () => {
  const prompt = composeMomoSystemInstruction(baseInstruction, decisionFor("LISTEN"));
  assert.match(prompt, /Distinguish CONTENT .* GROUNDED SIGNIFICANCE .* and INTERPRETATION/is);
  assert.match(prompt, /why confirmed details matter based only on connections the user supplied/i);
  assert.match(prompt, /combine content with grounded significance/i);
  assert.match(prompt, /must not present interpretation as fact/i);
  assert.match(prompt, /Grounded significance can notice an established mismatch, effort, consequence, priority, repeated event, or stated comparison/i);
  assert.match(prompt, /cannot manufacture the user's internal state/i);
  assert.match(prompt, /Do not merely restate the message/i);
  assert.match(prompt, /lightly paraphrase it/i);
  assert.match(prompt, /swap words for synonyms/i);
  assert.match(prompt, /transcript confirmation/i);
  assert.match(prompt, /brief acknowledgement or useful clarification is better than invented depth/i);
});

test("assumption regression corpus never requires an unstated emotion or hidden cause", () => {
  const cases = [
    ["I failed my exam.", ["ashamed", "exhausted", "anxious", "disappointed", "devastated"]],
    ["I haven't talked to anyone all day.", ["lonely", "rejected", "depressed"]],
    ["My friend hasn't replied.", ["abandoned", "rejected", "anxious"]],
    ["My partner is two hours late.", ["afraid", "angry", "betrayed"]],
    ["My boss scheduled a meeting tomorrow.", ["worried", "panicked", "guilty"]],
    ["My parents said my grade was too low.", ["ashamed", "hurt", "furious"]],
    ["I stayed in bed most of today.", ["depressed", "lazy", "hopeless"]],
    ["I cancelled my plans tonight.", ["overwhelmed", "avoidant", "sad"]],
    ["I forgot an important deadline.", ["irresponsible", "ashamed", "anxious"]],
    ["I barely spoke in the meeting.", ["insecure", "embarrassed", "afraid"]],
    ["I didn't answer my family's calls.", ["angry", "avoidant", "guilty"]],
    ["My bank balance is lower than I expected.", ["panicked", "terrified", "ashamed"]],
    ["My roommate closed their door when I came home.", ["rejected", "unwelcome", "lonely"]],
    ["I dropped one of my classes.", ["ashamed", "relieved", "disappointed"]],
    ["I made a mistake in the report.", ["guilty", "stupid", "devastated"]],
    ["I moved to a new city last week.", ["lonely", "excited", "overwhelmed"]],
    ["I argued with my sister.", ["angry", "hurt", "resentful"]],
    ["The client sent my project back for revisions.", ["disappointed", "frustrated", "incompetent"]],
    ["Nobody invited me to the gathering.", ["rejected", "lonely", "humiliated"]],
    ["I cried after the phone call.", ["sad", "devastated", "heartbroken"]],
  ];
  const modeInstruction = momoDecisionInstruction(decisionFor("LISTEN"));
  assert.match(modeInstruction, /only emotions or meanings the user actually stated/i);
  for (const [message, forbidden] of cases) {
    assert.equal(evaluateDeterministicSafety(message).state, "NORMAL", message);
    for (const label of forbidden) {
      assert.doesNotMatch(modeInstruction, new RegExp(`\\b${label}\\b`, "i"), `${message} -> ${label}`);
    }
  }
});

test("minimal pairs permit stated emotion without assigning it to the unstated side", () => {
  const pairs = [
    ["I failed.", "I failed and I'm embarrassed.", /embarrassed/i],
    ["My partner hasn't replied.", "My partner hasn't replied and I'm scared they're leaving me.", /scared/i],
    ["My presentation went badly.", "My presentation went badly and I feel ashamed.", /ashamed/i],
    ["I haven't talked to anyone today.", "I haven't talked to anyone today and I feel lonely.", /lonely/i],
  ];
  for (const [unstated, stated, emotion] of pairs) {
    assert.doesNotMatch(unstated, emotion);
    assert.match(stated, emotion);
  }
  assert.match(MOMO_PCT_PROMPT, /may be reflected confidently when the user directly stated them/i);
  assert.match(MOMO_PCT_PROMPT, /not established fact/i);
});

test("mode policies enforce brevity and one purposeful question", () => {
  const listen = momoDecisionInstruction(decisionFor("LISTEN"));
  const work = momoDecisionInstruction(decisionFor("WORK_THROUGH"));
  const direct = momoDecisionInstruction(decisionFor("DIRECT_HELP"));
  const regulate = momoDecisionInstruction(decisionFor("REGULATE"));
  const unclear = momoDecisionInstruction(decisionFor("UNCLEAR"));

  assert.match(listen, /one to three short sentences/i);
  assert.match(listen, /question is optional/i);
  assert.match(listen, /ask at most one/i);
  assert.match(listen, /conversational space is acceptable/i);
  assert.match(listen, /Do not merely paraphrase or synonym-swap/i);
  assert.match(work, /two to four short sentences/i);
  assert.match(work, /at most one useful question/i);
  assert.match(work, /Do not rush into automatic-thought identification/i);
  assert.match(direct, /one to three useful points/i);
  assert.match(direct, /no unnecessary empathy preamble/i);
  assert.match(direct, /respect, specificity, and agency/i);
  assert.match(direct, /Do not respond with another unnecessary question/i);
  assert.match(regulate, /one manageable instruction or anchor at a time/i);
  assert.match(regulate, /very short language/i);
  assert.match(regulate, /Avoid psychological interpretation/i);
  assert.match(unclear, /exactly one natural question to clarify/i);
  assert.match(unclear, /Leave unknown meaning open/i);
  assert.match(unclear, /multiple questions/i);
});

test("questions require a purpose and an explicit request to stop questions wins", () => {
  const conversation = input("Stop asking me questions and just give me one next step.", [
    { role: "USER", text: "I keep falling behind on this assignment." },
    { role: "MOMO", text: "What part feels hardest?" },
    { role: "USER", text: "The research section." },
    { role: "MOMO", text: "What about the research section is difficult?" },
  ]);
  const decision = planMomoResponse(conversation, "NORMAL", inferenceFor("LISTEN"));
  const prompt = composeMomoSystemInstruction(baseInstruction, decision);

  assert.equal(decision.supportMode, "DIRECT_HELP");
  assert.equal(decision.userPreferenceOverride, true);
  assert.match(prompt, /clarifying meaning, identifying what matters, determining desired support, or continuing user-led exploration/i);
  assert.match(prompt, /Questions are optional in listening/i);
  assert.match(prompt, /not required merely to sound empathic or keep the conversation moving/i);
  assert.match(prompt, /Do not respond with another unnecessary question/i);
});

test("normal PCT does not automatically become analysis, CBT, problem-solving, or advice", () => {
  const listen = composeMomoSystemInstruction(baseInstruction, decisionFor("LISTEN"));
  const work = momoDecisionInstruction(decisionFor("WORK_THROUGH"));

  assert.match(listen, /Do not automatically turn person-centered listening into thought analysis/i);
  assert.match(listen, /automatic-thought identification/i);
  assert.match(listen, /belief examination/i);
  assert.match(listen, /cognitive restructuring/i);
  assert.match(listen, /problem-solving, or advice/i);
  assert.match(listen, /only when the active support mode or intervention calls for them, or the user explicitly requests them/i);
  assert.match(listen, /Listening and understanding may stand on their own/i);
  assert.match(work, /unless the selected intervention and user's request call for it/i);
});

test("a user correction replaces rather than preserves a prior responder inference", () => {
  const conversation = input("No, I'm not anxious. I'm irritated that they changed the deadline.", [
    { role: "USER", text: "My manager moved the deadline to tomorrow." },
    { role: "MOMO", text: "You sound anxious about whether you can finish." },
  ]);
  const decision = planMomoResponse(conversation, "NORMAL", inferenceFor("LISTEN"));
  const prompt = composeMomoSystemInstruction(baseInstruction, decision);

  assert.equal(decision.supportMode, "LISTEN");
  assert.match(conversation.messageText, /not anxious/i);
  assert.match(conversation.messageText, /irritated/i);
  assert.match(prompt, /treat the user's safe description of their own experience as authoritative/i);
  assert.match(prompt, /Update immediately/i);
  assert.match(prompt, /do not defend or repeat the rejected interpretation/i);
});

test("repetitive empathy and understanding-check tics are explicitly discouraged", () => {
  const conversation = input("Work was awful again.", [
    { role: "USER", text: "My manager dismissed my idea." },
    { role: "MOMO", text: "It sounds like that was difficult. How does that make you feel?" },
    { role: "USER", text: "Then the deadline changed without warning." },
    { role: "MOMO", text: "It sounds like that was difficult. Am I understanding you correctly?" },
    { role: "USER", text: "And my meeting ran late." },
    { role: "MOMO", text: "It sounds like that was difficult. Does that resonate?" },
  ]);
  const repeatedOpenings = conversation.history.filter(
    (turn) => turn.role === "MOMO" && turn.text.startsWith("It sounds like")
  );
  const decision = planMomoResponse(conversation, "NORMAL", inferenceFor("LISTEN"));
  const prompt = composeMomoSystemInstruction(baseInstruction, decision);
  assert.equal(repeatedOpenings.length, 3);
  assert.match(prompt, /Avoid formulaic validation and repeated openings/i);
  assert.match(prompt, /Consider recent assistant turns/i);
  assert.match(prompt, /do not reuse them mechanically/i);
  assert.match(prompt, /not required merely to sound empathic/i);
  assert.match(prompt, /Do not make .*Am I understanding you correctly.* a default ending/i);
  assert.doesNotMatch(prompt, /always begin with (?:"|“)?It sounds like/i);
});

test("major-life-decision policy preserves user agency", () => {
  const cases = [
    "Should I quit school?",
    "Should I break up with my partner?",
    "Should I leave my job?",
  ];
  for (const message of cases) {
    const decision = planMomoResponse(input(message), "NORMAL", inferenceFor("DIRECT_HELP"));
    const prompt = composeMomoSystemInstruction(baseInstruction, decision);
    assert.equal(decision.supportMode, "DIRECT_HELP", message);
    assert.match(prompt, /The user owns major life decisions/i, message);
    assert.match(prompt, /the final decision remains the user's/i, message);
    assert.match(prompt, /Offer options or a small next step/i, message);
  }
});

test("AI congruence prohibits human-experience and presence claims", () => {
  const prompt = composeMomoSystemInstruction(baseInstruction, decisionFor("LISTEN"));
  for (const phrase of [
    "I know exactly how you feel",
    "I've experienced this too",
    "I've been there",
    "I feel devastated for you",
    "I'm sitting here with you",
  ]) {
    assert.match(prompt, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), phrase);
  }
  assert.match(prompt, /Never claim/i);
  assert.match(prompt, /do not claim human feelings, memories, or lived experience/i);
  assert.match(prompt, /do not claim physical presence/i);
});

test("unconditional positive regard separates the person from mistakes and behavior", () => {
  const prompt = composeMomoSystemInstruction(baseInstruction, decisionFor("WORK_THROUGH"));
  assert.match(prompt, /Accept the person without automatically approving every behavior/i);
  assert.match(prompt, /Do not confirm harmful global self-labels/i);
  assert.match(prompt, /unsupported praise/i);
  assert.match(prompt, /nonjudgmental/i);
});

test("naturalness corpus keeps normal distress in mode-specific PCT response policy", () => {
  const cases = [
    ["I studied hard and still failed the quiz.", "LISTEN"],
    ["I feel embarrassed about my grade.", "LISTEN"],
    ["My roommate ignored me again and I'm pissed.", "LISTEN"],
    ["I need to rant about my manager.", "LISTEN"],
    ["My family keeps interrupting me.", "LISTEN"],
    ["I feel sad today.", "LISTEN"],
    ["The rejection really disappointed me.", "LISTEN"],
    ["I argued with my partner last night.", "LISTEN"],
    ["I feel left out when they make plans without me.", "LISTEN"],
    ["Work was frustrating all day.", "LISTEN"],
    ["Can you help me understand why I freeze during presentations?", "WORK_THROUGH"],
    ["Why do I keep avoiding this assignment?", "WORK_THROUGH"],
    ["Can we think through what happened with my friend?", "WORK_THROUGH"],
    ["Help me make sense of why that comment bothered me.", "WORK_THROUGH"],
    ["I want to understand why I compare myself to everyone.", "WORK_THROUGH"],
    ["Can we work through my options for next semester?", "WORK_THROUGH"],
    ["Why does this argument keep happening in my family?", "WORK_THROUGH"],
    ["Help me understand what I want from this job.", "WORK_THROUGH"],
    ["What are two things I can do about tomorrow's deadline?", "DIRECT_HELP"],
    ["Give me some options for talking to my roommate.", "DIRECT_HELP"],
    ["What should I do first about these overdue bills?", "DIRECT_HELP"],
    ["Just tell me how to organize this assignment.", "DIRECT_HELP"],
    ["I need practical ideas for handling the commute.", "DIRECT_HELP"],
    ["Stop asking questions and give me a next step.", "DIRECT_HELP"],
    ["Help me decide what factors to consider before changing courses.", "DIRECT_HELP"],
    ["I need to calm down before I reply.", "REGULATE"],
    ["Help me ground myself for a minute.", "REGULATE"],
    ["My thoughts are racing; can we pause?", "REGULATE"],
    ["I don't know whether I want advice or just to talk.", "UNCLEAR"],
    ["I'm not sure what kind of help I need.", "UNCLEAR"],
  ];

  for (const [message, expectedMode] of cases) {
    const safety = evaluateDeterministicSafety(message);
    assert.equal(safety.state, "NORMAL", message);
    const decision = planMomoResponse(input(message), "NORMAL", inferenceFor(expectedMode));
    const prompt = composeMomoSystemInstruction(baseInstruction, decision);
    assert.equal(decision.supportMode, expectedMode, message);
    assert.match(prompt, /one main job/i, message);
    assert.match(prompt, /Be concise/i, message);
    assert.match(prompt, /USER-STATED/i, message);
    assert.match(prompt, /no unnecessary preamble/i, message);
    assert.match(prompt, /Scale response length to the message's complexity/i, message);
    assert.match(prompt, /concise and conversational/i, message);
  }
});

test("safety precedence bypasses the PCT responder unchanged", async () => {
  let planned = false;
  let responded = false;
  const request = input("I'm going to kill myself tonight.");
  const result = await orchestrateMomoTurn(request, {
    evaluateSafety: evaluateDeterministicSafety,
    plan: () => { planned = true; return decisionFor("LISTEN"); },
    respond: async () => { responded = true; return "normal PCT response"; },
    safetyResponse: (evaluation) => safetyResponseFor(evaluation, { messageText: request.messageText }),
  });
  assert.equal(result.kind, "SAFETY_RESPONSE");
  assert.equal(result.safety.state, "IMMINENT");
  assert.equal(planned, false);
  assert.equal(responded, false);
});
