'use strict';

// マーライオンのスプライト、器(ジョッキ・グラスなど)、胸ビレで飲む演出

/* ---- Merlion-shaped protagonist ---- */
// シンガポールのマーライオン像を模したドット絵(48x64、右向き、口から水を吐く姿)。
// 下端12行は波の台座。1文字=1ピクセル、'.'は透明。
const MERLION_SPRITE = [
  '..........KKKKKKKwwwGwwK.KKKK...................',
  '.........KwwGwwwGgggGgwwKwwwGK..................',
  '........KGGgGgggGgggGggwwwGGGwK.................',
  '........KGGGgggGgggGgggGGwwDGwKKK...............',
  '........KGGDgggGgggGggwGGGwWWWWWWKK.............',
  '........KGGGgggGgggGggwGGGwwwwwwWWWK............',
  '.........KgGgggGgggGggwGGGwwwwwwwwWWKK..........',
  '......KKKggGgggGgggGgggWWwwwwwwwwwwWWWK.........',
  '.....KwwGgggGgggGgggGgwgwwwwwwwwwwwwwWK.........',
  '....KGGgGgggGgggGgggGgggwwwwwwwwwwwwwWKKKK......',
  '....KGGgGgggGgggGgggGwggwwwwwDDDDDDDDWWWWWKKK...',
  '....KGGgGgggGgggGgggGwggwwwwwwGwweeewwwwwDDDDK..',
  '....KDGggGgggGgggGgggGggwwwwwwwwwDeWwwwwweeeDK..',
  '....KDGggGgggGgggGgggGggwwwwwwwwwwwwwwgwwwWKK...',
  '....KDGggGgggGgggGgggGggwwwwwwwwwwwwwwgGwGWK....',
  '....KDGggGgggGgggGgggGgggwwwwwwwwwwwwwgwGwWK....',
  '....KDGggGgggGgggGgggGgggwwwwwwwwwwwGGwwwwmmK...',
  '....KGGgGgggGgggGgggGwwgggwwwwwwwmmmmmmmmmWmK...',
  '....KGGgGgggGgggGgggGgwggggwwwwmmmmmWmmmmmWmK...',
  '....KGGGGgggGgggGgggGgwwgggggwwwmmmmmmrrrrrrK...',
  '....KGGGGgggGgggGgggGggwGgggggggwmmrrrrrrrWrK...',
  '.....KGGGgggGgggGgggGgggGwwgggggwwwwwWwwKKKK....',
  '.....KGDgggGgggGgggGgggGggwGwwggggwwwwwWK.......',
  '.....KGDgggGgggGgggGgggGgggGgwgggggggggWK.......',
  '.K...KGDgggGgggGgggGgggGgggGgwwGggggggKK........',
  'KWK..KGDGggGgggGgggGgggGgggGgggGwwKKKK..........',
  'KWDK.KGDGGGGgggGgggGgggGgggGgggGgwK.............',
  'KgWDKWWGDGGgGgggGgggGgggGgggGgggGwK.............',
  'KggDwwWWDGGGGgggGgggGgggGgggDGGGDWK.............',
  'KgggDwwwDGGGDGggGgggGgggGggGDGGGGWWK............',
  'KggggwwwWWGGDGGgGgggGgggGgWWWWWWggK.............',
  '.KgggDwwwWWWGDGGGDGggGgggGgwwWWggWK.............',
  '..KgggwwwwwDKDGGGDGGGDGGGGwwWgWWWWWKKKK.........',
  '..KgggDwwwwWKKKWgDGGGDGGGgwwgDggwwWWWWDKK.......',
  '...KgggwwwwWK.KGWWWWggWWwwggWgggwwwDwwWWWK......',
  '...KWDggwwDWK.KggwwwwwwwwwwwWWggwwwwwwwwWWK.....',
  '...KGggggwwK..KggwwwwwwwwwwwwWDDDDDDDDDDDDDK....',
  '...KWWggggWK..KGgwwwggwwwwggwWDDggwwwwwwwwWWK...',
  '..KggWGggKK...KgGwwgwwgwwgwwgWWgDgggwwwwwwwWK...',
  '..KggGWWK.....KggggwwwwggwwwwggWgDgggDwwwwwK....',
  '..KgGwwWK.....KggwwwwwwwwwwwwwwWWWDggggDggK.....',
  '..KGwwwGK.....KggwwwwwwwwwwwwwwwwWWDgggggK......',
  '.KGgwwGWK.....KggGgwwwwggwwwwggwwwWKKKKKK.......',
  '.KggwGwWK.....KgGgwgwwgwwgwwgwwgwwgK............',
  '.KggGwwWGK.....KgggwggwwwwggwwwwggK.............',
  '.KgGgwwGWK.....KgggwwwwwwwwwwwwwwWK.............',
  '.KGggwGwWWK..KKWWgggwwwwwwwwwwwwwK..............',
  '..KggGwwwGWKKGwwWgggGgwwwwggwwwwgK..............',
  '..KgGwwwGwWWGwwwGWgGgggwwgwwgwwgK...............',
  '..KGgwwGwwwGwwwGwWWggggGgwwwwgGK................',
  '..KgggGwwwGwwwGwwwGWggggggggggK.................',
  '..KggGgwwGwwwGwwwGwWWGggggggKK......KK..........',
  '...KGgggGwwwGwwwGwwwGWWWGppppKK..KKKppK.........',
  '....KggGggwGwwwGwwwGwwwGqqqqpppKKppqqppK..KK....',
  '.....KGgggGwwwGwwwGgggGqqqqqqqppqqqqqqppKKppK...',
  '.....KppgGgggGwggGgggpqWWWWqqqqqqqqqqWWWpqqpK...',
  '....KQQWWgggGgggGpppqWWqqqqWqqqqqqqWWqqqWWqpK...',
  '....KQWqpppGgpWWqqqqWqqqqqqqWWqqqWWqqqqqqqWWK...',
  '....KWQqqqppqqqqWWWWqqqqqqqqqqWWWqqqqqqqqqqpK...',
  '....KQWWWqqqqqqqqqqqWWWqqqqqqqqqqWWWWqqqqqqpK...',
  '....KWQqqWWqqqqqqqWWqqqWWqqqqqqqWqqqqWWqqqqpK...',
  '....KQQqqqqWWqqqWWqqqqqqqWqqqqWWqqqqqqqWqqqpK...',
  '....KQQQQQQQQWWWQQQQQQQQQQWWWWQQQQQQQQQQWWWWK...',
  '....KQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQpK...',
];
const MERLION_PALETTE = {
  K: '#2e2a3a', W: '#fbf8f0', w: '#e3ded2', g: '#c2bcaf', G: '#958e82', D: '#655e55',
  e: '#1a1024', m: '#4a2626', r: '#b5524a', p: '#8d8a96', q: '#6f6c7a', Q: '#55525f',
};
const MERLION_W = 48, MERLION_H = 64;
const MERLION_BASE_TOP = 52;             // ここから下は台座(揺れない)
const MERLION_MOUTH = { x: 44, y: 18 };  // スプライト内の口の位置

