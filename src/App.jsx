import { BACKEND_URL } from './config';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import VoiceAssistant from './components/VoiceAssistant';
import WeatherWidget from './components/WeatherWidget';
import SportsWidget from './components/SportsWidget';
import CalendarWidget from './components/CalendarWidget';
import QuickControls from './components/QuickControls';
import SystemStatus from './components/SystemStatus';
import ScenesWidget from './components/ScenesWidget';
import ActivityWidget from './components/ActivityWidget';
import FrameTvWidget from './components/FrameTvWidget';
import IdleMode from './components/IdleMode';
import { getIdleEnabled, setIdleEnabled, IDLE_MINUTES, WAKE_EVENT } from './utils/idlePrefs';
import { Music } from 'lucide-react';
import SpotifyMiniPlayer from "./components/Spotify/SpotifyMiniPlayer";
import FaceLock from './components/AuthAndProfiles/FaceLock';
import NewsWidget from './components/NewsWidget';
import { exchangeCodeForToken } from "./components/Spotify/spotifyAuth";
import { startSpotifyAuth, startSpotifyTokenSync } from "./components/Spotify/spotifyAuth";
import { migrateLegacyTokens } from "./utils/authApi";
import { isWakeEcho } from "./utils/wakeWord";
import { getCachedFaces, syncFaces, FACES_CHANGED } from "./utils/faceStore";
import { ProfileProvider } from './components/AuthAndProfiles/ProfileContext';
import { useProfile } from './components/AuthAndProfiles/ProfileContext';
import OnboardingScreen from './components/AuthAndProfiles/OnboardingScreen';
import BluetoothWidget from './components/BluetoothWidget';
import GoveeWidget from './components/GoveeWidget';
import DraggableGrid from './components/DraggableGrid';
import BambuPrinterWidget from './components/BambuPrinterWidget';
import SmartThingsWidget from './components/SmartThingsWidget';
import PhilipsHueWidget from './components/PhillipsHueWidget';
import TeslaWidget from './components/TeslaWidget';
import { processCommand } from './utils/sentinelLocal';
import { getGoogleCalendarEvents } from './utils/calendarApi';

const CLIENT_ID = "0982022f80f240138fd76bad2c53f3bd";

