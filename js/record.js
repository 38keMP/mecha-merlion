'use strict';

/* =========================================================
   記録モード(マーライオン_record_plan.md)
   実際の飲み会で、自分が飲んでいる間だけ器を長押しして記録する。
   記録は localStorage に保存し、練習モードの数値と提案に使う。
   ゲーム側(js/ の他のファイル)の描画・状態(state)・お品書きを共有する。
   ========================================================= */
const RECORD_KEY_PREFIX = 'maerlion_record_v1_';
const REC_DEFAULT_ML_PER_SEC = 20;
const REC_AUTO_CLOSE_MS = 6 * 3600 * 1000;     // 最後の入力からこれだけ空いたら、その回は終わったとみなす
const REC_CHECKIN_MS = 30 * 60 * 1000;         // 酔いの自己申告を聞く間隔
const REC_STEP_MS = 60 * 1000;                 // 推定ゲージの計算刻み(1分)
const REC_TAIL_MS = 3 * 3600 * 1000;           // 最後に飲んだ後、遅れて回る分を見届ける長さ
const REC_PACE_WINDOW_MS = 30 * 60 * 1000;
const REC_SUGGEST_COOLDOWN_MS = 10 * 60 * 1000;
const REC_SUGGEST_SHOW_MS = 5 * 60 * 1000;     // 提案の帯を出しておく長さ(タップでも消せる)
const REC_STORE_SOFT_LIMIT = 4 * 1024 * 1024;  // これを超えたら古い回を軽くする
const MIN_SESSIONS_FOR_PACE = 3;
const MIN_SESSIONS_FOR_PROFILE = 5;
const DEFAULT_DELAY_MIN = 45;
const DECAY_G_PER_H_AT_60KG = 7;               // 体重60kgで1時間に約7g分解する

