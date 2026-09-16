import test from 'node:test';
import assert from 'node:assert/strict';

import { COLS, ROWS, RISE_MS, RISE_PUSH_MS, FALL_MS, GAP , RISE_MIN_MS, RISE_SCORE_FULL } from '../js/config.js';
import { Board, FILLED, SEAM, HEART_GAP_ROWS, GAP_MODES } from '../js/board.js';
import { PIECES, PIECE_KEYS, createBag } from '../js/pieces.js';
import { Game } from '../js/game.js';

const silentSfx = new Proxy({}, { get: () => () => {} });

function fillRow(board, y) {
  for (let x = 0; x < COLS; x++) board.grid[y][x] = FILLED;
}

// 消行改成一道掃過去的碎裂波，不是瞬間完成。測試要把波跑完才能看結果。
function flushWaves(g) {
  for (let i = 0; i < 2000 && g.waves.length > 0; i++) g.updateWaves(16, 10);
  assert.equal(g.waves.length, 0, '碎裂波沒有在合理時間內跑完');
}

function countFilled(board) {
  let n = 0;
  for (const row of board.grid) for (const v of row) if (v & FILLED) n++;
  return n;
}

test('每種方塊的四個旋轉狀態格數都一樣', () => {
  for (const key of PIECE_KEYS) {
    const counts = PIECES[key].states.map((s) => s.length);
    assert.equal(counts[0], 4, `${key} 應該是四格`);
    assert.deepEqual(counts, [4, 4, 4, 4], `${key} 旋轉後格數變了`);
  }
});

test('旋轉四次會回到原狀', () => {
  for (const key of PIECE_KEYS) {
    const norm = (s) => [...s].map(([x, y]) => `${x},${y}`).sort().join(' ');
    const m = PIECES[key].states;
    assert.equal(norm(m[0]), norm(PIECES[key].states[0]));
    // I 與 O 以外，四個狀態不該全部相同
    if (key !== 'O') assert.notEqual(norm(m[0]), norm(m[1]), `${key} 旋轉沒有效果`);
  }
});

test('7-bag 每七塊出齊一輪', () => {
  const next = createBag();
  for (let round = 0; round < 5; round++) {
    const seen = new Set();
    for (let i = 0; i < 7; i++) seen.add(next());
    assert.equal(seen.size, 7, '同一輪出現重複');
  }
});

test('初始牆面：稜線在合理範圍，底列除了預留空格之外是實心', () => {
  for (let i = 0; i < 40; i++) {
    const b = new Board();
    b.generateWall();

    const depth = b.surfaceDepth();
    assert.ok(depth > 10 && depth < ROWS, `稜線深度異常: ${depth}`);

    const holes = [...b.grid[ROWS - 1]].filter((v) => !(v & FILLED)).length;
    assert.equal(holes, HEART_GAP_ROWS[(ROWS - 1) % HEART_GAP_ROWS.length].length,
      `最底列的愛心空格數異常: ${holes}`);
  }
});

// 空格是「升上來的每一列預先留好」的，不是在既有的牆上挖出來的
test('連續八列空格會拼成一顆像素愛心', () => {
  const b = new Board();
  b.heartCenter = 12;
  b.heartRow = 0;

  for (const expectedOffsets of HEART_GAP_ROWS) {
    const row = b.makeRow();
    const gaps = [];
    for (let x = 0; x < COLS; x++) if (!(row[x] & FILLED)) gaps.push(x - 12);
    assert.deepEqual(gaps, expectedOffsets);
  }
});

test('牆內每一列都符合愛心橫切面的寬度', () => {
  const b = new Board();
  b.generateWall();
  const top = b.columnTops();
  // 只看牆是滿寬的那一段；稜線最深處以上本來就是空的。
  const deepest = Math.max(...top);

  for (let y = deepest + 1; y < ROWS; y++) {
    const holes = [...b.grid[y]].filter((v) => !(v & FILLED)).length;
    const expected = HEART_GAP_ROWS[y % HEART_GAP_ROWS.length].length;
    assert.equal(holes, expected, `第 ${y} 列不是愛心的正確橫切面`);
  }
});

