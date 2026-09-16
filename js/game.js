import {
  COLS, ROWS, RAMP_SECONDS, GRAVITY_MS, GRAVITY_MIN_MS, GRAVITY_RAMP,
  SOFT_DROP_MS, LOCK_DELAY_MS, SPAWN_DELAY_MS,
  SCORE_LOCK, SCORE_PER_BRICK, SCORE_HARD_DROP_PER_CELL, TOP_OUT_DEPTH,
  RISE_MS, RISE_MIN_MS, RISE_SCORE_FULL, RISE_PUSH_MS, WAVE_COLS_PER_SEC, FALL_MS,
} from './config.js';
import { Board, EMPTY, FILLED, GAP_MODES } from './board.js';
import { PIECES, createBag } from './pieces.js';
import { Particles } from './particles.js';

export class Game {
  constructor(sfx, level = GAP_MODES.HEART) {
    this.sfx = sfx;
    this.level = level;
    this.board = new Board(level);
    this.particles = new Particles();
    this.reset();
  }

  setLevel(level) {
    this.level = level;
    this.board.setGapMode(level);
    this.reset();
  }

  enterMenu() {
    this.state = 'menu';
    this.piece = null;
    this.softDrop = false;
  }

  reset() {
    this.board.generateWall();
    this.particles.clear();
    this.nextPiece = createBag();
    this.score = 0;
    this.rowsCleared = 0;
    this.elapsed = 0;
    this.state = 'playing';
    this.softDrop = false;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.spawnTimer = 0;
    this.riseProgress = 0;
    this.waves = [];
    this.falls = [];
    this.piece = null;
    this.spawn();
  }

  spawn() {
    const key = this.nextPiece();
    const size = PIECES[key].size;
    const x = Math.floor((COLS - size) / 2);
    this.piece = key;
    this.pieceX = x;
    this.pieceY = -size;
    this.rot = 0;
    this.lockTimer = 0;
    this.dropTimer = 0;

    // 連最上面都塞不下，或牆已經頂到天花板，這局就結束
    if (!this.board.fits(key, 0, x, this.pieceY) || this.board.surfaceDepth() <= TOP_OUT_DEPTH) {
      this.gameOver();
    }
  }

  gameOver() {
    if (this.state === 'over') return;
    this.state = 'over';
    this.piece = null;
    this.sfx.over();
  }

  get gravityMs() {
    const t = Math.min(1, this.elapsed / RAMP_SECONDS);
    const ms = GRAVITY_MS * (1 - t * (1 - GRAVITY_RAMP));
    return Math.max(GRAVITY_MIN_MS, ms);
  }

  get ghostY() {
    if (!this.piece) return null;
    let y = this.pieceY;
    while (this.board.fits(this.piece, this.rot, this.pieceX, y + 1)) y++;
    return y;
  }

  move(dir) {
    if (this.state !== 'playing' || !this.piece) return false;
    if (!this.board.fits(this.piece, this.rot, this.pieceX + dir, this.pieceY)) return false;
    this.pieceX += dir;
    this.lockTimer = 0;
    this.sfx.move();
    return true;
  }

  moveTo(col) {
    if (this.state !== 'playing' || !this.piece) return;
    const dir = Math.sign(col - this.pieceX);
    if (dir === 0) return;
    while (this.pieceX !== col && this.move(dir)) { /* 逐格走，撞牆就停 */ }
  }

