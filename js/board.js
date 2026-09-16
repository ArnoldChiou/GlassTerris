import { COLS, ROWS, WALL, GAP } from './config.js';
import { PIECES } from './pieces.js';

export const EMPTY = 0;
export const FILLED = 1;
export const SEAM = 2; // 位元旗標：這格的上緣要畫一條崩塌接縫
export const GAP_MODES = Object.freeze({ STRAIGHT: 'straight', HEART: 'heart' });

// 一顆 9x8 的像素愛心，由上往下逐列生成；最後一列保留尖角作為間隔。
export const HEART_GAP_ROWS = [
  [-3, -2, 2, 3],
  [-4, -3, -2, -1, 1, 2, 3, 4],
  [-4, -3, -2, -1, 0, 1, 2, 3, 4],
  [-3, -2, -1, 0, 1, 2, 3],
  [-2, -1, 0, 1, 2],
  [-1, 0, 1],
  [0],
  [0],
];

export class Board {
  constructor(gapMode = GAP_MODES.HEART) {
    this.grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    this.setGapMode(gapMode);
    this.heartCenter = Math.floor(COLS / 2);
    this.heartRow = 0;
    this.straightGapCol = Math.floor(COLS / 2);
    this.straightRow = 0;
  }

  setGapMode(gapMode) {
    if (!Object.values(GAP_MODES).includes(gapMode)) throw new Error(`未知空格模式: ${gapMode}`);
    this.gapMode = gapMode;
  }

  at(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return FILLED; // 邊界視同實心
    if (y < 0) return EMPTY;                            // 場地上方是空的
    return this.grid[y][x] & FILLED;
  }

  // 依參考圖產生凹凸稜線：兩側高、中央低，每欄最多走一兩格
  generateWall() {
    const depths = new Array(COLS);
    let d = WALL.startDepth;
    const mid = (COLS - 1) / 2;
    for (let x = 0; x < COLS; x++) {
      if (Math.random() < WALL.stepChance) {
        const step = Math.random() < WALL.bigStepChance ? 2 : 1;
        d += Math.random() < 0.5 ? step : -step;
      }
      // 越靠兩側，稜線越高（深度越小）
      const lift = Math.round(WALL.edgeLift * (Math.abs(x - mid) / mid) ** 2);
      depths[x] = clamp(d - lift, WALL.minDepth, WALL.maxDepth);
    }

    // 兩側抬升會在邊緣造出斷崖，來回壓一下把落差收進 maxStep
    for (let pass = 0; pass < 3; pass++) {
      for (let x = 1; x < COLS; x++) {
        depths[x] = clamp(depths[x], depths[x - 1] - WALL.maxStep, depths[x - 1] + WALL.maxStep);
      }
      for (let x = COLS - 2; x >= 0; x--) {
        depths[x] = clamp(depths[x], depths[x + 1] - WALL.maxStep, depths[x + 1] + WALL.maxStep);
      }
    }

    // 簡單關固定一條中央長直槽；困難關由上往下鋪出像素愛心。
    this.straightGapCol = Math.floor(COLS / 2);
    this.straightRow = 0;
    this.heartCenter = randomHeartCenter();
    this.heartRow = 0;
    for (let y = 0; y < ROWS; y++) this.grid[y].fill(EMPTY);
    for (let y = 0; y < ROWS; y++) {
      const row = this.makeRow();
      for (let x = 0; x < COLS; x++) {
        if (y >= depths[x] && (row[x] & FILLED)) this.grid[y][x] = FILLED;
      }
    }
    this.nextRow = this.makeRow();
  }

  // 一列實心牆，依關卡挖出長直槽或像素愛心的其中一橫列。
  makeRow() {
    const row = new Uint8Array(COLS);
    row.fill(FILLED);

    if (this.gapMode === GAP_MODES.STRAIGHT) {
      row[this.straightGapCol] = EMPTY;
      this.straightRow++;
      if (this.straightRow >= GAP.straightRunRows) {
        this.straightRow = 0;
        let dir = Math.random() < 0.5 ? -1 : 1;
        if (this.straightGapCol <= 0) dir = 1;
        if (this.straightGapCol >= COLS - 1) dir = -1;
        const next = this.straightGapCol + dir;
        row[next] = EMPTY; // 轉彎列同時挖開新舊兩欄，讓長直槽保持連通
        this.straightGapCol = next;
      }
      return row;
    }

    for (const offset of HEART_GAP_ROWS[this.heartRow]) {
      row[this.heartCenter + offset] = EMPTY;
    }

    this.heartRow++;
    if (this.heartRow >= HEART_GAP_ROWS.length) {
      this.heartRow = 0;
      if (Math.random() < GAP.shiftChance) {
        const shift = Math.floor(Math.random() * (GAP.maxShift * 2 + 1)) - GAP.maxShift;
        this.heartCenter = clamp(
          this.heartCenter + shift,
          GAP.heartHalfWidth,
          COLS - 1 - GAP.heartHalfWidth,
        );
      }
    }
    return row;
  }

