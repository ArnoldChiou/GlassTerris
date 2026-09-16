import { COLS, ROWS } from './config.js';
import { FILLED, SEAM } from './board.js';
import { PIECES } from './pieces.js';

const C = {
  frame: '#ee3789',
  frameLip: '#b91e62',
  frameHi: '#ff9aca',
  back: '#fbe3eb',
  brick: 'rgba(235, 86, 140, 0.88)',
  brickDeep: '#e15c88',
  brickTop: 'rgba(249, 145, 181, 0.94)',
  brickHi: 'rgba(255, 207, 225, 0.86)',
  brickLo: 'rgba(174, 43, 96, 0.72)',
  grout: '#dc668e',
  cap: 'rgba(255, 184, 211, 0.94)',
  capEdge: '#fff0f5',
  seam: '#a82d60',
  ghost: 'rgba(214,74,124,0.55)',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = 10;
    this.pad = 5;
    this.dpr = 1;
  }

  // 依可用範圍算出格子大小；場地尺寸只從這裡推導（踩雷手冊 §6.9）
  layout(maxW, maxH) {
    const cell = Math.max(4, Math.floor(Math.min(maxW / (COLS + 1.1), maxH / (ROWS + 1.1))));
    const pad = Math.max(5, Math.round(cell * 0.55));
    const w = COLS * cell + pad * 2;
    const h = ROWS * cell + pad * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.cell = cell;
    this.pad = pad;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    return { w, h, cell };
  }

  draw(state) {
    const { ctx, cell, pad } = this;
    const w = COLS * cell + pad * 2;
    const h = ROWS * cell + pad * 2;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.drawFrame(w, h, pad);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, COLS * cell, ROWS * cell);
    ctx.clip();
    ctx.translate(pad, pad);
    // 牆是連續往上爬的，用次格位移畫，看起來才不會每隔幾秒跳一格
    ctx.translate(0, -(state.riseOffset || 0) * cell);

    this.drawBack();
    this.drawWall(state.board, state.nextRow, state.fallOffsets);
    if (state.piece && state.ghostY != null) this.drawGhost(state);
    if (state.piece) this.drawPiece(state.piece, state.pieceX, state.pieceY, state.rot);
    this.drawParticles(state.particles);

    ctx.restore();
  }

  drawFrame(w, h, pad) {
    const { ctx } = this;
    const frameGlass = ctx.createLinearGradient(0, 0, w, h);
    frameGlass.addColorStop(0, C.frameHi);
    frameGlass.addColorStop(0.18, C.frame);
    frameGlass.addColorStop(0.78, '#dc2477');
    frameGlass.addColorStop(1, '#ff68aa');
    ctx.fillStyle = frameGlass;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.frameHi;
    ctx.fillRect(0, 0, w, Math.max(2, pad * 0.2));
    // 內緣的暗邊，做出「畫框有厚度」
    ctx.strokeStyle = C.frameLip;
    ctx.lineWidth = Math.max(2, pad * 0.3);
    ctx.strokeRect(pad - ctx.lineWidth / 2, pad - ctx.lineWidth / 2,
      w - pad * 2 + ctx.lineWidth, h - pad * 2 + ctx.lineWidth);
    ctx.strokeStyle = 'rgba(255, 230, 242, 0.7)';
    ctx.lineWidth = Math.max(1, pad * 0.1);
    ctx.strokeRect(pad + ctx.lineWidth, pad + ctx.lineWidth,
      w - pad * 2 - ctx.lineWidth * 2, h - pad * 2 - ctx.lineWidth * 2);
  }

  drawBack() {
    const { ctx, cell } = this;
    const w = COLS * cell;
    const h = ROWS * cell + cell; // 多畫一格，次格位移時底部才不會露空
    ctx.fillStyle = C.back;
    ctx.fillRect(0, 0, w, h);
  }

  drawWall(board, nextRow, fallOffsets) {
    const { ctx, cell } = this;

    // 稜線：每一欄最上面那格
    const top = new Array(COLS).fill(ROWS);
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (board.grid[y][x] & FILLED) { top[x] = y; break; }
      }
    }

    for (let y = 0; y < ROWS; y++) {
      const row = board.grid[y];
      for (let x = 0; x < COLS; x++) {
        if (!(row[x] & FILLED)) continue;
        // 正在落下的磚：格子狀態已經是落點了，畫面上先往回挪剩下的距離
        const off = fallOffsets && fallOffsets.get(y * COLS + x);
        this.brick(x * cell, (off ? y - off : y) * cell, top[x] === y);
        if (row[x] & SEAM) {
          ctx.fillStyle = C.seam;
          ctx.fillRect(x * cell, y * cell, cell, Math.max(1, cell * 0.14));
        }
      }
    }

    // 正要升上來的那一列，畫在場地底下。它的空格是預先留好的，
    // 玩家在它進場之前就看得到縫會往哪裡長
    if (nextRow) {
      for (let x = 0; x < COLS; x++) {
        if (nextRow[x] & FILLED) this.brick(x * cell, ROWS * cell, false);
      }
    }

    // 越深越暗，做出整片牆的縱深；用漸層才不會在某一列出現色階斷層
    const minTop = Math.min(...top) * cell;
    const bottom = ROWS * cell + cell;
    if (minTop < bottom) {
      const g = ctx.createLinearGradient(0, minTop, 0, bottom);
      g.addColorStop(0, 'rgba(120,20,64,0)');
      g.addColorStop(1, 'rgba(112,18,61,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(0, minTop, COLS * cell, bottom - minTop);
    }
  }

  // 一塊玻璃磚：半透明粉紅本體、銳利斜角與兩道內反射。
  brick(px, py, exposed) {
    const { ctx, cell } = this;
    const groove = Math.max(0.32, cell * 0.026);
    const bevel = Math.max(1, cell * 0.16);
    const innerX = px + groove;
    const innerY = py + groove;
    const innerW = cell - groove * 2;

    ctx.fillStyle = C.grout;
    ctx.fillRect(px, py, cell, cell);

    ctx.fillStyle = C.brick;
    ctx.fillRect(innerX, innerY, innerW, innerW);

    ctx.fillStyle = C.brickHi;
    ctx.fillRect(innerX, innerY, innerW - bevel * 0.35, bevel);
    ctx.fillRect(innerX, innerY, bevel, innerW - bevel * 0.35);

    ctx.fillStyle = 'rgba(255, 218, 232, 0.2)';
    ctx.fillRect(innerX + bevel, innerY + bevel,
      Math.max(0, innerW - bevel * 2.15), Math.max(0, innerW - bevel * 2.15));

    ctx.fillStyle = C.brickLo;
    ctx.fillRect(innerX, innerY + innerW - bevel, innerW, bevel);
    ctx.fillRect(innerX + innerW - bevel, innerY, bevel, innerW);

    // 玻璃表面的水平鏡面高光與窄直向折射，不使用逐格漸層以維持效能。
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.fillRect(innerX + bevel * 0.18, innerY + bevel * 0.18,
      Math.max(1, innerW - bevel * 0.8), Math.max(0.65, cell * 0.045));
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(innerX + innerW * 0.28, innerY + bevel * 1.05,
      Math.max(0.55, cell * 0.055), Math.max(1, innerW - bevel * 2.3));
    ctx.fillStyle = 'rgba(255, 238, 246, 0.18)';
    ctx.fillRect(innerX + bevel * 1.1, innerY + innerW * 0.48,
      Math.max(1, innerW - bevel * 2.35), Math.max(0.55, cell * 0.06));
  }

  // 落下中的方塊用牆的飽和色，才不會消失在淺色背景裡
  drawPiece(key, ox, oy, rot) {
    const { ctx, cell } = this;
    const cells = PIECES[key].states[rot];

    ctx.save();
    ctx.shadowColor = 'rgba(112,20,69,0.48)';
    ctx.shadowBlur = cell * 0.62;
    ctx.shadowOffsetX = cell * 0.12;
    ctx.shadowOffsetY = cell * 0.24;
    for (const [cx, cy] of cells) {
      const y = oy + cy;
      if (y < 0) continue;
      ctx.fillStyle = C.brick;
      ctx.fillRect((ox + cx) * cell, y * cell, cell, cell);
    }
    ctx.restore();

    for (const [cx, cy] of cells) {
      const y = oy + cy;
      if (y < 0) continue;
      const px = (ox + cx) * cell;
      const py = y * cell;
      this.brick(px, py, false);
    }
  }

  drawGhost(state) {
    const { ctx, cell } = this;
    ctx.strokeStyle = C.ghost;
    ctx.lineWidth = Math.max(1.5, cell * 0.12);
    const inset = ctx.lineWidth / 2 + 1;
    for (const [cx, cy] of PIECES[state.piece].states[state.rot]) {
      const y = state.ghostY + cy;
      if (y < 0) continue;
      ctx.strokeRect(
        (state.pieceX + cx) * cell + inset, y * cell + inset,
        cell - inset * 2, cell - inset * 2,
      );
    }
  }

  drawParticles(list) {
    if (!list || list.length === 0) return;
    const { ctx } = this;
    for (const p of list) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      const halfW = p.s * 0.5;
      const halfH = halfW * (p.aspect || 1);
      const ca = Math.cos(p.a);
      const sa = Math.sin(p.a);
      const wx = ca * halfW;
      const wy = sa * halfW;
      const hx = -sa * halfH;
      const hy = ca * halfH;
      ctx.beginPath();
      ctx.moveTo(p.x - wx - hx, p.y - wy - hy);
      ctx.lineTo(p.x + wx - hx, p.y + wy - hy);
      ctx.lineTo(p.x + wx + hx, p.y + wy + hy);
      if (p.kind !== 1) ctx.lineTo(p.x - wx + hx, p.y - wy + hy);
      ctx.closePath();
      ctx.fill();
      if (p.s > this.cell * 0.2) {
        ctx.strokeStyle = 'rgba(255, 235, 245, 0.72)';
        ctx.lineWidth = Math.max(0.45, p.s * 0.08);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

export const SHARD_COLORS = [C.brick, C.brickTop, C.cap, C.brickLo, C.capEdge];