  rotate() {
    if (this.state !== 'playing' || !this.piece) return;
    const next = (this.rot + 1) % 4;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (this.board.fits(this.piece, next, this.pieceX + kick, this.pieceY)) {
        this.rot = next;
        this.pieceX += kick;
        this.lockTimer = 0;
        this.sfx.rotate();
        return;
      }
    }
  }

  hardDrop() {
    if (this.state !== 'playing' || !this.piece) return;
    const target = this.ghostY;
    this.score += Math.max(0, target - this.pieceY) * SCORE_HARD_DROP_PER_CELL;
    this.pieceY = target;
    this.lockPiece();
  }

  setSoftDrop(on) {
    this.softDrop = on;
  }

  lockPiece() {
    const wasFull = this.board.fullRowMask();
    const placed = this.board.lock(this.piece, this.rot, this.pieceX, this.pieceY);
    this.score += SCORE_LOCK;
    this.sfx.lock();

    // 沒消到列就完全不動：架在縫口上的方塊也留在原地。
    // 只有真的消掉之後，剩下的磚塊才會往下掉（在 finishWave 做）
    const rows = this.board.newlyFullRows(wasFull);
    if (rows.length > 0) this.startWave(rows, placed);

    this.piece = null;
    this.spawnTimer = SPAWN_DELAY_MS;

    if (this.board.surfaceDepth() <= TOP_OUT_DEPTH) this.gameOver();
  }

  // 消行不是瞬間完成的：一道碎裂波由左往右掃過去，邊掃邊摧毀、邊加分
  startWave(rows, cells) {
    this.waves.push({ rows: [...rows], cells: [...cells], x: 0 });
    this.sfx.clearRows(rows.length);
  }

  updateWaves(dtMs, cell) {
    if (this.waves.length === 0) return;
    const step = (WAVE_COLS_PER_SEC * dtMs) / 1000;
    const done = [];

    for (const w of this.waves) {
      const next = Math.min(COLS, w.x + step);
      const hit = [];
      for (let x = Math.floor(w.x); x < Math.floor(next); x++) {
        for (const y of w.rows) {
          if (!(this.board.grid[y][x] & FILLED)) continue;
          this.board.grid[y][x] = EMPTY;
          hit.push([x, y]);
          this.score += SCORE_PER_BRICK;
        }
      }
      if (hit.length > 0) this.particles.burstCells(hit, cell);
      w.x = next;
      if (next >= COLS) done.push(w);
    }

    for (const w of done) {
      this.waves.splice(this.waves.indexOf(w), 1);
      this.finishWave(w);
    }
  }

  // 波掃完才把那幾列抽掉，上方整面牆往下落一格。
  // 同一塊積木的殘磚可能再掉進空格並補滿另一列，因此結算後要檢查連鎖。
  finishWave(w) {
    this.rowsCleared += w.rows.length;
    this.startFall(this.board.collapseRows(w.rows));

    // 其它還在進行的波，座標要跟著往下移
    const dropped = (y) => y + w.rows.filter((r) => r > y).length;
    for (const other of this.waves) {
      other.rows = other.rows.map(dropped);
      other.cells = other.cells.map(([x, y]) => [x, dropped(y)]);
    }

    // 消掉之後，這一塊積木還活著的那幾格才往下掉
    const doomed = new Set(w.rows);
    const rest = w.cells.filter(([, y]) => !doomed.has(y)).map(([x, y]) => [x, dropped(y)]);
    if (rest.length > 0) {
      const moves = this.board.dropFloaters(rest);

      // 只檢查真的有殘磚落入的列；不能直接掃 fullRows()，否則牆體原本的
      // 實心列也會被當成新完成的列一起清掉。
      const landedRows = [...new Set(
        moves.filter(([, , dist]) => dist > 0).map(([, y]) => y),
      )];
      const chainRows = landedRows.filter((y) => this.board.isRowFull(y));
      const chain = chainRows.length > 0
        ? { rows: chainRows, cells: moves.map(([x, y]) => [x, y]) }
        : null;
      this.startFall(moves, chain);
    }
  }

  // 磚塊落下用動畫，不要瞬移。
  // 邏輯已經在 board 那邊結算完了，這裡只留「畫面上還差幾格」給繪製用 ——
  // 這樣碰撞判定不會因為動畫播到一半而含糊，測試也不用處理時間
  startFall(moves, chain = null) {
    const real = moves.filter(([, , dist]) => dist > 0);
    if (real.length > 0) {
      const longest = Math.max(...real.map(([, , d]) => fallDuration(d)));
      this.falls.push({ moves: real, t: 0, dur: longest, chain });
    } else if (chain) {
      this.startWave(chain.rows, chain.cells);
    }
  }

  updateFalls(dtMs) {
    if (this.falls.length === 0) return;
    for (const f of this.falls) f.t += dtMs;
    const done = this.falls.filter((f) => f.t >= f.dur);
    this.falls = this.falls.filter((f) => f.t < f.dur);
    for (const f of done) {
      if (f.chain) this.startWave(f.chain.rows, f.chain.cells);
    }
  }

  // 回傳 Map<列*COLS+欄, 還差幾格>，繪製時把那格往上挪這麼多。
  // 每一格用自己的距離算時長，所以同一批磚是用同一個加速度掉，不是一起等最慢的那格
  fallOffsets() {
    if (this.falls.length === 0) return null;
    const out = new Map();
    for (const f of this.falls) {
      for (const [x, y, dist] of f.moves) {
        const p = Math.min(1, f.t / fallDuration(dist));
        const off = dist * (1 - p * p); // 自由落體：起步慢、越掉越快
        if (off > 0.02) out.set(y * COLS + x, off);
      }
    }
    return out.size > 0 ? out : null;
  }

  // 現在的上升週期。分數越高升得越快，到 RISE_SCORE_FULL 之後就固定在最快
  get riseMs() {
    const t = Math.min(1, this.score / RISE_SCORE_FULL);
    return RISE_MS + (RISE_MIN_MS - RISE_MS) * t;
  }

  // 畫面上的上升位移。不是把一格平均攤在整個週期裡（那樣每秒只有 2.4px、
  // 肉眼看不見），而是平常不動、接近換列時才在 RISE_PUSH_MS 內推上去
  get riseOffset() {
    const frac = Math.min(1, RISE_PUSH_MS / this.riseMs);
    const t = (this.riseProgress - (1 - frac)) / frac;
    if (t <= 0) return 0;
    const p = Math.min(1, t);
    return p * p * (3 - 2 * p); // smoothstep，起停都不生硬
  }

  // 牆是連續往上爬的，riseProgress 是「離下一列還差多少」(0~1)
  updateRise(dtMs) {
    this.riseProgress += dtMs / this.riseMs;
    if (this.riseProgress < 1) return;
    this.riseProgress -= 1;

    if (this.board.rise()) { this.gameOver(); return; }
    this.sfx.rise();

    for (const w of this.waves) {
      w.rows = w.rows.map((y) => y - 1).filter((y) => y >= 0);
      w.cells = w.cells.map(([x, y]) => [x, y - 1]).filter(([, y]) => y >= 0);
    }
    this.waves = this.waves.filter((w) => w.rows.length > 0);

    // 進行中的落下動畫座標也要跟著往上推
    for (const f of this.falls) {
      f.moves = f.moves.map(([x, y, d]) => [x, y - 1, d]);
      if (f.chain) {
        f.chain.rows = f.chain.rows.map((y) => y - 1).filter((y) => y >= 0);
        f.chain.cells = f.chain.cells.map(([x, y]) => [x, y - 1]).filter(([, y]) => y >= 0);
        if (f.chain.rows.length === 0) f.chain = null;
      }
    }
    this.falls = this.falls.filter((f) => f.moves.every(([, y]) => y >= 0));

    if (!this.piece) return;
    const floor = -PIECES[this.piece].size * 2;
    this.pieceY -= 1;
    while (this.pieceY > floor && !this.board.fits(this.piece, this.rot, this.pieceX, this.pieceY)) {
      this.pieceY -= 1;
    }
    if (!this.board.fits(this.piece, this.rot, this.pieceX, this.pieceY)) this.gameOver();
  }

  step(dtMs, cell) {
    const dt = dtMs / 1000;
    this.particles.update(dt, cell);

    if (this.state !== 'playing') return;

    this.updateWaves(dtMs, cell);
    this.updateFalls(dtMs);
    this.updateRise(dtMs);
    if (this.state !== 'playing') return;

    // 時間只累計，不會因為時間到而結束 —— 唯一的結束條件是牆頂到最上方
    this.elapsed += dt;

    if (!this.piece) {
      this.spawnTimer -= dtMs;
      if (this.spawnTimer <= 0) this.spawn();
      return;
    }

    const interval = this.softDrop ? SOFT_DROP_MS : this.gravityMs;
    this.dropTimer += dtMs;
    while (this.dropTimer >= interval && this.piece) {
      this.dropTimer -= interval;
      if (this.board.fits(this.piece, this.rot, this.pieceX, this.pieceY + 1)) {
        this.pieceY += 1;
        this.lockTimer = 0;
      } else {
        break;
      }
    }

    if (!this.piece) return;

    // 貼地了給一小段緩衝，還能左右挪
    if (!this.board.fits(this.piece, this.rot, this.pieceX, this.pieceY + 1)) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lockPiece();
    } else {
      this.lockTimer = 0;
    }
  }

  snapshot() {
    return {
      board: this.board,
      piece: this.piece,
      pieceX: this.pieceX,
      pieceY: this.pieceY,
      rot: this.rot,
      ghostY: this.piece ? this.ghostY : null,
      particles: this.particles.list,
      riseOffset: this.riseOffset,
      fallOffsets: this.fallOffsets(),
      nextRow: this.board.nextRow,
    };
  }
}

// 掉 dist 格要多久。真實重力是 t ∝ √距離，所以掉遠的不會被甩下去
function fallDuration(dist) {
  return FALL_MS * Math.sqrt(Math.max(1, dist));
}

export { COLS, ROWS };