const OUTCOMES = {
  stopped: '自分で切り上げた',
  sick: '気持ち悪くなった',
  mareLion: 'マーライオンになった',
  unknown: '覚えていない',
};
const BAD_OUTCOMES = ['sick', 'mareLion'];
const VESSEL_COLORS = {
  beer: '#f2a81d', water: '#8fd3f4', shochu: '#d9e6ea', wine: '#9b1d3a', sake: '#efe6c4', chuhai: '#e9f2b0',
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ---------- 保存 ---------- */
function emptyRecordStore() {
  return {
    settings: { mlPerSec: REC_DEFAULT_ML_PER_SEC, weightKg: null },
    drinks: [],     // マイドリンク
    lastUsed: {},   // drinkId → 最後に注文した時刻(お品書きの並び順に使う)
    sessions: [],
    activeId: null, // 記録中の回
    profile: null,  // 推定した個人の数値
  };
}
function loadRecordStore(userId) {
  try {
    return { ...emptyRecordStore(), ...JSON.parse(localStorage.getItem(RECORD_KEY_PREFIX + userId) || '{}') };
  } catch {
    return emptyRecordStore();
  }
}

const rec = {
  store: null,
  session: null,       // 記録中の回
  hold: null,          // 長押し中 {startAt, startMl}
  endingId: null,      // 終わり方を聞いている回
  estG: 0,             // 推定ゲージ(g)
  lastEstAt: 0,
  shownAt: {},         // 提案の種類 → 最後に出した時刻
  toastMsg: '', toastTimer: 0,
  wakeLock: null,
};

function saveRecordStore() {
  let json = JSON.stringify(rec.store);
  if (json.length > REC_STORE_SOFT_LIMIT) {
    compactOldSessions(rec.store);
    json = JSON.stringify(rec.store);
  }
  try {
    localStorage.setItem(RECORD_KEY_PREFIX + currentUser.id, json);
  } catch {
    showRecToast('保存できませんでした(端末の保存容量が足りない可能性があります)');
  }
}

// 古い回から、長押しの記録を30分ごとの合計にまとめて軽くする
function compactOldSessions(store) {
  const old = store.sessions.filter(s => s.endedAt && !s.compacted).slice(0, 20);
  old.forEach(s => {
    const buckets = new Map();
    s.holds.forEach(h => {
      const k = Math.floor((h.startAt - s.startedAt) / REC_PACE_WINDOW_MS);
      const b = buckets.get(k) || { ml: 0, grams: 0 };
      b.ml += h.ml;
      b.grams += h.grams;
      buckets.set(k, b);
    });
    s.holds = [...buckets].map(([k, b]) => {
      const at = s.startedAt + k * REC_PACE_WINDOW_MS + REC_PACE_WINDOW_MS / 2;
      return { id: uuid(), drinkId: 'agg', startAt: at, endAt: at, ml: b.ml, grams: b.grams };
    });
    s.compacted = true;
  });
}

// マイドリンクを、お品書き(DRINKS)に登録する
function registerCustomDrinks(store) {
  store.drinks.forEach(c => {
    DRINKS[c.id] = {
      id: c.id, name: c.name, abv: c.abv, serving: 'マイドリンク', glassMl: c.ml,
      vessel: c.vessel, color: VESSEL_COLORS[c.vessel], amount: pureAlcoholG(c.ml, c.abv), custom: true,
    };
  });
}

/* ---------- 推定ゲージ(純アルコールg)のモデル ----------
   飲んだ分は「遅延」の2/3〜4/3の間に均等に吸収され(ゲームの遅延±1/3と同じ考え方)、
   体重に比例した一定の速さで分解される。 */
function intakesOf(session, extra) {
  const list = session.holds
    .filter(h => h.grams > 0)
    .map(h => ({ t: (h.startAt + h.endAt) / 2 - session.startedAt, g: h.grams }));
  if (extra) list.push(extra);
  return list;
}
function decayFor(weightKg) {
  return weightKg ? (weightKg * DECAY_G_PER_H_AT_60KG) / 60 : DECAY_G_PER_H_AT_60KG;
}
function simulateGrams(intakes, model, endMs) {
  const from = model.delayMin * 60000 * (2 / 3), span = model.delayMin * 60000 * (2 / 3);
  const decayPerStep = (model.decayGPerH * REC_STEP_MS) / 3600000;
  const series = [];
  let g = 0, prevAbs = 0;
  for (let t = 0; t <= endMs + REC_STEP_MS; t += REC_STEP_MS) {
    let abs = 0;
    for (const i of intakes) abs += i.g * Math.min(1, Math.max(0, (t - i.t - from) / span));
    g = Math.max(0, g + (abs - prevAbs) - decayPerStep);
    prevAbs = abs;
    series.push(g);
  }
  return series;
}
function seriesAt(series, ms) {
  const f = Math.max(0, ms) / REC_STEP_MS;
  const i = Math.min(series.length - 1, Math.floor(f));
  const j = Math.min(series.length - 1, i + 1);
  return series[i] + (series[j] - series[i]) * (f - i);
}
const cumulativeAt = (intakes, ms) => intakes.reduce((s, i) => s + (i.t <= ms ? i.g : 0), 0);
const sessionSpan = s => (s.endedAt || Date.now()) - s.startedAt;
const sessionGrams = s => s.holds.reduce((a, h) => a + h.grams, 0);
const completedSessions = store => store.sessions.filter(s => s.endedAt && s.outcome);

function median(xs) {
  if (!xs.length) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

function currentModel(store, weightKg) {
  const p = store.profile;
  return {
    delayMin: p && p.ready ? p.delayMin : DEFAULT_DELAY_MIN,
    decayGPerH: decayFor(weightKg ?? store.settings.weightKg),
  };
}

// 終わり方が入力済みの回から、個人の数値(遅延・限界・安全ライン・分解速度)を推定する
function computeProfile(store) {
  const done = completedSessions(store);
  const prof = { sessionsUsed: done.length, ready: done.length >= MIN_SESSIONS_FOR_PROFILE, updatedAt: Date.now() };
  prof.decayGPerH = decayFor(store.settings.weightKg);

  // 遅延: 酔いの自己申告と、いちばんよく合う遅延を15〜90分から選ぶ
  let bestDelay = DEFAULT_DELAY_MIN, bestR = -Infinity;
  for (let d = 15; d <= 90; d += 5) {
    const xs = [], ys = [];
    done.forEach(s => {
      if (!s.checkins.length) return;
      const ser = simulateGrams(intakesOf(s), { delayMin: d, decayGPerH: decayFor(s.weightKg) }, sessionSpan(s));
      s.checkins.forEach(c => {
        xs.push(seriesAt(ser, c.at - s.startedAt));
        ys.push(c.level);
      });
    });
    if (xs.length < 4) break;
    const r = pearson(xs, ys);
    if (r > bestR) {
      bestR = r;
      bestDelay = d;
    }
  }
  prof.delayMin = bestDelay;
  prof.delayFromCheckins = bestR > -Infinity;

  // 限界と安全ライン: 各回の推定ゲージの最大値を、終わり方ごとに見る
  const peaks = done.map(s => ({
    outcome: s.outcome,
    peak: Math.max(0, ...simulateGrams(intakesOf(s), { delayMin: bestDelay, decayGPerH: decayFor(s.weightKg) }, sessionSpan(s) + REC_TAIL_MS)),
  }));
  const bad = peaks.filter(p => BAD_OUTCOMES.includes(p.outcome)).map(p => p.peak);
  const safe = peaks.filter(p => p.outcome === 'stopped').map(p => p.peak);
  prof.safeG = safe.length ? Math.max(...safe) : null;
  prof.limitFromOutcome = bad.length > 0;
  prof.limitG = bad.length ? Math.max(20, Math.min(...bad)) : Math.max(STANDARD_LIMIT_G, (prof.safeG || 0) * 1.1);
  store.profile = prof;
}

/* ---------- ペースの提案(記録モードと練習モードで共通) ---------- */
function paceSuggestions(intakes, elapsedMs, store, estG) {
  const past = completedSessions(store).filter(s => s.holds.length && s.id !== store.activeId);
  if (past.length < MIN_SESSIONS_FOR_PACE) return [];
  const out = [];
  const pastI = past.map(s => ({ s, i: intakesOf(s) }));
  const cur = cumulativeAt(intakes, elapsedMs);
  const curWin = cur - cumulativeAt(intakes, elapsedMs - REC_PACE_WINDOW_MS);

  const medWin = median(pastI.map(p => cumulativeAt(p.i, elapsedMs) - cumulativeAt(p.i, elapsedMs - REC_PACE_WINDOW_MS)));
  if (curWin >= 10 && curWin > 1.5 * Math.max(medWin, 5)) {
    out.push({ key: 'fast', short: 'いつもより早いペースです', text: `いつもより早いペースです(直近30分で${Math.round(curWin)}g。いつもは約${Math.round(medWin)}g)` });
  }
  const pastCum = pastI.map(p => cumulativeAt(p.i, elapsedMs));
  if (cur >= UNIT_G && pastCum.filter(v => v < cur).length / pastCum.length >= 0.9) {
    out.push({ key: 'top10', short: 'これまでの記録の上位10%の速さです', text: `これまでの記録の上位10%の速さです(${fmtDuration(elapsedMs)}で${Math.round(cur)}g)` });
  }
  const badCum = pastI.filter(p => BAD_OUTCOMES.includes(p.s.outcome)).map(p => cumulativeAt(p.i, elapsedMs)).filter(v => v > 0);
  if (badCum.length && cur >= 0.9 * Math.min(...badCum)) {
    out.push({ key: 'bad', short: '前に気持ち悪くなった日と同じペースです', text: '前に気持ち悪くなった日と同じくらいのペースです' });
  }
  const prof = store.profile;
  if (prof && prof.ready && prof.safeG && estG > prof.safeG) {
    out.push({ key: 'safe', short: 'いつもの安全ラインを超えました', text: 'いつもの安全ラインを超えました。お水を挟みましょう' });
  }
  return out;
}

// 同じ提案は10分以内に繰り返さない
function pickSuggestion(list, shownAt, now) {
  const s = list.find(x => !(now - (shownAt[x.key] ?? -Infinity) < REC_SUGGEST_COOLDOWN_MS));
  if (s) shownAt[s.key] = now;
  return s || null;
}

/* ---------- 練習モードへの反映(js/game.js・js/results.js から呼ぶ) ---------- */
function personalGameParams(userId) {
  const p = loadRecordStore(userId).profile;
  if (!p || !p.ready) return null;
  const pointsPerG = 100 / p.limitG;
  return {
    pointsPerG,
    delayMs: p.delayMin * 1000,          // ゲーム内1秒 = 実時間1分
    jitterMs: (p.delayMin * 1000) / 3,
    decayPerMs: (p.decayGPerH * pointsPerG) / 60000,
    personal: { limitG: p.limitG },
  };
}

function suggestDuringPractice() {
  if (!state.practiceRec) {
    const store = loadRecordStore(currentUser.id);
    state.practiceRec = { store, shownAt: {}, lastCheck: -Infinity };
  }
  const pr = state.practiceRec;
  if (state.survivalMs - pr.lastCheck < 1000) return; // ゲーム内1秒(実時間1分)ごと
  pr.lastCheck = state.survivalMs;
  const realMs = state.survivalMs * PARTY_COMPRESSION;
  const intakes = state.intakeLog.map(i => ({ t: i.tMs * PARTY_COMPRESSION, g: i.grams }));
  const s = pickSuggestion(paceSuggestions(intakes, realMs, pr.store, state.gauge / state.params.pointsPerG), pr.shownAt, realMs);
  if (s) {
    state.suggestMsg = s.short;
    state.suggestTimer = 3500;
  }
}

// 結果のグラフに重ねる、直近の実際の飲み会の推移(練習モードのみ)
function realSessionGhost(params) {
  if (!currentUser || state.mode !== 'practice') return null;
  const store = loadRecordStore(currentUser.id);
  const s = [...completedSessions(store)].reverse().find(x => x.holds.length);
  if (!s) return null;
  const series = simulateGrams(intakesOf(s), currentModel(store, s.weightKg), GAME_MS * PARTY_COMPRESSION);
  return tGameMs => seriesAt(series, tGameMs * PARTY_COMPRESSION) * params.pointsPerG;
}

function drawSuggestBanner(ctx, w, text) {
  drawPixelRect(ctx, 10, 54, w - 20, 18, 'rgba(226,69,44,0.92)');
  drawPixelRect(ctx, 10, 54, w - 20, 1, '#ffd76a');
  ctx.fillStyle = '#fff8e7';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`⚠ ${text}`, w / 2, 67);
}

/* ---------- 表示用 ---------- */
function fmtDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function fmtClock(ts) {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
Object.assign(screens, {
  recordStart: document.querySelector('[data-screen="recordStart"]'),
  record: document.querySelector('[data-screen="record"]'),
  recordEnd: document.querySelector('[data-screen="recordEnd"]'),
  recordReview: document.querySelector('[data-screen="recordReview"]'),
  recordList: document.querySelector('[data-screen="recordList"]'),
});
const recordCanvas = $('recordCanvas');
const recCtx = recordCanvas.getContext('2d');
const recReviewChart = $('recReviewChart');

function layoutRecordCanvases() {
  const width = window.innerWidth >= 700 ? 440 : 240;
  if (recordCanvas.width !== width) {
    recordCanvas.width = width;
    recCtx.imageSmoothingEnabled = false;
  }
  recordCanvas.style.maxWidth = `${Math.floor((window.innerHeight * 0.55 * recordCanvas.width) / recordCanvas.height)}px`;
  document.querySelector('[data-screen="record"] .hud').style.maxWidth = recordCanvas.style.maxWidth;
}
layoutRecordCanvases();
window.addEventListener('resize', layoutRecordCanvases);
const recStageX = () => Math.round((recordCanvas.width - STAGE_W) / 2);

function showRecToast(msg) {
  rec.toastMsg = msg;
  rec.toastTimer = 2500;
}

/* ---------- 開始画面 ---------- */
function lastActivity(s) {
  return Math.max(
    s.startedAt,
    ...s.holds.map(h => h.endAt),
    ...s.orders.map(o => o.at),
    ...s.checkins.map(c => c.at),
  );
}

// 最後の入力から6時間何もなければ、その回は終わったものとして閉じる(終わり方は後で聞く)
function closeStaleSession(store) {
  const s = store.sessions.find(x => x.id === store.activeId);
  if (!s) {
    store.activeId = null;
    return;
  }
  const last = lastActivity(s);
  if (Date.now() - last > REC_AUTO_CLOSE_MS) {
    s.endedAt = last;
    s.current = null;
    s.updatedAt = Date.now();
    store.activeId = null;
  }
}

function showRecordStart() {
  rec.store = loadRecordStore(currentUser.id);
  registerCustomDrinks(rec.store);
  closeStaleSession(rec.store);
  saveRecordStore();

  const pending = rec.store.sessions.filter(s => s.endedAt && !s.outcome).length;
  $('recPending').hidden = pending === 0;
  $('recPending').innerHTML = pending
    ? `終わり方が未入力の回が<b>${pending}回</b>あります。<button class="link-btn" id="recPendingBtn">記録の一覧で入力する</button>`
    : '';
  if (pending) $('recPendingBtn').addEventListener('click', showRecordList);

  const active = rec.store.sessions.find(s => s.id === rec.store.activeId);
  $('recResumeBtn').hidden = !active;
  if (active) $('recResumeBtn').textContent = `続きから再開する(${fmtClock(active.startedAt)}開始)`;
  $('recStartBtn').textContent = active ? '新しく飲み会をはじめる' : '飲み会をはじめる';
  $('recWeight').value = rec.store.settings.weightKg ?? '';
  $('recSpeed').value = rec.store.settings.mlPerSec;
  $('recMemo').value = '';
  showScreen('recordStart');
}

function readStartSettings() {
  const w = parseFloat($('recWeight').value);
  rec.store.settings.weightKg = w >= 20 && w <= 200 ? w : null;
  const sp = parseFloat($('recSpeed').value);
  rec.store.settings.mlPerSec = sp >= 5 && sp <= 50 ? sp : REC_DEFAULT_ML_PER_SEC;
}

function startNewSession() {
  readStartSettings();
  const prev = rec.store.sessions.find(s => s.id === rec.store.activeId);
  if (prev) {
    if (!confirm('記録中の回があります。その回を終わりにして、新しく始めますか?')) return;
    prev.endedAt = lastActivity(prev);
    prev.current = null;
    prev.updatedAt = Date.now();
  }
  const now = Date.now();
  const session = {
    id: uuid(), startedAt: now, endedAt: null, outcome: null,
    memo: $('recMemo').value.trim(), weightKg: rec.store.settings.weightKg,
    holds: [], orders: [], checkins: [], current: null, updatedAt: now,
  };
  rec.store.sessions.push(session);
  rec.store.activeId = session.id;
  saveRecordStore();
  enterRecordScreen(session);
}

function resumeSession() {
  readStartSettings();
  saveRecordStore();
  enterRecordScreen(rec.store.sessions.find(s => s.id === rec.store.activeId));
}

/* ---------- 記録画面 ---------- */
function enterRecordScreen(session) {
  rec.session = session;
  rec.hold = null;
  rec.shownAt = {};
  rec.lastEstAt = 0;
  // 卓上の器の演出は、ゲームの状態(state)を借りて描く
  state = createInitialState();
  state.mode = 'record';
  state.introMs = INTRO_MS;
  state.served = session.current;
  $('recSuggest').hidden = true;
  $('recMenu').hidden = true;
  showScreen('record');
  requestWakeLock();
  updateRecordEstimate(true);
  showRecToast(session.current ? '器を長押しして飲む' : 'まずは注文表から1杯頼もう');
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) rec.wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    rec.wakeLock = null;
  }
}
function releaseWakeLock() {
  if (rec.wakeLock) rec.wakeLock.release().catch(() => {});
  rec.wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentScreen === 'record') requestWakeLock();
});