  // 每一欄最上面那格的列號；空欄回傳 ROWS
  columnTops() {
    const top = new Array(COLS).fill(ROWS);
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (this.grid[y][x] & FILLED) { top[x] = y; break; }
      }
    }
    return top;
  }

  // 懸空的格子往下掉，掉到踩到東西為止。只處理指定的格子（剛落定的那一塊），
  // 不能整面掃 —— 牆體內預留的空格上方本來就有磚，整面掃會把那條縫填平
  dropFloaters(cells) {
    const moved = [];
    // 由下往上處理，免得上面的格子先掉、卡住下面那格的位置
    const order = [...cells].sort((a, b) => b[1] - a[1]);
    for (const [x, y] of order) {
      if (!(this.grid[y][x] & FILLED)) continue;
      let ny = y;
      while (ny + 1 < ROWS && !(this.grid[ny + 1][x] & FILLED)) ny++;
      if (ny === y) { moved.push([x, y, 0]); continue; }
      this.grid[ny][x] = this.grid[y][x];
      this.grid[y][x] = EMPTY;
      moved.push([x, ny, ny - y]);
    }
    return moved;
  }

  // 消掉的列整列抽掉，上方的牆往下落。牆因此被「往下削掉」一層，
  // 不會留下懸空的橫帶（留橫帶的話牆永遠不會變矮，玩家削不下去）。
  // 回傳 [[x, 落點列, 落了幾格]]，畫面靠它做動畫
  collapseRows(rows) {
    const doomed = new Set(rows);
    const kept = [];
    const origin = [];
    for (let y = 0; y < ROWS; y++) {
      if (!doomed.has(y)) { kept.push(this.grid[y]); origin.push(y); }
    }

    const pad = ROWS - kept.length;
    const grid = [];
    for (let i = 0; i < pad; i++) grid.push(new Uint8Array(COLS));

    const seams = [];
    for (let i = 0; i < kept.length; i++) {
      grid.push(kept[i]);
      // 上下兩列原本不相鄰 = 中間被抽掉了，這裡就是落下後的接縫
      if (i > 0 && origin[i] !== origin[i - 1] + 1) seams.push(pad + i);
    }
    this.grid = grid;

    for (const y of seams) {
      for (let x = 0; x < COLS; x++) if (grid[y][x] & FILLED) grid[y][x] |= SEAM;
    }

    // 回報哪些磚塊往下移了幾格，給畫面做落下動畫用
    const moves = [];
    for (let i = 0; i < kept.length; i++) {
      const shift = pad + i - origin[i];
      if (shift <= 0) continue;
      const row = grid[pad + i];
      for (let x = 0; x < COLS; x++) if (row[x] & FILLED) moves.push([x, pad + i, shift]);
    }
    return moves;
  }

  // 方塊佔的格子能不能放在 (ox, oy)
  fits(key, rot, ox, oy) {
    for (const [cx, cy] of PIECES[key].states[rot]) {
      const x = ox + cx;
      const y = oy + cy;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.grid[y][x] & FILLED) return false;
    }
    return true;
  }

  lock(key, rot, ox, oy) {
    const cells = [];
    for (const [cx, cy] of PIECES[key].states[rot]) {
      const x = ox + cx;
      const y = oy + cy;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        this.grid[y][x] = FILLED;
        cells.push([x, y]);
      }
    }
    return cells;
  }

  isRowFull(y) {
    for (let x = 0; x < COLS; x++) if (!(this.grid[y][x] & FILLED)) return false;
    return true;
  }

  fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (this.isRowFull(y)) rows.push(y);
    return rows;
  }

  fullRowMask() {
    const mask = new Array(ROWS);
    for (let y = 0; y < ROWS; y++) mask[y] = this.isRowFull(y);
    return mask;
  }

  // 初始牆面稜線以下本來就整排實心，那些不算數。
  // 只有「落定這一塊之後才變滿」的列會崩，wasFull 是落定前的快照。
  newlyFullRows(wasFull) {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (!wasFull[y] && this.isRowFull(y)) rows.push(y);
    return rows;
  }

  // 牆從底部長出一列、整面往上推。長出來的是預先留好空格的那一列。
  // 回傳被推出頂端的那列有沒有磚
  rise() {
    let spilled = false;
    for (let x = 0; x < COLS; x++) {
      if (this.grid[0][x] & FILLED) { spilled = true; break; }
    }
    for (let y = 0; y < ROWS - 1; y++) this.grid[y] = this.grid[y + 1];
    this.grid[ROWS - 1] = this.nextRow;
    this.nextRow = this.makeRow();
    return spilled;
  }

  // 稜線離場地頂端最少幾格；用來判定是否堆到頂
  surfaceDepth() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (this.grid[y][x] & FILLED) return y;
    }
    return ROWS;
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function randomHeartCenter() {
  const min = GAP.heartHalfWidth;
  const max = COLS - 1 - GAP.heartHalfWidth;
  return min + Math.floor(Math.random() * (max - min + 1));
}