// Main App Component
const BatcomputerHub = () => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [processing, setProcessing] = useState(false);
  const [time, setTime] = useState(new Date());
  const [showSpotifyModal, setShowSpotifyModal] = React.useState(false);
  const token = localStorage.getItem("spotify_access_token");
  const [quoteText, setQuoteText] = useState('');
  const [quoteAuthor, setQuoteAuthor] = useState('');
  const [isNewsOnline, setNewsIsOnline] = useState(false);
  const [goveeIsConnected, setGoveeIsConnected] = useState(false);
  const [smartThingsIsConnected, setSmartThingsIsConnected] = useState(false);
  const [hueIsConnected, setHueIsConnected] = useState(false);

  // Wake word detection state
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    const saved = localStorage.getItem('wake_word_enabled');
    if (saved !== null) return saved !== 'false';
    // Default off on Android: Chrome's speech recognition grabs audio focus each time
    // it (re)starts, so always-on listening makes Spotify on the same device pause and
    // resume constantly. Still one tap to turn on; the choice is remembered per device.
    return !/Android/i.test(navigator.userAgent);
  });
  const [awaitingCommand, setAwaitingCommand] = useState(false);
  const [idleEnabled, setIdleEnabledState] = useState(getIdleEnabled);   // per device
  const [layoutEditing, setLayoutEditing] = useState(false);
  const toggleIdle = () => { const next = !idleEnabled; setIdleEnabled(next); setIdleEnabledState(next); };
  const [wakeWordActive, setWakeWordActive] = useState(false); // Is always-on listening active?
  const [voiceError, setVoiceError] = useState('');          // why the mic isn't hearing you, in words
  const voiceBlockedRef = useRef(false);                     // fatal mic error: stop auto-restarting until a tap

  const { profileData } = useProfile();

  const [theme, setTheme] = useState(profileData?.theme || "cyan");
  // Light/dark is per device (the wall panel and laptop can differ), so localStorage, not profile.
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('hud_mode') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const toggleMode = () => setMode((m) => {
    const next = m === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('hud_mode', next); } catch { /* storage unavailable; still toggles */ }
    return next;
  });

  // Face Lock State
  // Start locked when faces are registered (cached copy of the server's list). With no
  // faces there is no way to unlock, so start unlocked (same guard as the Lock button).
  const [isLocked, setIsLocked] = useState(() => getCachedFaces().length > 0);
  // Whether we already locked at startup from the local cache (see face sync below).
  const startedLockedRef = useRef(getCachedFaces().length > 0);
  // eslint-disable-next-line no-unused-vars
  const [hasRegisteredFaces, setHasRegisteredFaces] = useState(false);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding_completed');
  });

  // Widget visibility state
  const [widgetVisibility, setWidgetVisibility] = useState(() => {
    const defaults = {
      weather: true,
      sports: true,
      calendar: true,
      quickControls: true,
      spotify: true,
      news: true,
      smartThings: true,
      govee: true,
      bluetooth: true,
      printer: true,
      hue: true,
      tesla: true,
      scenes: true,
      activity: true,
      frametv: true,
    };
    // Merge so widgets added after a device saved its settings still show up
    // (saved settings used to replace the defaults wholesale -> new widgets hidden).
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('widget_visibility') || '{}') }; }
    catch { return defaults; }
  });

  // Save widget visibility to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('widget_visibility', JSON.stringify(widgetVisibility));
  }, [widgetVisibility]);

  const toggleWidgetVisibility = (widgetKey) => {
    setWidgetVisibility(prev => ({
      ...prev,
      [widgetKey]: !prev[widgetKey]
    }));
  };

  const handleSpotifyLogin = () => {
    startSpotifyAuth();
  };


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) return;

    // Google's callback is handled by CalendarWidget; don't fall through into Spotify below.
    if (state === 'google_calendar') return;

    // SmartThings OAuth: the server exchanges the code and keeps the login.
    if (state === 'smartthings_auth') {
      window.history.replaceState({}, "", "/");
      // OAuth codes are single-use; StrictMode runs effects twice in dev.
      if (sessionStorage.getItem("smartthings_code_exchanged") === code) return;
      sessionStorage.setItem("smartthings_code_exchanged", code);

      fetch(`${BACKEND_URL}/auth/smartthings/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          window.dispatchEvent(new Event('sentinel:smartthings-connected'));
        })
        .catch(err => console.error("SmartThings auth failed:", err));
      return;
    }

    // Handle Tesla OAuth
    if (state === 'tesla_auth') {
      if (sessionStorage.getItem("tesla_code_exchanged")) {
        window.history.replaceState({}, "", "/");
        return;
      }

      sessionStorage.setItem("tesla_code_exchanged", "true");

      fetch(`${BACKEND_URL}/auth/tesla/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
        .then(res => res.json())
        .then(data => {
          console.log("[Tesla] Token acquired and saved");
          localStorage.setItem('tesla_access_token', data.access_token);
          window.history.replaceState({}, "", "/");
          sessionStorage.removeItem("tesla_code_exchanged");
        })
        .catch(err => {
          console.error("Tesla auth failed:", err);
          sessionStorage.removeItem("tesla_code_exchanged");
        });
      return;
    }

    // Handle Spotify OAuth
    if (sessionStorage.getItem("spotify_code_exchanged")) {
      window.history.replaceState({}, "", "/");
      return;
    }

    sessionStorage.setItem("spotify_code_exchanged", "true");

    exchangeCodeForToken(code)
      .then(() => {
        console.log("[Spotify] Token acquired and saved");
        // Token is already saved inside exchangeCodeForToken
        window.history.replaceState({}, "", "/");
        // Clear the flag after successful exchange
        sessionStorage.removeItem("spotify_code_exchanged");
      })
      .catch(err => {
        console.error("Spotify auth failed:", err);
        // Clear the flag so user can retry
        sessionStorage.removeItem("spotify_code_exchanged");
      });
  }, []);

  // Server-held logins: move any old localStorage logins over once, then keep the
  // Spotify player's cached token fresh from the server.
  useEffect(() => {
    migrateLegacyTokens();
    return startSpotifyTokenSync();
  }, []);

  // Registered faces: pull the shared list from the server. A device with no local
  // copy yet (e.g. a freshly set-up tablet) locks as soon as faces arrive.
  useEffect(() => {
    const checkFaces = () => setHasRegisteredFaces(getCachedFaces().length > 0);
    checkFaces();
    syncFaces().then((faces) => {
      if (faces.length && !startedLockedRef.current) setIsLocked(true);
      startedLockedRef.current = true; // startup lock decided; later changes don't re-lock
    });

    // Re-check on changes from this tab (custom event) and other tabs (storage)
    window.addEventListener(FACES_CHANGED, checkFaces);
    window.addEventListener('storage', checkFaces);
    return () => {
      window.removeEventListener(FACES_CHANGED, checkFaces);
      window.removeEventListener('storage', checkFaces);
    };
  }, []);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const isListeningRef = useRef(false); // Track if we should process results
  const audioRef = useRef(null);
  const awaitingCommandRef = useRef(false); // Track wake word state
  // Android's recognizer often re-sends a final result for the wake word (or a misheard
  // fragment of it) right after detection. Remember when/what woke us so that echo isn't
  // processed as the command before the user has said anything.
  const wakeAtRef = useRef(0);
  const wakeTranscriptRef = useRef('');
  const commandTimeoutRef = useRef(null); // Timeout for command after wake word
  const wakeWordEnabledRef = useRef(wakeWordEnabled); // Ref to track wake word setting
  const processingRef = useRef(false); // Track if currently processing a command

  // ElevenLabs TTS with browser fallback - returns promise that resolves when done speaking
  const speak = useCallback(async (text) => {
    console.log('[Sentinel] Speaking:', text);

    // Function to use browser TTS
    const speakWithBrowserTTS = () => {
      return new Promise((resolve) => {
        if ('speechSynthesis' in window) {
          console.log('[Sentinel] Using browser TTS');
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.0;
          utterance.pitch = 0.9;
          utterance.volume = 1.0;

          utterance.onend = () => {
            console.log('[Sentinel] Browser TTS finished');
            resolve();
          };
          utterance.onerror = () => {
            console.log('[Sentinel] Browser TTS error');
            resolve();
          };

          window.speechSynthesis.speak(utterance);
        } else {
          console.log('[Sentinel] No TTS available');
          resolve();
        }
      });
    };

    // Always try ElevenLabs first — autoplay is allowed after user interaction
    // (clicking mic, speaking wake word, or typing all count as interaction)
    try {
      const response = await fetch(`${BACKEND_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        // Stop any currently playing audio
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Try to play
        try {
          await audio.play();
          console.log('[Sentinel] ElevenLabs audio playing');

          // Wait for it to finish (with 30s safety timeout)
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.log('[Sentinel] ElevenLabs audio timed out');
              resolve();
            }, 30000);
            audio.onended = () => {
              clearTimeout(timeout);
              console.log('[Sentinel] ElevenLabs audio finished');
              URL.revokeObjectURL(audioUrl);
              resolve();
            };
            audio.onerror = () => {
              clearTimeout(timeout);
              console.log('[Sentinel] ElevenLabs audio error during playback');
              resolve();
            };
          });
          return; // Success - exit
        } catch (playError) {
          console.log('[Sentinel] Play blocked:', playError.name);
          URL.revokeObjectURL(audioUrl);
          // Fall through to browser TTS
        }
      } else {
        console.log('[Sentinel] TTS response not ok:', response.status);
      }
    } catch (err) {
      console.log('[Sentinel] ElevenLabs fetch failed:', err.message);
    }

    // Use browser TTS as fallback
    await speakWithBrowserTTS();
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
    localStorage.setItem('wake_word_enabled', wakeWordEnabled);
  }, [wakeWordEnabled]);

  useEffect(() => {
    awaitingCommandRef.current = awaitingCommand;
  }, [awaitingCommand]);

  // Voice activity wakes the idle screen
  useEffect(() => {
    if (awaitingCommand || listening) window.dispatchEvent(new Event(WAKE_EVENT));
  }, [awaitingCommand, listening]);

  const processVoiceCommand = useCallback(async (command) => {
    if (!command.trim()) return;

    // Prevent double-processing
    if (processingRef.current) {
      console.log('[Sentinel] Already processing, ignoring:', command);
      return;
    }

    console.log('[Sentinel] Processing command:', command);

    setProcessing(true);
    processingRef.current = true;
    clearTimeout(silenceTimerRef.current);
    clearTimeout(commandTimeoutRef.current);

    // Stop recognition while processing to avoid feedback loop
    const wasRunning = recognitionRef.current && wakeWordEnabledRef.current;
    if (wasRunning) {
      console.log('[Sentinel] Stopping recognition to avoid feedback');
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }

    let responseText = '';
    let musicPlaying = false;
    try {
      // Process command locally (free, no API needed)
      const result = await processCommand(command, getGoogleCalendarEvents);
      responseText = result?.response || result || '';
      musicPlaying = result?.musicPlaying || false;
      console.log('[Sentinel] Response:', responseText, musicPlaying ? '(music playing)' : '');
    } catch (err) {
      console.error('Command error:', err);
      responseText = "I'm having trouble processing that request.";
    }

    // Update UI with response
    setResponse(responseText);
    setTranscript('');

    // Speak the response — wrapped in try/catch so processing ALWAYS clears
    try {
      await speak(responseText);
    } catch (speakErr) {
      console.error('[Sentinel] Speak failed:', speakErr);
    }

    // Restart recognition if it was running
    // BUT: if music just started playing, delay restart so the mic doesn't pick up lyrics
    if (wasRunning && wakeWordEnabledRef.current) {
      if (musicPlaying) {
        console.log('[Sentinel] Music playing — delaying recognition restart by 10s');
        setTimeout(() => {
          if (wakeWordEnabledRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              console.log('[Sentinel] Recognition restarted after music delay');
            } catch (e) {
              console.log('[Sentinel] Could not restart recognition:', e.message);
            }
          }
        }, 10000);
      } else {
        console.log('[Sentinel] Restarting recognition after speaking');
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.log('[Sentinel] Could not restart recognition:', e.message);
        }
      }
    }

    // Done processing — this MUST run no matter what
    setProcessing(false);
    processingRef.current = false;

    // In wake word mode, stay active for follow-up commands
    if (wakeWordEnabledRef.current) {
      console.log('[Sentinel] Ready for follow-up command (listening for 8 seconds of silence)...');
      setAwaitingCommand(true);
      awaitingCommandRef.current = true;

      // Clear any existing timeout first
      clearTimeout(commandTimeoutRef.current);

      // Set timeout - if no speech detected in 8 seconds, go back to passive
      // (This timeout will be cleared/reset when speech is detected in onresult)
      commandTimeoutRef.current = setTimeout(() => {
        if (awaitingCommandRef.current && !processingRef.current) {
          console.log('[Sentinel] No follow-up after 8 seconds of silence, returning to passive listening');
          setAwaitingCommand(false);
          awaitingCommandRef.current = false;
          setTranscript('');
          setResponse('');
        }
      }, 8000);
    } else {
      setAwaitingCommand(false);
      awaitingCommandRef.current = false;
    }
  }, [speak]);

  // Extract command after wake word
  const extractCommand = useCallback((text) => {
    const lower = text.toLowerCase();
    // Look for "sentinel" and extract everything after it
    const wakeWordPatterns = [
      /\bsentinel[,.]?\s+(.+)/i,
      /\bhey sentinel[,.]?\s+(.+)/i,
      /\bok sentinel[,.]?\s+(.+)/i,
    ];

    for (const pattern of wakeWordPatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Check if it just contains the wake word (command will come next)
    if (/\b(hey |ok )?sentinel\b/i.test(lower)) {
      return null; // Wake word detected but no command yet
    }

    return false; // No wake word found
  }, []);

  // Track if audio has been unlocked by user interaction
  const audioUnlockedRef = useRef(false);

  // Unlock audio on first user interaction
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;

    try {
      // Create and play a silent audio context to unlock audio
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      audioUnlockedRef.current = true;
      console.log('[Sentinel] Audio unlocked');
    } catch {
      // Ignore
    }
  }, []);

  // Unlock audio on any click
  useEffect(() => {
    const handleClick = () => unlockAudio();
    document.addEventListener('click', handleClick, { once: true });
    return () => document.removeEventListener('click', handleClick);
  }, [unlockAudio]);

  // Play a subtle acknowledgment sound when wake word is detected
  const playWakeSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880; // A5 note
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {
      // Audio context not available
    }
  }, []);

  // Create a new speech recognition instance
  const createRecognition = useCallback((forWakeWord = false) => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const instance = new SpeechRecognition();

    // For wake word mode: continuous listening
    // For manual mode: single utterance
    instance.continuous = forWakeWord;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    // Set language explicitly for better recognition
    instance.lang = 'en-US';

    instance.onresult = (event) => {
      setVoiceError('');
      // Build full transcript from all results
      let fullTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript;
      }

      const isFinal = event.results[event.results.length - 1].isFinal;

      console.log('[Sentinel] Heard:', fullTranscript, isFinal ? '(final)' : '(interim)',
        '| awaiting:', awaitingCommandRef.current, '| processing:', processingRef.current);

      // Skip if currently processing
      if (processingRef.current) {
        console.log('[Sentinel] Currently processing, buffering speech...');
        return;
      }

      if (forWakeWord && wakeWordEnabledRef.current) {
        // Wake word mode
        const command = extractCommand(fullTranscript);

        if (command === false) {
          // No wake word - but if we're awaiting a command, this IS the command
          if (awaitingCommandRef.current) {
            setTranscript(fullTranscript);

            // Clear any existing timeout
            clearTimeout(commandTimeoutRef.current);

            // Only set new timeout on interim results, not final
            // This prevents the timeout from racing with the final processing
            if (!isFinal) {
              console.log('[Sentinel] Resetting timeout (heard interim speech)');
              commandTimeoutRef.current = setTimeout(() => {
                if (awaitingCommandRef.current && !processingRef.current) {
                  console.log('[Sentinel] Command timeout (no more speech), returning to passive listening');
                  setAwaitingCommand(false);
                  awaitingCommandRef.current = false;
                  setTranscript('');
                  setResponse('');
                }
              }, 6000);
            }

            if (isFinal && isWakeEcho(fullTranscript, wakeTranscriptRef.current, wakeAtRef.current)) {
              console.log('[Sentinel] Ignoring wake-word echo:', fullTranscript);
              return;
            }

            if (isFinal && fullTranscript.trim()) {
              console.log('[Sentinel] Processing awaited command:', fullTranscript);
              // Clear timeout since we're processing now
              clearTimeout(commandTimeoutRef.current);
              processVoiceCommand(fullTranscript);
            }
          } else {
            // Not awaiting - ignore non-wake-word speech
            console.log('[Sentinel] Ignoring (no wake word, not awaiting)');
          }
          return;
        }

        if (command === null) {
          // Wake word detected but no command yet
          if (!awaitingCommandRef.current) {
            console.log('[Sentinel] Wake word detected, awaiting command...');
            wakeAtRef.current = Date.now();
            wakeTranscriptRef.current = fullTranscript;
            playWakeSound();
            setAwaitingCommand(true);
            awaitingCommandRef.current = true;
            setTranscript('');

            // Set timeout - if no command in 8 seconds, go back to passive
            clearTimeout(commandTimeoutRef.current);
            commandTimeoutRef.current = setTimeout(() => {
              if (awaitingCommandRef.current) {
                console.log('[Sentinel] Command timeout, returning to passive listening');
                setAwaitingCommand(false);
                awaitingCommandRef.current = false;
                setTranscript('');
              }
            }, 8000);
          }
          return;
        }

        // We have a command (after wake word in same utterance)
        setTranscript(command);

        if (isFinal && command.trim()) {
          console.log('[Sentinel] Processing command:', command);
          processVoiceCommand(command);
        }
      } else if (!forWakeWord) {
        // Manual mode (button press)
        if (!isListeningRef.current) return;

        setTranscript(fullTranscript);

        if (isFinal && isListeningRef.current && fullTranscript.trim()) {
          processVoiceCommand(fullTranscript);
        }
      }
    };

    instance.onerror = (event) => {
      if (event.error === 'aborted') return;

      if (event.error === 'no-speech') {
        // Wake-word mode: silence is normal, it just restarts. A tapped mic hearing
        // nothing usually means Chrome is listening to the wrong (or a muted) mic.
        if (!forWakeWord) setVoiceError("Didn't hear anything. Check which mic Chrome is using (mic icon in the address bar) and that your computer's input isn't muted.");
        return;
      }

      if (event.error === 'network') {
        setVoiceError("Can't reach Chrome's speech service (it runs on Google's servers). Check the internet connection.");
        return;
      }

      const why = {
        'audio-capture': 'No microphone found. Plug one in or pick one: mic icon in the address bar, or your computer\'s sound input settings.',
        'not-allowed': 'Microphone is blocked for Sentinel. Click the icon left of the address bar and allow Microphone, then tap the mic again.',
        'service-not-allowed': 'Speech recognition is blocked in this browser. Allow the microphone for this site, then tap the mic again.',
      }[event.error] || `Voice stopped (${event.error}). Tap the mic to try again.`;
      setVoiceError(why);
      voiceBlockedRef.current = true;                        // don't spin restarting into the same error
      console.error('Speech recognition error:', event.error);
      isListeningRef.current = false;
      setListening(false);
      setWakeWordActive(false);
    };

    instance.onend = () => {
      // Auto-restart in wake word mode, but not if we're currently processing
      // (processVoiceCommand manually stops/starts recognition to avoid feedback)
      if (forWakeWord && wakeWordEnabledRef.current && !processingRef.current && !voiceBlockedRef.current) {
        // Immediate restart to minimize gaps
        console.log('[Sentinel] Recognition ended, restarting immediately...');
        // Use requestAnimationFrame for faster restart
        requestAnimationFrame(() => {
          if (wakeWordEnabledRef.current && recognitionRef.current && !processingRef.current) {
            try {
              recognitionRef.current.start();
              console.log('[Sentinel] Restarted successfully');
            } catch (e) {
              // If start fails, try again after a brief delay
              console.log('[Sentinel] Restart failed, retrying...', e.message);
              setTimeout(() => {
                if (wakeWordEnabledRef.current && recognitionRef.current && !processingRef.current) {
                  try {
                    recognitionRef.current.start();
                  } catch {
                    console.log('[Sentinel] Could not restart; tap the mic to revive it');
                    setWakeWordActive(false);                // so the mic button knows to restart it
                  }
                }
              }, 500);
            }
          }
        });
      } else {
        isListeningRef.current = false;
        setListening(false);
        setWakeWordActive(false);
      }
    };

    instance.onaudiostart = () => {
      console.log('[Sentinel] Audio capture started');
    };

    instance.onspeechstart = () => {
      console.log('[Sentinel] Speech detected');
    };

    return instance;
  }, [extractCommand, playWakeSound, processVoiceCommand]);

  // Start wake word listening
  const startWakeWordListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { /* ignore */ }
    }

    recognitionRef.current = createRecognition(true);
    if (!recognitionRef.current) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    try {
      voiceBlockedRef.current = false;
      recognitionRef.current.start();
      setWakeWordActive(true);
      console.log('[Sentinel] Wake word listening started');
    } catch (e) {
      console.error('[Sentinel] Failed to start wake word listening:', e);
    }
  }, [createRecognition]);

  // Stop wake word listening
  const stopWakeWordListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch { /* ignore */ }
    }
    setWakeWordActive(false);
    setAwaitingCommand(false);
    awaitingCommandRef.current = false;
    console.log('[Sentinel] Wake word listening stopped');
  }, []);

  // Initialize wake word listening on mount if enabled
  useEffect(() => {
    if (wakeWordEnabled && !isLocked && !showOnboarding) {
      // Small delay to let everything initialize
      const timer = setTimeout(() => {
        startWakeWordListening();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { /* ignore */ }
      }
    };
  }, [wakeWordEnabled, isLocked, showOnboarding, startWakeWordListening]);

  // Toggle wake word mode
  const toggleWakeWordMode = useCallback(() => {
    if (wakeWordEnabled) {
      setWakeWordEnabled(false);
      stopWakeWordListening();
    } else {
      setWakeWordEnabled(true);
      startWakeWordListening();
    }
  }, [wakeWordEnabled, startWakeWordListening, stopWakeWordListening]);

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Get Quote
  useEffect(() => {
    // Backend guarantees { quote, author } (with its own retries + fallbacks),
    // so this is a single request. No retry loop in the browser.
    const getQuote = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/stoic`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { quote, author } = await res.json();
        if (quote && author) {
          setQuoteText(quote);
          setQuoteAuthor(author);
        }
      } catch (err) {
        console.error("Quote fetch error:", err);
      }
    };

    getQuote();
  }, []);

  const toggleListening = () => {
    // If wake word mode is active, the button acts as a manual override
    if (wakeWordEnabled) {
      if (awaitingCommand) {
        // Cancel waiting for command
        setAwaitingCommand(false);
        awaitingCommandRef.current = false;
        setTranscript('');
      } else {
        // The background listener may have died (mic error, laptop slept, tab in the
        // background). Restart it, or the button shows "listening" with nobody listening.
        if (!wakeWordActive) { setVoiceError(''); startWakeWordListening(); }
        // In wake word mode, button can be used to manually trigger command mode
        playWakeSound();
        setAwaitingCommand(true);
        awaitingCommandRef.current = true;
        setTranscript('');
        clearTimeout(commandTimeoutRef.current);
        commandTimeoutRef.current = setTimeout(() => {
          if (awaitingCommandRef.current) {
            setAwaitingCommand(false);
            awaitingCommandRef.current = false;
            setTranscript('');
          }
        }, 5000);
      }
      return;
    }

    // Manual mode (wake word disabled)
    if (listening) {
      // Stop listening
      isListeningRef.current = false;
      clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch { /* ignore */ }
      }
      setListening(false);
      setTranscript('');
      // Create fresh instance for next time
      recognitionRef.current = createRecognition(false);
    } else {
      // Start listening
      if (!recognitionRef.current) {
        recognitionRef.current = createRecognition(false);
      }
      if (!recognitionRef.current) {
        alert('Speech recognition not supported in this browser');
        return;
      }
      isListeningRef.current = true;
      voiceBlockedRef.current = false;
      setTranscript('');
      setResponse('');
      setVoiceError('');
      try {
        recognitionRef.current.start();
      } catch {
        // A stale instance throws if it's still running: start a fresh one
        recognitionRef.current = createRecognition(false);
        recognitionRef.current.start();
      }
      setListening(true);
    }
  };

  const quoteTab = <div className={`col-span-12 border border-${theme}-800 rounded-lg p-3 text-${theme}-400`}>
    <p>{quoteText}<a> - {quoteAuthor}</a></p>
  </div>

  const spotifyTab = <div
    className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px]`}>
    <div className="flex items-center gap-2 mb-2" onClick={() => setShowSpotifyModal(true)} style={{ cursor: 'pointer' }}>
      <Music size={20} className={`text-${theme}-400`} />
      <div className={`text-lg font-semibold text-${theme}-400`}>SPOTIFY</div>
    </div>
    <SpotifyMiniPlayer
      compact
      theme={theme}
      onLogin={handleSpotifyLogin}
      onOpen={() => setShowSpotifyModal(true)}
    />
  </div>

  // Spotify modal rendered separately (outside grid)
  const spotifyModal = showSpotifyModal && (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={() => setShowSpotifyModal(false)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <SpotifyMiniPlayer
          onClose={() => setShowSpotifyModal(false)}
          compact={false}
          theme={theme}
          onOpen={() => setShowSpotifyModal(true)}
          onLogin={handleSpotifyLogin}
        />
      </div>
    </div>
  )

  // derive verificationRequested from isLocked to avoid setting state synchronously in an effect
  const verificationRequested = isLocked;

  // Before the main return statement
  if (showOnboarding) {
    return <OnboardingScreen onComplete={() => setShowOnboarding(false)} />;
  }


  return (
    <>
      <IdleMode key={isLocked ? 'paused' : 'active'} enabled={idleEnabled} paused={isLocked} minutes={IDLE_MINUTES} theme={theme} />
      <FaceLock
        isLocked={isLocked}
        verificationRequested={verificationRequested}
        onUnlock={() => setIsLocked(false)}
        theme={theme}
      />
      <div data-hud={theme} data-mode={mode} className={`hud-root min-h-screen font-mono p-4 border border border-${theme}-800 ${isLocked ? 'blur-xl pointer-events-none' : ''}`}
        >
        <div className="max-w-[95%] mx-auto">
          <Header
            time={time}
            setTheme={setTheme}
            theme={theme}
            mode={mode}
            toggleMode={toggleMode}
            setIsLocked={setIsLocked}
            widgetVisibility={widgetVisibility}
            toggleWidgetVisibility={toggleWidgetVisibility}
            idleEnabled={idleEnabled}
            toggleIdle={toggleIdle}
            onEditLayout={() => setLayoutEditing(true)}
          />

          {/* Fixed Top Section - Always visible */}
          <div className="hud-stack mb-4 space-y-4 lg:mb-3 lg:space-y-3">
            <SystemStatus theme={theme} isSpotifyConnected={token} isNewsConnected={isNewsOnline} isGoveeConnected={goveeIsConnected} isSmartThingsConnected={smartThingsIsConnected} isHueConnected={hueIsConnected} />
            {quoteTab}
            <VoiceAssistant
              listening={listening}
              transcript={transcript}
              response={response}
              processing={processing}
              toggleListening={toggleListening}
              onTestAI={() => processVoiceCommand("status check")}
              theme={theme}
              wakeWordEnabled={wakeWordEnabled}
              wakeWordActive={wakeWordActive}
              awaitingCommand={awaitingCommand}
              toggleWakeWordMode={toggleWakeWordMode}
              voiceError={voiceError}
            />
          </div>

          <DraggableGrid theme={theme} editMode={layoutEditing} onEditModeChange={setLayoutEditing}>
            {widgetVisibility.weather && <WeatherWidget theme={theme} />}
            {widgetVisibility.sports && <SportsWidget theme={theme} />}
            {widgetVisibility.calendar && <CalendarWidget theme={theme} />}
            {widgetVisibility.quickControls && <QuickControls theme={theme} />}
            {widgetVisibility.spotify && spotifyTab}
            {widgetVisibility.news && <NewsWidget theme={theme} setNewsIsOnline={setNewsIsOnline} />}
            {widgetVisibility.smartThings && <SmartThingsWidget
              theme={theme}
              setSmartThingsIsConnected={setSmartThingsIsConnected}
            />}
            {widgetVisibility.govee && <GoveeWidget theme={theme} setGoveeIsConnected={setGoveeIsConnected} />}
            {widgetVisibility.bluetooth && <BluetoothWidget theme={theme} />}
            {widgetVisibility.printer && <BambuPrinterWidget theme={theme} />}
            {widgetVisibility.hue && <PhilipsHueWidget theme={theme} setHueIsConnected={setHueIsConnected} />}
            {widgetVisibility.tesla && <TeslaWidget theme={theme} />}
            {/* New widgets go at the END: DraggableGrid maps children to WIDGET_KEYS by position */}
            {widgetVisibility.scenes && <ScenesWidget theme={theme} />}
            {widgetVisibility.activity && <ActivityWidget theme={theme} />}
            {widgetVisibility.frametv && <FrameTvWidget theme={theme} />}
          </DraggableGrid>
        </div>

        {/* Custom scrollbar styling */}
        <style>{`
          .overflow-x-auto::-webkit-scrollbar {
            height: 8px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
            background: ${theme}-900;
            border-radius: 4px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb:hover {
            background: ${theme}-900;
          }
        `}</style>
      </div>
      {spotifyModal}
    </>
  );
};

export default BatcomputerHub;