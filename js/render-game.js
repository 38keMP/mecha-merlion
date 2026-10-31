'use strict';

// ゲーム画面: 卓上の配置、お品書き、吐き出し、入店・早送りの演出、結果画面の絵

// 卓上の配置(舞台座標)。届いた1杯を置く場所(長押しで飲む)と、卓上の注文表(タップで開く)
const SLOT = { x: 160, floorY: 188, hit: { x: 150, y: 116, w: 54, h: 92 } };
const MENU_CARD = { x: 210, y: 152, w: 24, h: 36, hit: { x: 204, y: 140, w: 36, h: 68 } };
// ゲーム画面の中心(マーライオンと卓上の飲み物)は幅240の「舞台」として描き、横長画面では中央に置く
const STAGE_W = 240;
function gameStageX() {
  return Math.round((gameCanvas.width - STAGE_W) / 2);
}

const inRect = (r, px, py) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
function tableItemAt(px, py) {
  if (inRect(MENU_CARD.hit, px, py)) return 'menu';
  if (inRect(SLOT.hit, px, py)) return 'drink';
  return null;
}

// 注文表(お品書き)のパネル。キャンバス全体の座標で、中央に開く
const MENU_ROW_H = 24;
function menuLayout() {
  const w = 224;
  return { x: Math.round((gameCanvas.width - w) / 2), y: 4, w, h: 222, rowsY: 36 };
}
function menuRowAt(px, py) {
  const L = menuLayout();
  if (px < L.x || px >= L.x + L.w) return -1;
  const i = Math.floor((py - L.y - L.rowsY) / MENU_ROW_H);
  return i >= 0 && i < MENU.length ? i : -1;
}

// 卓上の注文表(立て札)。何も頼んでいないときは「注文!」と目立たせる
function drawMenuCard(ctx, t, beckon) {
  const { x, y, w, h } = MENU_CARD;
  drawPixelRect(ctx, x - 1, y - 1, w + 2, h + 2, '#1a1024');
  drawPixelRect(ctx, x, y, w, h, '#f5ecd7');
  drawPixelRect(ctx, x, y, w, 4, '#b5524a');
  for (let i = 0; i < 4; i++) drawPixelRect(ctx, x + 4, y + 10 + i * 6, w - 8, 2, '#8a7a66');
  drawPixelRect(ctx, x + 4, y + h, 3, 4, '#5a3d24');
  drawPixelRect(ctx, x + w - 7, y + h, 3, 4, '#5a3d24');
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5ecd7';
  ctx.fillText('注文表', x + w / 2, y + h + 15);
  if (beckon) {
    const bob = Math.round(Math.sin(t / 150) * 3);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('注文!', x + w / 2, y - 16 + bob);
    ctx.fillText('▼', x + w / 2, y - 5 + bob);
  }
}

