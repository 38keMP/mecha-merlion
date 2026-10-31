'use strict';

// キャンバス共通: ドット描画、居酒屋の店内、飲み仲間、タイトル画面

/* =========================================================
   Canvas rendering
   ========================================================= */
const tctx = titleCanvas.getContext('2d');
const gctx = gameCanvas.getContext('2d');
const rctx = resultCanvas.getContext('2d');
const reportCanvas = document.getElementById('reportCanvas');
const repctx = reportCanvas.getContext('2d');
[tctx, gctx, rctx, repctx].forEach(ctx => (ctx.imageSmoothingEnabled = false));

function drawPixelRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/* ---- shared: izakaya interior scene (title + game background) ---- */
function drawIzakayaScene(ctx, w, h, t, npcCount) {
  drawPixelRect(ctx, 0, 0, w, h, '#2b1b3d');

  // wall / floor
  drawPixelRect(ctx, 0, 0, w, h * 0.55, '#3b2a1f');
  drawPixelRect(ctx, 0, h * 0.55, w, h * 0.45, '#241a12');

  // shelf with bottles
  const bottles = Math.max(7, Math.round(w / 34));
  for (let i = 0; i < bottles; i++) {
    const bx = 10 + i * ((w - 20) / bottles);
    drawPixelRect(ctx, bx, h * 0.16, 8, 16, i % 2 === 0 ? '#7fd858' : '#8fd3f4');
  }

  // hanging lanterns
  const lanterns = Math.max(4, Math.round(w / 70));
  for (let i = 0; i < lanterns; i++) {
    const lx = 14 + i * ((w - 28) / (lanterns - 1));
    const bob = Math.sin(t / 600 + i) * 2;
    drawPixelRect(ctx, lx - 6, 34 + bob, 12, 16, '#ffb703');
  }

  // counter
  drawPixelRect(ctx, 0, h * 0.5, w, 10, '#5a3d24');
  drawPixelRect(ctx, 0, h * 0.5 + 10, w, 4, '#3f2a18');

  // NPCs chatting at the counter
  const bodyColors = ['#e07856', '#6fa8dc', '#c27ba0', '#9fd08a'];
  for (let i = 0; i < npcCount; i++) {
    const nx = w * ((i + 1) / (npcCount + 1));
    const ny = h * 0.5;
    const bob = Math.sin(t / 380 + i * 2) * 2;
    ctx.save();
    ctx.translate(nx, ny + bob);
    drawPixelRect(ctx, -8, -20, 16, 20, bodyColors[i % bodyColors.length]);
    drawPixelRect(ctx, -7, -32, 14, 14, '#ffd9a0');

    const cyclePhase = (t / 1000 + i * 1.3) % 3;
    if (cyclePhase < 0.8) {
      ctx.globalAlpha = 1 - cyclePhase / 0.8;
      drawPixelRect(ctx, -4, -46, 10, 7, '#f5ecd7');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawPixelRect(ctx, 0, h - 8, w, 8, '#120a1a');
}

/* ---- friends (飲み仲間) ---- */
// 正面向きの上半身(16x18)。h=髪 s=肌 e=目 c=頬 m=口 t/T=服 K=輪郭
const FRIEND_SPRITE = [
  '.....KKKKKK.....',
  '...KKhhhhhhKK...',
  '..KhhhhhhhhhhK..',
  '..KhhhhhhhhhhK..',
  '..KhhssssssshK..',
  '..KhsssssssssK..',
  '..KssesssssessK.',
  '..KscssssssscsK.',
  '..KsssssmmssssK.',
  '...KsssssssssK..',
  '....KKsssssKK...',
  '...KtttKsKtttK..',
  '..KttttttttttK..',
  '.KttttttttttttK.',
  '.KTtttttttttttK.',
  '.KTtttttttttttK.',
  '.KTtttttttttttK.',
  '.KTTttttttttttK.',
];
const FRIEND_LOOKS = [
  { h: '#2b1b12', s: '#ffd9a0', t: '#e07856', T: '#b0553a' },
  { h: '#e2a83c', s: '#f6c896', t: '#6fa8dc', T: '#4a7fb0' },
  { h: '#4a2a5a', s: '#ffe0b8', t: '#9fd08a', T: '#6fa25c' },
  { h: '#8a4a2a', s: '#e8b98a', t: '#c27ba0', T: '#985a7c' },
  { h: '#1a1024', s: '#ffd9a0', t: '#f2c14e', T: '#c29a2e' },
  { h: '#b0b0c0', s: '#f6c896', t: '#5fb6a0', T: '#3f8a78' },
];
const friendImages = new Map();
function getFriendImage(look) {
  if (friendImages.has(look)) return friendImages.get(look);
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = FRIEND_SPRITE.length;
  const fctx = c.getContext('2d');
  const pal = { ...look, K: '#2e2a3a', e: '#1a1024', c: '#f08a7a', m: '#7a3a2a' };
  FRIEND_SPRITE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!pal[row[x]]) continue;
      fctx.fillStyle = pal[row[x]];
      fctx.fillRect(x, y, 1, 1);
    }
  });
  friendImages.set(look, c);
  return c;
}