let merlionImage = null;
function getMerlionImage() {
  if (merlionImage) return merlionImage;
  merlionImage = document.createElement('canvas');
  merlionImage.width = MERLION_W;
  merlionImage.height = MERLION_H;
  const mctx = merlionImage.getContext('2d');
  MERLION_SPRITE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = MERLION_PALETTE[row[x]];
      if (!color) continue;
      mctx.fillStyle = color;
      mctx.fillRect(x, y, 1, 1);
    }
  });
  return merlionImage;
}

// 酔うほど上半身が大きく揺れる(台座は固定)。(cx, baseY) は台座の下端中央、scale は表示倍率。
const MERLION_SCALE = 2;
function merlionSway(gauge, t) {
  return Math.sin(t / 220) * (Math.min(gauge, 100) / 100) * 6;
}
function merlionRowOffset(sway, y) {
  return Math.round(sway * Math.max(0, 1 - y / MERLION_BASE_TOP));
}
// スプライト内の座標 (sx, sy) が画面上のどこにあるか
function merlionPointAt(cx, baseY, gauge, t, sx, sy) {
  const k = MERLION_SCALE;
  const left = Math.round(cx - (MERLION_W * k) / 2), top = baseY - MERLION_H * k;
  return { x: left + (sx + merlionRowOffset(merlionSway(gauge, t), sy)) * k, y: top + sy * k };
}