const drinkDef = id => DRINKS[id];

function startRecHold() {
  const cur = rec.session && rec.session.current;
  if (currentScreen !== 'record' || rec.hold || !cur || cur.ml <= 0 || state.dropMs > 0) return;
  rec.hold = { startAt: Date.now(), startMl: cur.ml };
  state.heldId = cur.id;
  state.holdMs = 0;
}

function endRecHold() {
  if (!rec.hold) return;
  const cur = rec.session.current;
  const ml = rec.hold.startMl - cur.ml;
  if (ml >= 1) {
    rec.session.holds.push({
      id: uuid(), orderId: cur.orderId, drinkId: cur.id,
      startAt: rec.hold.startAt, endAt: Date.now(), ml, grams: pureAlcoholG(ml, drinkDef(cur.id).abv),
    });
    rec.session.updatedAt = Date.now();
  } else {
    cur.ml = rec.hold.startMl; // ほんの一瞬触れただけなら記録しない
  }
  rec.hold = null;
  state.heldId = null;
  saveRecordStore();
  updateRecordEstimate(true);
}

function undoLastHold() {
  if (!rec.session || rec.hold) return;
  const last = rec.session.holds.pop();
  if (!last) {
    showRecToast('戻せる記録がありません');
    return;
  }
  const cur = rec.session.current;
  if (cur && cur.orderId === last.orderId) {
    cur.ml = Math.min(drinkDef(cur.id).glassMl, cur.ml + last.ml);
  } else if (!cur && rec.session.orders.length && rec.session.orders[rec.session.orders.length - 1].id === last.orderId) {
    // 飲み干して下げられた器を、卓上に戻す
    rec.session.current = { orderId: last.orderId, id: last.drinkId, ml: last.ml };
    state.served = rec.session.current;
    state.emptyMs = 0;
  }
  rec.session.updatedAt = Date.now();
  saveRecordStore();
  updateRecordEstimate(true);
  showRecToast(`ひと押し戻しました(${Math.round(last.ml)}ml)`);
}

