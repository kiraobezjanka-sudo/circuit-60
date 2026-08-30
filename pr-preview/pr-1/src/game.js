export const GRID_SIZE = 6;
export const ROUND_MS = 60_000;
export const DIRECTIONS = [1, 2, 4, 8]; // N E S W
const OPPOSITE = { 1: 4, 2: 8, 4: 1, 8: 2 };
const DELTA = { 1: [-1, 0], 2: [0, 1], 4: [1, 0], 8: [0, -1] };

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function rotateMask(mask, turns = 1) {
  let result = mask;
  const normalized = ((turns % 4) + 4) % 4;
  for (let i = 0; i < normalized; i += 1) {
    result = ((result << 1) & 15) | ((result & 8) ? 1 : 0);
  }
  return result;
}

export class CircuitGame {
  constructor({ seed = Date.now(), duration = ROUND_MS } = {}) {
    this.duration = duration;
    this.seed = seed;
    this.attempt = 0;
    this.status = 'idle';
    this.selected = { row: 0, col: 0 };
    this.remainingMs = duration;
    this.moves = 0;
    this.endAt = 0;
    this.tiles = [];
    this.receivers = [];
    this.powered = new Set();
    this.createPuzzle();
  }

  createPuzzle() {
    const random = mulberry32((this.seed + this.attempt * 7919) >>> 0);
    const masks = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const stack = [[0, 0]];
    visited[0][0] = true;

    while (stack.length) {
      const [row, col] = stack[stack.length - 1];
      const options = DIRECTIONS.map((dir) => {
        const [dr, dc] = DELTA[dir];
        return [dir, row + dr, col + dc];
      }).filter(([, nr, nc]) => nr >= 0 && nc >= 0 && nr < GRID_SIZE && nc < GRID_SIZE && !visited[nr][nc]);
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [dir, nr, nc] = options[Math.floor(random() * options.length)];
      masks[row][col] |= dir;
      masks[nr][nc] |= OPPOSITE[dir];
      visited[nr][nc] = true;
      stack.push([nr, nc]);
    }

    const receiverCoords = [[0, 5], [2, 2], [3, 5], [5, 0], [5, 5]];
    const lockedCoords = new Set(['0,0', '1,4', '4,1', '5,3']);
    this.receivers = receiverCoords.map(([row, col]) => `${row},${col}`);
    this.tiles = masks.map((row, r) => row.map((solutionMask, c) => {
      const locked = lockedCoords.has(`${r},${c}`);
      const rotation = locked ? 0 : Math.floor(random() * 4);
      return { solutionMask, mask: rotateMask(solutionMask, rotation), locked };
    }));
    this.recalculatePower();
    if (this.receivers.every((key) => this.powered.has(key))) {
      this.tiles[0][1].mask = rotateMask(this.tiles[0][1].mask);
      this.recalculatePower();
    }
  }

  start(now = performance.now()) {
    if (this.status !== 'idle') return false;
    this.status = 'running';
    this.remainingMs = this.duration;
    this.endAt = now + this.remainingMs;
    return true;
  }

  restart(now = performance.now()) {
    this.attempt += 1;
    this.status = 'running';
    this.selected = { row: 0, col: 0 };
    this.remainingMs = this.duration;
    this.moves = 0;
    this.createPuzzle();
    this.endAt = now + this.remainingMs;
  }

  pause(now = performance.now()) {
    if (this.status !== 'running') return false;
    this.remainingMs = Math.max(0, this.endAt - now);
    this.status = 'paused';
    return true;
  }

  resume(now = performance.now()) {
    if (this.status !== 'paused') return false;
    this.endAt = now + this.remainingMs;
    this.status = 'running';
    return true;
  }

  update(now = performance.now()) {
    if (this.status !== 'running') return;
    this.remainingMs = Math.max(0, this.endAt - now);
    if (this.remainingMs === 0) this.status = 'lost';
  }

  moveSelection(dr, dc) {
    if (this.status !== 'running') return false;
    this.selected.row = (this.selected.row + dr + GRID_SIZE) % GRID_SIZE;
    this.selected.col = (this.selected.col + dc + GRID_SIZE) % GRID_SIZE;
    return true;
  }

  select(row, col) {
    if (this.status !== 'running' || row < 0 || col < 0 || row >= GRID_SIZE || col >= GRID_SIZE) return false;
    this.selected = { row, col };
    return true;
  }

  rotate(row = this.selected.row, col = this.selected.col, turns = 1) {
    if (this.status !== 'running') return false;
    const tile = this.tiles[row]?.[col];
    if (!tile || tile.locked) return false;
    tile.mask = rotateMask(tile.mask, turns);
    this.moves += 1;
    this.selected = { row, col };
    this.recalculatePower();
    if (this.receivers.every((key) => this.powered.has(key))) {
      this.status = 'won';
      this.remainingMs = Math.max(0, this.endAt - performance.now());
    }
    return true;
  }

  recalculatePower() {
    const powered = new Set(['0,0']);
    const queue = [[0, 0]];
    while (queue.length) {
      const [row, col] = queue.shift();
      const mask = this.tiles[row][col].mask;
      for (const dir of DIRECTIONS) {
        if (!(mask & dir)) continue;
        const [dr, dc] = DELTA[dir];
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
        if (!(this.tiles[nr][nc].mask & OPPOSITE[dir])) continue;
        const key = `${nr},${nc}`;
        if (!powered.has(key)) {
          powered.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    this.powered = powered;
  }

  snapshot() {
    return {
      status: this.status,
      remainingMs: this.remainingMs,
      moves: this.moves,
      selected: { ...this.selected },
      poweredReceivers: this.receivers.filter((key) => this.powered.has(key)).length,
      powered: [...this.powered]
    };
  }
}

