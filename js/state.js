'use strict';

// 1プレイごとの状態(state)、画面の DOM 参照、画面の切り替え

/* =========================================================
   ラウンド状態(ユーザー/モードとは別に、1プレイごとに作り直す)
   ========================================================= */
function createInitialState() {
  return {
    mode: null, // 'score' | 'practice' | 'record'
    params: standardGameParams(),
    gauge: 0,
    queue: [],
    absorbedTotal: 0,
    survivalMs: 0,
    dangerMs: 0,

    heldId: null,
    holdAccumMs: 0,
    holdMs: 0,
    activeSession: null,      // 進行中の飲酒(アルコール)セッション
    activeWaterSession: null, // 進行中のお水セッション

    drinkEvents: [],  // 完了した飲酒セッション {name, tMs, amount, glassEq, pendingAtDrink}
    waterEvents: [],  // 完了したお水セッション {tMs, holdMs}
    intakeLog: [],    // 一口ごとの摂取ログ {tMs, amount} (標準モデル算出用)
    gaugeHistory: [], // {tMs, gauge}
    lastSampleMs: 0,

    ended: false,
    stopping: false, // 飲むのをやめた(やめた/お開き)後、残りの遅延反応を早送りで消化中
    stoppedByTimeUp: false,
    stopAtMs: null,      // 飲むのをやめた時刻
    gaugeAtStop: 0,      // やめた時点のゲージ
    peakAfterStop: null, // やめた後に遅れて回ってきた分によるピーク {tMs, gauge}
    fatalAtMs: null,     // マーライオンになった時刻
    endedReason: null, // 'mareLion' | 'stopped'
    fatalName: null,
    fatalWhileStopping: false,
    finalScore: 0,
    paceBonus: 0,
    isNewHighScore: false,
    summary: null,

    served: null,        // 卓上に届いている1杯 {id, ml}(注文するまでは何もない)
    emptyMs: 0,          // 飲み干した器が下げられるまでの残り時間
    drinksFinished: 0,   // 飲み干したお酒の杯数
    menuOpen: false,     // 注文表を開いているか
    menuHover: -1,       // 注文表でポインタが乗っている行
    lift: 0,             // 器を持ち上げている度合い(0=卓上、1=口元で傾けている)
    dropMs: 0,           // 注文した1杯が上から置かれる演出の残り時間
    burstMs: 0,                      // マーライオン(バースト)してからの経過時間
    introMs: 0,          // 入店アニメーションの経過時間(INTRO_MS に達するまで時間は進まない)
    replay: null,        // やめた後の早送り再生 {fromMs, toMs, elapsed, duration, done}

    toastMsg: '',
    toastTimer: 0,
    suggestMsg: '',   // 記録と比べたペースの提案(練習モード)
    suggestTimer: 0,
    resultAnimMs: 0,
  };
}
let state = createInitialState();
let currentScreen = 'title';

/* ---------- dom refs ---------- */
const screens = {
  title: document.querySelector('[data-screen="title"]'),
  user: document.querySelector('[data-screen="user"]'),
  mode: document.querySelector('[data-screen="mode"]'),
  game: document.querySelector('[data-screen="game"]'),
  result: document.querySelector('[data-screen="result"]'),
  report: document.querySelector('[data-screen="report"]'),
};
const titleCanvas = document.getElementById('titleCanvas');
const gameCanvas = document.getElementById('gameCanvas');
const resultCanvas = document.getElementById('resultCanvas');
const resultChartCanvas = document.getElementById('resultChart');
const reportChartCanvas = document.getElementById('reportChart');

const userListEl = document.getElementById('userList');
const newUserNameInput = document.getElementById('newUserName');
const currentUserNameSpan = document.getElementById('currentUserName');

const hudLabel1 = document.getElementById('hudLabel1');
const hudVal1 = document.getElementById('hudVal1');
const hudLabel3 = document.getElementById('hudLabel3');
const hudVal3 = document.getElementById('hudVal3');
const timeVal = document.getElementById('timeVal');
const toastEl = document.getElementById('toast');

const resultTitleEl = document.getElementById('resultTitle');
const resultBodyEl = document.getElementById('resultBody');

const reportTitleEl = document.getElementById('reportTitle');
const reportStatsEl = document.getElementById('reportStats');

/* ---------- screen switching ---------- */
function showScreen(name) {
  currentScreen = name;
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}
