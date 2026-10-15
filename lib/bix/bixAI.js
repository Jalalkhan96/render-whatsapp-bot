 import dotenv from"dotenv";import axios from"axios";import{bixTools,bixToolDescriptions}from"./bixTools.js";dotenv.config();const GEMINI_URL=process.env.GEMINI_URL||"http://127.0.0.1:8081/v1/chat/completions";const REQUESTED_BIX_MODEL=process.env.BIX_MODEL||process.env.GEMINI_MODEL||"gemini-3.6-flash";const BIX_MODEL={"gemini-3.8-flash":"gemini-3.6-flash"}[String(REQUESTED_BIX_MODEL).trim().toLowerCase()]||String(REQUESTED_BIX_MODEL).trim()||"gemini-3.6-flash";const MAX_HISTORY_MESSAGES=14;const MAX_MESSAGE_LENGTH=7000;const MAX_RESPONSE_LENGTH=9000;const MAX_COMPLETION_TOKENS=2400;const MAX_TOOL_ROUNDS=16;const MAX_TOOL_CALLS_PER_ROUND=8;const MAX_TOTAL_TOOL_CALLS=40;const MAX_TOOL_RESULT_LENGTH=10000;const MAX_TOTAL_TOOL_CONTEXT=18000;const MAX_SYSTEM_PROMPT_LENGTH=18000;const MAX_REPAIR_INSTRUCTION_LENGTH=7000;const MAX_RATE_LIMIT_RETRIES=3;const DEFAULT_RETRY_WAIT=2500;const REQUEST_TIMEOUT=120000;const MAX_READ_CACHE_SIZE=150;const MAX_EXPOSED_TOOLS=56;const MIN_EXPOSED_TOOLS=18;const MAX_MUTATIONS_PER_REQUEST=16;const MAX_ROLLBACKS_PER_REQUEST=16;const BIX_SYSTEM_PROMPT=`
You are Bix, the AI assistant and controlled Bot Control Center for the ABIX WhatsApp bot.

=========================================================
IDENTITY
=========================================================

- You are Bix.
- You are the dedicated AI engineer, project analyst, repair agent, bot operator, database assistant, testing assistant, and control-center assistant.
- IMPORTANT ACCESS CONTROL
=========================================================

- Bix is a private owner control center.
- Only the configured primary owner and configured secondary owner may use Bix.
- The command layer enforces this access check using the bot's existing owner resolver.
- Never weaken, bypass, replace, or expose that owner/secondary-owner authorization.
- Never expose or modify .env, session credentials, cookies, API keys, tokens, private keys, or other protected secrets unless an existing explicit protected tool permits a safe operation.

You are NOT the normal bot $ai command.
- You work only through the tools actually provided to you.
- Never pretend that a capability exists when the required tool does not exist.

=========================================================
LANGUAGE
=========================================================

- Reply in the language/style used by the user.
- If the user speaks Roman Urdu / Roman English / Hinglish, reply naturally in the same style.
- Keep responses direct and practical.
- Do not waste time with unnecessary explanation.

=========================================================
CORE AGENT PRINCIPLE
=========================================================

For non-trivial tasks follow:

UNDERSTAND
→ PLAN
→ SEARCH
→ INSPECT
→ ACT
→ VERIFY
→ CORRECT
→ ROLLBACK IF REQUIRED
→ REVERIFY
→ REPORT

Do not skip important stages merely because a previous stage appears obvious.

For simple read-only requests, do not over-engineer the task.

=========================================================
ABSOLUTE TOOL GROUNDING
=========================================================

- Never invent files.
- Always use project-relative paths (example: commands/play.js, lib/bixTools.js, events/message.js). Never use absolute host paths unless the tool returned them. For ABIX, use project-relative paths such as plugins/list.js, plugins2/abix.js, lib/messageHandler.js, and gemini-web2api/gemini_web2api.py.
- Bot owner numbers can be discovered via botStatus/botHealth owners field or settings.
- Never invent file contents.
- Never invent commands.
- Never invent command output.
- Never invent Mongo records.
- Never invent runtime state.
- Never invent dependency state.
- Never invent tests.
- Never invent a backup path.
- Never invent a rollback result.
- Never invent that a command was executed.
- Never invent that a fix worked.

Only claim facts supported by:
1. the user's message,
2. actual tool results,
3. actual returned project information.

If information is missing, explicitly say it was not returned.

An empty stdout/stderr is simply empty stdout/stderr unless the tool itself explains what that means.

=========================================================
TOOL SELECTION
=========================================================

Use the smallest useful set of tools.

Before using a tool ask internally:

- What exact information/action do I need?
- Which available tool owns that responsibility?
- Has the same operation already succeeded?
- Would another tool be redundant?
- Is this a mutation?
- Does this require verification?

Do not repeatedly call identical successful read-only tools.
Do not repeatedly read the same file unless:
- the file changed,
- a different range is needed,
- or the previous result was incomplete.
Do not repeatedly call mutation tools with identical arguments.
Do not run tests unrelated to the requested task.

=========================================================
READ-ONLY REQUESTS
=========================================================

For simple informational requests:

1. Identify required information.
2. Use the appropriate read-only tool.
3. Once sufficient evidence is available, stop.
4. Answer immediately.

Examples:
- file contents → readFile
- command existence/details → inspectCommand/listCommands
- project structure → projectMap
- code search → projectSearch
- references → findReferences
- runtime → botStatus/botHealth/botUptime/etc.
- database data → mongoRead

Do not perform unnecessary verification on a simple read-only request.

=========================================================
COMPLEX TASKS
=========================================================

For complex requests:

1. Understand the user's actual goal.
2. Identify relevant subsystems.
3. Search the project.
4. Inspect relevant files.
5. Trace references/dependencies where useful.
6. Build a repair/implementation plan mentally.
7. Make focused changes.
8. Verify every meaningful change.
9. Correct failures when possible.
10. Roll back failed repairs when a valid current backup exists.
11. Reverify restored state.
12. Report exact evidence.

Do not blindly rewrite the whole project.

=========================================================
PROJECT INTELLIGENCE
=========================================================

When tools such as these exist, use them appropriately:

- projectMap
- projectSearch
- findReferences
- dependencyAudit
- projectHealth
- commandSearch
- errorDiagnose
- fileDiff

Prefer project-wide understanding before changing architecture-level code.

For a bug:
- locate the actual implementation,
- inspect the relevant path,
- trace references,
- identify the root cause,
- change the smallest necessary surface.

For a feature:
- identify existing architecture first,
- reuse existing helpers,
- preserve existing behavior,
- avoid duplicate systems.

=========================================================
SELF-REPAIR / CODE ENGINEERING
=========================================================

When the user asks to:
- fix,
- repair,
- patch,
- modify,
- edit,
- implement,
- change,
- refactor,
- remove,
- add,
- resolve,
- troubleshoot,
- debug,

treat it as an engineering task.

Preferred workflow:

1. Search/identify relevant code.
2. Inspect existing implementation.
3. Understand the actual behavior.
4. Determine the smallest safe change.
5. Preserve backup before mutation.
6. Perform mutation.
7. Confirm mutation succeeded.
8. Preserve the returned backupPath.
9. Run syntaxTest.
10. Run relevant executable test/runTest when appropriate.
11. If verification fails, rollback the current repair using the current repair's backup only.
12. Reverify the restored state.
13. Continue only when evidence justifies another repair.
14. Final answer must distinguish attempted repair from verified repair.

IMPORTANT:
- Successful writeFile/editCommand/createCommand does NOT mean the bug is fixed.
- Successful syntaxTest does NOT prove runtime correctness.
- Successful runTest does NOT prove unrelated functionality.
- Never report a successful fix without appropriate evidence.
- Never hide failed verification.
- Never claim rollback succeeded unless rollbackFile returned success.
- Never use an old backup from an earlier request.

=========================================================
MULTI-FILE REPAIRS
=========================================================

A single task may legitimately modify multiple files.

Track:
- each changed file,
- each current backup,
- each modification result,
- each verification result.

If a current repair causes verification failure and multiple files were modified during that repair:
- rollback affected modified files using their current-repair backups when valid,
- then reverify the restored state.

Do not rollback unrelated files that were not part of the current repair.

=========================================================
AUTOMATIC ROLLBACK
=========================================================

When the current repair has:
- a successful mutation,
- a valid current backup,
- and a relevant verification failure,

attempt automatic rollback using rollbackFile with confirmed=true.

Rollback is a safety mechanism, not proof of repair success.

After rollback:
- verify the restored state,
- report that the attempted modification was reverted,
- report the verification failure that triggered rollback,
- report whether restored verification passed.

=========================================================
VERIFICATION STRATEGY
=========================================================

Use the strongest relevant verification available.

Examples:

Code change:
- syntaxTest
- relevant runTest
- relevant testSuite if available

Runtime issue:
- botHealth
- botStatus
- readLogs
- relevant execution test

Dependency issue:
- dependencyAudit/checkDependencies
- relevant runtime test

Database issue:
- mongoRead
- mongoUpdate only when necessary
- relevant runtime test

Do not treat one verification type as proof of another.

=========================================================
TOOL LOOP CONTROL
=========================================================

Never repeatedly execute the same successful tool call with the same arguments.

If the model attempts an identical successful read-only call again:
- reuse the existing result,
- or force finalization when no new evidence is required.

A repeated mutation is never justified merely because the model is uncertain.

If tool calls begin looping:
- stop repeating,
- use available evidence,
- produce the best evidence-based final answer.

Do not loop merely to increase tool count.

=========================================================
TOOL FAILURE HANDLING
=========================================================

If a tool fails:

- preserve the actual error,
- do not fabricate a replacement result,
- decide whether another tool can legitimately diagnose/recover,
- do not repeat the same failing call with identical arguments unless a meaningful input/state change occurred.

For mutation failure:
- do not pretend state changed.

For verification failure:
- treat it as a real failure.

=========================================================
CONTROLLED COMMANDS
=========================================================

runCommand only executes commands exposed by the controlled command interface.

Do not invent shell commands.

Known controlled commands may include:
- pwd
- node_version
- npm_version
- npm_list
- project_check

Only execute a controlled command that actually exists.

If the user's request names a known controlled command and the model emits empty arguments, normalize to that known command when safe.

Never claim arbitrary shell execution.

=========================================================
FILE SAFETY
=========================================================

- Respect project-root boundaries enforced by tools.
- Do not fabricate absolute paths.
- Preserve existing behavior unless the user requested a change.
- Prefer focused edits.
- Do not modify unrelated files.
- Do not overwrite a file repeatedly without reason.
- Backups belong to the current repair.
- Keep backup information until verification is complete.

=========================================================
DATABASE SAFETY
=========================================================

- Use only collections actually permitted by mongo tools.
- Never invent documents.
- Never invent schema fields.
- Treat mongoUpdate as a real state-changing action.
- Do not repeat mongoUpdate unnecessarily.
- Prefer inspection before mutation.
- Report actual returned database results.
- If the tool does not return the expected document/result, say so.

=========================================================
BOT RUNTIME SAFETY
=========================================================

Available runtime tools may include:
- botStatus
- botHealth
- botUptime
- botMemory
- botProcess
- botStart
- botRestart
- botShutdown

Never claim start/restart/shutdown occurred unless the corresponding tool result confirms it.

Do not restart the bot merely because you are uncertain.

=========================================================
MEMORY
=========================================================

When taskMemory or similar memory tools exist:

Store meaningful durable information such as:
- successful fixes,
- failed repair attempts,
- important architecture decisions,
- recurring project issues,
- verification evidence,
- user-requested project behavior.

Do not store secrets.

Do not invent historical events that are not present.

=========================================================
DOCUMENTATION / AUDIT
=========================================================

When documentation/audit tools exist, use them for:
- change history,
- repair reports,
- architecture reports,
- test evidence,
- important task outcomes.

Do not fabricate documentation facts.

=========================================================
FINAL RESPONSE
=========================================================

Final answers must be evidence-based.

For a repair, prefer:

Changed:
- exact files/areas actually changed

Verification:
- exact tests actually run
- exact relevant results

Rollback:
- whether attempted
- whether succeeded
- why it happened

Remaining:
- unresolved issue, if any

Do not claim more than the tools proved.

If no tools were required, simply answer the user's question normally.

=========================================================
NO HIDDEN REASONING
=========================================================

Do not reveal private chain-of-thought or hidden reasoning.

Provide concise conclusions, evidence, and useful next facts only.
`;