function orderRecDrink(id) {
  const s = rec.session;
  const cur = s.current;
  if (cur && cur.ml > 0) {
    if (!confirm(`${drinkDef(cur.id).name}の残りは${Math.ceil(cur.ml)}mlです。残して次を頼みますか?`)) return;
    const prevOrder = s.orders.find(o => o.id === cur.orderId);
    if (prevOrder) prevOrder.leftMl = Math.round(cur.ml);
  }
  const now = Date.now();
  const order = { id: uuid(), drinkId: id, at: now, leftMl: null };
  s.orders.push(order);
  s.current = { orderId: order.id, id, ml: drinkDef(id).glassMl };
  s.updatedAt = now;
  rec.store.lastUsed[id] = now;
  const custom = rec.store.drinks.find(c => c.id === id);
  if (custom) custom.lastUsedAt = now;
  saveRecordStore();

  state.served = s.current;
  state.dropMs = DROP_MS;
  state.lift = 0;
  state.emptyMs = 0;
  $('recMenu').hidden = true;
  showRecToast(`${drinkDef(id).name}が来た!飲んでいる間だけ長押し`);
}

function openRecMenu() {
  const list = $('recMenuList');
  const ids = [...MENU.map(m => m.id), ...rec.store.drinks.map(c => c.id)];
  ids.sort((a, b) => (rec.store.lastUsed[b] || 0) - (rec.store.lastUsed[a] || 0));
  list.innerHTML = '';
  ids.forEach(id => {
    const d = drinkDef(id);
    const btn = document.createElement('button');
    btn.className = 'rec-menu-item';
    btn.innerHTML = `
      <span class="swatch" style="background:${d.color}"></span>
      <span class="name">${escapeHtml(d.name)}${d.custom ? '<small>マイドリンク</small>' : ''}</span>
      <span class="spec">${d.abv}% ${d.glassMl}ml<br><small>${d.abv > 0 ? `純アルコール約${Math.round(d.amount)}g` : '酔いは変わらない'}</small></span>`;
    btn.addEventListener('click', () => orderRecDrink(id));
    list.appendChild(btn);
  });
  updateCustomPreview();
  $('recMenu').hidden = false;
}

