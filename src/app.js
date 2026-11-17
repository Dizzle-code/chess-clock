import { ChessClock, MODES, STATUS, formatTime } from './clock.js';

const MIN = 60_000;
const SEC = 1_000;
const LOW_TIME_MS = 10 * SEC;
const STORAGE_KEY = 'chess-clock-settings-v1';

const PRESETS = [
  { name: 'Bullet 1 + 0', min: 1, mode: MODES.NONE, inc: 0 },
  { name: 'Bullet 2 + 1', min: 2, mode: MODES.FISCHER, inc: 1 },
  { name: 'Blitz 3 + 0', min: 3, mode: MODES.NONE, inc: 0 },
  { name: 'Blitz 3 + 2', min: 3, mode: MODES.FISCHER, inc: 2 },
  { name: 'Blitz 5 + 0', min: 5, mode: MODES.NONE, inc: 0 },
  { name: 'Blitz 5 + 3', min: 5, mode: MODES.FISCHER, inc: 3 },
  { name: 'Rapid 10 + 0', min: 10, mode: MODES.NONE, inc: 0 },
  { name: 'Rapid 10 + 5', min: 10, mode: MODES.FISCHER, inc: 5 },
  { name: 'Rapid 15 + 10', min: 15, mode: MODES.FISCHER, inc: 10 },
  { name: 'Rapid 25 + 10', min: 25, mode: MODES.FISCHER, inc: 10 },
  { name: 'Klassisch 90 + 30', min: 90, mode: MODES.FISCHER, inc: 30 },
  { name: 'FIDE 90/40 + 30 min + 30 s', min: 90, mode: MODES.FISCHER, inc: 30, stageMoves: 40, stageMin: 30 },
  { name: 'Delay 5 min, 5 s (US)', min: 5, mode: MODES.DELAY, inc: 5 },
  { name: 'Bronstein 5 min, 3 s', min: 5, mode: MODES.BRONSTEIN, inc: 3 },
];

const MODE_HINTS = {
  [MODES.NONE]: 'Feste Bedenkzeit. Nach Ablauf ist die Partie verloren.',
  [MODES.FISCHER]: 'Nach jedem Zug kommt das Inkrement dazu. Die Zeit kann wachsen.',
  [MODES.BRONSTEIN]: 'Die verbrauchte Zeit wird gutgeschrieben, höchstens bis zum Delay. Die Zeit wächst nie.',
  [MODES.DELAY]: 'Vor jedem Zug wartet die Uhr die Delay-Zeit ab, bevor sie läuft. Ungenutztes verfällt.',
};

const DEFAULT_SETTINGS = { min: [5, 5], sec: [0, 0], handicap: false, mode: MODES.NONE, inc: 0, stageMoves: 0, stageMin: 0 };

const $ = (id) => document.getElementById(id);
const now = () => performance.now();

// ---------- settings ----------

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function toConfig(s) {
  const base = [0, 1].map((p) => {
    const i = s.handicap ? p : 0;
    return (Number(s.min[i]) || 0) * MIN + (Number(s.sec[i]) || 0) * SEC;
  });
  const stage = s.stageMoves > 0 && s.stageMin > 0 ? { moves: s.stageMoves, addMs: s.stageMin * MIN } : null;
  return { baseMs: base, mode: s.mode, incrementMs: s.mode === MODES.NONE ? 0 : s.inc * SEC, stage };
}

function describe(s) {
  const t = (p) => (s.sec[p] ? `${s.min[p]}:${String(s.sec[p]).padStart(2, '0')}` : `${s.min[p]}`);
  let text = s.handicap ? `${t(0)} / ${t(1)}` : t(0);
  if (s.mode === MODES.FISCHER) text += ` + ${s.inc}`;
  else if (s.mode === MODES.BRONSTEIN) text += ` B${s.inc}`;
  else if (s.mode === MODES.DELAY) text += ` d${s.inc}`;
  else text += ' + 0';
  if (s.stageMoves > 0 && s.stageMin > 0) text += ` · ${s.stageMoves}. Zug +${s.stageMin}′`;
  return text;
}

// ---------- state ----------

let settings = loadSettings();
let clock;
try {
  clock = new ChessClock(toConfig(settings));
} catch {
  settings = { ...DEFAULT_SETTINGS };
  clock = new ChessClock(toConfig(settings));
}
let soundOn = true;
let rafId = null;
let lastStatus = clock.status;

// ---------- sound ----------

let audioCtx = null;
function beep(freq = 880, duration = 0.05, volume = 0.15) {
  if (!soundOn) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  } catch { /* audio unavailable */ }
}

// ---------- wake lock ----------

