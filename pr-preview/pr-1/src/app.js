import { CircuitGame, GRID_SIZE, ROUND_MS, DIRECTIONS } from './game.js';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const boardWrap = document.querySelector('#boardWrap');
const timerEl = document.querySelector('#timer');
const timerFill = document.querySelector('#timerFill');
const poweredEl = document.querySelector('#powered');
const movesEl = document.querySelector('#moves');
const statusEl = document.querySelector('#systemStatus');
const overlay = document.querySelector('#overlay');
const overlayCode = document.querySelector('#overlayCode');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayText = document.querySelector('#overlayText');
const primaryButton = document.querySelector('#primaryButton');
const pauseButton = document.querySelector('#pauseButton');
const soundButton = document.querySelector('#soundButton');

const params = new URLSearchParams(location.search);
const localTestMode = ['127.0.0.1', 'localhost'].includes(location.hostname);
const requestedDuration = localTestMode ? Number(params.get('duration')) : 0;
const requestedSeed = localTestMode ? Number(params.get('seed')) : 0;
const game = new CircuitGame({
  duration: requestedDuration > 0 ? requestedDuration : ROUND_MS,
  seed: requestedSeed || Date.now()
});
window.__circuitGame = game;
let audioEnabled = true;
let audioContext;
let previousStatus = game.status;

function tone(frequency, duration = 0.06, volume = 0.035) {
  if (!audioEnabled) return;
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Sound is optional. */ }
}

function resizeCanvas() {
  const size = Math.min(boardWrap.clientWidth, boardWrap.clientHeight || boardWrap.clientWidth, 760);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(size);
}

function drawWire(cx, cy, half, dir, powered) {
  const ends = { 1: [cx, cy - half], 2: [cx + half, cy], 4: [cx, cy + half], 8: [cx - half, cy] };
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(...ends[dir]);
  ctx.strokeStyle = powered ? '#b8ff63' : '#685f42';
  ctx.lineWidth = powered ? 8 : 6;
  ctx.shadowColor = powered ? '#82f15a' : 'transparent';
  ctx.shadowBlur = powered ? 13 : 0;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function draw(size = parseFloat(canvas.style.width) || 720) {
  const cell = size / GRID_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b100e';
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const tile = game.tiles[row][col];
      const x = col * cell;
      const y = row * cell;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      const key = `${row},${col}`;
      const powered = game.powered.has(key);
      ctx.fillStyle = (row + col) % 2 ? '#101713' : '#0e1411';
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.strokeStyle = '#263129';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5);
      for (const dir of DIRECTIONS) if (tile.mask & dir) drawWire(cx, cy, cell / 2 - 4, dir, powered);

      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = powered ? '#dfff9c' : '#8b7a45';
      ctx.fill();
      if (key === '0,0') {
        ctx.fillStyle = '#081008';
        ctx.font = `bold ${cell * 0.2}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('●', cx, cy);
      }
      if (game.receivers.includes(key)) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = powered ? '#e9ffbb' : '#c48c35';
        ctx.shadowColor = powered ? '#b8ff63' : '#d27c24';
        ctx.shadowBlur = powered ? 18 : 6;
        ctx.fillRect(-cell * 0.16, -cell * 0.16, cell * 0.32, cell * 0.32);
        ctx.restore();
      }
      if (tile.locked) {
        ctx.fillStyle = '#c58c31';
        ctx.font = `bold ${cell * 0.15}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('▣', x + cell - 8, y + 7);
      }
      if (game.selected.row === row && game.selected.col === col && game.status === 'running') {
        ctx.strokeStyle = '#f6bd51';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 5, y + 5, cell - 10, cell - 10);
      }
    }
  }
}

function setOverlay(code, title, text, button) {
  overlayCode.textContent = code;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  primaryButton.textContent = button;
  overlay.classList.remove('hidden');
  queueMicrotask(() => primaryButton.focus());
}