test('簡單關會生成較長直線段，之後才左右換欄', () => {
  const b = new Board(GAP_MODES.STRAIGHT);
  b.straightGapCol = 10;
  b.straightRow = 0;

  for (let i = 0; i < GAP.straightRunRows - 1; i++) {
    const gaps = [...b.makeRow()].flatMap((v, x) => v & FILLED ? [] : [x]);
    assert.deepEqual(gaps, [10], `直線段第 ${i + 1} 列不應提早換欄`);
  }

  const turn = [...b.makeRow()].flatMap((v, x) => v & FILLED ? [] : [x]);
  assert.equal(turn.length, 2, '轉彎列應同時挖開新舊兩欄');
  assert.ok(turn.includes(10));
  assert.equal(Math.abs(b.straightGapCol - 10), 1, '每段結束後只左右移動一欄');

  const continued = [...b.makeRow()].flatMap((v, x) => v & FILLED ? [] : [x]);
  assert.deepEqual(continued, [b.straightGapCol], '換欄後應開始下一段長直線');
});

test('切換關卡會重新生成對應的空格模式', () => {
  const g = new Game(silentSfx, GAP_MODES.HEART);
  g.setLevel(GAP_MODES.STRAIGHT);

  assert.equal(g.level, GAP_MODES.STRAIGHT);
  assert.equal(g.board.gapMode, GAP_MODES.STRAIGHT);
  assert.equal([...g.board.nextRow].filter((v) => !(v & FILLED)).length, 1);
});

test('nextRow 是預先備好的下一列，升上來之後會換一條新的', () => {
  const b = new Board();
  b.generateWall();

  const pending = b.nextRow;
  assert.ok(pending, '應該要先備好下一列');
  assert.ok(pending.some((v) => !(v & FILLED)), '下一列也要預留空格');

  b.rise();
  assert.equal(b.grid[ROWS - 1], pending, '備好的那列應該成為新的底列');
  assert.notEqual(b.nextRow, pending, '升完之後要再備一條新的');
});

// 使用者從實際畫面回報的：架在縫口上、底下是空的那幾格應該要掉下去
test('踩空的格子會沿著縫掉到底', () => {
  const b = new Board();
  b.grid.forEach((r) => r.fill(0));
  for (let y = 30; y < ROWS; y++) fillRow(b, y);
  for (let y = 30; y < 40; y++) b.grid[y][6] = 0; // 一條十格深的縫

  b.grid[29][6] = FILLED; // 架在縫口上
  b.grid[29][7] = FILLED; // 旁邊那格是踩實的

  const moved = b.dropFloaters([[6, 29], [7, 29]]);

  assert.ok(b.grid[39][6] & FILLED, '縫口那格要掉到縫底');
  assert.ok(!(b.grid[29][6] & FILLED), '原位要清空');
  assert.ok(b.grid[29][7] & FILLED, '踩實的那格不該動');
  // 回傳值多帶了「落了幾格」，畫面靠它做落下動畫
  assert.deepEqual(moved.sort(), [[6, 39, 10], [7, 29, 0]].sort());
});

test('dropFloaters 不會把牆體內預留的空格填平', () => {
  const b = new Board();
  b.generateWall();
  const before = countFilled(b);
  const tops = b.columnTops();

  // 只丟稜線上的那幾格進去，牆體內部不該被動到
  b.dropFloaters(tops.map((y, x) => [x, y]).filter(([, y]) => y < ROWS));

  assert.equal(countFilled(b), before, '格數不該改變');
});