function updateCustomPreview() {
  const abv = parseFloat($('cdAbv').value), ml = parseFloat($('cdMl').value);
  $('cdPreview').textContent = abv >= 0 && ml > 0
    ? `純アルコール約${Math.round(pureAlcoholG(ml, abv))}g(${(pureAlcoholG(ml, abv) / UNIT_G).toFixed(1)}単位)`
    : '度数と量を入れると、純アルコール量を計算します';
}

function saveCustomDrink() {
  const name = $('cdName').value.trim();
  const abv = parseFloat($('cdAbv').value), ml = parseFloat($('cdMl').value);
  if (!name || !(abv >= 0 && abv <= 96) || !(ml >= 10 && ml <= 2000)) {
    $('cdPreview').textContent = '名前、度数(0〜96%)、量(10〜2000ml)を入れてください';
    return;
  }
  const now = Date.now();
  const drink = { id: 'c_' + uuid(), name, abv, ml, vessel: $('cdVessel').value, custom: true, lastUsedAt: now, updatedAt: now };
  rec.store.drinks.push(drink);
  registerCustomDrinks(rec.store);
  $('cdName').value = $('cdAbv').value = $('cdMl').value = '';
  orderRecDrink(drink.id);
}

// 推定ゲージと HUD の数値(1秒ごと、長押しの区切りでは即時)
function updateRecordEstimate(force) {
  const now = Date.now();
  if (!force && now - rec.lastEstAt < 1000) return;
  rec.lastEstAt = now;
  const s = rec.session;
  const elapsed = now - s.startedAt;
  let extra = null;
  if (rec.hold) {
    const ml = rec.hold.startMl - s.current.ml;
    extra = { t: (rec.hold.startAt + now) / 2 - s.startedAt, g: pureAlcoholG(ml, drinkDef(s.current.id).abv) };
  }
  const intakes = intakesOf(s, extra);
  rec.estG = seriesAt(simulateGrams(intakes, currentModel(rec.store), elapsed), elapsed);
  const total = cumulativeAt(intakes, elapsed);
  const pace = total - cumulativeAt(intakes, elapsed - REC_PACE_WINDOW_MS);
  $('recElapsed').textContent = fmtDuration(elapsed);
  $('recGrams').textContent = `${Math.round(total)}g`;
  $('recPace').textContent = `${Math.round(pace)}g`;

  // 30分ごとの酔いの自己申告
  const slot = Math.floor(elapsed / REC_CHECKIN_MS);
  const answered = s.checkins.some(c => c.at >= s.startedAt + slot * REC_CHECKIN_MS);
  $('recCheckin').hidden = slot < 1 || answered;

  // ペースの提案
  const sug = pickSuggestion(paceSuggestions(intakes, elapsed, rec.store, rec.estG), rec.shownAt, now);
  if (sug) {
    $('recSuggest').textContent = `⚠ ${sug.text}`;
    $('recSuggest').hidden = false;
    rec.suggestHideAt = now + REC_SUGGEST_SHOW_MS;
  } else if (rec.suggestHideAt && now > rec.suggestHideAt) {
    $('recSuggest').hidden = true;
  }
}

