// Sentinel AI agent loop (Groq)
const express = require('express');
const axios = require('axios');
const { GROQ_API_KEY, GROQ_MODEL, GROQ_REASONING_EFFORT, GROQ_MAX_TOKENS } = require('../lib/config');

// Shared request settings for every Groq call in the loop
const groqParams = () => ({
  model: GROQ_MODEL,
  max_tokens: GROQ_MAX_TOKENS,
  ...(GROQ_REASONING_EFFORT ? { reasoning_effort: GROQ_REASONING_EFFORT } : {}),
});

// Groq's free tier allows 8K tokens/minute PER MODEL, and every loop step resends the
// prompt + tool list (~2.4K tokens). Two commands close together can hit it (Nov 9:
// "my AI service isn't responding"). On a 429: wait and retry if Groq says it's short,
// else use the smaller model, which has its own budget.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Each Groq model has its own rate-limit budget: on a 429, walk this list (comma-separated)
const FALLBACK_MODELS = () => String(process.env.GROQ_FALLBACK_MODEL ?? 'openai/gpt-oss-20b').split(',').map((m) => m.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function groqPost(body, { timeout = 15000 } = {}) {
  const post = (b) => axios.post(GROQ_URL, b, {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    timeout,
  });
  try {
    return await post(body);
  } catch (err) {
    if (err.response?.status !== 429) throw err;
    const wait = Number(err.response.headers?.['retry-after']);
    if (wait > 0 && wait <= 6) {
      console.log(`[Sentinel] Groq rate limit on ${body.model}; retrying in ${wait}s`);
      await sleep(wait * 1000);
      try { return await post(body); } catch (again) { if (again.response?.status !== 429) throw again; }
    }
    let last = err;
    for (const fallback of FALLBACK_MODELS().filter((m) => m !== body.model)) {
      console.log(`[Sentinel] Groq rate limit on ${body.model}; using ${fallback}`);
      try { return await post({ ...body, model: fallback }); }
      catch (e) { if (e.response?.status !== 429) throw e; last = e; }
    }
    throw last;
  }
}

// Reasoning models attach extra fields (e.g. `reasoning`) to replies. Send back only
// what the chat API accepts as conversation history.
const historyMessage = (m) => ({
  role: m.role,
  content: m.content ?? '',
  ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
});
const { SENTINEL_TOOLS } = require('../lib/sentinel/tools');
const { SENTINEL_SYSTEM_PROMPT } = require('../lib/sentinel/prompt');
const { executeTool } = require('../lib/sentinel/executeTool');

const { getSpotifyAccessToken } = require('./spotify');

const router = express.Router();

// ---- THE AGENT LOOP ----
// Shared by the chat route and the Pi mic (routes/voice.js), so a command spoken to the
// Pi with no panel open runs the same tools. Returns { response, toolsExecuted }.
async function runSentinel(message, { spotifyToken } = {}) {
  const memory = require('../lib/sentinel/memory');
  // Everyday phrasings ("lights off", "pause", "next song") skip the AI entirely
  const quick = await require('../lib/sentinel/quick').quickCommand(message, { spotifyToken });
  if (quick) { memory.remember(message, quick.response); return quick; }
  const result = await runAgent(message, { spotifyToken, history: memory.recent() });
  memory.remember(message, result.response);
  return result;
}

async function runAgent(message, { spotifyToken, history = [] } = {}) {

  // Prompt caching: Groq doesn't count CACHED input tokens against the rate limit, and the
  // cache only matches an identical prefix. So the system prompt and the tool list stay
  // byte-for-byte the same on every request (~4-5K tokens, cached after the first), and
  // everything that changes (the time, saved facts) rides in the user turn at the end.
  // Before Nov 9 the clock in the system prompt and a per-request tool subset meant
  // nothing was ever cached and two commands in a minute hit the 8K TPM limit.
  const context = `[Right now it is ${new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.${require('../lib/sentinel/longMemory').promptBlock()}]`;
  const messages = [
    { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
    ...history,                                   // the last few exchanges: follow-ups work
    { role: 'user', content: `${context}\n\n${message}` }
  ];
  // Every tool, same order, every time (cacheable). ALFRED_TOOL_ROUTING=on restores the
  // per-request subset (lib/sentinel/toolRouter.js) for a provider without caching.
  const requestTools = process.env.ALFRED_TOOL_ROUTING === 'on'
    ? require('../lib/sentinel/toolRouter').pickTools(SENTINEL_TOOLS, message, history)
    : SENTINEL_TOOLS;

  const MAX_ITERATIONS = 5; // Safety valve — prevent infinite loops
  let iterations = 0;
  const toolsExecuted = []; // Track what Sentinel actually did (for frontend awareness)

  // ---- THE LOOP ----
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Step 1: Call Groq
    // Wrapped in try/catch because Llama sometimes generates malformed tool calls
    // (e.g. for conversational messages like "tell me a joke"). When that happens,
    // Groq returns tool_use_failed. We retry without tools so it just responds naturally.
    let choice;
    try {
      const response = await groqPost({ ...groqParams(), messages, tools: requestTools, tool_choice: 'auto' });
      choice = response.data.choices[0];
      const u = response.data.usage;
      if (u) console.log(`[Sentinel] tokens: ${u.prompt_tokens} in, ${u.prompt_tokens_details?.cached_tokens ?? 0} cached (free vs the rate limit), ${u.completion_tokens} out`);
    } catch (groqErr) {
      // Llama tried to force a tool call and failed — retry without tools
      if (groqErr.response?.data?.error?.code === 'tool_use_failed') {
        console.log('[Sentinel] tool_use_failed — retrying without tools');
        const fallback = await groqPost({ ...groqParams(), messages });
        choice = fallback.data.choices[0];
      } else {
        throw groqErr; // Re-throw unexpected errors
      }
    }

    const assistantMessage = choice.message;
    console.log(`[Sentinel loop ${iterations}]`, JSON.stringify(assistantMessage, null, 2));

    // Step 2: Append the assistant's message to the conversation
    // IMPORTANT: You must include the full assistant message (with tool_calls) so the
    // model sees its own previous request when it gets the tool results back.
    messages.push(historyMessage(assistantMessage));

    // Step 3: Check finish_reason
    if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
      // Model is done — return final text
      return ({
        response: assistantMessage.content || 'Done.',
        toolsExecuted
      });
    }

    // Step 4: finish_reason is "tool_calls" — execute each tool and send results back
    // CORRECT FORMAT: Each tool result is a separate message with role:"tool" and the
    // matching tool_call_id. This is how the model knows which result goes with which call.
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let args;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      console.log(`  → Executing: ${toolName}`, args);

      // IMPORTANT: Wrap executeTool in try/catch. If a tool throws, we still need
      // to send a result back to the model — otherwise the conversation breaks.
      // Return the error as a string so the model can report it naturally.
      let result;
      try {
        result = await executeTool(toolName, args, { spotifyToken });
      } catch (toolErr) {
        console.error(`  ✗ Tool ${toolName} threw:`, toolErr.message);
        result = `Error: ${toolErr.message}`;
      }

      toolsExecuted.push({ tool: toolName, args, result });

      // Append tool result in the CORRECT format:
      messages.push({
        role: 'tool',                    // not "user" — this is a tool result
        tool_call_id: toolCall.id,       // ties this result to the specific tool_call
        content: result                  // string result from your executeTool function
      });
    }

    // Loop continues — Groq will see the tool results and either:
    // a) Make another tool call (e.g. "check weather" then "set lights based on weather")
    // b) Return a final text response to the user
  }

  // Safety: if we hit MAX_ITERATIONS, return whatever we have
  return ({
    response: 'I seem to have gotten carried away. Could you rephrase that?',
    toolsExecuted
  });
}

