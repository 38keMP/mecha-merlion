'use strict';

// 画面幅に合わせたレイアウト、メインループ、ボタンとポインタのイベント

/* =========================================================
   レイアウト: 横長の画面では店内を横に広く見せる
   ========================================================= */
function layoutCanvases() {
  const wide = window.innerWidth >= 700;
  const setWidth = (canvas, width) => {
    if (canvas.width !== width) {
      canvas.width = width;
      canvas.getContext('2d').imageSmoothingEnabled = false;
    }
  };
  setWidth(titleCanvas, wide ? 480 : 240);
  setWidth(gameCanvas, wide ? 440 : 240);
  setWidth(resultCanvas, wide ? 400 : 240);
  setWidth(reportCanvas, wide ? 400 : 240);
  // 縦にはみ出さないよう、画面の高さに合わせて表示幅の上限を決める
  const fit = (canvas, heightRatio) => {
    canvas.style.maxWidth = `${Math.floor((window.innerHeight * heightRatio * canvas.width) / canvas.height)}px`;
  };
  fit(titleCanvas, 0.6);
  fit(gameCanvas, 0.66);
  document.querySelector('.hud').style.maxWidth = gameCanvas.style.maxWidth;
}
layoutCanvases();
window.addEventListener('resize', layoutCanvases);

/* =========================================================
   main loop
   ========================================================= */
let lastTs = 0;
function loop(ts) {
  const dt = lastTs ? ts - lastTs : 16;
  lastTs = ts;

  update(dt);
  updateHud();

  if (currentScreen === 'title') renderTitle(ts);
  if (currentScreen === 'game') renderGame(ts);
  if (currentScreen === 'record') {
    updateRecord(dt);
    renderRecord(ts);
  }
  if (currentScreen === 'result' || currentScreen === 'report') {
    state.resultAnimMs += dt;
    renderResult(currentScreen === 'result' ? rctx : repctx);
  }

  requestAnimationFrame(loop);
}

/* =========================================================
   wire up events
   ========================================================= */
document.getElementById('startBtn').addEventListener('click', () => {
  const savedId = getCurrentUserId();
  const savedUser = savedId ? findUser(savedId) : null;
  if (savedUser) {
    currentUser = savedUser;
    showModeScreen();
  } else {
    showUserScreen();
  }
});

document.getElementById('createUserBtn').addEventListener('click', handleCreateUser);
newUserNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleCreateUser();
});

document.getElementById('switchUserBtn').addEventListener('click', showUserScreen);
document.getElementById('modeScoreBtn').addEventListener('click', () => enterGame('score'));
document.getElementById('modePracticeBtn').addEventListener('click', () => enterGame('practice'));

document.getElementById('stopBtn').addEventListener('click', () => stopDrinking());

// 卓上の注文表をタップして注文し、届いた1杯を直接長押しして飲む
// 画面上の位置を、キャンバスの座標に直す(CSSで拡大縮小していても合うように)
function canvasPoint(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left - canvas.clientLeft) / canvas.clientWidth) * canvas.width,
    y: ((e.clientY - rect.top - canvas.clientTop) / canvas.clientHeight) * canvas.height,
  };
}
gameCanvas.addEventListener('pointerdown', e => {
  if (isIntroPlaying()) {
    // タップで入店アニメーションをとばす
    state.introMs = INTRO_MS;
    return;
  }
  const p = canvasPoint(gameCanvas, e);
  if (state.menuOpen) {
    e.preventDefault();
    const row = menuRowAt(p.x, p.y);
    if (row >= 0) orderDrink(MENU[row].id);
    else state.menuOpen = false;
    return;
  }
  const item = tableItemAt(p.x - gameStageX(), p.y);
  if (!item) return;
  e.preventDefault();
  if (item === 'menu') toggleMenu();
  else startHold();
});
gameCanvas.addEventListener('pointermove', e => {
  const p = canvasPoint(gameCanvas, e);
  if (state.menuOpen) {
    state.menuHover = menuRowAt(p.x, p.y);
    gameCanvas.style.cursor = state.menuHover >= 0 ? 'pointer' : 'default';
    return;
  }
  const item = canAct() && tableItemAt(p.x - gameStageX(), p.y);
  const active = item === 'menu' || (item === 'drink' && state.served && state.served.ml > 0);
  gameCanvas.style.cursor = active || state.heldId ? 'pointer' : 'default';
});
window.addEventListener('pointerup', stopHold);
window.addEventListener('pointercancel', stopHold);

document.getElementById('retryBtn').addEventListener('click', () => showScreen('title'));
document.getElementById('reportRetryBtn').addEventListener('click', () => showScreen('title'));

requestAnimationFrame(loop);