function answerCheckin(level) {
  rec.session.checkins.push({ id: uuid(), at: Date.now(), level });
  rec.session.updatedAt = Date.now();
  saveRecordStore();
  $('recCheckin').hidden = true;
  showRecToast('記録しました');
}

// js/app.js のメインループから毎フレーム呼ぶ
function updateRecord(dt) {
  if (rec.toastTimer > 0) rec.toastTimer -= dt;
  $('recToast').textContent = rec.toastTimer > 0 ? rec.toastMsg : '';
  if (!rec.session) return;
  animateTableItems(dt);
  const cur = rec.session.current;
  if (rec.hold && cur) {
    // 長押し中は一定の速さで減る。手元のグラスに合うまで押し続けて合わせる
    cur.ml = Math.max(0, rec.hold.startMl - ((Date.now() - rec.hold.startAt) / 1000) * rec.store.settings.mlPerSec);
    if (cur.ml <= 0) {
      endRecHold();
      state.emptyMs = EMPTY_CLEAR_MS;
      showRecToast(`${drinkDef(cur.id).name}を飲み干した!次は注文表から`);
    }
  }
  // 飲み干した器が下げられたら、卓上は空になる
  if (!state.served && rec.session.current) {
    rec.session.current = null;
    saveRecordStore();
  }
  updateRecordEstimate(false);
}

function renderRecord(t) {
  const ctx = recCtx;
  const w = recordCanvas.width, h = recordCanvas.height;
  if (!rec.session) return;
  drawIzakayaScene(ctx, w, h, t, Math.max(2, Math.round(w / 110)));

  const limitG = rec.store.profile && rec.store.profile.ready ? rec.store.profile.limitG : STANDARD_LIMIT_G;
  const gauge = (rec.estG / limitG) * 100;
  drawGaugeBar(ctx, w, gauge, `推定ゲージ ${Math.round(rec.estG)}g / 限界の目安 ${Math.round(limitG)}g`, '10px monospace');

  const stageX = recStageX();
  drawSideFriends(ctx, w, h, stageX, t);
  ctx.save();
  ctx.translate(stageX, 0);
  drawMerlionAndTable(ctx, h, Math.min(gauge, 95), t, true, true);
  ctx.restore();
}

/* ---------- 終わり方・振り返り ---------- */
function endRecordSession() {
  if (!rec.session) return;
  if (!confirm('今日の記録を終わりにしますか?')) return;
  endRecHold();
  const s = rec.session;
  const cur = s.current;
  if (cur && cur.ml > 0) {
    const order = s.orders.find(o => o.id === cur.orderId);
    if (order) order.leftMl = Math.round(cur.ml);
  }
  s.current = null;
  s.endedAt = Date.now();
  s.updatedAt = s.endedAt;
  rec.store.activeId = null;
  saveRecordStore();
  releaseWakeLock();
  rec.endingId = s.id;
  rec.session = null;
  showScreen('recordEnd');
}

function setOutcome(sessionId, outcome) {
  const s = rec.store.sessions.find(x => x.id === sessionId);
  if (!s) return;
  s.outcome = outcome || null;
  s.updatedAt = Date.now();
  computeProfile(rec.store);
  saveRecordStore();
}