// Chat endpoint (the panel). The loop:
// This is the core pattern. Three steps:
//   1. Send messages + tools to Groq
//   2. If finish_reason is "tool_calls" → execute tools, append results, go to step 1
//   3. If finish_reason is "stop" → return the text response
// The messages array is your ENTIRE conversation history. Every iteration appends to it.
// That's how the model maintains context across multiple tool calls.
router.post('/api/sentinel/chat', async (req, res) => {
  try {
    const { message } = req.body;
    // Prefer the server-held Spotify login (always fresh); the browser's copy is a fallback.
    const spotifyToken = (await getSpotifyAccessToken().catch(() => null)) || req.body.spotifyToken;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }
    // What actually reached Sentinel (journalctl -u sentinel): the first thing to check
    // when an answer doesn't match what you said.
    console.log(`[Sentinel] heard: "${String(message).slice(0, 200)}"`);

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured', needsKey: true });
    }

    return res.json(await runSentinel(message, { spotifyToken }));
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error('Sentinel error:', error.response?.data || error.message);
    // 502: the upstream AI failed (bad key, retired model, outage), not our server.
    // Pass Groq's reason along so failures are diagnosable from the panel/console.
    res.status(502).json({ error: 'AI processing failed', detail, model: GROQ_MODEL });
  }
});

module.exports = router;
module.exports.runSentinel = runSentinel;
module.exports.groqPost = groqPost;
