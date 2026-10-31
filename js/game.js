'use strict';

// ユーザー/モード選択と、ゲームの進行(飲む・注文・早送り・時間を進める・HUD)

/* =========================================================
   ユーザー選択 / モード選択
   ========================================================= */
function renderUserList() {
  const users = loadUsers();
  userListEl.innerHTML = '';
  users.forEach(u => {
    const btn = document.createElement('button');
    btn.className = 'user-chip';
    btn.textContent = u.name;
    btn.addEventListener('click', () => selectUser(u));
    userListEl.appendChild(btn);
  });
}

function showUserScreen() {
  renderUserList();
  newUserNameInput.value = '';
  showScreen('user');
}

function showModeScreen() {
  currentUserNameSpan.textContent = currentUser.name;
  showScreen('mode');
}

function selectUser(user) {
  currentUser = user;
  setCurrentUserId(user.id);
  showModeScreen();
}

function handleCreateUser() {
  const name = newUserNameInput.value.trim();
  if (!name) return;
  const user = createUser(name);
  selectUser(user);
}

/* =========================================================
   ゲームプレイ
   ========================================================= */
function enterGame(mode) {
  state = createInitialState();
  state.mode = mode;
  // 練習モードは、記録モードの記録が十分にあれば「あなた専用」の数値で遊ぶ(record.js)
  if (mode === 'practice') state.params = personalGameParams(currentUser.id) || standardGameParams();

  if (mode === 'score') {
    hudLabel1.textContent = 'SCORE';
    hudLabel3.textContent = 'BEST';
    hudVal1.textContent = '0';
    hudVal3.textContent = String(getHighScore(currentUser.id));
  } else {
    hudLabel1.textContent = 'DRINKS';
    hudLabel3.textContent = '危険帯(秒)';
    hudVal1.textContent = '0';
    hudVal3.textContent = '0';
  }
  showScreen('game');
}

function canAct() {
  return currentScreen === 'game' && !state.ended && !state.stopping && !isIntroPlaying();
}

// 卓上に届いている1杯を長押しして飲む
function startHold() {
  if (!canAct() || state.heldId || !state.served || state.served.ml <= 0) return;
  const id = state.served.id;
  state.heldId = id;
  state.holdAccumMs = 0;
  state.holdMs = 0;

  if (!isAlcohol(id)) {
    state.activeWaterSession = { startTMs: state.survivalMs, holdMs: 0 };
  } else {
    state.activeSession = {
      id,
      name: DRINKS[id].name,
      startTMs: state.survivalMs,
      gaugeAtStart: state.gauge,
      pendingAtStart: state.queue.reduce((s, q) => s + q.amount, 0),
      amount: 0,
      grams: 0,
    };
  }
  // 一口目は、器を口元まで運び終えてから(update)
}

function stopHold() {
  if (!state.heldId) return;
  const id = state.heldId;
  state.heldId = null;

  if (state.ended) {
    state.activeSession = null;
    state.activeWaterSession = null;
    return;
  }

  if (!isAlcohol(id) && state.activeWaterSession) {
    if (state.activeWaterSession.holdMs > 0) {
      state.waterEvents.push({
        tMs: state.activeWaterSession.startTMs,
        holdMs: state.activeWaterSession.holdMs,
      });
    }
    state.activeWaterSession = null;
  } else if (state.activeSession) {
    const s = state.activeSession;
    if (s.amount > 0) {
      state.drinkEvents.push({
        name: s.name,
        tMs: s.startTMs,
        gaugeAtDrink: s.gaugeAtStart,
        pendingAtDrink: s.pendingAtStart,
        amount: s.amount,
        glassEq: s.grams / UNIT_G,
      });
    }
    state.activeSession = null;
  }
}