function merlionMouthAt(cx, baseY, gauge, t) {
  const k = MERLION_SCALE;
  const left = Math.round(cx - (MERLION_W * k) / 2), top = baseY - MERLION_H * k;
  const sway = merlionSway(gauge, t);
  return {
    x: left + (MERLION_MOUTH.x + merlionRowOffset(sway, MERLION_MOUTH.y)) * k,
    y: top + MERLION_MOUTH.y * k,
  };
}

function drawMerlionCharacter(ctx, cx, baseY, gauge, t) {
  const k = MERLION_SCALE;
  const img = getMerlionImage();
  const left = Math.round(cx - (MERLION_W * k) / 2), top = baseY - MERLION_H * k;
  const sway = merlionSway(gauge, t);

  for (let y = 0; y < MERLION_H; y += 2) {
    const dx = left + merlionRowOffset(sway, y) * k;
    ctx.drawImage(img, 0, y, MERLION_W, 2, dx, top + y * k, MERLION_W * k, 2 * k);
  }

  const headX = left + merlionRowOffset(sway, 12) * k;
  const blush = Math.min(1, gauge / 60);
  if (blush > 0) {
    ctx.fillStyle = `rgba(226,69,44,${(blush * 0.7).toFixed(2)})`;
    ctx.fillRect(headX + 30 * k, top + 13 * k, 5 * k, 3 * k);
  }
  if (gauge > 70) {
    // まぶたが下がってくる
    ctx.fillStyle = MERLION_PALETTE.g;
    ctx.fillRect(headX + 33 * k, top + 11 * k, 3 * k, k);
  }
}

// 中ジョッキ(500ml)の残量ゲージ。(x, y) はジョッキ本体の左上。
const MUG_W = 26, MUG_H = 38;
function drawBeerMug(ctx, x, y, remainingMl, t, drinking) {
  // 取っ手
  drawPixelRect(ctx, x + MUG_W, y + 8, 7, 22, '#f5ecd7');
  drawPixelRect(ctx, x + MUG_W, y + 12, 3, 14, '#2b1b3d');

  // ガラス
  drawPixelRect(ctx, x, y, MUG_W, MUG_H, '#f5ecd7');
  const ix = x + 2, iy = y + 2, iw = MUG_W - 4, ih = MUG_H - 4;
  drawPixelRect(ctx, ix, iy, iw, ih, '#3d4a5c');

  // ビール本体と泡
  const level = Math.round(ih * Math.max(0, remainingMl) / GLASS_ML);
  if (level > 0) {
    drawPixelRect(ctx, ix, iy + ih - level, iw, level, '#f2a81d');
    drawPixelRect(ctx, ix + 2, iy + ih - level, 3, level, '#ffd76a');
    const foam = Math.min(5, level);
    drawPixelRect(ctx, ix, iy + ih - level, iw, foam, '#fff8e7');
    if (drinking) {
      for (let i = 0; i < 3; i++) {
        const by = iy + ih - ((t / 12 + i * 11) % Math.max(1, level - foam));
        drawPixelRect(ctx, ix + 7 + i * 5, by - 1, 2, 2, '#ffe39a');
      }
    }
  }

  // 100mlごとの目盛り
  for (let ml = 100; ml < GLASS_ML; ml += 100) {
    const ty = iy + ih - Math.round(ih * ml / GLASS_ML);
    drawPixelRect(ctx, ix + iw - 4, ty, 4, 1, '#f5ecd7aa');
  }
}