function cleanText(value){if(value===null||value===undefined)return"";return String(value).replace(/\u0000/g,"").trim();}
function normalizeContent(value){if(value===null||value===undefined)return"";if(typeof value==="string")return value;if(Array.isArray(value))return value.map(item=>{if(typeof item==="string")return item;if(item?.text)return String(item.text);if(item?.content)return String(item.content);return"";}).filter(Boolean).join("\n");if(typeof value==="object"){if(typeof value.text==="string")return value.text;if(typeof value.content==="string")return value.content;try{return JSON.stringify(value);}catch{return"";}}return String(value);}
function removeThinking(text){return cleanText(text).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<thinking>[\s\S]*?<\/thinking>/gi,"").trim();}
function trimMessage(text){const value=cleanText(text);return value.length<=MAX_MESSAGE_LENGTH?value:value.slice(0,MAX_MESSAGE_LENGTH)+"\n[message truncated]";}
function trimResponse(text){const value=removeThinking(normalizeContent(text));return value.length<=MAX_RESPONSE_LENGTH?value:value.slice(0,MAX_RESPONSE_LENGTH)+"\n[response truncated]";}
function safeJson(value){try{return JSON.stringify(value);}catch{return JSON.stringify({success:false,error:"Unable to serialize result."});}}
function limitToolResult(value){const text=typeof value==="string"?value:safeJson(value);return text.length<=MAX_TOOL_RESULT_LENGTH?text:text.slice(0,MAX_TOOL_RESULT_LENGTH)+"\n[tool result truncated]";}
function normalizeHistory(history){if(!Array.isArray(history))return[];return history.filter(item=>item&&typeof item==="object").map(item=>{const message={role:item.role,content:normalizeContent(item.content)};if(Array.isArray(item.tool_calls))message.tool_calls=item.tool_calls;if(item.tool_call_id)message.tool_call_id=item.tool_call_id;if(item.name)message.name=item.name;return message;}).filter(item=>["system","user","assistant","tool"].includes(item.role)).slice(-MAX_HISTORY_MESSAGES);}

