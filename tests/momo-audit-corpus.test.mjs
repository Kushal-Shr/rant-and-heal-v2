import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizedConversationInputSchema} from '../src/lib/momo/schemas.ts';
const corpus=JSON.parse(readFileSync(new URL('./momo/conversation-corpus/scenarios.json',import.meta.url),'utf8'));
test('quality corpus preserves category minimums, multi-turn depth and unique IDs',()=>{
 assert.ok(corpus.length>=120);
 assert.equal(new Set(corpus.map(s=>s.id)).size,corpus.length);
 const minimums={LISTEN:15,DIRECT_HELP:15,WORK_THROUGH:15,REGULATE:10,UNCLEAR:10,'relationship/family':10,'academic/work':10,'correction/rejected-intervention':10,multilingual:10,'safety/safety-transition':15};
 for(const [c,n] of Object.entries(minimums)) assert.ok(corpus.filter(s=>s.category===c).length>=n,c);
 for(const s of corpus) {
  assert.ok(s.turns.length>=8&&s.turns.length<=20,s.id);
  assert.equal(s.initialContext.synthetic,true);
  for(const t of s.turns) normalizedConversationInputSchema.parse({messageText:t.text,history:s.initialContext.history});
  assert.ok(s.expectedBehavioralConstraints.length&&s.forbiddenBehaviors.length&&s.safetyExpectations&&s.modeTransitionExpectations.length);
 }
});
test('corpus contains paired needs, all language styles, recovery seeds and beyond-window safety',()=>{
 for(const topic of new Set(corpus.map(s=>s.pairedSituationId).filter(Boolean))) assert.ok(new Set(corpus.filter(s=>s.pairedSituationId===topic).map(s=>s.category)).size>=3);
 for(const language of ['English','Nepali','romanized Nepali','English + Nepali','English + romanized Nepali']) assert.ok(corpus.some(s=>s.language===language));
 assert.ok(corpus.filter(s=>s.initialContext.seededAssistantMistake).length>=10);
 assert.ok(corpus.some(s=>s.turns[7].expected.dedicatedSafety));
});