// 沒消到列就完全不動；只有消掉之後，那一塊剩下的磚才往下掉
test('沒消到列時，架在縫口上的方塊留在原地不動', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));
  for (let y = 10; y < ROWS; y++) for (let x = 0; x < COLS; x++) b.grid[y][x] = FILLED;
  for (let y = 10; y < 20; y++) b.grid[y][6] = 0;  // 第 6 欄一條深縫
  for (let y = 10; y < 20; y++) b.grid[y][15] = 0; // 另一條，這一落才不會補滿任何一列

  g.piece = 'O';
  g.rot = 0;
  g.pieceX = 5;   // O 在 4x4 裡佔第 1、2 欄 → 實際落在第 6、7 欄
  g.pieceY = 8;
  g.lockPiece();

  assert.equal(g.rowsCleared, 0, '前置條件：這一落不該消到列');
  assert.ok(b.grid[8][6] & FILLED, '架在縫口上的那格要留在原地');
  assert.ok(b.grid[9][6] & FILLED, '架在縫口上的那格要留在原地');
  assert.ok(!(b.grid[19][6] & FILLED), '縫底仍然是空的');
});

test('消掉之後，那一塊剩下的磚才往下掉', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));

  for (let y = 40; y < ROWS; y++) fillRow(b, y);
  for (let y = 40; y < 45; y++) b.grid[y][6] = 0; // 第 6 欄底下有一口豎井
  for (let y = 40; y < 45; y++) b.grid[y][15] = 0; // 保留另一缺口，隔離連鎖消除
  fillRow(b, 39);
  b.grid[39][5] = 0;                              // 第 39 列只差第 5、6 欄
  b.grid[39][6] = 0;

  // O 剛好蓋住那兩個缺口：左半邊踩在實地上，右半邊懸在豎井正上方
  g.piece = 'O';
  g.rot = 0;
  g.pieceX = 4; // O 在 4x4 裡佔第 1、2 欄 → 實際落在第 5、6 欄
  g.pieceY = 38;
  assert.ok(b.fits('O', 0, g.pieceX, g.pieceY), '前置條件：O 應該塞得進去');
  g.lockPiece();

  // 波還沒跑完之前，什麼都不該動
  assert.ok(b.grid[38][6] & FILLED, '波還沒跑完就不該掉');
  flushWaves(g);

  assert.equal(g.rowsCleared, 1, '第 39 列應該被消掉');
  assert.ok(b.grid[39][5] & FILLED, '踩在實地上的那半邊，落下一格後停住');
  assert.ok(b.grid[44][6] & FILLED, '懸在豎井上的那半邊要掉到井底');
  assert.ok(!(b.grid[39][6] & FILLED), '它的原位要清空');
});

// 使用者看了實際畫面之後的修正：留空的橫帶會讓上半面牆懸空、牆永遠不會變矮
test('消掉的列被抽掉，上方的牆整面往下落一格', () => {
  const b = new Board();
  b.grid.forEach((r) => r.fill(0));
  for (let y = ROWS - 5; y < ROWS; y++) fillRow(b, y);
  b.grid[ROWS - 8][3] = FILLED; // 上方一個記號，確認它有跟著落下

  b.collapseRows([ROWS - 3]);

  assert.equal(countFilled(b), COLS * 4 + 1, '應該剛好少掉一整列');
  assert.ok(b.grid[ROWS - 7][3] & FILLED, '記號要往下落一格');
  assert.ok(!(b.grid[ROWS - 8][3] & FILLED), '記號的原位要清空');
  assert.ok(b.grid[ROWS - 1].every((v) => v & FILLED), '被抽掉那列的下方不受影響');
});

test('補滿細縫之後牆會被往下削掉，不會留下懸空的橫帶', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));
  for (let y = 20; y < ROWS; y++) fillRow(b, y);
  for (let y = 20; y < 24; y++) b.grid[y][6] = 0; // 一條四格深的縫
  b.grid[14][0] = FILLED;                         // 牆上方一塊無關的積木

  const before = countFilled(b);

  g.piece = 'I';
  g.rot = 1;          // 直立的 I，正好把那條縫補滿
  g.pieceX = 6 - 2;   // I 旋轉後佔 4x4 的第 2 欄
  g.pieceY = 20;
  assert.ok(b.fits('I', 1, g.pieceX, g.pieceY), '前置條件：I 應該剛好塞得進去');
  g.lockPiece();
  flushWaves(g);

  assert.equal(g.rowsCleared, 4, '四列應該一起消掉');
  assert.equal(countFilled(b), before + 4 - 4 * COLS, '補進四格、抽掉四整列');

  // 牆整面往下落四格：原本在第 14 列的記號現在應該在第 18 列
  assert.ok(b.grid[18][0] & FILLED, '上方的記號要跟著落下四格');
  assert.ok(!(b.grid[14][0] & FILLED), '記號的原位要清空');

  // 牆被往下削掉四層：稜線從第 20 列退到第 24 列，中間不留空帶
  assert.equal(b.columnTops()[1], 24, '牆的稜線應該往下退四格');
  for (let y = 24; y < ROWS; y++) {
    assert.ok(b.grid[y].every((v) => v & FILLED), `第 ${y} 列應該是連續的實心牆`);
  }
});