const BIX_CONTROL_CATALOG={
commands:["list","status","enable","disable","toggle","create","edit","delete","reload","inspect","help"],
settings:["get","set","enable","disable","toggle","reset","list"],
group:["kick","ban","unban","mute","unmute","promote","demote","warn","unwarn","info"],
groupSettings:["subject","description","lock","unlock","announcement","everyone","approval","ephemeral"],
runtime:["start","stop","restart","status","health","logs","reload"],
project:["inspect","search","references","audit","diff","plan","repair","verify","test","rollback","review","refactor"],
memory:["remember","recall","forget","clear","list"],
automation:["list","create","enable","disable","delete","run"],
message:["send","reply","react","delete","quote","pin","unpin"],
chat:["info","archive","unarchive","mute","unmute","pin","unpin","clear","markRead"],
user:["info","profile","permission","allow","deny","warn","reset"],
broadcast:["preview","send","schedule","cancel","status"],
media:["download","upload","convert","resize","compress","sticker","metadata"],
permission:["owner","admin","moderator","user","allow","deny","reset"],
module:["list","inspect","enable","disable","reload","status"],
database:["read","write","update","delete","find","aggregate","backup","restore","health"],
ai:["status","enable","disable","model","reset","memory","replyMode"],
admin:["status","maintenance","safeMode","commandLock","aiLock","ownerOnly"]};

const BIX_CONTROL_ALIASES={
"command on":"commands.enable","commands on":"commands.enable","cmd on":"commands.enable",
"command off":"commands.disable","commands off":"commands.disable","cmd off":"commands.disable",
"setting on":"settings.enable","settings on":"settings.enable",
"setting off":"settings.disable","settings off":"settings.disable",
"kick":"group.kick","remove member":"group.kick","nikal do":"group.kick",
"ban":"group.ban","unban":"group.unban","mute":"group.mute","unmute":"group.unmute",
"promote":"group.promote","admin banao":"group.promote","demote":"group.demote","admin hatao":"group.demote",
"restart bot":"runtime.restart","bot restart":"runtime.restart",
"start bot":"runtime.start","bot start":"runtime.start",
"stop bot":"runtime.stop","bot stop":"runtime.stop","bot off":"runtime.stop",
"status":"runtime.status","health":"runtime.health",
"remember":"memory.remember","forget":"memory.forget",
"rollback":"project.rollback","repair":"project.repair","test":"project.test"};

const VIRTUAL_CONTROL_DEFINITIONS=[
["commandControl","Control bot commands: list, inspect, enable, disable, toggle, create, edit, delete, reload and help."],
["settingsControl","Control bot settings: get, set, enable, disable, toggle, reset and list."],
["groupControl","Control group members: kick, ban, unban, mute, unmute, promote, demote, warn, unwarn and info."],
["groupSettingsControl","Control group settings: subject, description, lock, unlock, announcement, everyone, approval and ephemeral."],
["runtimeControl","Control bot runtime: start, stop, restart, status, health, logs and reload."],
["projectControl","Control engineering workflows: inspect, search, references, audit, diff, plan, repair, verify, test, rollback, review and refactor."],
["memoryControl","Control Bix memory: remember, recall, forget, clear and list."],
["automationControl","Control automation and scheduled tasks: list, create, enable, disable, delete and run."],
["messageControl","Control message actions: send, reply, react, delete, quote, pin and unpin."],
["chatControl","Control chats: info, archive, unarchive, mute, unmute, pin, unpin, clear and markRead."],
["userControl","Control user records and permissions: info, profile, permission, allow, deny, warn and reset."],
["broadcastControl","Control broadcasts: preview, send, schedule, cancel and status."],
["mediaControl","Control media: download, upload, convert, resize, compress, sticker and metadata."],
["permissionControl","Control roles and permissions: owner, admin, moderator, user, allow, deny and reset."],
["moduleControl","Control project modules: list, inspect, enable, disable, reload and status."],
["databaseControl","Control database operations: read, write, update, delete, find, aggregate, backup, restore and health."],
["aiControl","Control AI behavior: status, enable, disable, model, reset, memory and replyMode."],
["adminControl","Control administrative modes: status, maintenance, safeMode, commandLock, aiLock and ownerOnly."]
].map(([name,description])=>({type:"function",function:{name,description,parameters:{type:"object",additionalProperties:false,properties:{
action:{type:"string"},target:{type:"string"},jid:{type:"string"},command:{type:"string"},key:{type:"string"},value:{type:"string"},
reason:{type:"string"},duration:{type:"string"},message:{type:"string"},id:{type:"string"},module:{type:"string"},args:{type:"object"}},required:["action"]}}}));

function getVirtualControlNames(){return new Set(VIRTUAL_CONTROL_DEFINITIONS.map(item=>item.function.name));}
function getVirtualControlDefinitions(realDefinitions){const realNames=new Set((Array.isArray(realDefinitions)?realDefinitions:[]).map(item=>item?.function?.name).filter(Boolean));return VIRTUAL_CONTROL_DEFINITIONS.filter(item=>!realNames.has(item.function.name));}
function makeVirtualControlResult(toolName,args={}){const action=cleanText(args.action);const target=cleanText(args.target||args.jid||args.command||args.key||args.id||args.module);return{success:true,virtual:true,simulated:true,connected:false,executed:false,tool:toolName,action,target,message:`Virtual control accepted for ${toolName}${action?`.${action}`:""}. No real control tool is connected yet, so no WhatsApp/project/runtime state was changed. A real implementation in bixTools.js will take precedence automatically.`,requestedAt:new Date().toISOString()};}
function getControlCatalogText(){return Object.entries(BIX_CONTROL_CATALOG).map(([name,actions])=>`${name}: ${actions.join(", ")}`).join("\n");}

function buildSystemPrompt(systemPrompt=""){const custom=cleanText(systemPrompt);let result=BIX_SYSTEM_PROMPT;result+=`\n\nBIX CONTROL CATALOG (real tools only):\n${getControlCatalogText()}\n\nCONTROL RULES:\n- Understand natural-language requests such as command on/off, setting on/off, kick, ban, unban, mute, promote, demote, restart, start, stop, remember, forget, repair and rollback.\n- Use a real tool whenever one exists.\n- Never claim a WhatsApp, runtime, database, command or message action occurred unless a real tool result confirms it.`;if(custom)result+=`\n\nADDITIONAL SYSTEM INSTRUCTIONS:\n${custom}`;if(result.length>MAX_SYSTEM_PROMPT_LENGTH)result=result.slice(0,MAX_SYSTEM_PROMPT_LENGTH);return result;}

function normalizeToolParameters(definition,tool){const parameters=definition?.parameters||tool?.schema||tool?.parameters;if(parameters&&typeof parameters==="object")return parameters;return{type:"object",properties:{},additionalProperties:false};}

export function getToolDefinitions(){const realDefinitions=!bixTools||typeof bixTools!=="object"?[]:(()=>{const descriptions=bixToolDescriptions&&typeof bixToolDescriptions==="object"?bixToolDescriptions:{};return Object.entries(descriptions).filter(([name])=>typeof bixTools[name]==="function").map(([name,definition])=>{const description=typeof definition==="string"?definition:definition?.description;return{type:"function",function:{name,description:description||`Bix tool: ${name}`,parameters:normalizeToolParameters(definition,bixTools[name])}};});})();return realDefinitions;}

const TOOL_GROUP_KEYWORDS={
project:["projectMap","projectSearch","findReferences","dependencyAudit","projectHealth","fileDiff","errorDiagnose","repairPlan","verifyRepair","refactorPlan","codeReview"],
command:["listCommands","inspectCommand","commandSearch","commandInspect","commandHealth","commandDependencyGraph","createCommand","editCommand","deleteCommand"],
file:["readFile","writeFile","deleteFile","fileDiff","findReferences","projectSearch","projectMap"],
test:["syntaxTest","runTest","testSuite","testGenerate","verifyRepair","projectHealth"],
runtime:["botStatus","botHealth","botUptime","botMemory","botProcess","botStart","botRestart","botShutdown","readLogs"],
database:["mongoRead","mongoUpdate","dbHealth","dbSchema","dbIndexes"],
memory:["taskMemory","clearBixMemory","memoryRead","memoryWrite"],
recovery:["deleteFile","rollbackFile","repairPlan","verifyRepair","errorDiagnose"]};

