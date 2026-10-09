import assert from 'node:assert/strict';
import test from 'node:test';
import { MOMO_EXAMPLES } from '../src/lib/momo/examples/index.ts';
import { exampleSelectionFor, selectExamples, selectedExamplePrinciples } from '../src/lib/momo/examples/selector.ts';
import { composeMomoSystemInstruction } from '../src/lib/momo/responder.ts';
import { planMomoResponse } from '../src/lib/momo/planner.ts';
import { emptyConversationContinuityState, prepareContinuityState, continuityResponseViolations } from '../src/lib/momo/continuity.ts';
import { groundingViolations } from '../src/lib/momo/grounding.ts';
import { responseStyleViolations } from '../src/lib/momo/responseStyle.ts';
import { orchestrateMomoTurn } from '../src/lib/momo/orchestrator.ts';
import { evaluateConversationSafety } from '../src/lib/safety/detector.ts';
import { safetyResponseFor } from '../src/lib/safety/responses.ts';
import { SUPPORT_MODES } from '../src/lib/momo/schemas.ts';

const input = (messageText, history = [], continuityState) => ({ messageText, history, continuityState });
const inference = (supportMode = 'WORK_THROUGH', intervention = 'CBT_RESTRUCTURING') => ({
  supportMode, intervention, primaryNeed: 'COGNITIVE_SUPPORT', confidence: 'HIGH',
  shouldClarify: supportMode === 'UNCLEAR', clarificationTarget: supportMode === 'UNCLEAR' ? 'SUPPORT_PREFERENCE' : null,
});

test('curated cases have explicit grounding, distinct dialogue, all modes and required coverage', () => {
  assert.ok(MOMO_EXAMPLES.length >= 50);
  assert.equal(new Set(MOMO_EXAMPLES.map(e => e.id)).size, MOMO_EXAMPLES.length);
  assert.equal(new Set(MOMO_EXAMPLES.map(e => e.turns[0].user)).size, MOMO_EXAMPLES.length);
  for (const e of MOMO_EXAMPLES) {
    for (const field of ['knownFacts', 'unknownFacts', 'principles', 'avoid', 'tags', 'turns']) assert.ok(e[field].length, `${e.id}: ${field}`);
    assert.ok(e.context && SUPPORT_MODES.includes(e.mode), e.id);
    assert.ok(e.turns.every(t => t.user && t.momo), e.id);
  }
  for (const mode of SUPPORT_MODES) assert.ok(MOMO_EXAMPLES.some(e => e.mode === mode), mode);
  for (const tag of ['work', 'academics', 'relationships', 'family', 'self-esteem', 'overwhelm', 'decision-making', 'correction', 'rejection', 'question-fatigue', 'option-overload', 'intervention-success', 'intervention-failure', 'breathing-rejection', 'grounding-rejection', 'cbt-requested', 'cbt-rejected', 'changing-goals', 'multilingual', 'romanized-nepali', 'safety-clarification', 'suicidal-flow', 'backend-truthfulness', 'guilt', 'jealousy', 'low-mood']) {
    assert.ok(MOMO_EXAMPLES.some(e => e.tags.includes(tag)), tag);
  }
});

test('selection is deterministic, bounded, relevant, and never sends safety cases to ordinary support', () => {
  const selection = { mode: 'LISTEN', primaryNeed: 'VENT', safetyState: 'NORMAL', domain: 'work' };
  assert.deepEqual(selectExamples(selection), []);
  for (const limit of [-1, 0, NaN]) assert.deepEqual(selectExamples({ ...selection, limit }), []);
  for (const limit of [1, 2, 3, 4, 50]) {
    const cases = selectExamples({ ...selection, limit });
    assert.equal(cases.length, 1);
    assert.deepEqual(cases, selectExamples({ ...selection, limit }));
    assert.ok(cases.every(e => !e.tags.includes('safety')));
    assert.equal(cases[0].id, 'work-credit-facts');
  }
  assert.equal(selectExamples({ ...selection, tags: ['explicit-emotion'], limit: 1 })[0].id, 'work-credit-anger');
  assert.equal(selectExamples({ mode: 'LISTEN', primaryNeed: 'VENT', safetyState: 'NORMAL', tags: ['no-advice'], limit: 1 })[0].id, 'rant-permission');
  assert.ok(!selectExamples({ ...selection, limit: 1 }).some(e => e.tags.includes('explicit-emotion')));
  assert.ok(!selectExamples({ mode: 'WORK_THROUGH', primaryNeed: 'UNDERSTAND', safetyState: 'NORMAL', tags: ['relationships'], limit: 1 }).some(e => e.tags.includes('guilt') || e.tags.includes('jealousy')));
  for (const safetyState of ['CLARIFY', 'SELF_HARM', 'SUICIDAL', 'IMMINENT', 'MEDICAL_EMERGENCY']) {
    assert.deepEqual(selectExamples({ ...selection, safetyState }), []);
    assert.equal(selectedExamplePrinciples({ ...selection, safetyState }), '');
  }
});

