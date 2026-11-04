// Sentinel AI agent loop (Groq)
const express = require('express');
const axios = require('axios');
const { GROQ_API_KEY } = require('../lib/config');
const { SENTINEL_TOOLS } = require('../lib/sentinel/tools');
const { SENTINEL_SYSTEM_PROMPT } = require('../lib/sentinel/prompt');
const { executeTool } = require('../lib/sentinel/executeTool');

const { getSpotifyAccessToken } = require('./spotify');

const router = express.Router();

// ---- THE AGENT LOOP ----
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

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured', needsKey: true });
    }

    // Build initial messages array — this grows every iteration
    const messages = [
      { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
      { role: 'user', content: message }
    ];

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
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages,
            tools: SENTINEL_TOOLS,
            tool_choice: 'auto',
            max_tokens: 300,
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000 // 15s — don't let Groq hang forever
          }
        );
        choice = response.data.choices[0];
      } catch (groqErr) {
        // Llama tried to force a tool call and failed — retry without tools
        if (groqErr.response?.data?.error?.code === 'tool_use_failed') {
          console.log('[Sentinel] tool_use_failed — retrying without tools');
          const fallback = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: 'llama-3.3-70b-versatile', messages, max_tokens: 300, temperature: 0.7 },
            { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
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
      messages.push(assistantMessage);

      // Step 3: Check finish_reason
      if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
        // Model is done — return final text
        return res.json({
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
    return res.json({
      response: 'I seem to have gotten carried away. Could you rephrase that?',
      toolsExecuted
    });

  } catch (error) {
    console.error('Sentinel error:', error.response?.data || error.message);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

module.exports = router;