test('消除後殘磚落下補滿另一列時會觸發連鎖削除', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));

  // 第 54 列由直立 I 的最底格補滿並先消除。
  fillRow(b, 54);
  b.grid[54][0] = 0;

  // 第 55 列也只差同一欄；上列抽掉後，I 的殘磚會落入這格。
  fillRow(b, 55);
  b.grid[55][0] = 0;
  for (let y = 56; y < ROWS; y++) fillRow(b, y);

  g.piece = 'I';
  g.rot = 1;
  g.pieceX = -2; // 直立 I 的實際方格位於局部第 2 欄，所以落在 x=0
  g.pieceY = 51;
  assert.ok(b.fits('I', 1, g.pieceX, g.pieceY));

  g.lockPiece();
  assert.deepEqual(g.waves.map((w) => w.rows), [[54]], '第一波應先削掉第 54 列');

  flushWaves(g);

  assert.equal(g.rowsCleared, 1, '磚塊還在下落時不應先啟動連鎖削除');
  assert.equal(g.waves.length, 0);
  assert.ok(g.falls.length > 0, '第一波結束後應先播放殘磚下落');

  g.updateFalls(FALL_MS * 10);
  assert.deepEqual(g.waves.map((w) => w.rows), [[55]], '落到底後才啟動第二道削除波');
  flushWaves(g);

  assert.equal(g.rowsCleared, 2, '殘磚補滿的第 55 列也應連鎖削除');
  assert.ok(!b.fullRows().includes(55), '連鎖完成後不應殘留滿列');
});

test('fits 會擋住邊界與已填的格子', () => {
  const b = new Board();
  b.grid.forEach((r) => r.fill(0));
  fillRow(b, ROWS - 1);

  assert.ok(b.fits('O', 0, 0, 0), '空中應該放得下');
  // O 在 4x4 裡佔第 1、2 欄，所以要退到 -2 才真的出界
  assert.ok(!b.fits('O', 0, -2, 0), '不該超出左邊界');
  assert.ok(!b.fits('O', 0, COLS - 1, 0), '不該超出右邊界');
  assert.ok(!b.fits('O', 0, 0, ROWS - 1), '不該穿過場地底部');
  assert.ok(!b.fits('O', 0, 0, ROWS - 2), '不該壓進已填的底列');
});

test('hardDrop 會落到 ghost 位置並鎖住', () => {
  const g = new Game(silentSfx);
  g.board.grid.forEach((r) => r.fill(0));
  g.spawn();
  const before = g.score;
  const key = g.piece;
  const target = g.ghostY;
  g.hardDrop();

  assert.equal(g.piece, null, 'hardDrop 之後應該等待下一塊');
  assert.equal(g.score, before, '落定本身不給分，分數只來自碎裂波');
  const cells = PIECES[key].states[0];
  const maxCy = Math.max(...cells.map(([, cy]) => cy));
  assert.equal(target + maxCy, ROWS - 1, '應該落到最底');
});

// 迴歸：初始牆面稜線以下本來就整排實心，第一塊落定不可以把整面牆掃掉
test('第一塊落定不會引發整面牆崩塌', () => {
  for (let i = 0; i < 30; i++) {
    const g = new Game(silentSfx);
    const preexisting = g.board.fullRows().length;
    // 預留空格讓大部分列都差一格，滿列會很少，但盤面不該因此被掃掉
    assert.ok(preexisting >= 0);

    const before = countFilled(g.board);
    g.hardDrop();
    const after = countFilled(g.board);

    // 直條掉進細縫最多一次補滿四列，但絕不該把整面牆掃掉
    assert.ok(g.rowsCleared <= 4, `一塊消掉的列數異常: ${g.rowsCleared}`);
    assert.ok(after >= before - 4 * COLS, `牆面掉了太多格: ${before} -> ${after}`);
  }
});

