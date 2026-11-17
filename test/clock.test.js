import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChessClock, MODES, STATUS, formatTime } from '../src/clock.js';

const MIN = 60_000;
const SEC = 1_000;

test('idle press starts the opponent (black starts white)', () => {
  const c = new ChessClock({ baseMs: [5 * MIN, 5 * MIN] });
  assert.equal(c.status, STATUS.IDLE);
  assert.ok(c.press(1, 0));
  assert.equal(c.active, 0);
  assert.equal(c.status, STATUS.RUNNING);
  assert.deepEqual(c.moves, [0, 0]);
});

test('time runs only for the active player', () => {
  const c = new ChessClock({ baseMs: [5 * MIN, 5 * MIN] });
  c.press(1, 0);
  assert.equal(c.timeLeft(0, 10 * SEC), 5 * MIN - 10 * SEC);
  assert.equal(c.timeLeft(1, 10 * SEC), 5 * MIN);
  c.press(0, 10 * SEC);
  assert.equal(c.active, 1);
  assert.equal(c.timeLeft(0, 20 * SEC), 5 * MIN - 10 * SEC);
  assert.equal(c.timeLeft(1, 20 * SEC), 5 * MIN - 10 * SEC);
  assert.deepEqual(c.moves, [1, 0]);
});

test('pressing the inactive side does nothing', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN] });
  c.press(1, 0);
  assert.equal(c.press(1, 1000), false);
  assert.equal(c.active, 0);
});

test('fischer adds increment after each move, time can grow', () => {
  const c = new ChessClock({ baseMs: [3 * MIN, 3 * MIN], mode: MODES.FISCHER, incrementMs: 2 * SEC });
  c.press(1, 0);
  c.press(0, 500); // 0.5s used, +2s
  assert.equal(c.timeLeft(0, 500), 3 * MIN + 1500);
});

test('bronstein refunds used time up to the increment, never grows', () => {
  const c = new ChessClock({ baseMs: [3 * MIN, 3 * MIN], mode: MODES.BRONSTEIN, incrementMs: 2 * SEC });
  c.press(1, 0);
  c.press(0, 500); // fast move: full refund
  assert.equal(c.timeLeft(0, 500), 3 * MIN);
  c.press(1, 10 * SEC + 500); // 10s used: refund 2s
  assert.equal(c.timeLeft(1, 10 * SEC + 500), 3 * MIN - 8 * SEC);
});

test('simple delay waits before counting down, unused delay is lost', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN], mode: MODES.DELAY, incrementMs: 5 * SEC });
  c.press(1, 0);
  assert.equal(c.timeLeft(0, 3 * SEC), MIN);
  assert.equal(c.delayLeft(0, 3 * SEC), 2 * SEC);
  assert.equal(c.timeLeft(0, 8 * SEC), MIN - 3 * SEC);
  assert.equal(c.delayLeft(0, 8 * SEC), 0);
  c.press(0, 8 * SEC);
  assert.equal(c.timeLeft(0, 8 * SEC), MIN - 3 * SEC);
  // next turn: fast move costs nothing
  c.press(1, 9 * SEC);
  c.press(0, 10 * SEC);
  assert.equal(c.timeLeft(0, 10 * SEC), MIN - 3 * SEC);
});

test('bronstein and simple delay cost the same main time per move', () => {
  const opts = { baseMs: [10 * SEC, 10 * SEC], incrementMs: 3 * SEC };
  const b = new ChessClock({ ...opts, mode: MODES.BRONSTEIN });
  const d = new ChessClock({ ...opts, mode: MODES.DELAY });
  for (const c of [b, d]) {
    c.press(1, 0);
    c.press(0, 7 * SEC); // 7s used, 3s refunded/delayed → 4s net
  }
  assert.equal(b.timeLeft(0, 7 * SEC), 6 * SEC);
  assert.equal(d.timeLeft(0, 7 * SEC), 6 * SEC);
});

test('flag falls when time runs out and press is rejected', () => {
  const c = new ChessClock({ baseMs: [10 * SEC, 10 * SEC] });
  c.press(1, 0);
  assert.equal(c.tick(9_999), false);
  assert.equal(c.tick(10_000), true);
  assert.equal(c.status, STATUS.FLAGGED);
  assert.equal(c.flagged, 0);
  assert.equal(c.timeLeft(0, 20_000), 0);
  assert.equal(c.press(0, 20_000), false);
});

test('late press after flag fall does not save the player', () => {
  const c = new ChessClock({ baseMs: [10 * SEC, 10 * SEC], mode: MODES.FISCHER, incrementMs: 5 * SEC });
  c.press(1, 0);
  assert.equal(c.press(0, 11 * SEC), false);
  assert.equal(c.flagged, 0);
});

test('pause freezes time, resume continues', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN] });
  c.press(1, 0);
  c.pause(5 * SEC);
  assert.equal(c.timeLeft(0, 100 * SEC), MIN - 5 * SEC);
  assert.equal(c.press(0, 100 * SEC), false);
  c.resume(100 * SEC);
  assert.equal(c.timeLeft(0, 102 * SEC), MIN - 7 * SEC);
});

test('pause keeps simple delay progress', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN], mode: MODES.DELAY, incrementMs: 5 * SEC });
  c.press(1, 0);
  c.pause(3 * SEC);
  c.resume(50 * SEC);
  assert.equal(c.delayLeft(0, 51 * SEC), 1 * SEC);
  assert.equal(c.timeLeft(0, 53 * SEC), MIN - 1 * SEC);
});

test('stage adds time after the given number of moves', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN], stage: { moves: 2, addMs: 30 * MIN } });
  c.press(1, 0);
  c.press(0, 1 * SEC); // white move 1
  c.press(1, 2 * SEC); // black move 1
  c.press(0, 3 * SEC); // white move 2 → +30min
  assert.equal(c.timeLeft(0, 3 * SEC), MIN - 2 * SEC + 30 * MIN);
  assert.equal(c.timeLeft(1, 3 * SEC), MIN - 1 * SEC);
});

test('handicap: different base times', () => {
  const c = new ChessClock({ baseMs: [5 * MIN, 1 * MIN] });
  assert.equal(c.timeLeft(0, 0), 5 * MIN);
  assert.equal(c.timeLeft(1, 0), 1 * MIN);
});

test('reset restores initial state', () => {
  const c = new ChessClock({ baseMs: [MIN, MIN] });
  c.press(1, 0);
  c.press(0, 5 * SEC);
  c.reset();
  assert.equal(c.status, STATUS.IDLE);
  assert.deepEqual(c.remaining, [MIN, MIN]);
  assert.deepEqual(c.moves, [0, 0]);
  assert.equal(c.active, null);
});

test('invalid config is rejected', () => {
  assert.throws(() => new ChessClock({ baseMs: [0, MIN] }));
  assert.throws(() => new ChessClock({ baseMs: [MIN, MIN], mode: 'x' }));
});

test('formatTime', () => {
  assert.equal(formatTime(5 * MIN), '5:00');
  assert.equal(formatTime(90 * MIN), '1:30:00');
  assert.equal(formatTime(61_500), '1:02');
  assert.equal(formatTime(10_000), '0:10');
  assert.equal(formatTime(9_950), '9.9');
  assert.equal(formatTime(50), '0.0');
  assert.equal(formatTime(-5), '0.0');
});