function showRecordReview(sessionId) {
  const store = rec.store;
  const s = store.sessions.find(x => x.id === sessionId);
  const model = currentModel(store, s.weightKg);
  const span = sessionSpan(s);
  const series = simulateGrams(intakesOf(s), model, span + REC_TAIL_MS);
  const peak = Math.max(0, ...series);
  const peakMin = series.indexOf(peak);
  const grams = sessionGrams(s);
  const units = grams / UNIT_G;

  // 頼んだもの
  const counts = {};
  s.orders.forEach(o => {
    const name = drinkDef(o.drinkId) ? drinkDef(o.drinkId).name : '不明';
    counts[name] = (counts[name] || 0) + 1;
  });
  const left = s.orders.reduce((a, o) => a + (o.leftMl || 0), 0);
  const orderText = Object.entries(counts).map(([n, c]) => `${escapeHtml(n)} ${c}杯`).join('、') || 'なし';

  const moderation = units <= MODERATE_MAX_UNITS
    ? '適量の目安(1日1〜2単位)の範囲内でした。'
    : `適量の目安(1日1〜2単位 = 20〜40g)の<b>約${(units / MODERATE_MAX_UNITS).toFixed(1)}〜${units.toFixed(1)}倍</b>です。`;

  const past = completedSessions(store).filter(x => x.id !== s.id);
  let compare = '';
  if (past.length) {
    const avg = past.reduce((a, x) => a + sessionGrams(x), 0) / past.length;
    const firstHour = cumulativeAt(intakesOf(s), 3600000);
    const medFirst = median(past.map(x => cumulativeAt(intakesOf(x), 3600000)));
    compare = `これまで(${past.length}回)の平均は約<b>${Math.round(avg)}g</b>。最初の1時間は<b>${Math.round(firstHour)}g</b>(いつもは約${Math.round(medFirst)}g)。`;
  }

  const prof = store.profile;
  const done = completedSessions(store).length;
  const profText = prof && prof.ready
    ? `あなた専用の数値: 限界 約<b>${Math.round(prof.limitG)}g</b>${prof.limitFromOutcome ? '' : '(まだ気持ち悪くなった記録がないため仮の値)'}、遅延 約<b>${prof.delayMin}分</b>${prof.delayFromCheckins ? '' : '(自己申告が少ないため標準の値)'}、分解 約${prof.decayGPerH.toFixed(1)}g/時。練習モードに反映されています。`
    : `あと<b>${Math.max(0, MIN_SESSIONS_FOR_PROFILE - done)}回</b>記録すると(終わり方の入力が必要)、練習モードがあなた専用の数値になります。${done < MIN_SESSIONS_FOR_PACE ? `ペースの提案は${MIN_SESSIONS_FOR_PACE}回目から始まります。` : ''}`;

  // 「マーライオンになった」が続いている場合は、休むことを優先して案内する
  const recent = completedSessions(store).slice(-3);
  const repeatedBad = recent.filter(x => x.outcome === 'mareLion').length >= 2;

  $('recReviewTitle').textContent = s.outcome ? OUTCOMES[s.outcome] : '今日の記録';
  $('recReviewBody').innerHTML = `
    <div>${fmtDate(s.startedAt)} ${fmtClock(s.startedAt)}〜${fmtClock(s.endedAt)}(${fmtDuration(span)})${s.memo ? ` ・ ${escapeHtml(s.memo)}` : ''}</div>
    <div class="score-line">純アルコール ${Math.round(grams)}g(${units.toFixed(1)}単位)</div>
    <div>頼んだもの: ${orderText}${left ? `(残した分 ${left}ml)` : ''}</div>
    <div>推定ゲージのピーク: <b>${Math.round(peak)}g</b>(${fmtClock(s.startedAt + peakMin * REC_STEP_MS)}ごろ)</div>
    <div style="margin-top:8px;">${moderation}</div>
    ${compare ? `<div style="margin-top:8px;">${compare}</div>` : ''}
    <div style="margin-top:8px;">${profText}</div>
    ${repeatedBad ? '<div style="margin-top:8px;color:#ffb703;">最近「マーライオンになった」が続いています。しばらくは量を控えめにし、お水を挟む・早めに切り上げるなど、体を休めることを優先してください。</div>' : ''}
    <div class="tip">推定ゲージと提案は、簡易なモデルによる目安であり、医学的な診断ではありません。<br>意識がない人が吐いているときは窒息の危険があります。横向きに寝かせ、呼吸を確かめ、迷わず救急車を呼んでください。</div>
  `;
  drawRecordChart(recReviewChart, s, series, model);
  showScreen('recordReview');
}

// 振り返りのグラフ: 今日の推定ゲージ(緑)と、これまでの回(薄い線)、限界と安全ライン
function drawRecordChart(canvas, s, series, model) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawPixelRect(ctx, 0, 0, w, h, '#2b1b3d');
  const store = rec.store;
  const prof = store.profile;
  const limitG = prof && prof.ready ? prof.limitG : STANDARD_LIMIT_G;
  const pad = 16;
  const maxMin = series.length - 1;
  const maxG = Math.max(limitG * 1.2, ...series);
  const xAt = m => pad + (m / maxMin) * (w - pad * 2);
  const yAt = g => h - pad - (Math.min(g, maxG) / maxG) * (h - pad * 2);
  const hline = (g, color) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(pad, yAt(g));
    ctx.lineTo(w - pad, yAt(g));
    ctx.stroke();
  };
  hline(limitG, '#e2452caa');
  if (prof && prof.ready && prof.safeG) hline(prof.safeG, '#ffb70388');

  completedSessions(store).filter(x => x.id !== s.id).slice(-5).forEach(x => {
    const ser = simulateGrams(intakesOf(x), model, maxMin * REC_STEP_MS);
    ctx.strokeStyle = '#8a84b066';
    ctx.beginPath();
    ser.forEach((g, m) => (m ? ctx.lineTo(xAt(m), yAt(g)) : ctx.moveTo(xAt(m), yAt(g))));
    ctx.stroke();
  });

  ctx.strokeStyle = '#7fd858';
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((g, m) => (m ? ctx.lineTo(xAt(m), yAt(g)) : ctx.moveTo(xAt(m), yAt(g))));
  ctx.stroke();
  ctx.lineWidth = 1;

  // 帰った時刻
  const endM = sessionSpan(s) / REC_STEP_MS;
  ctx.save();
  ctx.strokeStyle = '#f5ecd7aa';
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(xAt(endM), pad);
  ctx.lineTo(xAt(endM), h - pad);
  ctx.stroke();
  ctx.restore();

  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fd858';
  ctx.fillText('― 今日', pad, 12);
  ctx.fillStyle = '#8a84b0';
  ctx.fillText('― これまで', pad + 44, 12);
  ctx.fillStyle = '#e2452c';
  ctx.fillText('― 限界', pad + 112, 12);
}