function drawMenuPanel(ctx, t) {
  const L = menuLayout();
  drawPixelRect(ctx, 0, 0, ctx.canvas.width, ctx.canvas.height, 'rgba(18,10,26,0.55)');
  drawPixelRect(ctx, L.x - 2, L.y - 2, L.w + 4, L.h + 4, '#1a1024');
  drawPixelRect(ctx, L.x, L.y, L.w, L.h, '#f5ecd7');
  drawPixelRect(ctx, L.x, L.y, L.w, 4, '#b5524a');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1024';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('お品書き', L.x + L.w / 2, L.y + 19);
  ctx.font = '9px monospace';
  ctx.fillStyle = '#655e55';
  ctx.fillText('お酒は1杯 ≒ 1単位(純アルコール約20g)', L.x + L.w / 2, L.y + 31);

  MENU.forEach((m, i) => {
    const d = DRINKS[m.id];
    const ry = L.y + L.rowsY + i * MENU_ROW_H;
    if (i === state.menuHover) drawPixelRect(ctx, L.x + 3, ry, L.w - 6, MENU_ROW_H - 1, '#ffe7a8');
    drawPixelRect(ctx, L.x + 3, ry + MENU_ROW_H - 1, L.w - 6, 1, '#d8ccb6');
    drawPixelRect(ctx, L.x + 8, ry + 5, 10, 14, '#3d4a5c');            // 器の色見本
    drawPixelRect(ctx, L.x + 9, ry + 9, 8, 9, m.color);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a1024';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(m.name, L.x + 24, ry + 12);
    ctx.font = '8px monospace';
    ctx.fillStyle = isAlcohol(m.id) ? '#8d3a2a' : '#2f6f8f';
    ctx.fillText(isAlcohol(m.id) ? `純アルコール約${Math.round(d.amount)}g` : '酔いは変わらない', L.x + 24, ry + 21);
    ctx.fillStyle = '#1a1024';
    ctx.font = '10px monospace';
    ctx.fillText(`${m.abv}%`, L.x + 104, ry + 14);
    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillText(`${m.serving} ${m.glassMl}ml`, L.x + L.w - 8, ry + 14);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#655e55';
  ctx.font = '9px monospace';
  ctx.fillText('タップで注文 / 外をタップで閉じる', L.x + L.w / 2, L.y + L.h - 6);
}

// 口から放物線を描いて吐き出す水しぶき
// バースト: 口から放物線を描いて液体(飲んだお酒)を大量に吐き出す。
// 太い水流(芯)+まわりに飛ぶしぶき+着水点の飛沫と水たまり。
const SPOUT_COLORS = ['#f2d16b', '#fff1b8', '#e8b93a', '#ffffff'];
// fall は口から着水点までの落差の目安(着水点 ≒ 口の高さ - 11 + fall)
function drawSpout(ctx, mouth, ms, reach, fall = 60) {
  const grow = Math.min(1, ms / 350);
  const arc = f => ({
    x: mouth.x + f * reach,
    y: mouth.y - Math.sin(f * Math.PI * 0.8) * 18 + f * f * fall,
  });

  // 芯: 口から着水点まで途切れない太い流れ(うねりながら流れる)
  for (let i = 0; i <= 90; i++) {
    const f = i / 90;
    if (f > grow) break;
    const p = arc(f);
    const pulse = Math.sin(ms / 60 - f * 18) * 1.5;
    const thick = 10 - f * 4 + pulse;
    drawPixelRect(ctx, p.x - 2, p.y - thick / 2, 5, thick, i % 4 === 0 ? '#e8b93a' : '#f2d16b');
    drawPixelRect(ctx, p.x - 1, p.y - thick / 2 + 1, 3, 2, '#fff1b8');
  }

  // しぶき: 流れに沿って外へ散る粒
  for (let i = 0; i < 160; i++) {
    const f = ((ms / 700) + i / 160) % 1;
    if (f > grow) continue;
    const p = arc(f);
    const spread = (((i * 37) % 17) - 8) * (0.4 + f * 1.2);
    const size = 2 + (i % 3);
    drawPixelRect(ctx, p.x + ((i * 13) % 5) - 2, p.y + spread, size, size, SPOUT_COLORS[i % SPOUT_COLORS.length]);
  }

  if (grow < 1) return;
  // 着水点: 跳ね返る飛沫と、広がる水たまり
  const land = arc(1);
  const pool = Math.min(1, ms / 1500);
  drawPixelRect(ctx, land.x - 10 - pool * 30, land.y + 4, 20 + pool * 60, 4, '#e8b93a');
  drawPixelRect(ctx, land.x - 6 - pool * 24, land.y + 4, 12 + pool * 44, 1, '#fff1b8');
  for (let i = 0; i < 40; i++) {
    const g = ((ms / 450) + i / 40) % 1;
    const side = (i % 2 ? 1 : -1) * (4 + (i % 7) * 3);
    drawPixelRect(ctx, land.x + side * g * 2, land.y + 2 - Math.sin(g * Math.PI) * (8 + (i % 5) * 4), 3, 3, SPOUT_COLORS[(i + 1) % SPOUT_COLORS.length]);
  }
}

// 入店シーン: 夜の店先から、のれんをくぐって光の中へ入っていく
function drawEntrance(ctx, w, h, ms) {
  const p = Math.min(1, ms / INTRO_ENTER_MS);
  drawPixelRect(ctx, 0, 0, w, h, '#120d22');
  for (let i = 0; i < 18; i++) {
    drawPixelRect(ctx, (i * 53) % w, (i * 29) % 60, 1, 1, i % 3 ? '#8a84b0' : '#f5ecd7'); // 星
  }

  // のれんの中心へ向かってカメラが寄っていく
  const zoom = 1 + Math.pow(p, 2.2) * 5;
  const fx = w / 2, fy = 128;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);

  // 横長画面では、両隣にも店が並ぶ通りにして、のれんの店を中央に置く
  drawPixelRect(ctx, 0, 196, w, h - 196, '#241a22');
  for (let x = -40; x < w + 40; x += 64) drawPixelRect(ctx, x, 80, 56, 116, '#2a2030');
  for (let x = -40; x < w + 40; x += 64) drawPixelRect(ctx, x + 12, 100, 14, 12, '#ffd76a55');
  ctx.translate(Math.round((w - 240) / 2), 0);
  w = 240;

  drawPixelRect(ctx, 0, 196, w, h - 196, '#241a22');            // 地面
  drawPixelRect(ctx, 26, 64, w - 52, 136, '#3b2a1f');           // 店の壁
  for (let x = 30; x < w - 26; x += 8) drawPixelRect(ctx, x, 64, 2, 136, '#33241a'); // 板張り
  ctx.fillStyle = '#1d1410';                                     // 屋根
  ctx.beginPath();
  ctx.moveTo(14, 66); ctx.lineTo(w - 14, 66); ctx.lineTo(w - 34, 44); ctx.lineTo(34, 44);
  ctx.closePath();
  ctx.fill();
  drawPixelRect(ctx, 60, 47, 120, 15, '#f5ecd7');               // 看板
  ctx.fillStyle = '#1a1024';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('居酒屋 まーらいおん', w / 2, 58);

  // 入口の奥からもれる光
  const glow = 0.6 + p * 0.4;
  drawPixelRect(ctx, 88, 96, 64, 104, `rgba(255,231,168,${glow.toFixed(2)})`);
  drawPixelRect(ctx, 96, 104, 48, 96, '#fff6dc');

  // 赤提灯
  for (const lx of [64, 176]) {
    drawPixelRect(ctx, lx - 9, 92, 18, 24, '#e2452c');
    drawPixelRect(ctx, lx - 9, 90, 18, 3, '#1d1410');
    drawPixelRect(ctx, lx - 9, 115, 18, 3, '#1d1410');
    drawPixelRect(ctx, lx - 3, 98, 6, 12, '#ffb703');
  }

  // のれん(3枚)。近づくと左右に分かれて、光の中へ
  const part = Math.max(0, (p - 0.45) / 0.55) * 22;
  const sway = Math.sin(ms / 160) * 1.5;
  for (let i = 0; i < 3; i++) {
    const nx = 89 + i * 21 + (i - 1) * part;
    drawPixelRect(ctx, nx + sway, 96, 20, 40, '#1f3a68');
    drawPixelRect(ctx, nx + sway, 96, 20, 3, '#132544');
  }
  drawPixelRect(ctx, 86, 94, 68, 3, '#5a3d24');                 // のれん棒
  ctx.fillStyle = '#f5ecd7';
  ctx.font = 'bold 14px serif';
  ctx.fillText('酒', 120 + sway, 122);
  ctx.restore();

  // くぐる瞬間、光が画面を満たしていく
  const flash = Math.max(0, (p - 0.7) / 0.3);
  if (flash > 0) drawPixelRect(ctx, 0, 0, ctx.canvas.width, h, `rgba(255,246,220,${flash.toFixed(2)})`);
}

// 入店後: 光が晴れて店内が見え、「19:00 乾杯!」で飲み会が始まる
function drawIntroOverlay(ctx, w, h, ms) {
  const lightFade = 1 - (ms - INTRO_ENTER_MS) / (INTRO_LIGHT_MS - INTRO_ENTER_MS);
  if (lightFade > 0) drawPixelRect(ctx, 0, 0, w, h, `rgba(255,246,220,${Math.min(1, lightFade).toFixed(2)})`);
  if (ms < INTRO_LIGHT_MS - 300) return;

  const cardMs = ms - (INTRO_LIGHT_MS - 300);
  const cardTotal = INTRO_MS - (INTRO_LIGHT_MS - 300);
  const alpha = Math.min(1, cardMs / 250, (cardTotal - cardMs) / 300);
  const pop = Math.min(1, cardMs / 200);
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  drawPixelRect(ctx, 0, 70, w, 84, 'rgba(18,10,26,0.82)');
  drawPixelRect(ctx, 0, 70, w, 2, '#ffd76a');
  drawPixelRect(ctx, 0, 152, w, 2, '#ffd76a');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = `bold ${Math.round(18 + pop * 16)}px monospace`;
  ctx.fillText('19:00', w / 2, 112);
  ctx.fillStyle = '#f5ecd7';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('乾杯! 飲み会スタート', w / 2, 134);
  ctx.font = '10px monospace';
  const personal = state.params.personal;
  ctx.fillText(personal ? `あなた専用の数値(限界 約${Math.round(personal.limitG)}g)` : '21:00 にお開き(2時間)', w / 2, 148);
  ctx.restore();
}

// 早送り再生中: 画面の端に「▶▶」と時刻を出し、少し暗くする
function drawReplayOverlay(ctx, w, h, t) {
  drawPixelRect(ctx, 0, 0, w, h, 'rgba(18,10,26,0.25)');
  if (Math.floor(t / 300) % 2 === 0) {
    ctx.fillStyle = '#f5ecd7';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('▶▶ 早送り', w - 10, 60);
  }
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(formatPartyClock(replayTimeMs()), w - 10, 80);
}

/* ---- game screen ---- */
// 酔いゲージの帯と、その下の一行(ゲームと記録モードで共通)
function drawGaugeBar(ctx, w, gauge, label, font) {
  const barX = 14, barY = 14, barW = w - 28, barH = 16;
  drawPixelRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, '#f5ecd7');
  drawPixelRect(ctx, barX, barY, barW, barH, '#1a1024');
  const color = gauge >= 90 ? '#e2452c' : gauge >= 70 ? '#ffb703' : '#7fd858';
  drawPixelRect(ctx, barX, barY, barW * Math.min(gauge / 100, 1), barH, color);
  ctx.fillStyle = '#ffd76a';
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.fillText(label, barX, barY + barH + 16);
}

