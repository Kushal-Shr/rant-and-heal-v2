// Opt-in synthetic API smoke check. No Firestore, personal data, notifications,
// or external handoffs. Run with --env-file=.env.local and an output path.
import './momo-audit-loader.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AI_MODELS } from '../src/lib/ai/models.ts';
import { prepareContinuityState } from '../src/lib/momo/continuity.ts';
const [{ planMomoResponseWithInference }, { generateMomoResponse }, { resolveMomoTextConfig }] = await Promise.all([
  import('../src/server/momo/planner.ts'),
  import('../src/server/momo/responder.ts'),
  import('../src/server/momo/textProvider.ts'),
]);

const outputPath = process.argv[2];
if (!outputPath) throw new Error('Provide an output JSON path for the synthetic results.');
const policySha256 = createHash('sha256').update(readFileSync(new URL('../src/lib/momo/prompts/conversationContract.ts', import.meta.url))).digest('hex');
const fixtures = [
  ['work', 'My coworker got credit for most of my work.'],
  ['relationships', "My girlfriend hasn't replied all day."],
  ['academics', 'I studied for months and barely passed.'],
  ['family', 'My parents said my grade was too low.'],
  ['low-mood', 'I stayed in bed most of today.'],
  ['ambiguous-emotion', 'My friend got engaged and I feel weird.'],
  ['guilt', 'I forgot to call my friend back.'],
  ['correction', "I'm not frustrated. I'm mostly confused.", [{ role: 'USER', text: 'My coworker got credit for my work.' }, { role: 'MOMO', text: 'You sound frustrated.' }]],
  ['direct-help', 'What should I say to my supervisor about my coworker getting credit for my work?'],
  ['mixed-listening', 'Advice nadeu hai, just let me rant.'],
  ['cbt-requested', 'I think everyone at university thinks I am stupid. Help me challenge that thought.'],
  ['regulation-rejection', 'Breathing makes me dizzy.'],
];
// Avoid logging provider error objects, which may include request details.
console.warn = () => {};
const selected = process.argv[3] ? fixtures.filter(([id]) => id === process.argv[3]) : fixtures;
if (!selected.length) throw new Error('Unknown fixture id.');
const records = new Array(selected.length);
const queue = selected.map((fixture, index) => ({ fixture, index }));
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const { fixture: [id, messageText, history = []], index } = queue.shift();
    const input = { messageText, history, continuityState: prepareContinuityState({ messageText }) };
    const startedAt = Date.now();
    try {
      const decision = await planMomoResponseWithInference(input, 'NORMAL');
      const message = await generateMomoResponse(input, decision);
      records[index] = { id, input, decision, message, durationMs: Date.now() - startedAt };
      console.log(`${id}: generated`);
    } catch (error) {
      records[index] = { id, input, error: { name: error?.name ?? 'Error', status: error?.status ?? null }, durationMs: Date.now() - startedAt };
      console.log(`${id}: failed (${error?.name ?? 'Error'})`);
    }
  }
}));
writeFileSync(outputPath, `${JSON.stringify({ synthetic: true, createdAt: new Date().toISOString(), policySha256, models: { planner: { provider: 'gemini', model: process.env.GEMINI_PLANNER_MODEL ?? AI_MODELS.MOMO_PLANNER }, responder: resolveMomoTextConfig() }, records }, null, 2)}\n`);
process.exitCode = records.some(record => record.error) ? 1 : 0;
