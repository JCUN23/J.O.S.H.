// Sentinel tool executor
const axios = require('axios');
const sharp = require('sharp');
const { GOVEE_API_KEY, GOVEE_BASE_URL, HUE_BRIDGE_IP, HUE_USERNAME } = require('../config');
const { parseColor, rgbToHueBridgeHSB } = require('../color');
const { findTeam, TEAMS } = require('../teams');
const gameDay = require('../gameDay');

// ---- executeTool: the switch statement that ACTUALLY does things ----
// The model says "call X with Y" — this function runs YOUR code and returns a string result.
// The model never enters this function. It only sees what you return.
async function executeTool(toolName, args, { spotifyToken } = {}) {

  // ===== ALL LIGHTS ("the lights") / GOVEE =====
  // Both go through lib/devices: Govee commands one at a time with retries, power-only
  // models skipped for color, failures named. (Nov 9: the old Govee code fired every
  // command at once, ignored Govee's in-band errors, and said "applied" regardless.)
  if (toolName === 'control_all_lights' || toolName === 'control_govee_lights') {
    const devices = require('../devices');
    const opts = {};
    if (args.action === 'on') opts.on = true;
    else if (args.action === 'off') opts.on = false;
    else if (args.action === 'brightness') opts.brightness = Math.max(1, Math.min(100, parseInt(args.value) || 50));
    else if (args.action === 'color') {
      opts.color = parseColor(args.value);
      if (!opts.color) return `Unknown color "${args.value}".`;
    } else return `Unknown light action "${args.action}".`;
    const only = args.device && !/^all$/i.test(args.device) ? args.device : undefined;
    const steps = [devices.goveeApply({ ...opts, only })];
    if (toolName === 'control_all_lights') steps.push(devices.hueApply(opts));
    const results = (await Promise.allSettled(steps)).map((r) =>
      r.status === 'fulfilled' ? r.value : `error: ${r.reason?.response?.data?.message || r.reason?.message}`);
    const failed = results.some((r) => /fail|error|no lights matched|: 0\//i.test(r));
    return `${results.join('. ')}.${failed ? ' Tell Josh exactly which lights failed; do not say it worked.' : ''}`;
  }

  // ===== HUE LIGHTS =====
  if (toolName === 'control_hue_lights') {
    try {
      if (!HUE_BRIDGE_IP || !HUE_USERNAME) return 'Hue Bridge not configured.';

      // Map friendly names → bridge IDs
      const lightsRes = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
      const allLights = Object.entries(require('../hueLights').filterLights(lightsRes.data)).map(([id, l]) => ({ id, ...l }));

      // Filter to target
      let targets;
      if (!args.device || args.device.toLowerCase() === 'all') {
        targets = allLights;
      } else {
        targets = allLights.filter(l => l.name.toLowerCase().includes(args.device.toLowerCase()));
      }
      if (targets.length === 0) return `No Hue light matching "${args.device}" found.`;

      let state;
      if (args.action === 'on') state = { on: true };
      else if (args.action === 'off') state = { on: false };
      else if (args.action === 'brightness') state = { on: true, bri: Math.min(254, Math.max(1, parseInt(args.value) || 127)) };
      else if (args.action === 'color') {
        const rgb = parseColor(args.value);
        if (!rgb) return `Unknown color "${args.value}".`;
        state = { on: true, ...rgbToHueBridgeHSB(rgb) };
      }

      await Promise.all(targets.map(l =>
        axios.put(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${l.id}/state`, state)
      ));

      const names = targets.map(l => l.name).join(', ');
      return `Hue ${args.action} applied to: ${names}`;
    } catch (err) {
      return `Hue control failed: ${err.message}`;
    }
  }

  // ===== TIME =====
  if (toolName === 'get_time') {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
      ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ===== WEATHER =====
  if (toolName === 'get_weather') {
    try {
      // Home location comes from .env (HOME_LAT/HOME_LON, also used for sunset rules): never in the public repo
      const lat = Number(process.env.HOME_LAT), lon = Number(process.env.HOME_LON);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Weather needs HOME_LAT and HOME_LON in backend/.env.';
      const weatherRes = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/Detroit`
      );
      const data = weatherRes.data;
      const temp = Math.round(data.current.temperature_2m);
      const feelsLike = Math.round(data.current.apparent_temperature);
      const high = Math.round(data.daily.temperature_2m_max[0]);
      const low = Math.round(data.daily.temperature_2m_min[0]);
      const code = data.current.weather_code;
      let condition = 'clear';
      if (code === 0) condition = 'clear';
      else if (code <= 3) condition = 'partly cloudy';
      else if (code <= 48) condition = 'foggy';
      else if (code <= 67) condition = 'rainy';
      else if (code <= 77) condition = 'snowy';
      else if (code <= 82) condition = 'rainy';
      else condition = 'stormy';
      return `Currently ${temp} degrees and ${condition}. Feels like ${feelsLike}. High of ${high}, low of ${low}.`;
    } catch { return 'Unable to get weather data.'; }
  }

  // ===== SPORTS =====
  if (toolName === 'get_sports') {
    // Followed teams + date-filtered league scoreboards with real times (lib/sports.js)
    return require('../sports').answer(args.query);
  }

  // ===== PLAY MUSIC (Spotify + lights) =====
  // This is the most complex tool — it chains multiple APIs:
  //   1. Search Spotify for the query
  //   2. Start playback (artist catalog on shuffle, or specific track)
  //   3. Optionally extract dominant color from album/artist art
  //   4. Set Govee + Hue lights to that color
  if (toolName === 'save_playlist_shortcut') {
    if (!spotifyToken) return 'Spotify is not connected. Josh needs to log in on the dashboard first.';
    if (!args.name) return 'What should I call it?';
    return require('../spotifyPlay').saveCurrentAs(args.name, { Authorization: `Bearer ${spotifyToken}` });
  }

  if (toolName === 'play_music') {
    if (!spotifyToken) return 'Spotify is not connected. Josh needs to log in on the dashboard first.';

    const SPOTIFY_BASE = 'https://api.spotify.com/v1';
    const spotifyHeaders = { Authorization: `Bearer ${spotifyToken}` };

    try {
      // Step 1: What to play: saved shortcuts, Josh's playlists, then search (lib/spotifyPlay.js)
      const spotify = require('../spotifyPlay');
      const pick = await spotify.resolve(args.query, { headers: spotifyHeaders, kind: args.kind });
      if (pick.error) return pick.error;
      const { playBody } = pick;
      const imageUrl = pick.imageUrl;
      let description = pick.description;

      // Step 2: Where: a named device ("on The Frame" opens Spotify on the TV if needed),
      // else the active device, else the first available one.
      let deviceId = null;
      if (args.device) {
        const d = await spotify.pickDevice(args.device, spotifyHeaders);
        if (d.error) return d.error;
        deviceId = d.device.id;
        description += ` On ${d.device.name}.`;
      }
      const jsonHeaders = { ...spotifyHeaders, 'Content-Type': 'application/json' };
      const play = () => axios.put(`${SPOTIFY_BASE}/me/player/play`, playBody, { headers: jsonHeaders, params: deviceId ? { device_id: deviceId } : undefined });
      try {
        await play();
      } catch (playErr) {
        // 404 = no active device (or the chosen one isn't active yet): transfer, then play.
        if (playErr.response?.status === 404 || playErr.response?.status === 403) {
          if (!deviceId) {
            const devicesRes = await axios.get(`${SPOTIFY_BASE}/me/player/devices`, { headers: spotifyHeaders });
            const devices = devicesRes.data.devices || [];
            if (devices.length === 0) return `${description} But no Spotify device is available — open Spotify on a device first.`;
            deviceId = devices[0].id;
          }
          await axios.put(`${SPOTIFY_BASE}/me/player`, { device_ids: [deviceId], play: false }, { headers: jsonHeaders });
          await play();
        } else {
          return `${description} But playback failed: ${playErr.response?.data?.error?.message || playErr.message}`;
        }
      }

      // Enable shuffle for artist context (mood behavior)
      if (playBody.context_uri?.startsWith('spotify:artist:')) {
        try {
          await axios.put(`${SPOTIFY_BASE}/me/player/shuffle?state=true`, null, { headers: spotifyHeaders });
        } catch { /* shuffle is nice-to-have, not critical */ }
      }

      // Step 3: Extract dominant color from album/artist art
      if (args.set_lights !== false && imageUrl) {
        try {
          // Download the image and resize to 1x1 pixel to get average color.
          // sharp handles this efficiently — no heavy image processing.
          const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
          const { data: [r, g, b] } = await sharp(Buffer.from(imgResponse.data))
            .resize(1, 1)
            .raw()
            .toBuffer({ resolveWithObject: true });

          // Step 4: Set lights to the extracted color
          const lightResults = [];

          // Govee
          try {
            const devicesRes = await axios.get(`${GOVEE_BASE_URL}/devices`, { headers: { 'Govee-API-Key': GOVEE_API_KEY } });
            const devices = (devicesRes.data?.data?.devices || [])
              .filter(d => !d.model?.toUpperCase().startsWith('H6076')); // skip read-only
            if (devices.length > 0) {
              await Promise.all(devices.map(d =>
                axios.put(`${GOVEE_BASE_URL}/devices/control`, {
                  device: d.device, model: d.model,
                  cmd: { name: 'color', value: { r, g, b } }
                }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } })
              ));
              lightResults.push('Govee');
            }
          } catch { /* non-critical */ }

          // Hue
          try {
            if (HUE_BRIDGE_IP && HUE_USERNAME) {
              const hsb = rgbToHueBridgeHSB({ r, g, b });
              const lightsRes = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
              const hueIds = Object.keys(require('../hueLights').filterLights(lightsRes.data));
              await Promise.all(hueIds.map(id =>
                axios.put(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${id}/state`, { on: true, ...hsb })
              ));
              lightResults.push('Hue');
            }
          } catch { /* non-critical */ }

          if (lightResults.length > 0) {
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            description += ` Lights set to ${hexColor} (${lightResults.join(' + ')}).`;
          }
        } catch {
          description += ' Could not extract art color for lights.';
        }
      }

      return description;
    } catch (err) {
      return `Spotify search failed: ${err.message}`;
    }
  }

  // ===== GAME DAY MODE =====
  if (toolName === 'printer_status') {
    const p = require('../bambu').snapshot();
    if (!p.configured) return 'The printer is not set up yet (BAMBU_HOST, BAMBU_SERIAL, BAMBU_ACCESS_CODE).';
    if (!p.connected) return `Can't reach the printer${p.error ? `: ${p.error}` : ''}.`;
    if (!p.active) return `Printer is ${String(p.state || 'idle').toLowerCase()}. Nozzle ${p.nozzle ?? '?'}°C, bed ${p.bed ?? '?'}°C.`;
    const left = p.remainingMin != null ? `${Math.floor(p.remainingMin / 60)}h ${p.remainingMin % 60}m left` : 'time left unknown';
    const done = p.finishAt ? `, done around ${new Date(p.finishAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
    return `Printing ${p.job || 'a job'}: ${p.percent ?? '?'}% (layer ${p.layer ?? '?'} of ${p.totalLayers ?? '?'}), ${left}${done}.`;
  }

  if (toolName === 'activate_scene') {
    const scenes = require('../scenes');
    const scene = scenes.find(args.scene);
    if (!scene) return `No scene called "${args.scene}". Available: ${scenes.list().map((s) => s.name).join(', ')}.`;
    const r = await scenes.activate(scene, { source: 'voice' });
    return `${scene.name} activated. ${r.results.join('. ')}`;
  }

  if (toolName === 'game_day_mode') {
    // Shared with the API route and the automatic watcher (lib/gameDay)
    const team = findTeam(args.team);
    if (!team) return `Unknown team "${args.team}". Supported: ${TEAMS.map((t) => t.name).join(', ')}.`;
    const entry = await gameDay.activate(team, { reason: 'voice' });
    return `Game Day Mode activated for ${team.name} (${team.colors.name})! ${entry.results.join('. ')}.`;
  }

  // ===== STUBS (not yet wired server-side) =====
  // ===== SPOTIFY PLAYBACK (pause / resume / skip / volume, optionally on a device) =====
  if (toolName === 'control_spotify') {
    if (!spotifyToken) return 'Spotify is not connected. Josh needs to log in on the dashboard first.';
    if (args.action === 'search_and_play') return executeTool('play_music', { query: args.value, device: args.device }, { spotifyToken });
    const spotify = require('../spotifyPlay');
    const H = { Authorization: `Bearer ${spotifyToken}` };
    let device = null;
    if (args.device) {
      const d = await spotify.pickDevice(args.device, H);
      if (d.error) return d.error;
      device = d.device;
    }
    const where = device ? ` on ${device.name}` : '';
    const params = device ? { device_id: device.id } : {};
    try {
      if (args.action === 'play' && device) {
        // Resuming on another device = move playback there; it keeps the song and position.
        await axios.put(`${spotify.BASE}/me/player`, { device_ids: [device.id], play: true }, { headers: H });
        return `Resumed${where}.`;
      }
      const calls = {
        play: () => axios.put(`${spotify.BASE}/me/player/play`, {}, { headers: H, params }),
        pause: () => axios.put(`${spotify.BASE}/me/player/pause`, null, { headers: H, params }),
        next: () => axios.post(`${spotify.BASE}/me/player/next`, null, { headers: H, params }),
        previous: () => axios.post(`${spotify.BASE}/me/player/previous`, null, { headers: H, params }),
        volume: () => axios.put(`${spotify.BASE}/me/player/volume`, null,
          { headers: H, params: { ...params, volume_percent: Math.max(0, Math.min(100, parseInt(args.value) || 50)) } }),
      };
      if (!calls[args.action]) return `Unknown playback action "${args.action}".`;
      await calls[args.action]();
      const said = { play: 'Resumed', pause: 'Paused', next: 'Skipped', previous: 'Went back', volume: `Volume ${parseInt(args.value) || 50}%` };
      return `${said[args.action]}${where}.`;
    } catch (err) {
      const st = err.response?.status;
      if (st === 404) return 'No active Spotify device. Say where, e.g. "on The Frame".';
      if (st === 403) return `Spotify refused that (${err.response?.data?.error?.message || 'not allowed right now'}).`;
      return `Spotify playback failed: ${err.response?.data?.error?.message || err.message}`;
    }
  }
  // ===== TV CONTROL (Frame TVs on the local network) =====
  if (toolName === 'control_tv' && !require('../frameTv').configured().length) return 'No TV is set up (FRAME_TVS).';
  if (toolName === 'control_tv') {
    // Local network control (lib/frameTv.js): every configured Frame TV.
    const frame = require('../frameTv');
    const keyFor = { mute: 'KEY_MUTE', home: 'KEY_HOME', hdmi: 'KEY_HDMI', play: 'KEY_PLAY', pause: 'KEY_PAUSE' };
    const out = [];
    for (const tv of frame.configured()) {
      try {
        if (args.action === 'on') out.push(`${tv.name}: ${await frame.powerOn(tv)}`);
        else if (args.action === 'off') out.push(`${tv.name}: ${await frame.powerOff(tv)}`);
        else if (args.action === 'art_mode_on' || args.action === 'art_mode_off') {
          await frame.powerOn(tv);
          out.push(`${tv.name}: ${await frame.ensureArtMode(tv, args.action === 'art_mode_on')}`);
        } else if (args.action === 'volume') {
          const steps = Math.min(Math.abs(parseInt(args.value, 10) || 3), 15);
          const up = !String(args.value || '').startsWith('-');
          for (let i = 0; i < steps; i++) await frame.sendKey(tv, up ? 'KEY_VOLUP' : 'KEY_VOLDOWN');
          out.push(`${tv.name}: volume ${up ? 'up' : 'down'} ${steps}`);
        } else if (args.action === 'open_app') {
          if (!args.value) { out.push(`${tv.name}: which app?`); continue; }
          await frame.powerOn(tv);
          await frame.ensureArtMode(tv, false).catch(() => {});
          out.push(`${tv.name}: opened ${await frame.launchApp(tv, args.value)}`);
        } else if (keyFor[args.action]) { await frame.sendKey(tv, keyFor[args.action]); out.push(`${tv.name}: ${args.action}`); }
        else out.push(`${tv.name}: "${args.action}" isn't supported`);
      } catch (err) { out.push(`${tv.name}: ${err.message}`); }
    }
    return out.join('. ');
  }

  if (toolName === 'get_news') {
    try {
      const { getNews } = require('../../routes/news');
      const cat = { technology: 'tech', tech: 'tech', world: 'world', sports: 'sports', business: 'business' }[args.category] || 'all';
      const { articles } = await getNews(cat, 5);
      if (!articles.length) return "The news sources aren't responding right now.";
      return articles.map((a) => `${a.title} (${a.source})`).join('; ');
    } catch (err) { return `Couldn't load the news (${err.message}).`; }
  }
  if (toolName === 'get_calendar') return require('../calendar').answer(args.when);

  return `Unknown tool: ${toolName}`;
}

module.exports = { executeTool };