test('live prompt projects selected principles and cannot import library dialogue, facts, or backend evidence', () => {
  const conversation = input('My coworker got credit for most of my work.');
  const decision = planMomoResponse(conversation, 'NORMAL', inference('LISTEN', 'PCT_LISTENING'));
  const selected = selectExamples(exampleSelectionFor(conversation, decision));
  const prompt = composeMomoSystemInstruction('Base persona', decision, { userMessageText: conversation.messageText });
  assert.ok(prompt.startsWith('GROUNDING CONTRACT — AUTHORITATIVE'));
  for (const e of selected) for (const principle of e.principles) assert.ok(prompt.includes(principle));
  for (const e of MOMO_EXAMPLES) {
    for (const turn of e.turns) assert.ok(!prompt.includes(turn.momo), e.id);
    for (const fact of [...e.knownFacts, ...e.unknownFacts]) assert.ok(!prompt.includes(fact), `${e.id}: ${fact}`);
  }
  assert.ok(selectedExamplePrinciples(exampleSelectionFor(conversation, decision)).length < 2000);
});

test('coworker credit event cannot license anger, betrayal, frustration, theft, or intent', () => {
  const conversation = input('My coworker got credit for most of my work.');
  const route = planMomoResponse(conversation, 'NORMAL', inference('LISTEN', 'PCT_LISTENING'));
  for (const response of ["You're angry.", 'You feel betrayed.', 'That sounds frustrating.', 'Your coworker stole your work.', 'They deliberately took the credit.']) {
    assert.ok(responseStyleViolations(response, conversation, route).some(v => v.startsWith('UNSUPPORTED_')), response);
  }
  for (const response of ['You did most of the work, and your coworker got most of the credit.', 'How did the credit get assigned?', "We don't know whether they deliberately took the credit."]) {
    assert.deepEqual(groundingViolations(response, conversation), [], response);
  }
  assert.deepEqual(groundingViolations("You're angry.", input("I'm pissed that my coworker got the credit.")), []);
  assert.deepEqual(groundingViolations('Your coworker stole your work.', input('My coworker stole my work.')), []);
});

test('grounding rejects unsupported internal states across the requested domains', () => {
  for (const [message, response] of [
    ["My partner hasn't replied.", 'You are afraid.'],
    ['I failed my exam.', 'You feel ashamed.'],
    ['My parents called twice.', 'You sound guilty.'],
    ['I stayed in bed today.', 'You are sad.'],
    ['My friend got engaged.', 'You feel jealous.'],
    ['I forgot to call back.', 'You feel guilty.'],
    ['I feel weird.', 'You are jealous.'],
    ['My manager scheduled a meeting.', 'That sounds frustrating.'],
    ['I am angry.', 'You are angry and betrayed.'],
  ]) assert.ok(groundingViolations(response, input(message)).includes('UNSUPPORTED_EMOTION_INFERENCE'), message);
});

test('only user self-reports establish emotion, and the latest correction wins', () => {
  for (const conversation of [
    input('My coworker is angry.'),
    input('Am I angry?'),
    input('I wonder if I am angry.'),
    input('She said "I am angry".'),
    input('Continue.', [{ role: 'MOMO', text: 'You are angry.' }]),
    input('I am not angry.', [{ role: 'USER', text: 'I am angry.' }]),
    input('Continue.', [{ role: 'USER', text: 'I am not angry.' }]),
  ]) assert.ok(groundingViolations('You are angry.', conversation).includes('UNSUPPORTED_EMOTION_INFERENCE'), conversation.messageText);
  let state = prepareContinuityState(input("I'm not frustrated. I'm mostly confused."));
  assert.equal(state.userCorrections.at(-1).preferredTerm, 'confused');
  assert.deepEqual(groundingViolations('You are confused.', input('Go on.', [], state)), []);
  assert.ok(groundingViolations('You are frustrated.', input('Go on.', [], state)).length);
  state = prepareContinuityState(input('Now I am frustrated.'), state);
  assert.deepEqual(groundingViolations('You are frustrated.', input('Now I am frustrated.', [], state)), []);
  assert.deepEqual(groundingViolations('You are angry and betrayed.', input('I am angry and betrayed.')), []);
  assert.deepEqual(groundingViolations('You are angry.', input("I'm feeling angry.")), []);
  assert.deepEqual(groundingViolations('You are angry.', input('That made me angry.')), []);
  assert.ok(groundingViolations('You are angry.', input('I am confused and not angry.', [{ role: 'USER', text: 'I am angry.' }])).length);
});