function render() {
  const snapshot = game.snapshot();
  const seconds = Math.ceil(snapshot.remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  timerFill.style.width = `${Math.max(0, snapshot.remainingMs / game.duration * 100)}%`;
  poweredEl.textContent = snapshot.poweredReceivers;
  movesEl.textContent = snapshot.moves;
  document.body.classList.toggle('critical', snapshot.status === 'running' && snapshot.remainingMs <= 10_000);
  statusEl.textContent = { idle: 'ОЖИДАНИЕ', running: 'ВОССТАНОВЛЕНИЕ', paused: 'ПАУЗА', won: 'КОНТУР СТАБИЛЕН', lost: 'ОТКЛЮЧЕНИЕ' }[snapshot.status];
  pauseButton.textContent = snapshot.status === 'paused' ? 'ПРОДОЛЖИТЬ [P]' : 'ПАУЗА [P]';
  pauseButton.disabled = !['running', 'paused'].includes(snapshot.status);

  if (snapshot.status !== previousStatus) {
    if (snapshot.status === 'won') {
      tone(660, 0.18, 0.05);
      setOverlay('ПРОТОКОЛ ВЫПОЛНЕН', 'Контур восстановлен', `Все терминалы запитаны. Поворотов: ${snapshot.moves}.`, 'НОВАЯ СХЕМА [ENTER]');
    } else if (snapshot.status === 'lost') {
      tone(90, 0.35, 0.06);
      setOverlay('ВРЕМЯ ИСТЕКЛО', 'Аварийное отключение', 'Контур не был восстановлен за 60 секунд.', 'ПОВТОРИТЬ [ENTER]');
    } else if (snapshot.status === 'paused') {
      setOverlay('ТАЙМЕР ОСТАНОВЛЕН', 'Пауза', 'Схема сохранена. Продолжите, когда будете готовы.', 'ПРОДОЛЖИТЬ [ENTER]');
    } else if (snapshot.status === 'running') {
      overlay.classList.add('hidden');
      canvas.focus();
    }
    previousStatus = snapshot.status;
  }
  draw();
}

function primaryAction() {
  if (game.status === 'idle') game.start();
  else if (game.status === 'paused') game.resume();
  else if (game.status === 'won' || game.status === 'lost') game.restart();
  render();
}

function togglePause() {
  if (game.status === 'running') game.pause();
  else if (game.status === 'paused') game.resume();
  render();
}

primaryButton.addEventListener('click', primaryAction);
pauseButton.addEventListener('click', togglePause);
soundButton.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  soundButton.textContent = `ЗВУК: ${audioEnabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  soundButton.setAttribute('aria-pressed', String(!audioEnabled));
  if (audioEnabled) tone(420);
});

canvas.addEventListener('pointerdown', (event) => {
  if (game.status !== 'running') return;
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor((event.clientX - rect.left) / rect.width * GRID_SIZE);
  const row = Math.floor((event.clientY - rect.top) / rect.height * GRID_SIZE);
  game.select(row, col);
  if (game.rotate(row, col, event.button === 2 ? -1 : 1)) tone(240 + game.powered.size * 8);
  render();
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

document.addEventListener('keydown', (event) => {
  const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyP', 'Escape', 'Enter'].includes(event.code);
  if (handled) event.preventDefault();
  if (event.code === 'Enter') return primaryAction();
  if (event.code === 'KeyP' || event.code === 'Escape') return togglePause();
  const moves = { KeyW: [-1, 0], ArrowUp: [-1, 0], KeyS: [1, 0], ArrowDown: [1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
  if (moves[event.code]) game.moveSelection(...moves[event.code]);
  if (event.code === 'KeyE' || event.code === 'Space') {
    if (game.rotate()) tone(260 + game.powered.size * 7);
  }
  if (event.code === 'KeyQ') {
    if (game.rotate(undefined, undefined, -1)) tone(210 + game.powered.size * 7);
  }
  render();
});

window.addEventListener('resize', resizeCanvas);
const observer = new ResizeObserver(resizeCanvas);
observer.observe(boardWrap);

function frame(now) {
  game.update(now);
  render();
  requestAnimationFrame(frame);
}
resizeCanvas();
requestAnimationFrame(frame);

