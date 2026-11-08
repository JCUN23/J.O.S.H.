// Sentinel tool executor
const axios = require('axios');
const sharp = require('sharp');
const { GOVEE_API_KEY, GOVEE_BASE_URL, HUE_BRIDGE_IP, HUE_USERNAME } = require('../config');
const { SMARTTHINGS_BASE_URL, getSmartThingsToken } = require('../smartthings');
const { parseColor, rgbToHueBridgeHSB } = require('../color');
const { findTeam, TEAMS } = require('../teams');
const gameDay = require('../gameDay');

// ---- executeTool: the switch statement that ACTUALLY does things ----
// The model says "call X with Y" — this function runs YOUR code and returns a string result.
// The model never enters this function. It only sees what you return.
async function executeTool(toolName, args, { spotifyToken } = {}) {

  // ===== GOVEE LIGHTS =====
  if (toolName === 'control_govee_lights') {
    try {
      const devicesRes = await axios.get(`${GOVEE_BASE_URL}/devices`, {
        headers: { 'Govee-API-Key': GOVEE_API_KEY }
      });
      const devices = devicesRes.data?.data?.devices || [];
      if (devices.length === 0) return 'No Govee devices found.';

      // Filter to specific device if requested
      let targets = args.device
        ? devices.filter(d => d.deviceName.toLowerCase().includes(args.device.toLowerCase()))
        : devices;
      if (targets.length === 0) return `No Govee device matching "${args.device}" found.`;

      // H6076 models are read-only (Govee API limitation) — only allow power toggle
      if (args.action !== 'on' && args.action !== 'off') {
        targets = targets.filter(d => !d.model?.toUpperCase().startsWith('H6076'));
        if (targets.length === 0) return 'All matching Govee devices are read-only and do not support color/brightness control.';
      }

      let cmd;
      if (args.action === 'on') cmd = { name: 'turn', value: 'on' };
      else if (args.action === 'off') cmd = { name: 'turn', value: 'off' };
      else if (args.action === 'brightness') cmd = { name: 'brightness', value: parseInt(args.value) || 50 };
      else if (args.action === 'color') {
        const rgb = parseColor(args.value);
        if (!rgb) return `Unknown color "${args.value}".`;
        cmd = { name: 'color', value: rgb };
      }

      await Promise.all(targets.map(d =>
        axios.put(`${GOVEE_BASE_URL}/devices/control`, {
          device: d.device, model: d.model, cmd
        }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } })
      ));

      const names = targets.map(d => d.deviceName).join(', ');
      return `Govee ${args.action} applied to: ${names}`;
    } catch (err) {
      return `Govee control failed: ${err.message}`;
    }
  }

  // ===== HUE LIGHTS =====
  if (toolName === 'control_hue_lights') {
    try {
      if (!HUE_BRIDGE_IP || !HUE_USERNAME) return 'Hue Bridge not configured.';

      // Map friendly names → bridge IDs
      const lightsRes = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
      const allLights = Object.entries(lightsRes.data).map(([id, l]) => ({ id, ...l }));

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
      const lat = 42.751784, lon = -83.0058174;
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
      return `Currently ${temp}°F and ${condition}. Feels like ${feelsLike}°F. High of ${high}°F, low of ${low}°F.`;
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
  if (toolName === 'play_music') {
    if (!spotifyToken) return 'Spotify is not connected. Josh needs to log in on the dashboard first.';

    const SPOTIFY_BASE = 'https://api.spotify.com/v1';
    const spotifyHeaders = { Authorization: `Bearer ${spotifyToken}` };

    try {
      // Step 1: Search — try artist first, fall back to track
      const searchRes = await axios.get(`${SPOTIFY_BASE}/search`, {
        headers: spotifyHeaders,
        params: { q: args.query, type: 'artist,track,playlist', limit: 3 }
      });

      const artists = searchRes.data.artists?.items || [];
      const tracks = searchRes.data.tracks?.items || [];
      const playlists = searchRes.data.playlists?.items || [];

      let playBody = {};     // What to send to /me/player/play
      let imageUrl = null;   // Album/artist art for color extraction
      let description = '';  // What we'll tell the model we did

      if (artists.length > 0 && artists[0].name.toLowerCase().includes(args.query.toLowerCase().split(' ')[0])) {
        // Artist match — play their full catalog on shuffle (the "mood" behavior)
        const artist = artists[0];
        playBody = { context_uri: artist.uri };
        imageUrl = artist.images?.[0]?.url;
        description = `Playing ${artist.name} on shuffle.`;
      } else if (tracks.length > 0) {
        // Track match — play that specific track
        const track = tracks[0];
        playBody = { uris: [track.uri] };
        imageUrl = track.album?.images?.[0]?.url;
        description = `Playing "${track.name}" by ${track.artists[0].name}.`;
      } else if (playlists.length > 0) {
        // Playlist match — good for mood/genre queries like "chill lo-fi"
        const playlist = playlists[0];
        playBody = { context_uri: playlist.uri };
        imageUrl = playlist.images?.[0]?.url;
        description = `Playing playlist "${playlist.name}".`;
      } else {
        return `Couldn't find anything on Spotify for "${args.query}".`;
      }

      // Step 2: Start playback
      try {
        await axios.put(`${SPOTIFY_BASE}/me/player/play`, playBody, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
      } catch (playErr) {
        // 404 = no active device. Try to find one and transfer playback.
        if (playErr.response?.status === 404 || playErr.response?.status === 403) {
          const devicesRes = await axios.get(`${SPOTIFY_BASE}/me/player/devices`, { headers: spotifyHeaders });
          const devices = devicesRes.data.devices || [];
          if (devices.length === 0) return `${description} But no Spotify device is available — open Spotify on a device first.`;
          // Transfer to the first available device
          await axios.put(`${SPOTIFY_BASE}/me/player`, {
            device_ids: [devices[0].id], play: true
          }, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
          // Retry play
          await axios.put(`${SPOTIFY_BASE}/me/player/play`, playBody, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
        } else {
          return `${description} But playback failed: ${playErr.message}`;
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
              const hueIds = Object.keys(lightsRes.data);
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
  if (toolName === 'control_spotify') return 'Use the play_music tool instead for music requests. For basic playback control (pause/skip), action noted: ' + args.action;
  // ===== TV CONTROL (SmartThings → Samsung Frame TV) =====
  if (toolName === 'control_tv' && require('../frameTv').configured().length) {
    // Local network control (lib/frameTv.js): every configured Frame TV.
    const frame = require('../frameTv');
    const keyFor = { mute: 'KEY_MUTE', home: 'KEY_HOME', hdmi: 'KEY_HDMI' };
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
        } else if (keyFor[args.action]) { await frame.sendKey(tv, keyFor[args.action]); out.push(`${tv.name}: ${args.action}`); }
        else out.push(`${tv.name}: "${args.action}" isn't supported`);
      } catch (err) { out.push(`${tv.name}: ${err.message}`); }
    }
    return out.join('. ');
  }

  if (toolName === 'control_tv') {
    try {
      const token = await getSmartThingsToken();
      if (!token) return 'SmartThings not connected. Josh needs to add a token.';

      // Find Frame TV device
      const devicesRes = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const frameTV = devicesRes.data.items?.find(d =>
        d.label?.toLowerCase().includes('frame') &&
        d.components?.[0]?.capabilities?.some(c => c.id === 'samsungvd.mediaInputSource')
      );
      if (!frameTV) return 'No Samsung Frame TV found on SmartThings.';

      const deviceId = frameTV.deviceId;
      const sendCmd = (capability, command, cmdArgs = []) =>
        axios.post(`${SMARTTHINGS_BASE_URL}/devices/${deviceId}/commands`,
          { commands: [{ capability, command, arguments: cmdArgs }] },
          { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

      if (args.action === 'on') {
        await sendCmd('switch', 'on');
        return 'TV powered on.';
      } else if (args.action === 'off') {
        await sendCmd('switch', 'off');
        return 'TV powered off.';
      } else if (args.action === 'art_mode_on') {
        await sendCmd('samsungvd.ambient', 'on');
        return 'Art mode enabled.';
      } else if (args.action === 'art_mode_off') {
        await sendCmd('samsungvd.ambient', 'off');
        return 'Art mode disabled.';
      } else if (args.action === 'mute') {
        await sendCmd('audioMute', 'mute');
        return 'TV muted.';
      } else if (args.action === 'volume') {
        const level = parseInt(args.value) || 20;
        await sendCmd('audioVolume', 'setVolume', [level]);
        return `TV volume set to ${level}.`;
      } else if (args.action === 'hdmi') {
        const input = `HDMI${args.value || '1'}`;
        await sendCmd('samsungvd.mediaInputSource', 'setInputSource', [input]);
        return `TV switched to ${input}.`;
      } else if (args.action === 'home') {
        await sendCmd('samsungvd.remoteControl', 'send', ['HOME']);
        return 'TV navigated to home screen.';
      }

      return `Unknown TV action: ${args.action}`;
    } catch (err) {
      return `TV control failed: ${err.message}`;
    }
  }
  if (toolName === 'get_news') return 'News headlines not currently available.';
  if (toolName === 'get_calendar') return 'Calendar access not available in this context.';

  return `Unknown tool: ${toolName}`;
}

module.exports = { executeTool };