// ガラスの器(グラス・ロックグラスなど)。(x, y) は左上、frac は残量の割合(0〜1)。
// opts: light=液面・反射の色、ice=氷の数、lemon=レモンの輪切り
function drawGlass(ctx, x, y, w, h, frac, liquid, t, drinking, opts = {}) {
  const light = opts.light || '#ffffff';
  drawPixelRect(ctx, x, y, w, h, '#f5ecd7');
  const ix = x + 2, iy = y + 2, iw = w - 4, ih = h - 4;
  drawPixelRect(ctx, ix, iy, iw, ih, '#3d4a5c');
  const level = Math.round(ih * Math.max(0, frac));
  if (level <= 0) return;
  const ripple = drinking && level > 2 ? Math.round(Math.sin(t / 80)) : 0;
  const top = iy + ih - level + ripple;
  drawPixelRect(ctx, ix, top, iw, level - ripple, liquid);
  drawPixelRect(ctx, ix + 2, top, 2, level - ripple, light);
  drawPixelRect(ctx, ix, top, iw, 1, light);                          // 液面
  for (let i = 0; i < (opts.ice || 0); i++) {                         // 液面に浮かぶ氷
    if (level > 5) drawPixelRect(ctx, ix + 3 + i * 6, top + 1 + (i % 2), 5, 5, '#e8f8ffcc');
  }
  if (opts.lemon && level > 6) {                                      // レモンの輪切り
    drawPixelRect(ctx, ix + iw - 8, top - 1, 7, 7, '#f7d53c');
    drawPixelRect(ctx, ix + iw - 7, top, 5, 5, '#fff3a6');
  }
  if (drinking) {
    for (let i = 0; i < 2; i++) {
      const by = iy + ih - ((t / 14 + i * 9) % Math.max(1, level - 1));
      drawPixelRect(ctx, ix + 3 + i * 6, by - 1, 1, 1, '#ffffff');
    }
  }
}

// 日本酒: 枡に入れたコップ酒
function drawSakeMasu(ctx, x, y, frac, t, drinking) {
  drawGlass(ctx, x + 4, y, 16, 26, frac, '#efe6c4', t, drinking, { light: '#fffbe8' });
  drawPixelRect(ctx, x, y + 18, 24, 12, '#c79a5b');      // 枡
  drawPixelRect(ctx, x, y + 18, 24, 2, '#e0bb7c');
  drawPixelRect(ctx, x + 2, y + 22, 20, 1, '#a87c42');
}

// ワイン: 脚つきのグラス
function drawWineGlass(ctx, x, y, frac, t, drinking) {
  drawGlass(ctx, x, y, 20, 18, frac, '#9b1d3a', t, drinking, { light: '#c9445f' });
  drawPixelRect(ctx, x + 9, y + 18, 2, 9, '#f5ecd7');    // 脚
  drawPixelRect(ctx, x + 3, y + 27, 14, 3, '#f5ecd7');   // 台
}

// お品書きの各メニューを、どの器でどう描くか(w, h は器全体の大きさ)
const VESSELS = {
  beer: { w: MUG_W, h: MUG_H, draw: (ctx, x, y, f, t, d) => drawBeerMug(ctx, x, y, f * GLASS_ML, t, d) },
  sake: { w: 24, h: 30, draw: drawSakeMasu },
  shochu: { w: 22, h: 22, draw: (ctx, x, y, f, t, d) => drawGlass(ctx, x, y, 22, 22, f, '#d9e6ea', t, d, { ice: 3 }) },
  whisky: { w: 20, h: 18, draw: (ctx, x, y, f, t, d) => drawGlass(ctx, x, y, 20, 18, f, '#c8782a', t, d, { light: '#f0b062', ice: 2 }) },
  wine: { w: 20, h: 30, draw: drawWineGlass },
  chuhai: { w: 18, h: 42, draw: (ctx, x, y, f, t, d) => drawGlass(ctx, x, y, 18, 42, f, '#e9f2b0', t, d, { light: '#fbffe0', ice: 2, lemon: true }) },
  water: { w: 18, h: 26, draw: (ctx, x, y, f, t, d) => drawGlass(ctx, x, y, 18, 26, f, '#8fd3f4', t, d, { light: '#d6f1ff', ice: 1 }) },
};

