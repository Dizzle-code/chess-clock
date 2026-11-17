// Pure chess clock engine. No DOM, no timers: every method takes `now` (ms),
// so the logic is deterministic and unit-testable.

export const MODES = Object.freeze({
  NONE: 'none', // sudden death
  FISCHER: 'fischer', // fixed increment after every move
  BRONSTEIN: 'bronstein', // refund time used, capped at increment
  DELAY: 'delay', // simple/US delay: clock waits before counting down
});

export const STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  FLAGGED: 'flagged',
});

/**
 * @typedef {Object} ClockConfig
 * @property {[number, number]} baseMs     Starting time for player 0 and 1.
 * @property {string} [mode]               One of MODES.
 * @property {number} [incrementMs]        Increment / delay in ms.
 * @property {{moves:number, addMs:number}|null} [stage]
 *           Optional time control stage: after `moves` moves add `addMs`.
 */

export class ChessClock {
  /** @param {ClockConfig} config */
  constructor(config) {
    this.configure(config);
  }

  configure(config) {
    const { baseMs, mode = MODES.NONE, incrementMs = 0, stage = null } = config;
    if (!Array.isArray(baseMs) || baseMs.length !== 2 || baseMs.some((t) => !(t > 0))) {
      throw new Error('baseMs must be two positive numbers');
    }
    if (!Object.values(MODES).includes(mode)) throw new Error(`unknown mode: ${mode}`);
    if (incrementMs < 0) throw new Error('incrementMs must be >= 0');
    this.config = { baseMs: [...baseMs], mode, incrementMs, stage };
    this.reset();
  }

  reset() {
    this.remaining = [...this.config.baseMs];
    this.moves = [0, 0];
    this.active = null; // player whose clock runs (0 | 1 | null)
    this.status = STATUS.IDLE;
    this.flagged = null; // player whose flag fell
    this._turnElapsed = 0; // ms spent in the current turn before last resume
    this._since = null; // timestamp of last start/resume while running
  }

  /** Time spent in the active player's current turn. */
  turnElapsed(now) {
    if (this.active === null) return 0;
    const live = this.status === STATUS.RUNNING ? now - this._since : 0;
    return this._turnElapsed + live;
  }

  /** Main time that has been consumed in the current turn. */
  _consumed(now) {
    const elapsed = this.turnElapsed(now);
    if (this.config.mode === MODES.DELAY) {
      return Math.max(0, elapsed - this.config.incrementMs);
    }
    return elapsed;
  }

  /** Remaining time of `player` at `now` (never negative). */
  timeLeft(player, now) {
    if (player !== this.active || this.status === STATUS.FLAGGED) return this.remaining[player];
    return Math.max(0, this.remaining[player] - this._consumed(now));
  }

  /** Remaining simple-delay time for the active player (0 if not in delay mode). */
  delayLeft(player, now) {
    if (this.config.mode !== MODES.DELAY || player !== this.active) return 0;
    if (this.status === STATUS.IDLE || this.status === STATUS.FLAGGED) return 0;
    return Math.max(0, this.config.incrementMs - this.turnElapsed(now));
  }

  /** Check for flag fall. Returns true if a flag has fallen. */
  tick(now) {
    if (this.status !== STATUS.RUNNING) return this.status === STATUS.FLAGGED;
    const p = this.active;
    if (this.remaining[p] - this._consumed(now) <= 0) {
      this.remaining[p] = 0;
      this.flagged = p;
      this.status = STATUS.FLAGGED;
      this._turnElapsed = 0;
      this._since = null;
      return true;
    }
    return false;
  }

  /**
   * Player `player` presses their button: ends their turn, starts the opponent.
   * In IDLE, any press starts the opponent's clock (Black starts White's clock).
   * Returns true if the press changed state.
   */
  press(player, now) {
    if (player !== 0 && player !== 1) throw new Error('player must be 0 or 1');
    const opponent = 1 - player;

    if (this.status === STATUS.IDLE) {
      this._startTurn(opponent, now);
      this.status = STATUS.RUNNING;
      return true;
    }
    if (this.status !== STATUS.RUNNING || this.active !== player) return false;
    if (this.tick(now)) return false; // flag fell before the press

    const elapsed = this.turnElapsed(now);
    const { mode, incrementMs, stage } = this.config;
    let rem = this.remaining[player] - this._consumed(now);

    if (mode === MODES.FISCHER) rem += incrementMs;
    else if (mode === MODES.BRONSTEIN) rem += Math.min(incrementMs, elapsed);

    this.moves[player] += 1;
    if (stage && stage.moves > 0 && this.moves[player] === stage.moves) rem += stage.addMs;

    this.remaining[player] = rem;
    this._startTurn(opponent, now);
    return true;
  }

  pause(now) {
    if (this.status !== STATUS.RUNNING) return false;
    if (this.tick(now)) return false;
    this._turnElapsed = this.turnElapsed(now);
    this._since = null;
    this.status = STATUS.PAUSED;
    return true;
  }

  resume(now) {
    if (this.status !== STATUS.PAUSED) return false;
    this._since = now;
    this.status = STATUS.RUNNING;
    return true;
  }

  _startTurn(player, now) {
    this.active = player;
    this._turnElapsed = 0;
    this._since = now;
  }
}

/** Format ms as clock text: h:mm:ss, m:ss, or s.t below 10 seconds. */
export function formatTime(ms) {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) {
    // Floor to tenths so 0.0 only shows when time is really over.
    const tenths = Math.floor(clamped / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  const totalSec = Math.ceil(clamped / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
