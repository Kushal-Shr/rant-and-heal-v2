import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyConversationContinuityState, continuityResponseViolations, prepareContinuityState, finalizeContinuityState } from '../src/lib/momo/continuity.ts';
import { evaluateConversationSafety, evaluateConversationSafetyWithClassifier } from '../src/lib/safety/detector.ts';
import { planMomoResponse } from '../src/lib/momo/planner.ts';
import { responseStyleViolations } from '../src/lib/momo/responseStyle.ts';
const input=(messageText,state,history=[])=>({messageText,history,continuityState:state});
const now=new Date('2026-09-27T00:00:00Z');
test('quiet listening can continue after three different acknowledgements',()=>{
 const state={...emptyConversationContinuityState(),currentSupportMode:'LISTEN',recentResponseShapes:['ACKNOWLEDGEMENT','ACKNOWLEDGEMENT','ACKNOWLEDGEMENT']};
 assert.ok(!continuityResponseViolations('There is no need to explain any more.',input('Please just listen.',state)).includes('REPEATED_SHAPE'));
});
test('stopping a worsening technique is not offering that technique again',()=>{
 const state=prepareContinuityState({messageText:'Breathing made me dizzy. I had to stop.'},emptyConversationContinuityState(),now);
 const reply='Stop the breathing exercise. Leave it there.';
 const violations=continuityResponseViolations(reply,input('Please stop.',state));
 assert.ok(!violations.includes('REJECTED_APPROACH'));
 assert.ok(!violations.includes('REASSESSMENT_REQUIRED'));
 const decision=planMomoResponse(input('Please just listen.',state),'NORMAL');
 const next=finalizeContinuityState(state,decision,reply,now).state;
 assert.equal(next.recentInterventions.at(-1).outcome,'WORSE');
 assert.ok(next.rejectedApproaches.includes('BREATHING'));
});
test('negated reconsideration does not authorize a rejected approach',()=>{
 const state={...emptyConversationContinuityState(),rejectedApproaches:['BREATHING']};
 assert.ok(continuityResponseViolations('Try breathing slowly.',input('I do not want to try breathing again.',state)).includes('REJECTED_APPROACH'));
});
test('standalone emotion correction persists after bounded history eviction',()=>{
 const state=prepareContinuityState({messageText:'I am not angry.'},emptyConversationContinuityState(),now);
 assert.ok(state.userCorrections.some(c=>c.rejectedTerm==='angry'));
 const route=planMomoResponse(input('Just listen.',state),'NORMAL');
 assert.ok(responseStyleViolations('You are angry.',input('Go on.',state),route).includes('UNSUPPORTED_EMOTION_INFERENCE'));
});
test('latest explicit emotion can supersede an earlier correction',()=>{
 const state=prepareContinuityState({messageText:'I am not angry, I am confused.'},emptyConversationContinuityState(),now);
 const next=prepareContinuityState({messageText:'Now I am angry.'},state,now);
 const route=planMomoResponse(input('Just listen.',next),'NORMAL');
 assert.ok(!responseStyleViolations('You are angry.',input('Now I am angry.',next),route).includes('UNSUPPORTED_EMOTION_INFERENCE'));
});
test('persisted safety survives many bounded-history turns for every risk target',()=>{
 for(const messageText of ['I am going to kill myself tonight.','I am going to hurt him tonight. I have a knife.','I am going to kill myself and hurt him tonight.','I cut myself and I am bleeding heavily.']) {
  let safety=evaluateConversationSafety({messageText,history:[]});
  const initialState=safety.state,initialTarget=safety.safetyTarget;
  const history=[{role:'USER',text:messageText}];
  for(let i=0;i<20;i++) {
   safety=evaluateConversationSafety({messageText:'Let us talk about tomorrow’s assignment.',history:history.slice(-12),previousSafetyEvaluation:safety});
   assert.equal(safety.state,initialState);
   assert.equal(safety.safetyTarget,initialTarget);
   history.push({role:'USER',text:'Let us talk about tomorrow’s assignment.'},{role:'MOMO',text:'Safety response fixture.'});
  }
 }
});
test('saved safety advances each answer once instead of replaying already-consumed history',async()=>{
 const disclosed='I want to hurt myself.';
 let safety=evaluateConversationSafety({messageText:disclosed,history:[]});
 safety=evaluateConversationSafety({messageText:'No.',history:[],previousSafetyEvaluation:safety});
 assert.equal(safety.assessmentStep,'CHECK_ALREADY_ACTED');
 safety=await evaluateConversationSafetyWithClassifier({messageText:'No.',history:[{role:'USER',text:disclosed},{role:'USER',text:'No.'}],previousSafetyEvaluation:safety},async()=>{throw Error('Active risk must bypass classifier');});
 assert.equal(safety.assessmentStep,'CHECK_CURRENT_IMMEDIACY');
});
test('saved ambiguous risk can still resolve with the existing clear explanation rule',()=>{
 const safety=evaluateConversationSafety({messageText:"I can't do this anymore.",history:[]});
 assert.equal(safety.state,'CLARIFY');
 const resolved=evaluateConversationSafety({messageText:'I mean my exams, not hurting myself.',history:[],previousSafetyEvaluation:safety});
 assert.equal(resolved.state,'NORMAL');
});
test('negated inflected harm is not a new disclosure, while independent danger still wins',()=>{
 for(const messageText of ['I am not thinking of hurting myself.','I am not thinking about harming myself.','I am not planning to injure myself.']) {
  assert.equal(evaluateConversationSafety({messageText,history:[]}).state,'NORMAL',messageText);
 }
 for(const messageText of ['I am not thinking of hurting myself. I am bleeding heavily.','I am not thinking of hurting myself but I am going to kill myself tonight.','I am not thinking of hurting myself and I am going to hurt him tonight.']) {
  assert.notEqual(evaluateConversationSafety({messageText,history:[]}).state,'NORMAL',messageText);
 }
});
test('current practical request overrides the stored no-advice preference',()=>{
 let state=prepareContinuityState({messageText:'No advice please.'},emptyConversationContinuityState(),now);
 state=prepareContinuityState({messageText:'Give me one concrete next step.'},state,now);
 const decision=planMomoResponse(input('Give me one concrete next step.',state),'NORMAL');
 assert.equal(decision.supportMode,'DIRECT_HELP');
 assert.ok(!state.explicitPreferences.includes('NO_ADVICE'));
});
test('a requested recap may reuse relevant words without being treated as unsolicited repetition',()=>{
 const history=[{role:'MOMO',text:'Tomorrow morning, write down your current deadlines.'}];
 const state=emptyConversationContinuityState();
 assert.ok(!continuityResponseViolations('Tomorrow morning, write down your current deadlines.',input('Give me the short version.',state,history)).includes('RECYCLED_RESPONSE'));
});
test('uncertainty and conjunctions cannot negate a separate affirmative harm claim',()=>{
 for(const messageText of [
  'I am not sure but I will kill myself tonight.',
  'I do not know and I will hurt him tonight.',
  'I am not ready to talk; I will end my life tonight.',
 ]) assert.equal(evaluateConversationSafety({messageText,history:[]}).state,'IMMINENT',messageText);
});
test('repetition signals cannot waive hard preference, grounding or approach constraints',async()=>{
 await import('../scripts/momo-audit-loader.mjs');
 const {hasBlockingResponseViolation}=await import('../src/server/momo/responder.ts');
 assert.equal(hasBlockingResponseViolation(['REPEATED_SHAPE','RECYCLED_RESPONSE']),false);
 for(const violation of ['QUESTION_FATIGUE','REJECTED_APPROACH','REASSESSMENT_REQUIRED','OPTION_OVERLOAD','UNSUPPORTED_EVENT_INFERENCE','UNSUPPORTED_DIAGNOSIS','INTERNAL_SYSTEM_TERMINOLOGY','TOO_MANY_QUESTIONS']) {
  assert.equal(hasBlockingResponseViolation(['REPEATED_SHAPE',violation]),true,violation);
 }
 for(const violation of ['UNSUPPORTED_EMOTION_INFERENCE','UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION','UNNECESSARY_FACT_MIRRORING']) {
  assert.equal(hasBlockingResponseViolation([violation]),false,violation);
 }
});
test('attributed fictional quotes are separated from current personal risk outside the quote',()=>{
 for(const messageText of [
  'My essay quotes a character saying "I want to die". Can you explain the quote?',
  'A narrator said “I am going to kill myself tonight”. What does that passage mean?',
 ]) assert.equal(evaluateConversationSafety({messageText,history:[]}).state,'NORMAL',messageText);
 for(const messageText of [
  'A character says "I want to die". I am going to kill myself tonight.',
  'I want to die.',
  '"I am going to kill myself tonight"',
 ]) assert.notEqual(evaluateConversationSafety({messageText,history:[]}).state,'NORMAL',messageText);
});
test('an unrelated first-person sentence is not an affirmative risk answer',()=>{
 const previousSafetyEvaluation=evaluateConversationSafety({messageText:'I want to die.',history:[]});
 const result=evaluateConversationSafety({messageText:'I am asking about my exam.',history:[],previousSafetyEvaluation});
 assert.equal(result.state,'SUICIDAL');
 assert.notEqual(result.state,'IMMINENT');
});
test('a user identifying with a fictional quote retains the original safety assessment',()=>{
 for(const ending of ['That is how I feel too.','This describes my thoughts.','Same here.']) {
  const messageText=`My essay quotes a character saying "I want to die". ${ending}`;
  assert.notEqual(evaluateConversationSafety({messageText,history:[]}).state,'NORMAL',messageText);
 }
});