let wakeLock = null;
async function updateWakeLock() {
  const want = clock.status === STATUS.RUNNING && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', updateWakeLock);

// ---------- rendering ----------

function render() {
  const t = now();
  clock.tick(t);

  for (const p of [0, 1]) {
    const left = clock.timeLeft(p, t);
    const delay = clock.delayLeft(p, t);
    const isActive = clock.active === p && (clock.status === STATUS.RUNNING || clock.status === STATUS.PAUSED);
    const side = $(`side-${p}`);
    $(`time-${p}`).textContent = formatTime(left);
    $(`moves-${p}`).textContent = `Züge: ${clock.moves[p]}`;
    $(`delay-${p}`).textContent = delay > 0 ? `Delay ${Math.ceil(delay / 1000)} s` : '';
    side.classList.toggle('active', isActive);
    side.classList.toggle('low', isActive && left < LOW_TIME_MS);
    side.classList.toggle('flagged', clock.flagged === p);
  }

  const pauseBtn = $('btn-pause');
  pauseBtn.textContent = clock.status === STATUS.PAUSED ? '▶' : '⏸';
  pauseBtn.disabled = clock.status !== STATUS.RUNNING && clock.status !== STATUS.PAUSED;
  pauseBtn.setAttribute('aria-label', clock.status === STATUS.PAUSED ? 'Fortsetzen' : 'Pause');
  $('btn-sound').textContent = soundOn ? '🔊' : '🔇';
  $('label').textContent = describe(settings);

  if (clock.status !== lastStatus) {
    if (clock.status === STATUS.FLAGGED) beep(440, 0.8, 0.25);
    lastStatus = clock.status;
    updateWakeLock();
  }

  if (clock.status === STATUS.RUNNING) {
    rafId = requestAnimationFrame(render);
  } else {
    rafId = null;
  }
}

function scheduleRender() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  render();
}

// ---------- input ----------

function pressSide(p) {
  if ($('settings').open) return;
  if (clock.status === STATUS.PAUSED) return;
  if (clock.press(p, now())) {
    beep();
    scheduleRender();
  }
}

function togglePause() {
  const t = now();
  if (clock.status === STATUS.RUNNING) clock.pause(t);
  else if (clock.status === STATUS.PAUSED) clock.resume(t);
  scheduleRender();
}

function resetClock() {
  if (clock.status === STATUS.RUNNING || clock.status === STATUS.PAUSED) {
    clock.pause(now());
    scheduleRender();
    if (!confirm('Uhr zurücksetzen?')) return;
  }
  clock.reset();
  scheduleRender();
}

for (const p of [0, 1]) {
  // pointerdown reacts faster than click on touch screens
  $(`side-${p}`).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressSide(p);
  });
  // keyboard activation via Enter on focused button
  $(`side-${p}`).addEventListener('click', (e) => {
    if (e.detail === 0) pressSide(p);
  });
}

$('btn-pause').addEventListener('click', togglePause);
$('btn-reset').addEventListener('click', resetClock);
$('btn-sound').addEventListener('click', () => { soundOn = !soundOn; scheduleRender(); });
$('btn-settings').addEventListener('click', openSettings);

document.addEventListener('keydown', (e) => {
  if ($('settings').open || e.repeat) return;
  switch (e.code) {
    case 'ShiftLeft': case 'KeyA': pressSide(0); break;
    case 'ShiftRight': case 'KeyL': pressSide(1); break;
    case 'Space': e.preventDefault(); togglePause(); break;
    default: return;
  }
});

// ---------- settings dialog ----------

function fillPresetSelect() {
  const sel = $('preset');
  sel.innerHTML = '<option value="">– Eigene –</option>';
  PRESETS.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = p.name;
    sel.append(o);
  });
}

function writeForm(s) {
  for (const p of [0, 1]) {
    $(`min-${p}`).value = s.min[p];
    $(`sec-${p}`).value = s.sec[p];
  }
  $('handicap').checked = s.handicap;
  $('mode').value = s.mode;
  $('inc').value = s.inc;
  $('stage-moves').value = s.stageMoves || '';
  $('stage-min').value = s.stageMin || '';
  syncFormVisibility();
}

function readForm() {
  const int = (id) => Math.max(0, Math.floor(Number($(id).value) || 0));
  return {
    min: [int('min-0'), int('min-1')],
    sec: [Math.min(59, int('sec-0')), Math.min(59, int('sec-1'))],
    handicap: $('handicap').checked,
    mode: $('mode').value,
    inc: int('inc'),
    stageMoves: int('stage-moves'),
    stageMin: int('stage-min'),
  };
}

function syncFormVisibility() {
  $('handicap-row').hidden = !$('handicap').checked;
  const mode = $('mode').value;
  $('inc-label').hidden = mode === MODES.NONE;
  $('mode-hint').textContent = MODE_HINTS[mode];
}

function openSettings() {
  if (clock.status === STATUS.RUNNING) {
    clock.pause(now());
    scheduleRender();
  }
  writeForm(settings);
  $('preset').value = '';
  $('settings-error').textContent = '';
  $('settings').showModal();
}

$('preset').addEventListener('change', () => {
  const p = PRESETS[Number($('preset').value)];
  if (!p) return;
  writeForm({
    min: [p.min, p.min], sec: [0, 0], handicap: false,
    mode: p.mode, inc: p.inc, stageMoves: p.stageMoves || 0, stageMin: p.stageMin || 0,
  });
});

for (const id of ['min-0', 'sec-0', 'min-1', 'sec-1', 'inc', 'stage-moves', 'stage-min', 'mode', 'handicap']) {
  $(id).addEventListener('input', () => {
    if (id !== 'mode' && id !== 'handicap') $('preset').value = '';
    syncFormVisibility();
  });
}

$('settings-cancel').addEventListener('click', () => $('settings').close());

$('settings-form').addEventListener('submit', (e) => {
  const s = readForm();
  try {
    if (!s.handicap) { s.min[1] = s.min[0]; s.sec[1] = s.sec[0]; }
    clock = new ChessClock(toConfig(s));
  } catch {
    e.preventDefault();
    $('settings-error').textContent = 'Bitte eine Bedenkzeit größer als 0 angeben.';
    return;
  }
  settings = s;
  saveSettings(settings);
  lastStatus = clock.status;
  scheduleRender();
});

fillPresetSelect();
render();