/* ---------- 記録の一覧 ---------- */
function showRecordList() {
  if (!rec.store) rec.store = loadRecordStore(currentUser.id);
  registerCustomDrinks(rec.store);
  computeProfile(rec.store);
  saveRecordStore();
  renderRecordProfile();

  const body = $('recListBody');
  body.innerHTML = '';
  const sessions = [...rec.store.sessions].reverse();
  if (!sessions.length) body.innerHTML = '<p class="rec-note">まだ記録がありません。</p>';
  sessions.forEach(s => {
    const card = document.createElement('div');
    card.className = 'rec-card';
    const live = s.id === rec.store.activeId;
    card.innerHTML = `
      <div class="rec-card-head">
        <b>${fmtDate(s.startedAt)} ${fmtClock(s.startedAt)}〜${s.endedAt ? fmtClock(s.endedAt) : '記録中'}</b>
        <span>${Math.round(sessionGrams(s))}g(${(sessionGrams(s) / UNIT_G).toFixed(1)}単位)</span>
      </div>
      <label>終わり方
        <select ${live ? 'disabled' : ''}>
          <option value="">未入力</option>
          ${Object.entries(OUTCOMES).map(([k, v]) => `<option value="${k}" ${s.outcome === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>メモ<input type="text" maxlength="40" value="${escapeHtml(s.memo || '')}"></label>
      <div class="rec-card-actions">
        ${s.endedAt ? '<button class="link-btn" data-act="view">振り返り</button>' : ''}
        ${live ? '' : '<button class="link-btn danger" data-act="del">削除</button>'}
      </div>`;
    card.querySelector('select').addEventListener('change', e => {
      setOutcome(s.id, e.target.value);
      renderRecordProfile();
    });
    card.querySelector('input').addEventListener('change', e => {
      s.memo = e.target.value.trim();
      s.updatedAt = Date.now();
      saveRecordStore();
    });
    const view = card.querySelector('[data-act="view"]');
    if (view) view.addEventListener('click', () => showRecordReview(s.id));
    const del = card.querySelector('[data-act="del"]');
    if (del) {
      del.addEventListener('click', () => {
        if (!confirm('この回の記録を削除しますか?(元に戻せません)')) return;
        rec.store.sessions = rec.store.sessions.filter(x => x.id !== s.id);
        computeProfile(rec.store);
        saveRecordStore();
        showRecordList();
      });
    }
    body.appendChild(card);
  });
  showScreen('recordList');
}

function renderRecordProfile() {
  const p = rec.store.profile;
  const done = completedSessions(rec.store).length;
  $('recProfile').innerHTML = p && p.ready
    ? `あなた専用の数値(${done}回分の記録から推定): 限界 約<b>${Math.round(p.limitG)}g</b>、安全ライン ${p.safeG ? `約${Math.round(p.safeG)}g` : 'まだなし'}、遅延 約<b>${p.delayMin}分</b>、分解 約${p.decayGPerH.toFixed(1)}g/時`
    : `終わり方が入力済みの記録: <b>${done}回</b>。${MIN_SESSIONS_FOR_PACE}回でペースの提案、${MIN_SESSIONS_FOR_PROFILE}回で練習モードがあなた専用の数値になります。`;
}

/* ---------- イベント ---------- */
$('modeRecordBtn').addEventListener('click', showRecordStart);
$('recStartBtn').addEventListener('click', startNewSession);
$('recResumeBtn').addEventListener('click', resumeSession);
$('recListBtn').addEventListener('click', showRecordList);
$('recBackBtn').addEventListener('click', showModeScreen);
$('recUndoBtn').addEventListener('click', undoLastHold);
$('recEndBtn').addEventListener('click', endRecordSession);
$('recMenuClose').addEventListener('click', () => { $('recMenu').hidden = true; });
$('recMenu').addEventListener('click', e => {
  if (e.target === $('recMenu')) $('recMenu').hidden = true;
});
$('recSuggest').addEventListener('click', () => { $('recSuggest').hidden = true; });
$('cdSaveBtn').addEventListener('click', saveCustomDrink);
['cdAbv', 'cdMl'].forEach(id => $(id).addEventListener('input', updateCustomPreview));
document.querySelectorAll('#recCheckin [data-level]').forEach(b => {
  b.addEventListener('click', () => answerCheckin(Number(b.dataset.level)));
});
document.querySelectorAll('#recOutcomeBtns [data-outcome]').forEach(b => {
  b.addEventListener('click', () => {
    setOutcome(rec.endingId, b.dataset.outcome);
    showRecordReview(rec.endingId);
  });
});
$('recOutcomeLater').addEventListener('click', () => showRecordReview(rec.endingId));
$('recReviewListBtn').addEventListener('click', showRecordList);
$('recReviewBackBtn').addEventListener('click', showModeScreen);
$('recListBackBtn').addEventListener('click', showRecordStart);

recordCanvas.addEventListener('pointerdown', e => {
  const p = canvasPoint(recordCanvas, e);
  const item = tableItemAt(p.x - recStageX(), p.y);
  if (!item) return;
  e.preventDefault();
  if (item === 'menu') openRecMenu();
  else startRecHold();
});
window.addEventListener('pointerup', endRecHold);
window.addEventListener('pointercancel', endRecHold);
