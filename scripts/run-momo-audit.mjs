import './momo-audit-loader.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AI_MODELS, THINKING_LEVELS } from '../src/lib/ai/models.ts';
import { orchestrateMomoTurn } from '../src/lib/momo/orchestrator.ts';
import { emptyConversationContinuityState, prepareContinuityState, finalizeContinuityState } from '../src/lib/momo/continuity.ts';
import { safetyResponseFor } from '../src/lib/safety/responses.ts';
import { GoogleGenAI } from '@google/genai';
const [{ planMomoResponseWithInference }, { generateMomoResponse }, { assessMomoTurnSafety }, { resolveMomoTextConfig }] = await Promise.all([
 import('../src/server/momo/planner.ts'),
 import('../src/server/momo/responder.ts'),
 import('../src/server/momo/turnSafety.ts'),
 import('../src/server/momo/textProvider.ts'),
]);
const root=new URL('../',import.meta.url);
const corpusPath=new URL('tests/momo/conversation-corpus/scenarios.json',root);
const rubricPath=new URL('tests/momo/conversation-corpus/rubric.json',root);
const corpus=JSON.parse(readFileSync(corpusPath,'utf8'));
const rubric=JSON.parse(readFileSync(rubricPath,'utf8'));
const args=process.argv.slice(2);
const flag=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const run=flag('--run','baseline');
if(!/^[a-z0-9-]+$/.test(run)) throw Error('Invalid run name');
const dir=new URL(`tests/momo/conversation-corpus/runs/${run}/`,root);
mkdirSync(dir,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
function sourceFiles(path) {return readdirSync(new URL(path,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?sourceFiles(`${path}/${e.name}`):[`${path}/${e.name}`]);}
const files=[...sourceFiles('src/lib/momo'),...sourceFiles('src/lib/safety'),...sourceFiles('src/server/momo'),...sourceFiles('src/server/safety'),'src/lib/ai/models.ts','app/api/momo/chat/route.ts'];
const evaluatorModel=process.env.GEMINI_EVALUATOR_MODEL??AI_MODELS.SAFETY_CLASSIFIER;
const manifest={run,createdAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),corpusSha256:sha(readFileSync(corpusPath)),rubricSha256:sha(readFileSync(rubricPath)),sourceHashes:Object.fromEntries(files.map(f=>[f,sha(readFileSync(new URL(f,root)))])),models:{planner:{provider:'gemini',model:process.env.GEMINI_PLANNER_MODEL??AI_MODELS.MOMO_PLANNER},responder:resolveMomoTextConfig(),safety:{provider:'gemini',model:process.env.GEMINI_SAFETY_MODEL??AI_MODELS.SAFETY_CLASSIFIER},evaluator:{provider:'gemini',model:evaluatorModel}},registryThinking:THINKING_LEVELS,historyMessageLimit:12,synthetic:true,externalSideEffects:false,transport:'production server functions; no HTTP/Firestore',evaluatorContext:'rubric + scenario + transcript only; fresh API request per conversation',plannedScenarios:corpus.length,plannedUserTurns:corpus.reduce((n,s)=>n+s.turns.length,0)};
manifest.routeStateTransport=args.includes('--legacy-route-state')?'legacy':'checkpoint';
const manifestPath=new URL('manifest.json',dir);
if(existsSync(manifestPath)) {
 const old=JSON.parse(readFileSync(manifestPath,'utf8'));
 if(!args.includes('--evaluate-only')&&(old.routeStateTransport??'checkpoint')!==manifest.routeStateTransport) throw Error('Refusing to mix route-state transports in one run');
 if(old.corpusSha256!==manifest.corpusSha256||old.rubricSha256!==manifest.rubricSha256||(!args.includes('--evaluate-only')&&JSON.stringify(old.sourceHashes)!==JSON.stringify(manifest.sourceHashes))) throw Error('Refusing to mix changed sources/corpus/rubric into an existing run');
} else writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.warn=(label,error)=>console.log(JSON.stringify({warning:label,error:error?.name??'unknown',status:error?.status??null}));
const errorSummary=e=>({name:e?.name??'Error',status:e?.status??null,message:String(e?.message??e).replace(/key=[^&\s]+/g,'key=[redacted]').slice(0,1500)});
function timebox(p,ms) {let timer; return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Audit turn timeout')),ms);})]).finally(()=>clearTimeout(timer));}
const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
async function evaluate(record) {
 const prompt=JSON.stringify({dimensions:rubric.dimensions,scenario:record.scenario,turns:record.turns.map(t=>({turn:t.turn,user:t.user,response:t.output?.message??null,kind:t.output?.kind??null,mode:t.output?.decision?.supportMode??null,error:t.error??null}))});
 const responseJsonSchema={type:'object',properties:{turns:{type:'array',items:{type:'object',properties:{turn:{type:'integer'},grades:{type:'array',items:{type:'string',enum:rubric.grades},minItems:13,maxItems:13},notApplicable:{type:'array',items:{type:'string',enum:rubric.dimensions}},findings:{type:'array',items:{type:'object',properties:{dimension:{type:'string',enum:rubric.dimensions},evidence:{type:'string'},reason:{type:'string'}},required:['dimension','evidence','reason']}}},required:['turn','grades','notApplicable','findings']}},summary:{type:'string'}},required:['turns','summary']};
 for(let attempt=0;attempt<3;attempt++) {
  try {
   const result=await client.models.generateContent({model:evaluatorModel,contents:prompt,config:{systemInstruction:rubric.instruction,responseMimeType:'application/json',responseJsonSchema,thinkingConfig:{thinkingLevel:'low'},httpOptions:{timeout:90000}}});
   const judgment=JSON.parse(result.text??'');
   if(judgment.turns?.length!==record.turns.length || judgment.turns.some((t,i)=>t.turn!==i+1||t.grades?.length!==13||t.grades.some(g=>!rubric.grades.includes(g)))) throw Error('Incomplete evaluator output');
   return {model:evaluatorModel,rubricSha256:manifest.rubricSha256,usage:result.usageMetadata,judgment};
  } catch(e) {if(attempt===2) return {error:errorSummary(e)};}
 }
}
let completed=0;
async function execute(scenario) {
 const path=new URL(`${scenario.id}.json`,dir);
 let record=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 if(record&&args.includes('--retry-provider-errors')&&record.turns.some(t=>[429,500,502,503,504].includes(t.error?.status))) {
  if(args.includes('--evaluate-only')) throw Error('Provider-response retries cannot be evaluator-only');
  const attempts=new URL('attempts/',dir);
  mkdirSync(attempts,{recursive:true});
  writeFileSync(new URL(`${scenario.id}-${Date.now()}.json`,attempts),JSON.stringify(record,null,2)+'\n');
  record=null; // Replay the whole affected conversation to rebuild its context.
 }
 if(!record&&args.includes('--evaluate-only')) throw Error(`Missing transcript for evaluator-only run: ${scenario.id}`);
 if(!record) {
  record={scenario,turns:[],startedAt:new Date().toISOString()};
  let state=emptyConversationContinuityState();
  let previousSafetyEvaluation;
  const history=[...scenario.initialContext.history];
  for(const [i,t] of scenario.turns.entries()) {
   const prepared=prepareContinuityState({messageText:t.text},state);
   const input={messageText:t.text,history:history.slice(-12),continuityState:prepared,participant:{isAnonymous:true},...(args.includes('--legacy-route-state')?{}:{previousSafetyEvaluation})};
   const start=Date.now();
   try {
    const output=await timebox(orchestrateMomoTurn(input,{evaluateSafety:(_text,input)=>assessMomoTurnSafety(input),plan:planMomoResponseWithInference,respond:generateMomoResponse,safetyResponse:(ev,input)=>safetyResponseFor(ev,{messageText:input?.messageText})}),45000);
    previousSafetyEvaluation=output.safety;
    if(output.kind==='MOMO_RESPONSE') state=finalizeContinuityState(prepared,output.decision,output.message).state;
    // The baseline route leaves ordinary continuity unchanged after safety responses.
    history.push({role:'USER',text:t.text},{role:'MOMO',text:output.message});
    record.turns.push({turn:i+1,user:t.text,expected:t.expected,output,stateAfter:state,durationMs:Date.now()-start});
   } catch(e) {
    if(!args.includes('--legacy-route-state')) state=prepared; // Match route failure cleanup.
    // A failed route does not commit this user turn or fabricated assistant text.
    record.turns.push({turn:i+1,user:t.text,expected:t.expected,error:errorSummary(e),durationMs:Date.now()-start});
   }
  }
  record.completedAt=new Date().toISOString();
  writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 }
 if(!record.evaluation || (args.includes('--retry-evaluator')&&record.evaluation.error)) {
  record.evaluation=await evaluate(record);
  writeFileSync(path,JSON.stringify(record,null,2)+'\n');
 }
 completed++;
 console.log(JSON.stringify({run,completed,id:scenario.id,errors:record.turns.filter(t=>t.error).length,critical:record.evaluation.judgment?.turns.filter(t=>t.grades.includes('CRITICAL_FAIL')).length??null}));
}
const selected=flag('--only',null)?corpus.filter(s=>s.id===flag('--only',null)):flag('--category',null)?corpus.filter(s=>flag('--category',null).split(',').includes(s.category)):corpus;
const queue=[...selected];
await Promise.all(Array.from({length:Number(flag('--concurrency','8'))},async()=>{while(queue.length) await execute(queue.shift());}));
console.log(JSON.stringify({run,finished:true,scenarios:completed}));
