import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitGame, ROUND_MS, rotateMask } from '../src/game.js';

test('four rotations restore a connector mask', () => {
  assert.equal(rotateMask(5, 4), 5);
  assert.equal(rotateMask(3, -1), 9);
});

test('initial state and start use the documented one-minute timer', () => {
  const game = new CircuitGame({ seed: 42 });
  assert.equal(game.status, 'idle');
  assert.equal(game.snapshot().poweredReceivers < 5, true);
  game.start(1000);
  game.update(16_000);
  assert.equal(game.status, 'running');
  assert.equal(game.remainingMs, 45_000);
});

test('timer loses exactly at zero and input is ignored afterward', () => {
  const game = new CircuitGame({ seed: 42, duration: 1000 });
  game.start(10);
  game.update(1010);
  assert.equal(game.status, 'lost');
  assert.equal(game.rotate(0, 1), false);
  assert.equal(game.moves, 0);
});

test('pause freezes remaining time and resume preserves it', () => {
  const game = new CircuitGame({ seed: 17, duration: 5000 });
  game.start(100);
  game.pause(1100);
  game.update(9000);
  assert.equal(game.remainingMs, 4000);
  game.resume(10_000);
  game.update(12_000);
  assert.equal(game.remainingMs, 2000);
});

test('locked tile cannot rotate and restart creates clean attempt', () => {
  const game = new CircuitGame({ seed: 5 });
  game.start(0);
  assert.equal(game.rotate(0, 0), false);
  game.rotate(0, 1);
  assert.equal(game.moves, 1);
  game.restart(100);
  assert.equal(game.moves, 0);
  assert.deepEqual(game.selected, { row: 0, col: 0 });
  assert.equal(game.status, 'running');
});

test('putting every tile in its generated solution wins', () => {
  const game = new CircuitGame({ seed: 99 });
  game.start(0);
  for (const row of game.tiles) for (const tile of row) tile.mask = tile.solutionMask;
  game.recalculatePower();
  game.rotate(0, 1, 4);
  assert.equal(game.status, 'won');
  assert.equal(game.snapshot().poweredReceivers, 5);
});