// 小さなビールジョッキ(6x8単位)。(x, y) は左上、k は倍率、dir は取っ手の向き
function drawSmallMug(ctx, x, y, k, dir) {
  drawPixelRect(ctx, x, y, 6 * k, 8 * k, '#f5ecd7');
  drawPixelRect(ctx, x + k, y + 3 * k, 4 * k, 4 * k, '#f2a81d');
  drawPixelRect(ctx, x + k, y + k, 4 * k, 2 * k, '#fff8e7');
  drawPixelRect(ctx, dir > 0 ? x + 6 * k : x - 2 * k, y + 2 * k, 2 * k, 4 * k, '#f5ecd7');
}

// 卓の向こうに座る友人。cx は中心、tableTop は卓の上端、dir は手(ジョッキ)を出す向き。
// pose.mugDX/mugDY でジョッキを持ち上げ、pose.mouthOpen で口を開ける。
function drawFriend(ctx, cx, tableTop, look, k, t, dir, pose = {}) {
  const bob = Math.round(Math.sin(t / 420 + cx) * 1) * k;
  const left = Math.round(cx - 8 * k), top = tableTop - 14 * k + bob;
  ctx.drawImage(getFriendImage(look), 0, 0, 16, FRIEND_SPRITE.length, left, top, 16 * k, FRIEND_SPRITE.length * k);
  if (pose.mouthOpen) drawPixelRect(ctx, left + 7 * k, top + 8 * k, 2 * k, 2 * k, '#4a1a1a');

  // 腕とジョッキ
  const shoulderX = cx + dir * 5 * k, shoulderY = top + 13 * k;
  const handX = cx + dir * 9 * k + (pose.mugDX || 0), handY = tableTop - 3 * k + (pose.mugDY || 0);
  for (let i = 0; i <= 4; i++) {
    const f = i / 4;
    drawPixelRect(ctx, shoulderX + (handX - shoulderX) * f - k * 1.5, shoulderY + (handY - shoulderY) * f - k * 1.5, 3 * k, 3 * k, look.T);
  }
  const mugX = dir > 0 ? handX - k : handX - 5 * k;
  drawSmallMug(ctx, mugX, handY - 5 * k, k, dir);
  drawPixelRect(ctx, handX - k * 1.5, handY - k, 3 * k, 3 * k, look.s);
}

// 卓(座卓)と料理
function drawTable(ctx, x0, x1, tableTop, h) {
  drawPixelRect(ctx, x0, tableTop, x1 - x0, h - tableTop, '#5a3d24');
  drawPixelRect(ctx, x0, tableTop, x1 - x0, 4, '#8a5e36');
  drawPixelRect(ctx, x0, tableTop + 4, x1 - x0, 2, '#3f2a18');
}
function drawDishes(ctx, xs, tableTop) {
  xs.forEach((x, i) => {
    drawPixelRect(ctx, x - 14, tableTop + 6, 28, 6, '#f5ecd7');   // 皿
    drawPixelRect(ctx, x - 12, tableTop + 7, 24, 3, '#e3ded2');
    if (i % 3 === 0) {          // 枝豆
      for (let j = 0; j < 5; j++) drawPixelRect(ctx, x - 10 + j * 4, tableTop + 4 + (j % 2), 4, 3, '#7fd858');
    } else if (i % 3 === 1) {   // 焼き鳥
      for (let j = 0; j < 3; j++) {
        drawPixelRect(ctx, x - 12, tableTop + 2 + j * 2, 24, 1, '#c9a46a');
        drawPixelRect(ctx, x - 8 + j * 2, tableTop + 1 + j * 2, 10, 2, '#8a4a2a');
      }
    } else {                    // 唐揚げ
      for (let j = 0; j < 4; j++) drawPixelRect(ctx, x - 9 + j * 5, tableTop + 2 + (j % 2) * 2, 5, 4, '#d98c2a');
      drawPixelRect(ctx, x + 6, tableTop + 4, 4, 3, '#ffe066');  // レモン
    }
  });
}

