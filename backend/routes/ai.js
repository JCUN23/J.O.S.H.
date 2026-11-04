// Anthropic chat endpoints (/api/chat, legacy /api/sentinel)
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

router.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
    });

    res.json(message);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sentinel AI endpoint with tool use
router.post('/api/sentinel', async (req, res) => {
  try {
    const { message, systemPrompt, tools, toolResults, previousAssistantMessage } = req.body;

    // Build messages array
    const messages = [];

    // If we have tool results, we need to include the previous exchange
    if (toolResults && previousAssistantMessage) {
      messages.push({ role: 'user', content: message });
      messages.push({ role: 'assistant', content: previousAssistantMessage });
      messages.push({ role: 'user', content: toolResults });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const requestParams = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
    };

    // Add tools if provided and not processing tool results
    if (tools && !toolResults) {
      requestParams.tools = tools;
    }

    const response = await anthropic.messages.create(requestParams);

    // Extract text and tool calls from response
    const textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const toolCalls = response.content.filter(c => c.type === 'tool_use').map(c => ({
      id: c.id,
      name: c.name,
      input: c.input
    }));

    res.json({
      text: textContent,
      toolCalls: toolCalls,
      stopReason: response.stop_reason,
      fullContent: response.content
    });
  } catch (error) {
    console.error('Sentinel error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