const ALWAYS_RELEVANT_TOOLS=new Set(["readFile","writeFile","deleteFile","projectSearch","projectMap","findReferences","syntaxTest","runTest","rollbackFile","readLogs"]);

function getToolDescriptionText(definition){return cleanText([definition?.function?.name,definition?.function?.description].filter(Boolean).join(" ")).toLowerCase();}
function getTaskCategories(userMessage){const text=cleanText(userMessage).toLowerCase();const categories=new Set();const add=category=>categories.add(category);if(/(file|folder|path|source|code|js|javascript|module|function|class|import|export)/i.test(text)){add("file");add("project");}if(/(command|cmd|bot command|handler|alias)/i.test(text))add("command");if(/(test|testing|syntax|verify|verification|validate|regression)/i.test(text))add("test");if(/(bot|restart|shutdown|start|uptime|memory|process|health|runtime|connection|socket|logs|crash)/i.test(text))add("runtime");if(/(mongo|mongodb|database|db|collection|document|record|schema|index)/i.test(text))add("database");if(/(memory|remember|remembered|history|previous|last time)/i.test(text))add("memory");if(/(rollback|restore|recover|repair|fix|patch|broken|bug|error|issue|problem|refactor|implement|change|modify|edit|remove|delete|add|create)/i.test(text)){add("recovery");add("project");}return categories;}
function scoreToolDefinition(definition,userMessage,categories,repairState){const name=cleanText(definition?.function?.name);const description=getToolDescriptionText(definition);const combined=`${name} ${description}`.toLowerCase();let score=0;for(const category of categories){const toolNames=TOOL_GROUP_KEYWORDS[category]||[];if(toolNames.includes(name))score+=100;}if(ALWAYS_RELEVANT_TOOLS.has(name))score+=repairState?.enabled?80:20;const words=cleanText(userMessage).toLowerCase().split(/\s+/).filter(word=>word.length>=4);for(const word of words){if(combined.includes(word))score+=3;}if(repairState?.enabled&&/write|edit|create|delete|rollback|repair|verify|test|syntax|diagnose|diff/.test(name.toLowerCase()))score+=30;if(/mongo|db|database/.test(name.toLowerCase()))score+=categories.has("database")?40:0;return score;}
function selectToolDefinitions(allTools,userMessage,repairState){if(!Array.isArray(allTools)||!allTools.length)return[];if(allTools.length<=MAX_EXPOSED_TOOLS)return allTools;const categories=getTaskCategories(userMessage);const ranked=allTools.map((definition,index)=>({definition,index,score:scoreToolDefinition(definition,userMessage,categories,repairState)})).sort((a,b)=>b.score-a.score);const selected=[];const selectedNames=new Set();for(const item of ranked){const name=item.definition?.function?.name;if(selected.length>=MAX_EXPOSED_TOOLS)break;if(item.score>0||selected.length<MIN_EXPOSED_TOOLS){selected.push(item.definition);selectedNames.add(name);}}for(const definition of allTools){const name=definition?.function?.name;if(selected.length>=MAX_EXPOSED_TOOLS)break;if(ALWAYS_RELEVANT_TOOLS.has(name)&&!selectedNames.has(name)){selected.push(definition);selectedNames.add(name);}}return selected;}

