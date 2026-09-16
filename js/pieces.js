// 七種方塊，用字串矩陣定義，旋轉時就地轉置
const DEFS = {
  I: ['....', '####', '....', '....'],
  O: ['.##.', '.##.', '....', '....'],
  T: ['.#.', '###', '...'],
  S: ['.##', '##.', '...'],
  Z: ['##.', '.##', '...'],
  J: ['#..', '###', '...'],
  L: ['..#', '###', '...'],
};

function toMatrix(rows) {
  return rows.map((r) => [...r].map((c) => (c === '#' ? 1 : 0)));
}

function rotateCW(m) {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

// 產生四個旋轉狀態，順便存好每個狀態的實際佔格座標
function buildRotations(rows) {
  const states = [];
  let m = toMatrix(rows);
  for (let i = 0; i < 4; i++) {
    const cells = [];
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) if (m[y][x]) cells.push([x, y]);
    }
    states.push(cells);
    m = rotateCW(m);
  }
  return states;
}

export const PIECES = Object.fromEntries(
  Object.entries(DEFS).map(([k, rows]) => [k, { size: rows.length, states: buildRotations(rows) }]),
);

export const PIECE_KEYS = Object.keys(DEFS);

// 旋轉卡住時依序嘗試的水平位移
export const KICKS = [0, -1, 1, -2, 2];

// 7-bag：保證每七塊出齊一輪，不會連續餓同一種
export function createBag() {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = [...PIECE_KEYS];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}
