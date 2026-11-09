// Send the model only the tools a request can need. All 26 tool definitions are ~2.9K
// tokens per agent step, and Groq's free tier allows 8K tokens/minute per model, so
// "lights off and play jazz" shouldn't also carry the calendar, printer and memory tools.
// Groups are picked by keywords in the new message AND the last request (so follow-ups
// like "make them blue" keep the light tools). Nothing matched = every tool, so nothing
// is ever unreachable.
const GROUPS = [
  { re: /\b(lights?|lamps?|neon|hue|govee|bright|brightness|dim|dark|colou?rs?|scenes?|mood|vibe|red|blue|green|purple|pink|orange|yellow|white|warm|cool|movie (?:night|mode))\b/,
    tools: ['control_all_lights', 'control_govee_lights', 'control_hue_lights', 'activate_scene'] },
  { re: /\b(music|songs?|play(?:ing)?|spotify|playlists?|album|artist|tracks?|pause|resume|skip|next|previous|volume|listen|queue|like this|more like)\b/,
    tools: ['play_music', 'control_spotify', 'save_playlist_shortcut'] },
  { re: /\b(tv|television|frame|youtube|netflix|hulu|peacock|espn|hbo|max|fubo|disney|prime video|art mode|hdmi|apps?|watch)\b/,
    tools: ['control_tv', 'play_music'] },
  { re: /\b(games?|scores?|lions|pistons|michigan|wolverines|bar[cç]a|barcelona|nfl|nba|football|basketball|soccer|match|playing tonight|won|win|kickoff|game day)\b/,
    tools: ['get_sports', 'game_day_mode'] },
  { re: /\b(weather|rain|snow|temperature|temp|cold|hot|warm outside|umbrella|jacket|coat|forecast|sunny|storm)\b/, tools: ['get_weather'] },
  { re: /\b(calendar|schedule|meetings?|events?|appointments?|free|busy|plans?|add .+ (?:on|at|for)|put .+ on|book|undo|move|reschedule|cancel|delete|yes|yeah|do it|confirm)\b/,
    tools: ['get_calendar', 'create_calendar_event', 'undo_calendar_event', 'update_calendar_event', 'delete_calendar_event'] },
  { re: /\b(timers?|remind(?:er|ers)?|alarm|countdown|minutes?|hours?)\b/, tools: ['set_timer', 'set_reminder', 'list_timers', 'cancel_timer'] },
  { re: /\b(remember|forget|memory|recall|about me)\b/, tools: ['remember_fact', 'forget_fact', 'list_memories'] },
  { re: /\b(news|headlines?)\b/, tools: ['get_news'] },
  { re: /\b(print(?:s|er|ing)?|bambu|filament|nozzle)\b/, tools: ['printer_status', 'printer_control'] },
  { re: /\b(show|hide|open|display|widget|panel|screen|theme|dark mode|light mode|lock|standby|idle|go to sleep)\b/, tools: ['control_panel'] },
  { re: /\b(send|text|push|phone|notify me|note)\b/, tools: ['send_to_phone'] },
  { re: /\b(rules?|automations?|sunset|happened|while i was|activity|home|away|who's|anyone)\b/, tools: ['list_rules', 'set_rule', 'activity_summary', 'presence_status'] },
  { re: /\b(brief|briefing|my day|catch me up|rundown)\b/, tools: ['get_briefing'] },
  { re: /\b(time|date|what day)\b/, tools: ['get_time'] },
];
const ALWAYS = ['web_search'];

// -> the tool definitions to send (all of them when nothing matched)
function pickTools(allTools, message, history = []) {
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const text = `${message} \n ${lastUser}`.toLowerCase();
  const names = new Set();
  for (const g of GROUPS) if (g.re.test(text)) g.tools.forEach((t) => names.add(t));
  if (!names.size) return allTools;
  ALWAYS.forEach((t) => names.add(t));
  return allTools.filter((t) => names.has(t.function.name));
}

module.exports = { pickTools, GROUPS };