function performSip(id) {
  const d = DRINKS[id];
  const served = state.served;
  if (!isAlcohol(id)) {
    if (state.activeWaterSession) state.activeWaterSession.holdMs += POUR_TICK_MS;
    served.ml -= d.mlPerSec * (POUR_TICK_MS / 1000);
  } else {
    // 1杯を飲むのにかかる時間は、どのお酒でも同じ(長押しで加速)。純アルコール量はお酒ごとに違う
    const glassFrac = glassRateAt(state.holdMs) * (POUR_TICK_MS / 1000);
    const grams = glassFrac * d.amount;
    const tickAmount = grams * state.params.pointsPerG;
    const jitter = (Math.random() * 2 - 1) * state.params.jitterMs;
    state.queue.push({ amount: tickAmount, remaining: state.params.delayMs + jitter, name: d.name });
    state.intakeLog.push({ tMs: state.survivalMs, amount: tickAmount, grams });
    if (state.activeSession) {
      state.activeSession.amount += tickAmount;
      state.activeSession.grams += grams;
    }
    served.ml -= glassFrac * d.glassMl;
  }

  if (served.ml > 0) {
    showToast(`${d.name}を飲んでいる…(残り${Math.ceil(served.ml)}ml${isAlcohol(id) ? '' : '・酔いは変わりません'})`);
    return;
  }
  // 飲み干したら器を下げる。次は注文表から頼む
  served.ml = 0;
  state.emptyMs = EMPTY_CLEAR_MS;
  if (isAlcohol(id)) state.drinksFinished++;
  showToast(isAlcohol(id)
    ? `ぷはー!${d.name}を飲み干した!(${state.drinksFinished}杯目)次は注文表から`
    : 'お水を飲み干した。次は注文表から');
  stopHold();
}

// 注文表から頼んだ1杯が、上から「ドン!」と卓に置かれる。置かれるまでは飲めない
function orderDrink(id) {
  if (!canAct() || (state.served && state.served.ml > 0)) return;
  state.served = { id, ml: DRINKS[id].glassMl };
  state.emptyMs = 0;
  state.dropMs = DROP_MS;
  state.lift = 0;
  state.menuOpen = false;
  showToast(`${DRINKS[id].name}(${DRINKS[id].serving})が来た!長押しで飲む`);
}

function toggleMenu() {
  if (!canAct()) return;
  if (state.served && state.served.ml > 0 && !state.menuOpen) {
    showToast('まずは今の1杯を飲み干してから注文しよう');
    return;
  }
  state.menuOpen = !state.menuOpen;
}

function showToast(msg) {
  state.toastMsg = msg;
  state.toastTimer = 1400;
}

// 飲むのをやめたら(「今日はここまで」/お開き)、残っている遅延反応を待たずに早送りで消化し、
// 「その後どうなったか」まで含めた結果をすぐに確定する。
function stopDrinking(timeUp = false) {
  if (currentScreen !== 'game' || state.ended || state.stopping || isIntroPlaying()) return;
  stopHold();
  state.menuOpen = false;
  state.stopping = true;
  state.stoppedByTimeUp = timeUp;
  state.stopAtMs = state.survivalMs;
  state.gaugeAtStop = state.gauge;
  state.peakAfterStop = { tMs: state.survivalMs, gauge: state.gauge };

  while (!state.ended && state.queue.length > 0) {
    stepWorld(GAUGE_SAMPLE_INTERVAL_MS);
    if (state.gauge > state.peakAfterStop.gauge) {
      state.peakAfterStop = { tMs: state.survivalMs, gauge: state.gauge };
    }
  }

  // 計算した「その後」を、ゲーム画面上で早送りアニメーションとして再生してから結果へ進む
  const span = state.survivalMs - state.stopAtMs;
  state.replay = {
    fromMs: state.stopAtMs,
    toMs: state.survivalMs,
    elapsed: 0,
    duration: Math.min(REPLAY_MAX_MS, Math.max(REPLAY_MIN_MS, span * REPLAY_MS_PER_GAME_MS)),
    done: false,
  };
  if (!state.ended) endGame('stopped');
}

function isIntroPlaying() {
  return state.introMs < INTRO_MS;
}

// 早送り再生中に画面へ出す時刻
function replayTimeMs() {
  const r = state.replay;
  const f = Math.min(1, r.elapsed / r.duration);
  return r.fromMs + (r.toMs - r.fromMs) * f;
}