/* ---- title screen: マーライオンと飲み仲間たちの宴会 ---- */
const TITLE_CHEER_MS = 3600;
function renderTitle(t) {
  const ctx = tctx;
  const w = titleCanvas.width, h = titleCanvas.height;
  drawIzakayaScene(ctx, w, h, t, Math.round(w / 120));

  // 壁のお品書き
  for (let i = 0; i < Math.round(w / 60); i++) {
    const mx = 18 + i * 56;
    drawPixelRect(ctx, mx, 62, 12, 30, '#f5ecd7');
    for (let j = 0; j < 4; j++) drawPixelRect(ctx, mx + 5, 66 + j * 6, 2, 4, '#3b2a1f');
  }

  const tableTop = h - 58;
  const cx = w / 2;

  // 乾杯のタイミング(数秒ごとに全員でジョッキを掲げる)
  const phase = (t % TITLE_CHEER_MS) / TITLE_CHEER_MS;
  const cheer = phase > 0.1 && phase < 0.5 ? Math.sin(((phase - 0.1) / 0.4) * Math.PI) : 0;

  drawMerlionCharacter(ctx, cx, tableTop + 44, 35, t);

  const k = 3;
  const offsets = (w >= 400 ? [-200, -150, -100, 100, 150, 200] : [-84, 84])
    .filter(o => cx + o - 8 * k >= 0 && cx + o + 8 * k <= w);
  offsets.forEach((o, i) => {
    const dir = o < 0 ? 1 : -1; // マーライオンの方へ手を出す
    drawFriend(ctx, cx + o, tableTop, FRIEND_LOOKS[i % FRIEND_LOOKS.length], k, t, dir, {
      mugDX: dir * cheer * 10,
      mugDY: -cheer * 26,
      mouthOpen: cheer > 0.4,
    });
  });

  drawTable(ctx, 0, w, tableTop, h);
  drawDishes(ctx, offsets.map(o => cx + o * 0.75).concat([cx - 36, cx + 36]), tableTop);

  // マーライオンのジョッキ
  const mouth = merlionMouthAt(cx, tableTop + 44, 35, t);
  const mugX = mouth.x + 4 - cheer * 8, mugY = mouth.y + 14 - cheer * 34;
  drawSmallMug(ctx, mugX, mugY, k, 1);

  // 乾杯の瞬間: 「カンパーイ!」と、ジョッキの間に飛ぶ泡
  if (cheer > 0.75) {
    ctx.fillStyle = '#fff8e7';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t / 300;
      const r = 14 + (i % 3) * 8;
      drawPixelRect(ctx, cx + Math.cos(a) * r * 2.4, tableTop - 76 + Math.sin(a) * r, 3, 3, i % 2 ? '#ffd76a' : '#fff8e7');
    }
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1024';
    ctx.fillText('カンパーイ!', cx + 2, 38);
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('カンパーイ!', cx, 36);
  }
}

// ゲーム画面の左右に余白がある(横長画面)ときは、隣の卓で飲む仲間を描く
function drawSideFriends(ctx, w, h, stageX, t) {
  if (stageX < 60) return;
  const tableTop = h - 40, k = 3;
  [[stageX / 2, 1, 4], [w - stageX / 2, -1, 1]].forEach(([fx, dir, lookIdx], i) => {
    const sipPhase = ((t + i * 2100) % 4200) / 4200;
    const sip = sipPhase < 0.3 ? Math.sin((sipPhase / 0.3) * Math.PI) : 0;
    drawFriend(ctx, fx, tableTop, FRIEND_LOOKS[lookIdx], k, t, dir, {
      mugDX: -dir * sip * 22,
      mugDY: -sip * 24,
      mouthOpen: sip > 0.5,
    });
    drawTable(ctx, fx - 46, fx + 46, tableTop, h - 8);
    drawDishes(ctx, [fx - dir * 20], tableTop);
  });
}
