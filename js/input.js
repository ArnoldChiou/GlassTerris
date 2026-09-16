// 觸控容差一律用「絕對像素」，不能用格子數。
// 手機上一格只有 10~11px，用 0.6 格當容差 = 6.6px，
// 但真人點一下手指位移 5~15px 是常態 —— 實測晃 6px 方塊就跑掉一欄、
// 晃 8px 旋轉就完全失效，變成「想轉卻往旁邊滑走」。
const TAP_SLOP_PX = 12;      // 超過這個位移才算「在拖曳」，iOS 的觸控容差約 10px
const TAP_MS = 320;          // 按住超過這麼久就不算點擊
const FLICK_PX = 44;         // 往下甩超過這麼多像素就直接落底
const FLICK_MS = 320;
const SOFT_DROP_PX = 28;     // 明顯往下拖才加速

export function bindInput(canvas, game, renderer, onAction) {
  let drag = null;

  const act = () => { if (onAction) onAction(); };

  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    canvas.setPointerCapture(e.pointerId);
    drag = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: false,
      // 橫移的基準點。超過容差之後才設，設在「剛超過的那一刻」，
      // 方塊才不會在拖曳開始的瞬間跳一格
      originX: 0,
      originCol: game.pieceX,
    };
    act();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= TAP_SLOP_PX) return; // 還在容差內，當作沒動
      drag.moved = true;
      drag.originX = e.clientX;
      drag.originCol = game.pieceX;
    }

    const cell = renderer.cell;
    const target = drag.originCol + Math.round((e.clientX - drag.originX) / cell);
    if (target !== game.pieceX) game.moveTo(target);

    game.setSoftDrop(dy > SOFT_DROP_PX && Math.abs(dy) > Math.abs(dx));
  });

  const end = (e) => {
    if (!drag) return;
    const dt = performance.now() - drag.t;
    const dy = e.clientY - drag.y;
    const dx = e.clientX - drag.x;

    game.setSoftDrop(false);
    if (!drag.moved && dt < TAP_MS) {
      game.rotate();
    } else if (dy > FLICK_PX && dt < FLICK_MS && Math.abs(dy) > Math.abs(dx) * 1.5) {
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