test('只有被這一塊補滿的列會消，其它既有的滿列不動', () => {
  const b = new Board();
  b.grid.forEach((r) => r.fill(0));
  fillRow(b, ROWS - 1);          // 既有滿列，不該被碰
  fillRow(b, ROWS - 2);
  b.grid[ROWS - 2][3] = 0;       // 只差這一格

  const wasFull = b.fullRowMask();
  assert.equal(wasFull[ROWS - 1], true, '最底列落定前就是滿的');
  assert.equal(wasFull[ROWS - 2], false, '倒數第二列落定前還缺一格');

  b.grid[ROWS - 2][3] = FILLED;
  assert.deepEqual(b.newlyFullRows(wasFull), [ROWS - 2], '只有剛補滿的那列該消');
});

test('補滿稜線上的一列，該列會消掉且總格數減少一列', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));
  for (let y = ROWS - 4; y < ROWS; y++) fillRow(b, y);
  const target = ROWS - 5;
  fillRow(b, target);
  for (let x = 0; x < 4; x++) b.grid[target][x] = 0; // 留一個 I 型的缺口

  const before = countFilled(b);
  g.piece = 'I';
  g.rot = 0;
  g.pieceX = 0;
  g.pieceY = target - 1; // I 的方塊在第 1 列
  g.lockPiece();
  flushWaves(g);

  assert.equal(g.rowsCleared, 1);
  assert.equal(countFilled(b), before + 4 - COLS, '補進四格、消掉一整列');
  assert.ok(b.grid[ROWS - 5].every((v) => !(v & FILLED)), '最上面那列應該空了');
});

// 影片實測到的第三件事：牆會自己往上長，連玩家沒碰過的欄位也一樣
test('牆會定時往上長一列，整面一起升', () => {
  const g = new Game(silentSfx);
  // 隔離：不讓落下的方塊與細縫補裂污染稜線
  g.piece = null;
  g.spawnTimer = Infinity;
  const before = g.board.columnTops();

  g.step(RISE_MS, 10);

  const after = g.board.columnTops();
  for (let x = 0; x < COLS; x++) {
    assert.equal(after[x], before[x] - 1, `第 ${x} 欄沒有跟著升`);
  }
  const holes = [...g.board.grid[ROWS - 1]].filter((v) => !(v & FILLED)).length;
  assert.ok(HEART_GAP_ROWS.some((offsets) => offsets.length === holes),
    `長出來的那列要帶著愛心橫切面，實際 ${holes} 個空格`);
});

test('牆頂到天花板就結束', () => {
  const g = new Game(silentSfx);
  for (let x = 0; x < COLS; x++) g.board.grid[0][x] = FILLED;

  assert.equal(g.board.rise(), true, '被推出頂端的那列有磚，應該回報溢出');
  g.board.grid[0][0] = FILLED;
  g.step(RISE_MS, 10);
  assert.equal(g.state, 'over');
});

test('落下中的方塊會跟著牆一起被往上推，不會被牆吃掉', () => {
  const g = new Game(silentSfx);
  g.piece = 'O';
  g.rot = 0;
  g.pieceX = 5;
  g.pieceY = 6;

  g.updateRise(RISE_MS); // 直接測上升本身，不要讓重力一起作用

  assert.equal(g.pieceY, 5, '方塊要跟著往上移一格');
  assert.ok(g.board.fits(g.piece, g.rot, g.pieceX, g.pieceY), '推完之後不該卡在牆裡');
});