// 画面に表示する酔いゲージ(早送り再生中は記録をたどる)
function displayedGauge() {
  if (!state.replay || state.replay.done) return state.gauge;
  const t = replayTimeMs();
  const hist = state.gaugeHistory;
  for (let i = 1; i < hist.length; i++) {
    if (hist[i].tMs >= t) {
      const a = hist[i - 1], b = hist[i];
      const f = b.tMs > a.tMs ? (t - a.tMs) / (b.tMs - a.tMs) : 1;
      return a.gauge + (b.gauge - a.gauge) * f;
    }
  }
  return state.gauge;
}

function computeScore() {
  return Math.round(state.absorbedTotal);
}

function buildPracticeSummary(reason) {
  const events = state.drinkEvents;
  const totalGlassEq = events.reduce((s, e) => s + e.glassEq, 0);

  let avgIntervalMs = null;
  if (events.length >= 2) {
    let sum = 0;
    for (let i = 1; i < events.length; i++) sum += events[i].tMs - events[i - 1].tMs;
    avgIntervalMs = sum / (events.length - 1);
  }

  const riskIndex = events.length > 0
    ? events.reduce((s, e) => s + e.pendingAtDrink, 0) / events.length
    : 0;

  const overshoot = reason === 'mareLion' ? Math.round(state.gauge - 100) : 0;

  return {
    ts: Date.now(),
    outcome: reason,
    fatalWhileStopping: reason === 'mareLion' ? state.fatalWhileStopping : false,
    survivalMs: state.survivalMs,
    totalGlassEq,
    waterCount: state.waterEvents.length,
    avgIntervalMs,
    dangerMs: state.dangerMs,
    riskIndex,
    overshoot,
  };
}

function endGame(reason) {
  stopHold();
  state.menuOpen = false;
  state.ended = true;
  state.endedReason = reason;
  state.gaugeHistory.push({ tMs: state.survivalMs, gauge: state.gauge });

  if (state.mode === 'score') {
    state.paceBonus = reason === 'stopped' && state.dangerMs === 0 ? 50 : 0;
    state.finalScore = computeScore() + state.paceBonus;
    state.isNewHighScore = setHighScoreIfNeeded(currentUser.id, state.finalScore);
  } else {
    state.summary = buildPracticeSummary(reason);
    appendHistory(currentUser.id, state.summary);
  }

  // 早送り再生がある場合は、再生が終わってから結果画面へ進む(update で呼ぶ)
  if (!state.stopping) showResultScreenAfter(reason === 'mareLion' ? BURST_RESULT_DELAY_MS : 150);
}

// 演出を見せた後、ゲーム画面をフェードアウトさせてから結果画面をフェードインで出す
const SCREEN_FADE_MS = 600;
function showResultScreenAfter(delay) {
  setTimeout(() => {
    screens.game.classList.add('is-leaving');
    setTimeout(() => {
      screens.game.classList.remove('is-leaving');
      state.resultAnimMs = 0;
      if (state.mode === 'score') {
        renderResultDom();
        showScreen('result');
      } else {
        renderReportDom();
        showScreen('report');
      }
    }, SCREEN_FADE_MS);
  }, delay);
}

/* ---------- update loop ---------- */
// 時間を dt だけ進める(自然減少・危険帯の計測・記録・遅延キューの反映)
function stepWorld(dt) {
  state.survivalMs += dt;
  state.gauge = Math.max(0, state.gauge - state.params.decayPerMs * dt);
  if (state.gauge > 80) state.dangerMs += dt;

  if (state.survivalMs - state.lastSampleMs >= GAUGE_SAMPLE_INTERVAL_MS) {
    state.gaugeHistory.push({ tMs: state.survivalMs, gauge: state.gauge });
    state.lastSampleMs = state.survivalMs;
  }

  for (let i = state.queue.length - 1; i >= 0; i--) {
    const q = state.queue[i];
    q.remaining -= dt;
    if (q.remaining <= 0) {
      const tentative = state.gauge + q.amount;
      state.queue.splice(i, 1);
      if (tentative >= 100) {
        state.gauge = tentative;
        state.fatalName = q.name;
        state.fatalWhileStopping = state.stopping;
        state.fatalAtMs = state.survivalMs;
        endGame('mareLion');
        return;
      }
      state.gauge = tentative;
      state.absorbedTotal += q.amount;
    }
  }
}