// 舞台(幅240)のマーライオンと卓上: 注文表と、届いた1杯(または空いた席)。
// 長押しするとマーライオンが胸ビレで器を支え、口元で上へ傾けて飲む。舞台座標に translate 済みで呼ぶ
const MERLION_STAGE_X = 60;
function drawMerlionAndTable(ctx, h, gauge, t, canOrder, beckon) {
  const merlionBase = h - 8;
  drawMerlionCharacter(ctx, MERLION_STAGE_X, merlionBase, gauge, t);
  const mouth = merlionMouthAt(MERLION_STAGE_X, merlionBase, gauge, t);
  const shoulder = merlionPointAt(MERLION_STAGE_X, merlionBase, gauge, t, 31, 33);
  const slotCx = SLOT.x + MUG_W / 2;
  drawMenuCard(ctx, t, beckon && !state.served);

  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  if (state.served) {
    drawHeldOrRestingDrink(ctx, mouth, shoulder, t);
    const d = DRINKS[state.served.id];
    const empty = state.served.ml <= 0;
    if (state.dropMs <= 0) {
      ctx.fillStyle = isAlcohol(d.id) ? '#f5ecd7' : '#8fd3f4';
      ctx.fillText(d.name.length > 7 ? d.name.slice(0, 7) + '…' : d.name, slotCx, 132);
    }
    ctx.fillStyle = empty ? '#7fd858' : '#ffd76a';
    ctx.fillText(empty ? '飲み干した!' : `残り${Math.ceil(state.served.ml)}ml`, slotCx, 204);
  } else {
    // まだ何も頼んでいない(または飲み干して下げられた)空の席
    drawPixelRect(ctx, SLOT.x - 2, SLOT.floorY - 2, MUG_W + 4, 3, '#5a3d24');
    if (canOrder && Math.floor(t / 500) % 2 === 0) {
      ctx.fillStyle = '#ffd76a';
      ctx.fillText('注文表から', slotCx, 164);
      ctx.fillText('頼もう →', slotCx, 177);
    }
  }
  return { mouth };
}

