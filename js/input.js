const TAP_MS = 280;
const TAP_SLOP = 0.6;      // 以格子為單位
const FLICK_CELLS = 3.5;   // 往下甩超過這麼多格就直接落底
const FLICK_MS = 320;

export function bindInput(canvas, game, renderer, onAction) {
  let drag = null;

  const act = () => { if (onAction) onAction(); };

  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, col: game.pieceX, t: performance.now(), moved: false };
    act();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const cell = renderer.cell;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (Math.abs(dx) > cell * TAP_SLOP || Math.abs(dy) > cell * TAP_SLOP) drag.moved = true;

    const target = drag.col + Math.round(dx / cell);
    if (target !== game.pieceX) game.moveTo(target);

    // 明顯往下拖才加速，避免橫移時誤觸
    game.setSoftDrop(dy > cell * 1.5 && Math.abs(dy) > Math.abs(dx));
  });

  const end = (e) => {
    if (!drag) return;
    const cell = renderer.cell;
    const dt = performance.now() - drag.t;
    const dy = e.clientY - drag.y;
    const dx = e.clientX - drag.x;

    game.setSoftDrop(false);
    if (!drag.moved && dt < TAP_MS) {
      game.rotate();
    } else if (dy > cell * FLICK_CELLS && dt < FLICK_MS && Math.abs(dy) > Math.abs(dx) * 1.5) {
      game.hardDrop();
    }
    drag = null;
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { game.setSoftDrop(false); drag = null; });

  window.addEventListener('keydown', (e) => {
    if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
    switch (e.code) {
      case 'ArrowLeft': game.move(-1); break;
      case 'ArrowRight': game.move(1); break;
      case 'ArrowUp': case 'KeyX': game.rotate(); break;
      case 'ArrowDown': game.setSoftDrop(true); break;
      case 'Space': e.preventDefault(); game.hardDrop(); break;
      default: return;
    }
    act();
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') game.setSoftDrop(false);
  });
}