function update(dt) {
  if (state.toastTimer > 0) state.toastTimer -= dt;
  if (state.suggestTimer > 0) state.suggestTimer -= dt;

  if (currentScreen !== 'game') return;

  animateTableItems(dt);

  if (isIntroPlaying()) {
    state.introMs += dt;
    return;
  }

  const r = state.replay;
  if (r && !r.done) {
    r.elapsed += dt;
    showToast(`▶▶ 早送り中… ${formatPartyClock(replayTimeMs())}`);
    if (r.elapsed >= r.duration) {
      r.done = true;
      if (state.endedReason === 'mareLion') {
        showToast('遅れて酔いが一気に回ってきた…!');
      } else {
        showToast(`${formatPartyClock(r.toMs)} 無事に帰宅`);
      }
      showResultScreenAfter(state.endedReason === 'mareLion' ? BURST_RESULT_DELAY_MS : 900);
    }
    return;
  }

  if (state.ended) return;

  // 器を口元まで運び終えてから飲み始める(注文した1杯が置かれている最中は飲めない)
  if (state.heldId && state.lift >= 1 && state.dropMs <= 0) {
    state.holdMs += dt;
    state.holdAccumMs += dt;
    while (state.heldId && state.holdAccumMs >= POUR_TICK_MS) {
      state.holdAccumMs -= POUR_TICK_MS;
      performSip(state.heldId);
    }
  }

  stepWorld(dt);
  if (state.ended) return;
  // 練習モード: 記録モードの記録と比べたペースの提案(record.js)
  if (state.mode === 'practice') suggestDuringPractice();

  // 時間切れ(21:00): 飲み会はお開き
  if (state.survivalMs >= GAME_MS) stopDrinking(true);
}

// 器の持ち上げ・注文した1杯の落下・空いた器の片付け・バースト演出の時間を進める(早送り中や終了後も動かす)
function animateTableItems(dt) {
  if (state.dropMs > 0) state.dropMs = Math.max(0, state.dropMs - dt);
  const target = state.heldId && state.dropMs <= 0 ? 1 : 0;
  const step = dt / LIFT_MS;
  state.lift = target > state.lift ? Math.min(target, state.lift + step) : Math.max(target, state.lift - step);
  if (state.emptyMs > 0) {
    state.emptyMs -= dt;
    if (state.emptyMs <= 0 && state.served && state.served.ml <= 0) state.served = null;
  }
  if (isBursting()) state.burstMs += dt;
}

// マーライオン確定後(早送りがあるならその再生後)は、口から吐き出す演出を出す
function isBursting() {
  return state.ended && state.endedReason === 'mareLion' && (!state.replay || state.replay.done);
}

/* ---------- HUD (DOM) ---------- */
function formatPartyClock(ms) {
  const min = PARTY_START_MIN + Math.floor(ms / 1000);
  const h = Math.floor(min / 60) % 24;
  return `${h}:${String(min % 60).padStart(2, '0')}`;
}

function updateHud() {
  if (currentScreen !== 'game') return;
  const shownMs = state.replay ? (state.replay.done ? state.replay.toMs : replayTimeMs()) : Math.min(state.survivalMs, GAME_MS);
  timeVal.textContent = formatPartyClock(shownMs);
  toastEl.textContent = state.toastTimer > 0 ? state.toastMsg : '';

  if (state.mode === 'score') {
    hudVal1.textContent = computeScore();
  } else {
    hudVal1.textContent = state.drinkEvents.length;
    hudVal3.textContent = Math.floor(state.dangerMs / 1000);
  }
}