const smoothstep = f => f * f * (3 - 2 * f);

// 器の描画情報: 本体の大きさ、ヒレで支える位置(器の底)、液体の色、傾ける角度の上限
function drinkSpec(served) {
  const d = DRINKS[served.id];
  const v = VESSELS[d.vessel];
  const ramp = Math.min(1, state.holdMs / (RAMP_SECONDS * 1000));
  return {
    w: v.w, h: v.h, grip: { x: v.w * 0.45, y: v.h + 2 }, color: d.color, foam: '#fff8e7',
    tilt: isAlcohol(served.id) ? 0.55 + 0.6 * ramp : 0.9, // お酒は一気に近づくほど深く傾ける
    draw: (ctx, x, y, t, drinking) => v.draw(ctx, x, y, served.ml / d.glassMl, t, drinking),
  };
}

// 卓上で、届いた1杯を置く場所(器の底をそろえる)
function servedRestPos(spec) {
  return { x: SLOT.x + Math.round((MUG_W - spec.w) / 2), y: SLOT.floorY - spec.h };
}

// 卓上に置かれた器、または手に持って口元で傾けている器を描く
function drawHeldOrRestingDrink(ctx, mouth, shoulder, t) {
  const spec = drinkSpec(state.served);
  const rest = servedRestPos(spec);
  const lift = smoothstep(state.lift);

  if (state.dropMs > 0) {
    drawDroppingDrink(ctx, spec, rest, t);
    return;
  }

  // 器の左上(飲み口)を、卓上の位置から口元へ運び、口元で傾ける
  const ax = rest.x + (mouth.x - 2 - rest.x) * lift;
  const ay = rest.y + (mouth.y - 4 - rest.y) * lift;
  const angle = -spec.tilt * lift;
  const drinking = state.lift >= 1;

  ctx.save();
  ctx.translate(Math.round(ax), Math.round(ay));
  ctx.rotate(angle);
  spec.draw(ctx, 0, 0, t, drinking);
  ctx.restore();

  if (lift <= 0.02) return;

  // 飲み口から口へ流れ込むしずく
  if (drinking) {
    for (let i = 0; i < 3; i++) {
      const f = ((t / 160) + i / 3) % 1;
      drawPixelRect(ctx, ax - 2 - f * 4, ay + 2 + f * 4, 2, 2, spec.color);
    }
  }

  // 胸ビレを伸ばし、先端で器の底を下から支えて持ち上げる
  const c = Math.cos(angle), s = Math.sin(angle);
  const gx = ax + spec.grip.x * c - spec.grip.y * s;
  const gy = ay + spec.grip.x * s + spec.grip.y * c;
  drawMerlionFin(ctx, shoulder, { x: gx, y: gy }, lift);
}

