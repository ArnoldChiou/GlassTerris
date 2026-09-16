import { VERSION, COLS, ROWS } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';
import { bindInput } from './input.js';
import { GAP_MODES } from './board.js';

const el = (id) => document.getElementById(id);
const canvas = el('board');
const hud = el('hud');
const stage = el('stage');
const timeEl = el('time');
const scoreEl = el('score');
const overlay = el('overlay');
const overlayScore = el('overlay-score');
const overlayTitle = el('overlay-title');
const levelSelect = el('level-select');
const debugEl = el('debug');

const DEBUG = new URLSearchParams(location.search).has('debug');

const sfx = new Sfx();
const renderer = new Renderer(canvas);
const game = new Game(sfx, GAP_MODES.STRAIGHT);
game.enterMenu();

// HUD 字級跟著場地寬度、場地高度又扣掉 HUD 高度，兩者互相依賴（踩雷手冊 §6.9）。
// 跑兩趟讓它收斂，不要只算一次拿到上一輪的舊 HUD 高度。
function relayout() {
  for (let pass = 0; pass < 2; pass++) {
    const rect = stage.getBoundingClientRect();
    const hudH = hud.getBoundingClientRect().height;
    const bottom = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.5;
    const { w } = renderer.layout(rect.width, Math.max(80, rect.height - hudH - bottom));

    // HUD 與靜音鍵都跟場地對齊，否則在寬螢幕上會被甩到視窗兩端
    hud.style.width = `${w}px`;
    hud.style.fontSize = `${Math.max(11, w * 0.055)}px`;
    el('mute').style.right = `${Math.max(8, (rect.width - w) / 2 + 8)}px`;
    el('mute').style.fontSize = `${Math.max(10, w * 0.038)}px`;
  }
}

bindInput(canvas, game, renderer, () => sfx.unlock());

el('restart').addEventListener('click', restart);
el('again').addEventListener('click', restart);
el('choose-level').addEventListener('click', showLevelSelect);
for (const button of document.querySelectorAll('.level-option')) {
  button.addEventListener('click', () => chooseLevel(button.dataset.level));
}
el('mute').addEventListener('click', (e) => {
  sfx.unlock();
  e.currentTarget.textContent = sfx.toggle() ? '🔇' : '🔊';
});

function restart() {
  sfx.unlock();
  game.reset();
  overlay.hidden = true;
}

function chooseLevel(level) {
  sfx.unlock();
  game.setLevel(level);
  levelSelect.hidden = true;
  overlay.hidden = true;
  wasOver = false;
}

function showLevelSelect() {
  game.enterMenu();
  overlay.hidden = true;
  levelSelect.hidden = false;
}

let lastScore = -1;
let lastTime = -1;
let wasOver = false;

function syncHud() {
  const secs = Math.floor(game.elapsed);
  if (secs !== lastTime) {
    timeEl.textContent = `TIME ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    lastTime = secs;
  }
  if (game.score !== lastScore) {
    scoreEl.textContent = game.score;
    lastScore = game.score;
  }
  const over = game.state === 'over';
  if (over !== wasOver) {
    wasOver = over;
    overlay.hidden = !over;
    if (over) {
      overlayTitle.textContent = '堆到頂了';
      overlayScore.textContent = game.score;
    }
  }
}

let prev = performance.now();
// 實際數幀，不用指數平滑 —— 平滑值開場一秒內會顯示假數字
let fps = 0;
let fpsFrames = 0;
let fpsSince = prev;

function frame(now) {
  const dt = Math.min(100, now - prev);
  prev = now;
  // 第一幀之前的載入時間不算進取樣窗，否則開場會顯示假的低 fps
  if (fpsFrames === 0 && fps === 0) fpsSince = now;
  fpsFrames++;
  if (now - fpsSince >= 500) {
    fps = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;
  }

  // 橫向時提示蓋住畫面，這時不要推進 —— 否則牆會在玩家看不到的時候繼續往上長
  if (getComputedStyle(el('rotate-hint')).display === 'none') game.step(dt, renderer.cell);
  renderer.draw(game.snapshot());
  syncHud();
  if (DEBUG) syncDebug();

  requestAnimationFrame(frame);
}

// 實機除錯通道：把量到的數字直接畫在畫面上（踩雷手冊 §6.6）
function syncDebug() {
  const probeTop = el('safe-probe-top').offsetHeight;
  const probeBottom = el('safe-probe-bottom').offsetHeight;
  debugEl.textContent = [
    `v${VERSION}  fps ${fps > 0 ? fps.toFixed(0) : '--'}`, // 還沒量完就顯示 --，不要給假數字
    `grid ${COLS}x${ROWS}  cell ${renderer.cell}  dpr ${renderer.dpr}`,
    `canvas ${canvas.style.width} x ${canvas.style.height}`,
    `inner ${innerWidth}x${innerHeight}  screen ${screen.width}x${screen.height}`,
    `safe top ${probeTop}  bottom ${probeBottom}`,
    `surface ${game.board.surfaceDepth()}  rows ${game.rowsCleared}`,
    `rise ${(game.riseProgress * 100).toFixed(0)}%`,
    `waves ${game.waves.length}`,
    `particles ${game.particles.list.length}`,
  ].join('\n');
}

if (DEBUG) {
  debugEl.hidden = false;
  window.__game = game;     // 給自動化測試用的把手
  window.__renderer = renderer;
}

addEventListener('resize', relayout);
addEventListener('orientationchange', () => setTimeout(relayout, 120));
relayout();
requestAnimationFrame(frame);