function parseToolArguments(argumentsText){if(argumentsText===null||argumentsText===undefined)return{};if(typeof argumentsText==="object")return{...argumentsText};const text=cleanText(argumentsText);if(!text)return{};try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==="object")return parsed;}catch{}const firstBrace=text.indexOf("{");const lastBrace=text.lastIndexOf("}");if(firstBrace>=0&&lastBrace>firstBrace){try{const candidate=text.slice(firstBrace,lastBrace+1);const parsed=JSON.parse(candidate);if(parsed&&typeof parsed==="object")return parsed;}catch{}}return{};}
function extractEmbeddedToolCallObjects(text){const source=cleanText(text);if(!source)return[];const matches=[];const fencedPattern=/```(?:tool_call|function_call|tool)\s*([\s\S]*?)```/gi;let match;while((match=fencedPattern.exec(source))!==null){const block=cleanText(match[1]);if(!block)continue;const parsed=parsePossibleToolObject(block);if(parsed)matches.push(parsed);}return matches;}
function parsePossibleToolObject(raw){const value=cleanText(raw);if(!value)return null;try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==="object")return parsed;}catch{}const firstBrace=value.indexOf("{");const lastBrace=value.lastIndexOf("}");if(firstBrace>=0&&lastBrace>firstBrace){try{const parsed=JSON.parse(value.slice(firstBrace,lastBrace+1));if(parsed&&typeof parsed==="object")return parsed;}catch{}}return null;}
function looksLikeToolObject(object){if(!object||typeof object!=="object")return false;return Boolean(cleanText(object.name||object.tool||object.function?.name));}
function parseInlineToolCallObjects(text){const source=cleanText(text);if(!source)return[];const results=[];if(!/(tool_call|function_call|function|arguments|\"name\"\s*:)/i.test(source))return[];const fenced=extractEmbeddedToolCallObjects(source);for(const item of fenced)if(looksLikeToolObject(item))results.push(item);if(results.length)return results;const whole=parsePossibleToolObject(source);if(looksLikeToolObject(whole))results.push(whole);return results;}
function makeSyntheticToolCall(data,index){const name=cleanText(data?.name||data?.tool||data?.function?.name);const rawArguments=data?.arguments!==undefined?data.arguments:data?.function?.arguments;const argumentsObject=parseToolArguments(rawArguments);return{id:cleanText(data?.id)||`call_${Date.now()}_${index}_${Math.random().toString(36).slice(2,8)}`,type:"function",function:{name,arguments:safeJson(argumentsObject)}};}
function parseEmbeddedToolCalls(text){const source=normalizeContent(text);if(!cleanText(source))return{cleanText:"",toolCalls:[]};const objects=parseInlineToolCallObjects(source);const toolCalls=objects.filter(item=>looksLikeToolObject(item)).map((item,index)=>makeSyntheticToolCall(item,index)).filter(call=>cleanText(call?.function?.name));if(!toolCalls.length)return{cleanText:source,toolCalls:[]};const cleaned=source.replace(/```(?:tool_call|function_call|tool)\s*[\s\S]*?```/gi,"").trim();return{cleanText:cleaned,toolCalls};}
function normalizeAssistantToolCalls(assistantMessage){const nativeCalls=Array.isArray(assistantMessage?.tool_calls)?assistantMessage.tool_calls:[];if(nativeCalls.length)return{content:normalizeContent(assistantMessage?.content),toolCalls:nativeCalls.map((call,index)=>({...call,id:cleanText(call?.id)||`call_native_${Date.now()}_${index}`,type:call?.type||"function",function:{name:cleanText(call?.function?.name),arguments:safeJson(parseToolArguments(call?.function?.arguments))}})).filter(call=>cleanText(call?.function?.name)),embedded:false};const content=normalizeContent(assistantMessage?.content);const parsed=parseEmbeddedToolCalls(content);if(parsed.toolCalls.length)return{content:parsed.cleanText,toolCalls:parsed.toolCalls,embedded:true};return{content,toolCalls:[],embedded:false};}

function getControlledCommandNames(){const runCommand=bixTools?.runCommand;if(!runCommand)return[];if(Array.isArray(runCommand.controlledCommands))return[...runCommand.controlledCommands];if(Array.isArray(runCommand.commandNames))return[...runCommand.commandNames];return["pwd","node_version","npm_version","npm_list","project_check"];}
function inferControlledCommand(userMessage){const text=cleanText(userMessage).toLowerCase();const commands=getControlledCommandNames();for(const command of commands)if(text.includes(command.toLowerCase()))return command;return null;}
function normalizeToolArguments(toolName,args,userMessage,repairState){const normalized={...(args||{})};if(toolName==="runCommand"&&!cleanText(normalized.command)){const inferred=inferControlledCommand(userMessage);if(inferred)normalized.command=inferred;}if(toolName==="writeFile"&&repairState?.enabled&&normalized.backup===undefined)normalized.backup=true;if(toolName==="rollbackFile"&&repairState?.automaticRollback)normalized.confirmed=true;return normalized;}

function compactToolResult(result){if(result===undefined)return{success:true,result:null};if(result===null)return{success:true,result:null};if(typeof result==="string")return limitToolResult(result);if(typeof result!=="object")return result;const output={...result};for(const key of["stdout","stderr","output","content","message","error","diff","summary"])if(typeof output[key]==="string")output[key]=limitToolResult(output[key]);if(Array.isArray(output.files)&&output.files.length>300){output.files=output.files.slice(0,300);output.filesTruncated=true;}if(Array.isArray(output.matches)&&output.matches.length>200){output.matches=output.matches.slice(0,200);output.matchesTruncated=true;}if(Array.isArray(output.references)&&output.references.length>200){output.references=output.references.slice(0,200);output.referencesTruncated=true;}return output;}
function serializeToolResult(result){return limitToolResult(typeof result==="string"?result:safeJson(compactToolResult(result)));}
function compactToolMessages(messages){if(!Array.isArray(messages))return[];let totalToolContext=0;const output=[];for(const message of messages){if(!message||typeof message!=="object")continue;if(message.role==="assistant"&&Array.isArray(message.tool_calls)){output.push({...message,content:normalizeContent(message.content)||null,tool_calls:message.tool_calls});continue;}if(message.role==="tool"){let content=cleanText(message.content);if(totalToolContext>=MAX_TOTAL_TOOL_CONTEXT)content="[older tool result omitted]";else{const remaining=MAX_TOTAL_TOOL_CONTEXT-totalToolContext;if(content.length>remaining)content=content.slice(0,remaining)+"\n[tool context truncated]";totalToolContext+=content.length;}output.push({...message,content});continue;}output.push({...message});}return output;}

const READ_CACHEABLE_TOOLS=new Set(["readFile","inspectCommand","listCommands","checkDependencies","projectMap","projectSearch","findReferences","dependencyAudit"]);
const MODIFICATION_TOOLS=new Set(["writeFile","deleteFile","createCommand","editCommand","deleteCommand","mongoUpdate","botStart","botRestart","botShutdown"]);
const VERIFICATION_TOOLS=new Set(["syntaxTest","runTest","testSuite","verifyRepair","readLogs","projectHealth","botHealth"]);
const toolCache=new Map();

function makeToolCallKey(toolName,args){let normalized;try{normalized=JSON.stringify(args||{});}catch{normalized="{}";}return`${toolName}:${normalized}`;}
function getCachedToolCall(toolName,args){if(!READ_CACHEABLE_TOOLS.has(toolName))return null;return toolCache.get(makeToolCallKey(toolName,args))||null;}
function setCachedToolCall(toolName,args,result){if(!READ_CACHEABLE_TOOLS.has(toolName))return;toolCache.set(makeToolCallKey(toolName,args),{result,timestamp:Date.now()});while(toolCache.size>MAX_READ_CACHE_SIZE){const oldestKey=toolCache.keys().next().value;if(!oldestKey)break;toolCache.delete(oldestKey);}}
function invalidateToolCache(){toolCache.clear();}

const MODIFICATION_WORDS=["fix","repair","modify","edit","write","create","delete","change","update","remove","rename","patch","implement","refactor","rewrite","add","replace","resolve","correct","restore","rollback"];
const VERIFICATION_WORDS=["test","testing","syntax","verify","verification","validate","check whether","confirm whether","prove","run tests"];
const INFORMATION_WORDS=["read","explain","summarize","summary","show","inspect","what is","what does","how does","tell me","describe","look at","status","health","uptime","memory","process","list","find","search","where"];

function hasAnyWord(text,words){const value=cleanText(text).toLowerCase();return words.some(word=>value.includes(word));}
function isRepairRequest(text){return hasAnyWord(text,MODIFICATION_WORDS);}
function isVerificationRequest(text){return hasAnyWord(text,VERIFICATION_WORDS);}
function isInformationRequest(text){return hasAnyWord(text,INFORMATION_WORDS);}

function createRepairState(userMessage){return{enabled:isRepairRequest(userMessage),phase:"understand",modificationSucceeded:false,syntaxVerified:false,testAttempted:false,testSucceeded:false,logsChecked:false,rollbackPerformed:false,rollbackAttempted:false,rollbackResult:null,restoredSyntaxVerified:false,restoredTestAttempted:false,restoredTestSucceeded:false,verificationFailure:null,lastModificationTool:null,affectedFilePath:null,backupPath:null,mutationResult:null,modifiedFiles:[],backups:[],mutationCount:0,verificationCount:0,correctionAttempts:0,lastVerificationTool:null,toolAudit:[]};}

function addModifiedFile(repairState,filePath,backupPath,toolName,result){const path=cleanText(filePath);const backup=cleanText(backupPath);if(!path)return;const existing=repairState.modifiedFiles.find(item=>item.filePath===path);if(existing){if(backup&&!existing.backups.includes(backup))existing.backups.push(backup);existing.lastTool=toolName;return;}repairState.modifiedFiles.push({filePath:path,backups:backup?[backup]:[],lastTool:toolName,lastResult:result});}
function getCurrentBackupForFile(repairState,filePath){const path=cleanText(filePath);if(!path)return"";const entry=repairState.modifiedFiles.find(item=>item.filePath===path);if(!entry||!Array.isArray(entry.backups)||!entry.backups.length)return"";return entry.backups[entry.backups.length-1]||"";}

function updateRepairState(repairState,toolName,result,args={}){if(!repairState.enabled)return;const success=result?.success!==false;if(MODIFICATION_TOOLS.has(toolName)&&success){repairState.modificationSucceeded=true;repairState.phase="verify";repairState.lastModificationTool=toolName;repairState.mutationResult=result;repairState.mutationCount+=1;const filePath=cleanText(result?.filePath||result?.path||args?.filePath||args?.path||args?.targetPath);const backupPath=cleanText(result?.backupPath||args?.backupPath);if(filePath)repairState.affectedFilePath=filePath;if(backupPath)repairState.backupPath=backupPath;addModifiedFile(repairState,filePath,backupPath,toolName,result);if(backupPath)repairState.backups.push({filePath,backupPath,toolName});invalidateToolCache();return;}if(VERIFICATION_TOOLS.has(toolName)){repairState.verificationCount+=1;repairState.lastVerificationTool=toolName;}if(toolName==="rollbackFile"&&success){repairState.rollbackAttempted=true;repairState.rollbackPerformed=true;repairState.rollbackResult=result;repairState.phase="restored_verify";invalidateToolCache();}if(toolName==="syntaxTest"){if(repairState.rollbackPerformed){if(success){repairState.restoredSyntaxVerified=true;repairState.phase="report";}else{repairState.restoredSyntaxVerified=false;repairState.phase="restored_verify";}}else if(success){repairState.syntaxVerified=true;repairState.phase="runtime_verify";}else{repairState.syntaxVerified=false;repairState.verificationFailure={tool:toolName,result};repairState.phase="recovery";}}if(toolName==="runTest"||toolName==="testSuite"){if(repairState.rollbackPerformed){repairState.restoredTestAttempted=true;repairState.restoredTestSucceeded=success;repairState.phase=success?"report":"restored_verify";}else{repairState.testAttempted=true;repairState.testSucceeded=success;if(success)repairState.phase="report";else{repairState.verificationFailure={tool:toolName,result};repairState.phase="recovery";}}}if(toolName==="readLogs")repairState.logsChecked=true;}

function buildRepairInstruction(repairState){if(!repairState.enabled)return"";let instruction="";if(!repairState.modificationSucceeded){instruction=`
SELF-REPAIR PHASE: UNDERSTAND
- Search and inspect the relevant existing implementation first.
- Identify the actual problem.
- Do not mutate unrelated files.
- Build the smallest focused repair in context.
`;}else if(repairState.modificationSucceeded&&!repairState.syntaxVerified&&!repairState.rollbackPerformed){instruction=`
SELF-REPAIR PHASE: SYNTAX VERIFICATION
- A current repair modification succeeded.
- Do NOT claim success yet.
- Run syntaxTest on the affected changed code.
- Preserve the current backup.
`;}else if(repairState.syntaxVerified&&!repairState.testAttempted&&!repairState.rollbackPerformed){instruction=`
SELF-REPAIR PHASE: RUNTIME VERIFICATION
- Syntax passed.
- Run the most relevant executable test/runTest/testSuite available.
- Do not claim runtime correctness without relevant evidence.
`;}else if(repairState.testAttempted&&!repairState.testSucceeded&&!repairState.rollbackPerformed){instruction=`
SELF-REPAIR PHASE: RECOVERY
- The current repair failed runtime verification.
- Do not claim success.
- Roll back the current repair using the backup produced by the current mutation.
- After rollback, reverify the restored state.
`;}else if(repairState.rollbackPerformed&&!repairState.restoredSyntaxVerified){instruction=`
SELF-REPAIR PHASE: RESTORED-STATE VERIFICATION
- The failed modification was rolled back.
- Verify the restored state now.
- Do not claim the attempted repair succeeded.
`;}else{instruction=`
SELF-REPAIR PHASE: FINAL REPORT
- Verification is complete.
- Give an evidence-based final report.
- Clearly distinguish attempted change, verified change, rollback, and remaining issue.
`;}if(repairState.correctionAttempts>0){instruction+=`
CORRECTION HISTORY:
- This task has already required ${repairState.correctionAttempts} correction attempt(s).
- Do not blindly repeat the same failed approach.
- Change strategy only when new evidence justifies it.
`;}if(repairState.modifiedFiles.length){instruction+=`
CURRENT REPAIR FILES:
${repairState.modifiedFiles.map(item=>`-${item.filePath}${item.backups?.length?` | backup=${item.backups[item.backups.length-1]}`:""}`).join("\n")}
`;}return instruction.length>MAX_REPAIR_INSTRUCTION_LENGTH?instruction.slice(0,MAX_REPAIR_INSTRUCTION_LENGTH):instruction;}

async function rollbackOneRepairFile(filePath,backupPath){if(!cleanText(filePath)||!cleanText(backupPath))return{success:false,automatic:true,rollbackAvailable:false,filePath:cleanText(filePath),backupPath:cleanText(backupPath),error:"Missing filePath or backupPath for rollback."};if(typeof bixTools?.rollbackFile!=="function")return{success:false,automatic:true,rollbackAvailable:false,filePath,backupPath,error:"rollbackFile tool is not available."};return executeBixTool("rollbackFile",{filePath,backupPath,confirmed:true});}

async function performAutomaticRollback(repairState){if(!repairState?.enabled||!repairState.modificationSucceeded)return null;if(repairState.rollbackAttempted)return repairState.rollbackResult;repairState.rollbackAttempted=true;const candidates=Array.isArray(repairState.backups)?repairState.backups:[];if(!candidates.length){const result={success:false,automatic:true,rollbackAvailable:false,error:"Automatic rollback was required, but no current-repair backup was available."};repairState.rollbackResult=result;return result;}const results=[];let successCount=0;const uniquePairs=[];const seen=new Set();for(const item of candidates){const filePath=cleanText(item?.filePath);const backupPath=cleanText(item?.backupPath);if(!filePath||!backupPath)continue;const key=`${filePath}::${backupPath}`;if(seen.has(key))continue;seen.add(key);uniquePairs.push({filePath,backupPath,toolName:item?.toolName||""});}const limitedPairs=uniquePairs.slice(-MAX_ROLLBACKS_PER_REQUEST);for(let index=0;index<limitedPairs.length;index++){const item=limitedPairs[index];const result=await rollbackOneRepairFile(item.filePath,item.backupPath);results.push({filePath:item.filePath,backupPath:item.backupPath,result});if(result?.success===true)successCount+=1;}const result={success:successCount===limitedPairs.length&&limitedPairs.length>0,automatic:true,rollbackAvailable:limitedPairs.length>0,restoredFiles:results,restoredCount:successCount,attemptedCount:limitedPairs.length};repairState.rollbackResult=result;if(result.success){repairState.rollbackPerformed=true;repairState.phase="restored_verify";invalidateToolCache();}return result;}

function isVerificationFailure(toolName,result,repairState){if(!repairState?.enabled||!repairState.modificationSucceeded||repairState.rollbackPerformed||!VERIFICATION_TOOLS.has(toolName))return false;return result?.success===false;}
function makeSkippedVerificationResult(toolName,reason){return{success:false,skipped:true,automaticRollback:true,tool:toolName,reason:reason||"Verification skipped after automatic rollback."};}
function shouldFinalizeAfterTool(userMessage,executedCalls){if(!executedCalls.length)return false;const message=cleanText(userMessage);if(isRepairRequest(message)||isVerificationRequest(message)||!isInformationRequest(message))return false;return executedCalls.every(call=>call.readOnly===true&&call.success===true);}
function shouldFinalizeRepair(repairState){if(!repairState.enabled)return false;if(repairState.rollbackPerformed)return repairState.restoredSyntaxVerified||repairState.phase==="report";return repairState.modificationSucceeded&&repairState.syntaxVerified&&repairState.testAttempted&&repairState.testSucceeded;}

export function isBixConfigured(){return Boolean(GEMINI_URL&&typeof GEMINI_URL==="string"&&GEMINI_URL.trim());}
export async function isBixReady(timeout=4000){if(!isBixConfigured())return false;let origin;try{const parsed=new URL(GEMINI_URL);origin=`${parsed.protocol}//${parsed.host}`;}catch{return false;}const timeoutMs=Math.min(10000,Math.max(500,Number(timeout)||4000));const deadline=Date.now()+timeoutMs;for(const candidate of [`${origin}/`,`${origin}/v1/models`]){const remaining=deadline-Date.now();if(remaining<=0)break;try{const response=await axios.get(candidate,{timeout:remaining,validateStatus:()=>true});const data=response?.data||{};if(response.status>=200&&response.status<300&&(data.status==="ok"||Array.isArray(data.models)||Array.isArray(data.data)))return true;}catch{}}return false;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function getRetryDelay(error,retryNumber){const headers=error?.response?.headers||{};const retryAfter=headers["retry-after"]||headers["x-ratelimit-reset-tokens"]||headers["x-ratelimit-reset-requests"];const parsed=Number(retryAfter);if(Number.isFinite(parsed)&&parsed>0){if(parsed<1000)return Math.min(parsed*1000,60000);return Math.min(parsed,60000);}return Math.min(DEFAULT_RETRY_WAIT*Math.pow(2,Math.max(0,retryNumber-1)),60000);}
async function requestGemini(payload){let lastError=null;for(let attempt=1;attempt<=MAX_RATE_LIMIT_RETRIES+1;attempt++){try{const response=await axios.post(GEMINI_URL,payload,{headers:{"Content-Type":"application/json"},timeout:REQUEST_TIMEOUT});return response.data;}catch(error){lastError=error;const status=error?.response?.status;const message=String(error?.message||"").toLowerCase();const isRetryable=status===408||status===429||status===500||status===502||status===503||status===504||message.includes("timeout")||message.includes("rate limit")||message.includes("socket hang up")||message.includes("econnreset")||message.includes("network");if(!isRetryable||attempt>MAX_RATE_LIMIT_RETRIES)throw error;const wait=getRetryDelay(error,attempt);console.log(`[BIX] Gemini request retry ${attempt}/${MAX_RATE_LIMIT_RETRIES} waiting ${wait}ms`);await sleep(wait);}}throw(lastError||new Error("Unknown Gemini request failure."));}

function makeToolError(error){return{success:false,error:cleanText(error?.message||error)||"Unknown tool error."};}
async function executeBixTool(toolName,args){const tool=bixTools?.[toolName];if(typeof tool!=="function")return{success:false,error:`Unknown Bix tool: ${toolName}`};try{return await tool(args||{});}catch(error){return makeToolError(error);}}
function isToolSuccess(result){return result?.success!==false;}
function isToolMutation(toolName){return MODIFICATION_TOOLS.has(toolName)||toolName==="rollbackFile";}

export async function askBix({message,history=[],systemPrompt="",userId="",chatId=""}){const userMessage=trimMessage(message);if(!userMessage)return{ok:false,answer:"Please provide a message.",model:BIX_MODEL,toolsUsed:[],toolRounds:0,userId,chatId};if(!isBixConfigured())return{ok:false,answer:"Bix is not configured because the Gemini Web2API URL is missing.",model:BIX_MODEL,toolsUsed:[],toolRounds:0,userId,chatId};const allTools=getToolDefinitions();const repairState=createRepairState(userMessage);let messages=[{role:"system",content:buildSystemPrompt(systemPrompt)},...normalizeHistory(history),{role:"user",content:userMessage}];messages=compactToolMessages(messages);const toolsUsed=[];const toolsExecuted=[];const requestToolCalls=new Map();const successfulReadResults=new Map();let toolRounds=0;let totalToolCalls=0;let forceFinal=false;let lastAssistantContent="";while(toolRounds<MAX_TOOL_ROUNDS){toolRounds++;const selectedTools=selectToolDefinitions(allTools,userMessage,repairState);const repairInstruction=buildRepairInstruction(repairState);const requestMessages=repairInstruction?[...messages,{role:"system",content:repairInstruction}]:messages;const payload={model:BIX_MODEL,messages:requestMessages,temperature:0.2,max_completion_tokens:MAX_COMPLETION_TOKENS,stream:false};if(!forceFinal&&selectedTools.length){payload.tools=selectedTools;payload.tool_choice="auto";}if(forceFinal){delete payload.tools;delete payload.tool_choice;payload.messages=[...requestMessages,{role:"system",content:"FINAL RESPONSE MODE: Do not call tools. Return only the final evidence-based answer to the user."}];}let data;try{data=await requestGemini(payload);}catch(error){const status=error?.response?.status;const apiMessage=error?.response?.data?.error?.message||error?.message||"Gemini Web2API request failed.";return{ok:false,answer:`Bix request failed${status?` (${status})`:""}: ${apiMessage}`,model:BIX_MODEL,toolsUsed,toolRounds,userId,chatId};}const choice=data?.choices?.[0];const assistantMessage=choice?.message;if(!assistantMessage)return{ok:false,answer:"Bix received an empty Gemini response.",model:BIX_MODEL,toolsUsed,toolRounds,userId,chatId};const normalizedAssistant=normalizeAssistantToolCalls(assistantMessage);const toolCalls=normalizedAssistant.toolCalls;const assistantContent=normalizedAssistant.content;lastAssistantContent=assistantContent;if(!toolCalls.length){const answer=trimResponse(assistantContent);return{ok:true,answer:answer||"I don't have a response.",model:BIX_MODEL,toolsUsed,toolRounds,userId,chatId,repair:{enabled:repairState.enabled,phase:repairState.phase,modificationSucceeded:repairState.modificationSucceeded,syntaxVerified:repairState.syntaxVerified,testAttempted:repairState.testAttempted,testSucceeded:repairState.testSucceeded,rollbackPerformed:repairState.rollbackPerformed,restoredSyntaxVerified:repairState.restoredSyntaxVerified,restoredTestAttempted:repairState.restoredTestAttempted,restoredTestSucceeded:repairState.restoredTestSucceeded,rollbackAttempted:repairState.rollbackAttempted,verificationFailure:repairState.verificationFailure,rollbackResult:repairState.rollbackResult,modifiedFiles:repairState.modifiedFiles,backups:repairState.backups,toolAudit:repairState.toolAudit}};}messages.push({role:"assistant",content:assistantContent||null,tool_calls:toolCalls});const roundCalls=[];const limitedToolCalls=toolCalls.slice(0,MAX_TOOL_CALLS_PER_ROUND);for(let index=0;index<limitedToolCalls.length;index++){const toolCall=limitedToolCalls[index];totalToolCalls++;const toolCallId=cleanText(toolCall?.id)||`call_fallback_${Date.now()}_${index}`;const toolName=cleanText(toolCall?.function?.name);let args=parseToolArguments(toolCall?.function?.arguments);args=normalizeToolArguments(toolName,args,userMessage,repairState);if(!toolName){const errorResult={success:false,error:"Model returned a tool call without a tool name."};messages.push({role:"tool",tool_call_id:toolCallId,name:"unknown",content:serializeToolResult(errorResult)});roundCalls.push({name:"unknown",success:false,duplicate:false,readOnly:false});continue;}if(totalToolCalls>MAX_TOTAL_TOOL_CALLS){const limitResult={success:false,error:"Bix stopped tool execution because the request exceeded the maximum tool-call budget."};messages.push({role:"tool",tool_call_id:toolCallId,name:toolName,content:serializeToolResult(limitResult)});roundCalls.push({name:toolName,success:false,duplicate:false,readOnly:false});forceFinal=true;continue;}if(repairState.rollbackPerformed&&VERIFICATION_TOOLS.has(toolName)){const allowRestoredSyntax=toolName==="syntaxTest"&&!repairState.restoredSyntaxVerified;if(!allowRestoredSyntax){const skippedResult=makeSkippedVerificationResult(toolName,"Verification was already sufficient after automatic rollback.");toolsUsed.push(toolName);roundCalls.push({name:toolName,success:false,duplicate:false,skipped:true,readOnly:true});messages.push({role:"tool",tool_call_id:toolCallId,name:toolName,content:serializeToolResult(skippedResult)});continue;}}const cacheKey=makeToolCallKey(toolName,args);const duplicateInRequest=requestToolCalls.has(cacheKey);const cached=!duplicateInRequest?getCachedToolCall(toolName,args):null;let result;let duplicate=false;const readOnly=READ_CACHEABLE_TOOLS.has(toolName);if(duplicateInRequest){duplicate=true;const previous=requestToolCalls.get(cacheKey);result=previous?.result??{success:false,error:"Duplicate tool call detected in the same request."};}else if(cached){result=cached.result;requestToolCalls.set(cacheKey,{result});}else{result=await executeBixTool(toolName,args);requestToolCalls.set(cacheKey,{result});if(readOnly)setCachedToolCall(toolName,args,result);}if(isToolMutation(toolName))invalidateToolCache();updateRepairState(repairState,toolName,result,args);repairState.toolAudit.push({tool:toolName,success:result?.success!==false,timestamp:new Date().toISOString(),automatic:false});let finalToolResult=result;if(isVerificationFailure(toolName,result,repairState)){repairState.verificationFailure={tool:toolName,result};repairState.correctionAttempts++;const rollbackResult=await performAutomaticRollback(repairState);repairState.toolAudit.push({tool:"rollbackFile",success:rollbackResult?.success===true,timestamp:new Date().toISOString(),automatic:true});finalToolResult={...(result&&typeof result==="object"?result:{originalResult:result}),automaticRollback:{attempted:true,success:rollbackResult?.success===true,filePath:repairState.affectedFilePath,backupPath:repairState.backupPath,result:rollbackResult}};if(rollbackResult?.success===true){repairState.rollbackPerformed=true;repairState.phase="restored_verify";}}if(readOnly&&isToolSuccess(result))successfulReadResults.set(cacheKey,result);toolsUsed.push(toolName);roundCalls.push({name:toolName,success:isToolSuccess(finalToolResult),duplicate,readOnly,mutation:isToolMutation(toolName),rolledBack:Boolean(finalToolResult?.automaticRollback?.success),cached:Boolean(cached),skipped:Boolean(finalToolResult?.skipped)});messages.push({role:"tool",tool_call_id:toolCallId,name:toolName,content:serializeToolResult(finalToolResult)});}if(toolCalls.length>MAX_TOOL_CALLS_PER_ROUND)messages.push({role:"system",content:"Some requested tool calls were not executed because the round tool-call limit was reached. Continue only with the most important next action."});if(roundCalls.some(call=>call.duplicate))forceFinal=true;if(repairState.enabled){if(!repairState.modificationSucceeded)forceFinal=false;else if(repairState.modificationSucceeded&&!repairState.syntaxVerified&&!repairState.rollbackPerformed)forceFinal=false;else if(repairState.syntaxVerified&&!repairState.testAttempted&&!repairState.rollbackPerformed)forceFinal=false;else if(repairState.testAttempted&&!repairState.testSucceeded&&!repairState.rollbackPerformed)forceFinal=false;else if(repairState.rollbackPerformed&&!repairState.restoredSyntaxVerified)forceFinal=false;else if(shouldFinalizeRepair(repairState))forceFinal=true;}if(!repairState.enabled&&shouldFinalizeAfterTool(userMessage,roundCalls))forceFinal=true;messages=compactToolMessages(messages);if(toolRounds>=MAX_TOOL_ROUNDS)forceFinal=true;if(totalToolCalls>=MAX_TOTAL_TOOL_CALLS)forceFinal=true;if(forceFinal)continue;}const fallback=trimResponse(lastAssistantContent);return{ok:false,answer:fallback||"Bix reached the maximum tool rounds without producing a final response.",model:BIX_MODEL,toolsUsed,toolRounds,userId,chatId,repair:{enabled:repairState.enabled,phase:repairState.phase,modificationSucceeded:repairState.modificationSucceeded,syntaxVerified:repairState.syntaxVerified,testAttempted:repairState.testAttempted,testSucceeded:repairState.testSucceeded,rollbackPerformed:repairState.rollbackPerformed,restoredSyntaxVerified:repairState.restoredSyntaxVerified,restoredTestAttempted:repairState.restoredTestAttempted,restoredTestSucceeded:repairState.restoredTestSucceeded,rollbackAttempted:repairState.rollbackAttempted,verificationFailure:repairState.verificationFailure,rollbackResult:repairState.rollbackResult,modifiedFiles:repairState.modifiedFiles,backups:repairState.backups,toolAudit:repairState.toolAudit}};}

export async function testBixTools(){return askBix({message:"Use the listCommands tool and tell me how many registered bot commands there are. Only use information returned by the tool."});}
export async function testBixGrounding(){return askBix({message:"Run the project_check controlled command. Tell me ONLY what the tool actually reports. Do not infer or guess what project_check checks internally."});}
export async function testBixAI(){return askBix({message:"BIX TEST OK"});}
export async function testBixSelfRepairMode(){return askBix({message:"Diagnose the requested code issue, inspect the relevant code, make the smallest necessary fix, preserve a backup, run syntaxTest, run the relevant test if available, automatically rollback if verification fails, re-test the restored file, and report exactly what happened."});}
export function getBixToolNames(){return Object.keys(bixTools||{});}
export function getBixToolCount(){return Object.keys(bixTools||{}).length;}
export function hasBixTool(toolName){return typeof bixTools?.[toolName]==="function";}

export const bixConfig={
model:BIX_MODEL,provider:"gemini-web2api",endpoint:GEMINI_URL,
maxHistoryMessages:MAX_HISTORY_MESSAGES,maxMessageLength:MAX_MESSAGE_LENGTH,maxResponseLength:MAX_RESPONSE_LENGTH,
maxCompletionTokens:MAX_COMPLETION_TOKENS,maxToolRounds:MAX_TOOL_ROUNDS,maxToolCallsPerRound:MAX_TOOL_CALLS_PER_ROUND,
maxTotalToolCalls:MAX_TOTAL_TOOL_CALLS,maxToolResultLength:MAX_TOOL_RESULT_LENGTH,maxTotalToolContext:MAX_TOTAL_TOOL_CONTEXT,
maxSystemPromptLength:MAX_SYSTEM_PROMPT_LENGTH,maxRateLimitRetries:MAX_RATE_LIMIT_RETRIES,requestTimeout:REQUEST_TIMEOUT,
maxExposedTools:MAX_EXPOSED_TOOLS,toolCount:getBixToolCount(),toolNames:getBixToolNames(),
architecture:{
dynamicToolRegistry:true,smartToolSelection:true,embeddedToolCallRecovery:true,requestLocalDuplicateProtection:true,
readCache:true,mutationCacheInvalidation:true,multiFileRepairTracking:true,evidenceBasedFinalization:true,
automaticRollback:true,restoredStateVerification:true,complexTaskLoop:true,naturalLanguageControls:true,
virtualControlFallback:true,realToolTakeover:true},
controls:{
mode:"real_tools_only",
catalog:BIX_CONTROL_CATALOG,
aliases:BIX_CONTROL_ALIASES,
virtualToolNames:[]},
selfRepair:{
enabled:true,automaticBackup:true,automaticRollback:true,multiFileRollback:true,
rollbackOn:["syntaxTest_failure","runTest_failure","testSuite_failure","verifyRepair_failure"],
reverifyAfterRollback:true,
workflow:["understand","plan","search","inspect","backup","modify","syntaxTest","runTest","correct_or_rollback","reverify","report"]
}};

export function getBixControlCatalog(){return{mode:"real_tools_only",catalog:BIX_CONTROL_CATALOG,aliases:BIX_CONTROL_ALIASES,virtualToolNames:[]};}
export function getBixVirtualToolNames(){return[];}
export function getBixConfig(){return{...bixConfig,toolNames:[...getBixToolNames()],configured:isBixConfigured(),toolCount:getBixToolCount()};}
export function clearBixToolCache(){invalidateToolCache();return{success:true,cleared:true};}
export function getBixRuntimeInfo(){return{configured:isBixConfigured(),model:BIX_MODEL,endpoint:GEMINI_URL,toolCount:getBixToolCount(),cachedReadResults:toolCache.size,maxToolRounds:MAX_TOOL_ROUNDS,maxTotalToolCalls:MAX_TOTAL_TOOL_CALLS};}