// マーライオンの胸ビレ: 付け根(from)から伸び、先端が少し扇状に開いて器の底(to)を包み込む。
// スプライトと同じ2px単位のドット・配色・輪郭で描く。
function drawMerlionFin(ctx, from, to, lift) {
  const k = MERLION_SCALE;
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;          // 付け根→先端の向き
  const len = dist + 5;                          // 先端は器の底を少し越えて包む
  const halfW = d => 4 + 8 * Math.pow(Math.min(1, d / len), 2); // 付け根は細く、先端で扇状に開く
  const inside = (x, y) => {
    const rx = x - from.x, ry = y - from.y;
    const d = rx * ux + ry * uy;                 // ヒレに沿った距離
    const w = -rx * uy + ry * ux;                // ヒレを横切る距離
    if (d < 0 || d > len) return null;
    const hw = halfW(d);
    if (Math.abs(w) > hw) return null;
    // 先端は丸く(扇のふち)
    if (d > len - 4 && Math.hypot(d - (len - 4), w * 0.5) > 4) return null;
    return { d, w, hw };
  };
  const minX = Math.min(from.x, to.x) - 16, maxX = Math.max(from.x, to.x) + 16;
  const minY = Math.min(from.y, to.y) - 16, maxY = Math.max(from.y, to.y) + 16;
  const x0 = Math.floor(minX / k) * k, y0 = Math.floor(minY / k) * k;
  for (let y = y0; y < maxY; y += k) {
    for (let x = x0; x < maxX; x += k) {
      const cx = x + k / 2, cy = y + k / 2;
      const p = inside(cx, cy);
      if (!p) {
        if (inside(cx + k, cy) || inside(cx - k, cy) || inside(cx, cy + k) || inside(cx, cy - k)) {
          drawPixelRect(ctx, x, y, k, k, MERLION_PALETTE.K);
        }
        continue;
      }
      // 先端寄りに放射状の筋(ヒレの骨)、下側に陰
      const t = (p.w / p.hw + 1) / 2;
      const onRay = p.d > len * 0.45 && Math.abs(t * 4 - Math.round(t * 4)) < 0.18;
      let color = p.w > p.hw * 0.35 ? MERLION_PALETTE.g : MERLION_PALETTE.w;
      if (p.w < -p.hw * 0.55) color = MERLION_PALETTE.W;
      if (onRay) color = MERLION_PALETTE.G;
      drawPixelRect(ctx, x, y, k, k, color);
    }
  }
}

// 注文した1杯: 上から「ドン!」と置かれ、勢いで中身が少しこぼれる
function drawDroppingDrink(ctx, spec, rest, t) {
  const p = 1 - state.dropMs / DROP_MS;
  const fall = 0.45;
  if (p < fall) {
    const f = p / fall;
    spec.draw(ctx, rest.x, Math.round(rest.y - (1 - f * f) * 150), t, false);
    return;
  }
  const q = (p - fall) / (1 - fall); // 着地後の経過 0→1
  const squash = q < 0.25 ? Math.round(Math.sin((q / 0.25) * Math.PI) * 3) : 0;
  spec.draw(ctx, rest.x, rest.y + squash, t, false);

  // こぼれて卓に広がる水たまり
  const puddle = Math.min(1, q * 3) * (1 - Math.max(0, q - 0.6) / 0.4);
  if (puddle > 0) {
    ctx.save();
    ctx.globalAlpha = puddle * 0.85;
    drawPixelRect(ctx, rest.x - 6 - q * 8, rest.y + spec.h - 2, spec.w + 12 + q * 16, 3, spec.color);
    ctx.restore();
  }

  // 飲み口から飛び散るしぶき
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const spread = 4 + (i >> 1) * 4;
    const x = rest.x + spec.w / 2 + side * (spec.w / 2 + spread * q);
    const y = rest.y + squash - Math.sin(q * Math.PI) * (10 + (i % 3) * 5) + q * q * 18;
    if (q < 0.95) drawPixelRect(ctx, x, y, 3, 3, i % 3 === 0 ? spec.foam : spec.color);
  }

  // 「ドン!」
  if (q < 0.7) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (0.7 - q) / 0.2);
    ctx.font = `bold ${Math.round(14 + Math.min(1, q * 6) * 6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a1024';
    ctx.fillText('ドン!', rest.x + spec.w / 2 + 1, rest.y - 8 + 1);
    ctx.fillStyle = '#ffb703';
    ctx.fillText('ドン!', rest.x + spec.w / 2, rest.y - 8);
    ctx.restore();
  }
}