function renderGame(t) {
  const ctx = gctx;
  const w = gameCanvas.width, h = gameCanvas.height;
  if (state.introMs < INTRO_ENTER_MS) {
    drawEntrance(ctx, w, h, state.introMs);
    return;
  }
  drawIzakayaScene(ctx, w, h, t, Math.max(2, Math.round(w / 110)));

  const gauge = displayedGauge();
  const danger = gauge >= 90;

  let shakeX = 0, shakeY = 0;
  const dropP = 1 - state.dropMs / DROP_MS;
  const impact = state.dropMs > 0 && dropP > 0.45 && dropP < 0.6;
  if (danger || impact || (isBursting() && state.burstMs < 600)) {
    shakeX = (Math.random() - 0.5) * 4;
    shakeY = (Math.random() - 0.5) * 4;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const pendingSum = state.replay ? 0 : state.queue.reduce((s, q) => s + q.amount, 0);
  const dropLabel = pendingSum <= 0.5 ? '' : pendingSum < 15 ? '●' : pendingSum < 35 ? '●●' : '●●●';
  drawGaugeBar(ctx, w, gauge, `まだ効いてない分: ${dropLabel}`, '12px monospace');
  if (state.suggestTimer > 0 && !state.replay) drawSuggestBanner(ctx, w, state.suggestMsg);

  const stageX = gameStageX();
  drawSideFriends(ctx, w, h, stageX, t);
  ctx.translate(stageX, 0);

  const canOrder = !state.ended && !state.stopping && !isIntroPlaying();
  const { mouth } = drawMerlionAndTable(ctx, h, gauge, t, canOrder, canOrder && !state.menuOpen);

  // バースト: ここで初めて、像のように口から液体を吐き出す
  if (isBursting()) drawSpout(ctx, mouth, state.burstMs, 110);

  ctx.restore();
  if (state.menuOpen) drawMenuPanel(ctx, t);
  if (state.replay && !state.replay.done) drawReplayOverlay(ctx, w, h, t);
  if (isIntroPlaying()) drawIntroOverlay(ctx, w, h, state.introMs);
}

/* ---- result screen: splash / calm animation ---- */
function renderResult(ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawPixelRect(ctx, 0, 0, w, h, '#2b1b3d');

  const cx = 56, baseY = h - 4;
  if (state.endedReason === 'mareLion') {
    // マーライオン像のように、口から勢いよく吐き出す
    const shake = Math.round(Math.sin(state.resultAnimMs / 40) * 1);
    drawMerlionCharacter(ctx, cx + shake, baseY, 100, state.resultAnimMs);
    const mouth = merlionMouthAt(cx + shake, baseY, 100, state.resultAnimMs);
    drawSpout(ctx, mouth, state.resultAnimMs, Math.min(w - mouth.x - 30, 260), h - 12 - mouth.y + 11);
  } else {
    for (let i = 0; i < 10; i++) {
      const x = (i * 37 + (state.resultAnimMs / 20)) % w;
      const y = (i * 53) % h;
      drawPixelRect(ctx, x, y, 6, 6, i % 2 === 0 ? '#ffd76a' : '#7fd858');
    }
    drawMerlionCharacter(ctx, cx, baseY, Math.min(state.gauge, 60), state.resultAnimMs);
  }
}