// 分數是碎裂波邊掃邊加的，不是整列一個固定值
test('碎裂波由左往右掃，分數隨著波前進逐步累加', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));
  for (let y = ROWS - 3; y < ROWS; y++) fillRow(b, y);
  const target = ROWS - 4;
  fillRow(b, target);
  for (let x = 0; x < 4; x++) b.grid[target][x] = 0;

  const before = countFilled(b);
  g.piece = 'I';
  g.rot = 0;
  g.pieceX = 0;
  g.pieceY = target - 1;
  g.lockPiece();

  assert.equal(g.waves.length, 1, '應該起一道碎裂波');
  assert.equal(g.rowsCleared, 0, '波還沒掃完，還不算消掉');

  const snaps = [];
  for (let i = 0; i < 6 && g.waves.length > 0; i++) {
    g.updateWaves(80, 10);
    snaps.push({ x: Math.round(g.waves[0]?.x ?? COLS), score: g.score });
  }

  for (let i = 1; i < snaps.length; i++) {
    assert.ok(snaps[i].score > snaps[i - 1].score,
      `分數應該隨波前進持續增加: ${JSON.stringify(snaps)}`);
  }

  flushWaves(g);
  assert.equal(g.rowsCleared, 1, '波掃完才算消掉');
  assert.equal(countFilled(b), before + 4 - COLS, '補進四格、抽掉一整列');
});

// 磚塊落下改成動畫：邏輯立刻結算，畫面用偏移量插值
test('落下會產生動畫偏移，而且會收斂到零', () => {
  const g = new Game(silentSfx);
  const b = g.board;
  b.grid.forEach((r) => r.fill(0));
  for (let y = 40; y < ROWS; y++) fillRow(b, y);
  b.grid[30][3] = FILLED; // 懸空一格，等一下會掉九格（第 30 列 → 第 39 列）

  g.startFall(b.dropFloaters([[3, 30]]));
  assert.equal(g.falls.length, 1, '應該起一段落下動畫');

  // 格子狀態立刻就是落點，畫面才是慢慢補上
  assert.ok(b.grid[39][3] & FILLED, '邏輯上已經在落點了');
  const key = 39 * COLS + 3;
  let prev = g.fallOffsets().get(key);
  assert.ok(prev > 5, `一開始應該還差很多格: ${prev}`);

  for (let i = 0; i < 4; i++) {
    g.updateFalls(60);
    const off = g.fallOffsets();
    const now = off ? off.get(key) ?? 0 : 0;
    assert.ok(now < prev, `偏移量應該持續縮小: ${prev} -> ${now}`);
    prev = now;
  }

  g.updateFalls(FALL_MS * 4); // 掉九格的時長是 FALL_MS*√9 = 3 倍
  assert.equal(g.falls.length, 0, '動畫應該結束');
  assert.equal(g.fallOffsets(), null, '結束後不該再有偏移');
});

test('掉得越遠，落下動畫越久（∝√距離）', () => {
  const near = new Game(silentSfx);
  const far = new Game(silentSfx);

  const setup = (g, fromY) => {
    const b = g.board;
    b.grid.forEach((r) => r.fill(0));
    for (let y = 40; y < ROWS; y++) fillRow(b, y);
    b.grid[fromY][3] = FILLED;
    g.falls = [];
    g.startFall(b.dropFloaters([[3, fromY]]));
    return g.falls[0].dur;
  };

  const short = setup(near, 38); // 掉 1 格（第 38 列 → 第 39 列）
  const long = setup(far, 30);   // 掉 9 格（第 30 列 → 第 39 列）

  assert.ok(long > short * 2.5, `掉遠的要明顯久一點: ${short} vs ${long}`);
  assert.ok(Math.abs(long / short - 3) < 1e-6, `比例應該是 √9 = 3，實際 ${long / short}`);
});

test('沒有實際位移的格子不會產生動畫', () => {
  const g = new Game(silentSfx);
  g.falls = [];
  g.startFall([[3, 40, 0], [4, 40, 0]]);
  assert.equal(g.falls.length, 0);
});

