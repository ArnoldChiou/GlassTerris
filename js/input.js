// 觸控容差一律用「絕對像素」，不能用格子數。
// 手機上一格只有 10~11px，用 0.6 格當容差 = 6.6px，
// 但真人點一下手指位移 5~15px 是常態 —— 實測晃 6px 方塊就跑掉一欄、
// 晃 8px 旋轉就完全失效，變成「想轉卻往旁邊滑走」。
const TAP_SLOP_PX = 12;      // 超過這個位移才算「在拖曳」，iOS 的觸控容差約 10px
const TAP_MS = 320;          // 按住超過這麼久就不算點擊
const FLICK_PX = 44;         // 往下甩超過這麼多像素就直接落底
// 實測 320ms 偏緊：真人刻意往下甩常落在 300~400ms，會被誤判成慢速拖曳
const FLICK_MS = 420;
const SOFT_DROP_PX = 28;     // 明顯往下拖才加速
// 軸向鎖定。沒有鎖定的話，按住往下軟降時手指難免橫向飄，方塊就會跟著亂跑。
//
// 不能在剛超過容差的那一刻就決定軸向 —— 那個瞬間的方向雜訊很大，
// 實測「往下拖但橫向飄 12px」會在第一個取樣點被判成橫移。
// 要等某一軸明確拉開 AXIS_COMMIT_PX 才鎖，在那之前只判定「不是點擊」。
const AXIS_COMMIT_PX = 22;
const AXIS_SWITCH_PX = 30;   // 鎖定之後，另一軸要再拉開這麼多才改判

export function bindInput(canvas, game, renderer, onAction) {
  let drag = null;

  const act = () => { if (onAction) onAction(); };

  // 擋掉 iOS 長按叫出的查詢／分享選單。CSS 的 -webkit-touch-callout 擋大部分，
  // 這裡再補一層；pointer 事件不受影響，照常送達
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (game.state !== 'playing') return;
    canvas.setPointerCapture(e.pointerId);
    drag = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: false,
      axis: null,      // 'x' = 橫移，'y' = 軟降
      lockX: 0,        // 鎖定軸向時的座標，用來判斷要不要改判
      lockY: 0,
      // 橫移的基準點。超過容差之後才設，設在「剛超過的那一刻」，
      // 方塊才不會在拖曳開始的瞬間跳一格
      originX: 0,
      originCol: game.pieceX,
    };
    act();
  });

  const commit = (e, axis) => {
    drag.axis = axis;
    drag.lockX = e.clientX;
    drag.lockY = e.clientY;
    drag.originX = e.clientX;
    drag.originCol = game.pieceX;
  };

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= TAP_SLOP_PX) return; // 還在容差內，當作沒動
      drag.moved = true; // 已經不是點擊了，但還不急著決定軸向
    }

    // 等某一軸明確勝出才鎖定，在那之前不移動也不加速
    if (drag.axis === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_COMMIT_PX) return;
      commit(e, Math.abs(dx) > Math.abs(dy) ? 'x' : 'y');
    }

    // 另一軸拉開夠大的距離才改判，並重設基準點，避免改判瞬間跳一大段
    if (drag.axis === 'y' && Math.abs(e.clientX - drag.lockX) > AXIS_SWITCH_PX) {
      game.setSoftDrop(false);
      commit(e, 'x');
    } else if (drag.axis === 'x' && e.clientY - drag.lockY > AXIS_SWITCH_PX) {
      commit(e, 'y');
    }

    if (drag.axis === 'x') {
      const target = drag.originCol + Math.round((e.clientX - drag.originX) / renderer.cell);
      if (target !== game.pieceX) game.moveTo(target);
    } else {
      game.setSoftDrop(dy > SOFT_DROP_PX);
    }
  });

  const end = (e) => {
    if (!drag) return;
    const dt = performance.now() - drag.t;
    const dy = e.clientY - drag.y;

    game.setSoftDrop(false);
    if (!drag.moved && dt < TAP_MS) {
      game.rotate();
    } else if (drag.axis === 'y' && dy > FLICK_PX && dt < FLICK_MS) {
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
