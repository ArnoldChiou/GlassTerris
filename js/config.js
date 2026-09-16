// 所有會影響玩法的數值集中在這裡。改動就提 VERSION（踩雷手冊 §6.8）
export const VERSION = '0.12.0';

// 場地
// 影片實測：參考版的格子邊長正好 12px、遊戲區約 408x719，回推就是 34x60
export const COLS = 34;
export const ROWS = 60;

// 牆從底部長出新的一列、整面往上推 —— 這是這個遊戲真正的壓力來源。
//
// 影片實測就是 5 秒一列。畫面用次格位移連續爬升，換算成每秒 cell/5 ≈ 2.4 像素 ——
// 這個速度是「盯著看才感覺得到」的等級。想讓上升更明顯就調小這個值，
// 但它同時是難度旋鈕：一局 180 秒會多長出幾列牆。
export const RISE_MS = 5000;
// 上升的位移集中在換列前的這段時間內推完，其餘時間畫面不動。
// 把一格 12px 平均攤在 5 秒裡等於每秒 2.4px，肉眼看不見；
// 集中在 0.6 秒就是每秒 20px，看得出來在推 —— 平均速度與難度完全不變
export const RISE_PUSH_MS = 600;

// 上升會隨分數加速：分數 0 時是 RISE_MS，到 RISE_SCORE_FULL 時收斂到 RISE_MIN_MS。
// 綁分數而不是綁時間，因為分數才代表玩家真的在推進 —— 卡住不消行的人不會被額外懲罰，
// 消得越兇的人壓力升得越快，一場自然會收尾
export const RISE_MIN_MS = 1800;
export const RISE_SCORE_FULL = 2500;

// 沒有時間限制，唯一的結束條件是磚塊頂到最上方；畫面上的時間是累計遊玩時間。
// 這個值只剩下「難度爬升的參考長度」：下落速度在這段時間內從 GRAVITY_MS 收到 GRAVITY_MIN_MS
export const RAMP_SECONDS = 180;

// 落下節奏（毫秒）
// 620ms 一格的話一塊要掉快 9 秒，一局只出得了 20 塊。240ms 約 3.5 秒一塊、一局 50 塊
export const GRAVITY_MS = 240;
export const GRAVITY_MIN_MS = 120;      // 隨時間加速的下限
export const GRAVITY_RAMP = 0.75;       // 一局結束時的速度倍率
export const SOFT_DROP_MS = 45;
export const LOCK_DELAY_MS = 320;
export const SPAWN_DELAY_MS = 90;

// 計分
// 影片實測：方塊落地時分數完全不動（40.0~41.6 秒一直是 1300），
// 只有碎裂波在跑的時候才跳。所以落定與 hard drop 都不給分
export const SCORE_LOCK = 0;
// 消行的分數是碎裂波「每摧毀一塊磚」即時累加的，不是整列一個固定值。
// 影片實測：一次消除過程中分數是 1309 → 1345 → 1377 這樣邊掃邊跳，
// 全程加約 77 分、一列 34 塊磚，回推每塊約 2 分
export const SCORE_PER_BRICK = 2;
export const WAVE_COLS_PER_SEC = 48;    // 碎裂波由左往右掃過去的速度
// 磚塊落下「一格」的動畫長度；掉越遠總時間越長（∝√距離），跟真的重力一樣。
// 固定時長的話掉十格跟掉一格一樣快，看起來像被甩下去。
// 邏輯是立刻結算的，這個值只影響畫面插值
export const FALL_MS = 200;
export const SCORE_HARD_DROP_PER_CELL = 0;

// 初始牆面：從底往上疊到一條凹凸的稜線
// 輪廓照影片：兩側高、中央低。但深度比影片深很多 ——
// 影片那幾格是遊戲中期（分數已經 1000、貼文寫 Level 5），牆早就被墊高了。
// 開局要留夠空間，「每 RISE_MS 升一列」才不會幾十秒就把玩家頂死。
export const WALL = {
  minDepth: 26,         // 稜線離場地頂端最少幾格
  maxDepth: 42,         // 最多幾格
  startDepth: 36,       // 中央起始深度
  stepChance: 0.5,      // 每一欄變動高度的機率
  bigStepChance: 0.06,  // 變動時一次走兩格的機率
  edgeLift: 10,         // 兩側往上抬幾格（參考圖是兩側高、中間低）
  maxStep: 1,           // 相鄰兩欄的落差上限，避免出現孤立的尖刺
};

// 空格不是在既有的牆上挖出來的，而是由連續 8 列拼成像素愛心。
export const GAP = {
  straightRunRows: 12, // 簡單關每段直線空槽維持的列數，之後才左右換一欄
  heartHalfWidth: 4, // 愛心最寬 9 格，中心左右各 4 格
  shiftChance: 0.75, // 每顆新愛心左右位移的機率
  maxShift: 2,       // 每次最多移動幾欄
};

// 結束條件：稜線頂到這個深度以內就算輸
export const TOP_OUT_DEPTH = 2;
