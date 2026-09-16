import { COLS } from './config.js';
import { SHARD_COLORS } from './render.js';

const MAX = 1800;

export class Particles {
  constructor() {
    this.list = [];
  }

  // 整列崩掉時，沿著那幾列噴一排碎片
  burstRows(rows, cell) {
    const per = 12;
    for (const y of rows) {
      for (let x = 0; x < COLS; x++) {
        for (let i = 0; i < per; i++) {
          if (this.list.length >= MAX) return;
          const dust = i >= 8;
          this.list.push({
            x: (x + Math.random()) * cell,
            y: (y + Math.random()) * cell,
            vx: (Math.random() - 0.5) * cell * (dust ? 12 : 9),
            vy: (Math.random() - (dust ? 0.72 : 0.92)) * cell * (dust ? 9 : 7),
            a: Math.random() * Math.PI,
            va: (Math.random() - 0.5) * (dust ? 20 : 13),
            s: cell * (dust ? 0.07 + Math.random() * 0.12 : 0.18 + Math.random() * 0.34),
            aspect: dust ? 0.45 + Math.random() * 0.75 : 0.55 + Math.random() * 0.9,
            kind: Math.random() < 0.28 ? 1 : 0,
            c: SHARD_COLORS[(Math.random() * SHARD_COLORS.length) | 0],
            life: 1,
            decay: dust ? 0.85 + Math.random() * 0.75 : 0.52 + Math.random() * 0.62,
          });
        }
      }
    }
  }

  // 牆上裂開一條細縫時，沿著被挖掉的那幾格噴碎片
  burstCells(cells, cell) {
    const per = 10;
    for (const [x, y] of cells) {
      for (let i = 0; i < per; i++) {
        if (this.list.length >= MAX) return;
        const dust = i >= 6;
        this.list.push({
          x: (x + Math.random()) * cell,
          y: (y + Math.random()) * cell,
          vx: (Math.random() - 0.5) * cell * (dust ? 10 : 7),
          vy: (Math.random() - 0.8) * cell * (dust ? 8 : 6),
          a: Math.random() * Math.PI,
          va: (Math.random() - 0.5) * (dust ? 20 : 13),
          s: cell * (dust ? 0.07 + Math.random() * 0.12 : 0.16 + Math.random() * 0.28),
          aspect: dust ? 0.45 + Math.random() * 0.75 : 0.55 + Math.random() * 0.9,
          kind: Math.random() < 0.28 ? 1 : 0,
          c: SHARD_COLORS[(Math.random() * SHARD_COLORS.length) | 0],
          life: 1,
          decay: dust ? 0.9 + Math.random() * 0.75 : 0.6 + Math.random() * 0.6,
        });
      }
    }
  }

  update(dt, cell) {
    const g = cell * 26;
    const next = [];
    for (const p of this.list) {
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.va * dt;
      p.life -= p.decay * dt;
      if (p.life > 0) next.push(p);
    }
    this.list = next;
  }

  clear() {
    this.list.length = 0;
  }
}
