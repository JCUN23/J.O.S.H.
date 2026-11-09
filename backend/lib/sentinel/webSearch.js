// Live web answers ("who won the Michigan game", "how late is Costco open"): one focused
// Groq call with its built-in browser_search tool, kept separate from the agent loop
// (whose custom tools it isn't documented to mix with). The answer is cleaned up for
// speech: no citation markers, links or markdown.
const { GROQ_MODEL } = require('../config');

const clean = (text) => String(text || '')
  .replace(/【[^】]*】/g, '')                       // citation markers like 【2†L6-L10】
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1') // markdown links -> their text
  .replace(/https?:\/\/\S+/g, '')
  .replace(/[*_#`>]+/g, '')
  .replace(/\s+([.,;:!?])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

async function webSearch(query, { post } = {}) {
  if (!query) return 'What should I look up?';
  post = post || require('../../routes/sentinel').groqPost;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  try {
    const res = await post({
      model: process.env.GROQ_SEARCH_MODEL || GROQ_MODEL,
      reasoning_effort: 'low',            // Groq: higher effort = longer browsing, more tokens
      max_tokens: 1024,
      tools: [{ type: 'browser_search' }],
      tool_choice: 'required',
      messages: [
        { role: 'system', content: `Today is ${today}. Search the web, then answer for a voice assistant in at most three short sentences with the specific facts asked for (names, numbers, times, dates). Say how recent the information is when it matters. Plain sentences only: no lists, links or markdown.` },
        { role: 'user', content: String(query).slice(0, 400) },
      ],
    }, { timeout: 30000 });
    return clean(res.data?.choices?.[0]?.message?.content) || "I couldn't find an answer online.";
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    return `Web search failed (${detail}). Don't guess; tell Josh you couldn't look it up.`;
  }
}

module.exports = { webSearch, clean };