// 上升的位移集中在換列前那段時間，平常不動 —— 平均速度不變但看得見
test('上升位移平常是零，接近換列時才推上去', () => {
  const g = new Game(silentSfx);

  g.riseProgress = 0;
  assert.equal(g.riseOffset, 0, '一格剛開始時畫面不該動');

  g.riseProgress = 1 - (RISE_PUSH_MS / RISE_MS) - 0.01;
  assert.equal(g.riseOffset, 0, '推進開始前仍然不動');

  const mid = [];
  for (let i = 1; i <= 4; i++) {
    g.riseProgress = 1 - (RISE_PUSH_MS / RISE_MS) * (1 - i / 5);
    mid.push(g.riseOffset);
  }
  for (let i = 1; i < mid.length; i++) {
    assert.ok(mid[i] > mid[i - 1], `推進中位移要單調增加: ${mid}`);
  }

  g.riseProgress = 1;
  assert.ok(Math.abs(g.riseOffset - 1) < 1e-6, '換列的瞬間剛好推滿一格，接得起來');
});

// 改成計時遊玩時間：時間只會往上累加，不再是結束條件
// 上升速度綁分數：消得越兇，壓力升得越快
test('上升週期隨分數縮短，到上限後固定在最快', () => {
  const g = new Game(silentSfx);

  g.score = 0;
  assert.equal(g.riseMs, RISE_MS, '零分時是開局週期');

  g.score = RISE_SCORE_FULL;
  assert.equal(g.riseMs, RISE_MIN_MS, '到門檻就收斂到最快');

  g.score = RISE_SCORE_FULL * 10;
  assert.equal(g.riseMs, RISE_MIN_MS, '超過門檻不會再更快');

  let prev = Infinity;
  for (let i = 0; i <= 10; i++) {
    g.score = (RISE_SCORE_FULL / 10) * i;
    assert.ok(g.riseMs <= prev, `週期不該回升: ${prev} -> ${g.riseMs}`);
    prev = g.riseMs;
  }
});

test('高分時牆升得比低分時頻繁', () => {
  const countRises = (score) => {
    const g = new Game(silentSfx);
    g.piece = null;
    g.spawnTimer = Infinity;
    let rises = 0;
    const realRise = g.board.rise.bind(g.board);
    g.board.rise = () => { rises++; return realRise(); };
    for (let i = 0; i < 600; i++) { g.score = score; g.step(50, 10); }
    return rises;
  };

  const low = countRises(0);
  const high = countRises(RISE_SCORE_FULL);
  assert.ok(high > low * 2, `高分該升得明顯更頻繁: 低分 ${low} 次 vs 高分 ${high} 次`);
});

test('時間只會累加，不會因為時間而結束', () => {
  const g = new Game(silentSfx);
  assert.equal(g.elapsed, 0, '開局是從零開始計時');

  g.piece = null;
  g.spawnTimer = Infinity;
  for (let i = 0; i < 20; i++) g.step(1000, 10);

  assert.ok(g.elapsed >= 19, `時間應該累加到約 20 秒，實際 ${g.elapsed}`);
  assert.equal(g.state, 'playing', '時間本身不該讓遊戲結束');
});

test('唯一的結束條件是牆頂到最上方', () => {
  const g = new Game(silentSfx);
  g.elapsed = 9999; // 就算玩很久也不該因此結束
  g.step(16, 10);
  assert.equal(g.state, 'playing');

  for (let x = 0; x < COLS; x++) g.board.grid[0][x] = FILLED;
  g.board.rise();
  g.board.grid[0][0] = FILLED;
  g.riseProgress = 0.999;
  g.step(RISE_MS, 10);
  assert.equal(g.state, 'over', '牆頂到最上方才結束');
});

test('一整局跑完不會爆，而且盤面始終合法', () => {
  const g = new Game(silentSfx);
  let guard = 0;
  while (g.state === 'playing' && guard++ < 60000) {
    if (guard % 7 === 0) g.rotate();
    if (guard % 11 === 0) g.move(1);
    if (guard % 13 === 0) g.move(-1);
    if (guard % 23 === 0) g.hardDrop();
    g.step(16, 10);
    assert.equal(g.board.grid.length, ROWS);
  }
  assert.equal(g.state, 'over', '一局應該會結束');
  assert.ok(g.score >= 0);
});