test('listening constraints persist, prevent forced CBT, and current practical intent replaces them', () => {
  let state = prepareContinuityState(input('Advice nadeu hai, just let me rant.'));
  assert.ok(state.explicitPreferences.includes('NO_ADVICE'));
  assert.equal(planMomoResponse(input('More happened at work.', [], state), 'NORMAL', inference()).supportMode, 'LISTEN');
  assert.equal(planMomoResponse(input('More happened at work.', [], state), 'NORMAL').supportMode, 'LISTEN');
  state = prepareContinuityState(input('What should I say to my supervisor?'), state);
  assert.equal(state.currentSupportMode, 'DIRECT_HELP');
  assert.ok(!state.explicitPreferences.includes('NO_ADVICE'));
  assert.equal(planMomoResponse(input('What should I say to my supervisor?', [], state), 'NORMAL').supportMode, 'DIRECT_HELP');
  assert.equal(planMomoResponse(input('What exactly is CBT?'), 'NORMAL').supportMode, 'DIRECT_HELP');
});

test('mixed-language corrections survive history eviction', () => {
  const state = prepareContinuityState(input('Angry haina, confused ho.'));
  assert.equal(state.userCorrections.at(-1).rejectedTerm.toLowerCase(), 'angry');
  assert.deepEqual(groundingViolations('You are confused.', input('Go on.', [], state)), []);
  assert.ok(groundingViolations('You are angry.', input('Go on.', [], state)).length);
});

test('failed approaches are retained, but an explicit reopening applies to that approach only', () => {
  let state = prepareContinuityState(input('Breathing makes me dizzy.'));
  state = prepareContinuityState(input("The grounding thing isn't doing anything."), state);
  assert.ok(state.rejectedApproaches.includes('BREATHING'));
  assert.ok(state.rejectedApproaches.includes('GROUNDING'));
  state = prepareContinuityState(input('Can we try grounding again?'), state);
  assert.ok(state.rejectedApproaches.includes('BREATHING'));
  assert.ok(!state.rejectedApproaches.includes('GROUNDING'));
  assert.equal(state.needsReassessment, false);
  assert.deepEqual(continuityResponseViolations('Try grounding for a moment.', input('Can we try grounding again?', [], state)), []);
  state = prepareContinuityState(input('Making a list just stresses me out more.'), state);
  assert.ok(state.rejectedApproaches.includes('TASK_LISTING'));
  const cbtState = prepareContinuityState(input("I don't want to do a thought exercise. I just need to vent."));
  assert.ok(cbtState.rejectedApproaches.includes('CBT_RESTRUCTURING'));
});

test('question fatigue and uncertainty do not produce contradictory prompt and response checks', () => {
  const state = { ...emptyConversationContinuityState(), questionFatigue: true };
  const conversation = input('Everything is a bit unclear.', [], state);
  const route = planMomoResponse(conversation, 'NORMAL', inference('UNCLEAR', 'NONE'));
  assert.equal(route.shouldClarify, false);
  assert.equal(planMomoResponse(conversation, 'NORMAL').shouldClarify, false);
  assert.deepEqual(responseStyleViolations("We can leave that open for now.", conversation, route), []);
  const prompt = composeMomoSystemInstruction('', route, { continuityState: state });
  assert.match(prompt, /No clarification is required/);
});

test('brief practical requests get a verbosity retry without withholding otherwise valid help', async () => {
  const conversation = input('What should I say to my supervisor?');
  const route = planMomoResponse(conversation, 'NORMAL');
  const long = 'Here is an additional point about preparing for the conversation. '.repeat(16);
  assert.ok(responseStyleViolations(long, conversation, route).includes('EXCESSIVE_DIRECT_HELP'));
  assert.ok(!responseStyleViolations(long, input('Compare detailed alternatives for talking to my supervisor.'), route).includes('EXCESSIVE_DIRECT_HELP'));
  await import('../scripts/momo-audit-loader.mjs');
  const { hasBlockingResponseViolation } = await import('../src/server/momo/responder.ts');
  assert.equal(hasBlockingResponseViolation(['EXCESSIVE_DIRECT_HELP']), false);
  assert.equal(hasBlockingResponseViolation(['EXCESSIVE_DIRECT_HELP', 'UNSUPPORTED_EVENT_INFERENCE']), true);
});

test('every active safety state bypasses examples, planning, and ordinary generation despite preferences', async () => {
  for (const messageText of ["I can't do this anymore.", 'I want to hurt myself.', 'I am thinking about killing myself.', 'I am going to kill myself tonight.', 'I cut myself and I am bleeding heavily.']) {
    const conversation = input(messageText, [], { ...emptyConversationContinuityState(), questionFatigue: true, explicitPreferences: ['NO_ADVICE'], currentSupportMode: 'LISTEN' });
    const result = await orchestrateMomoTurn(conversation, {
      evaluateSafety: () => evaluateConversationSafety(conversation),
      plan: () => assert.fail('safety must bypass planning'),
      respond: () => assert.fail('safety must bypass ordinary generation and example selection'),
      safetyResponse: safetyResponseFor,
    });
    assert.equal(result.kind, 'SAFETY_RESPONSE', messageText);
    assert.ok(result.message);
  }
});
