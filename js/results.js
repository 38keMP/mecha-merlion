'use strict';

// 標準モデルとの比較、結果のグラフ、リザルト/レポート画面の文章

/* =========================================================
   標準モデル(簡易吸収・分解カーブ)との比較
   ========================================================= */
// 標準モデル: 摂取分がREF_RISE_MSかけて立ち上がり、全体として一定速度で分解される。
function buildReferenceModel(intakeLog, endMs) {
  const stepMs = GAUGE_SAMPLE_INTERVAL_MS;
  const series = [];
  let g = 0, prevRise = 0;
  for (let t = 0; t <= endMs + stepMs; t += stepMs) {
    let rise = 0;
    for (const intake of intakeLog) {
      if (t < intake.tMs) continue;
      rise += intake.amount * Math.min(1, (t - intake.tMs) / REF_RISE_MS);
    }
    g = Math.max(0, g + (rise - prevRise) - REF_ELIMINATION_PER_MS * stepMs);
    prevRise = rise;
    series.push(g);
  }
  return t => {
    const f = Math.max(0, t) / stepMs;
    const i = Math.min(series.length - 1, Math.floor(f));
    const j = Math.min(series.length - 1, i + 1);
    return series[i] + (series[j] - series[i]) * (f - i);
  };
}

function computeStandardComparison(s) {
  const log = s.intakeLog;
  if (log.length === 0 || s.gaugeHistory.length === 0) return null;

  const maxT = Math.max(s.survivalMs, 1);
  const ref = buildReferenceModel(log, maxT);
  let sumAbsDiff = 0, sumSignedDiff = 0, n = 0;
  s.gaugeHistory.forEach(p => {
    const refG = ref(p.tMs);
    sumAbsDiff += Math.abs(p.gauge - refG);
    sumSignedDiff += (p.gauge - refG);
    n++;
  });
  const avgAbsDiff = n ? sumAbsDiff / n : 0;
  const avgSignedDiff = n ? sumSignedDiff / n : 0;

  let verdict;
  if (avgAbsDiff < 8) verdict = '標準モデルに近い、落ち着いたペースでした。';
  else if (avgAbsDiff < 20) verdict = '標準モデルよりやや駆け足なペースでした。';
  else verdict = '標準モデルを大きく上回る、かなり急なペースでした。';

  return { avgAbsDiff, avgSignedDiff, verdict, maxT, log, ref };
}

function drawComparisonChart(ctx, canvasEl, s, comparison) {
  const w = canvasEl.width, h = canvasEl.height;
  ctx.clearRect(0, 0, w, h);
  drawPixelRect(ctx, 0, 0, w, h, '#2b1b3d');
  if (!comparison) return;

  const padding = 16;
  const maxT = comparison.maxT;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;
  const xAt = tMs => padding + (tMs / maxT) * plotW;
  const yAt = gauge => padding + plotH - (Math.min(Math.max(gauge, 0), 120) / 120) * plotH;

  ctx.strokeStyle = '#ffb70388';
  ctx.beginPath();
  ctx.moveTo(padding, yAt(80));
  ctx.lineTo(w - padding, yAt(80));
  ctx.stroke();

  ctx.strokeStyle = '#e2452caa';
  ctx.beginPath();
  ctx.moveTo(padding, yAt(100));
  ctx.lineTo(w - padding, yAt(100));
  ctx.stroke();

  // 飲むのをやめた時刻(ここから右は、遅れて回ってきた分)
  if (s.stopAtMs != null) {
    ctx.save();
    ctx.strokeStyle = '#f5ecd7aa';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(xAt(s.stopAtMs), padding);
    ctx.lineTo(xAt(s.stopAtMs), h - padding);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f5ecd7';
    ctx.font = '9px monospace';
    const stopX = xAt(s.stopAtMs);
    const nearLeft = stopX < padding + 40;
    ctx.textAlign = nearLeft ? 'left' : 'right';
    ctx.fillText(s.stoppedByTimeUp ? 'お開き' : 'やめた', stopX + (nearLeft ? 2 : -2), h - padding - 2);
    ctx.restore();
  }

  // 標準モデル曲線(破線)
  ctx.strokeStyle = '#ffd76a';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (maxT * i) / steps;
    const g = comparison.ref(t);
    const x = xAt(t), y = yAt(g);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // 記録モードの、実際の飲み会での推移(直近の1回。ゲーム内の時間に換算, record.js)
  const ghost = realSessionGhost(s.params);
  if (ghost) {
    ctx.strokeStyle = '#8fd3f4aa';
    ctx.setLineDash([1, 2]);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (maxT * i) / steps;
      const x = xAt(t), y = yAt(ghost(t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 自分の実際の曲線(実線)
  ctx.strokeStyle = '#7fd858';
  ctx.lineWidth = 2;
  ctx.beginPath();
  s.gaugeHistory.forEach((p, i) => {
    const x = xAt(p.tMs), y = yAt(p.gauge);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  s.drinkEvents.forEach(e => {
    const x = xAt(e.tMs), y = yAt(e.gaugeAtDrink);
    drawPixelRect(ctx, x - 2, y - 2, 4, 4, '#ffffff');
  });

  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7fd858';
  ctx.fillText('― あなた', padding, 12);
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('- - 標準モデル', padding + 54, 12);
  if (ghost) {
    ctx.fillStyle = '#8fd3f4';
    ctx.fillText('… 実際のあなた', padding + 138, 12);
  }
}

// 飲むのをやめた後、遅れて回ってきた酔いがどうなったか(早送りで確定した結果)
function buildAfterStopText() {
  if (state.stopAtMs == null) return '';
  const when = state.stoppedByTimeUp
    ? `お開き(${formatPartyClock(state.stopAtMs)})`
    : `${formatPartyClock(state.stopAtMs)}に飲むのをやめた時点`;
  const g0 = Math.round(state.gaugeAtStop);
  if (state.endedReason === 'mareLion') {
    return `${when}のゲージは<b>${g0}</b>でしたが、遅れて回ってきた分で<b>${formatPartyClock(state.fatalAtMs)}</b>に限界を超えてしまいました。やめても、飲んだ分は帳消しにはなりません。`;
  }
  const peak = state.peakAfterStop;
  if (peak.gauge - state.gaugeAtStop < 0.5) {
    return `${when}のゲージは<b>${g0}</b>。その後に遅れて回ってくる分はありませんでした。`;
  }
  return `${when}のゲージは<b>${g0}</b>でしたが、その後も遅れて酔いが回り、<b>${formatPartyClock(peak.tMs)}</b>にゲージ<b>${Math.round(peak.gauge)}</b>でピークを迎えました。`;
}

// 飲んだ純アルコール量を、適量の目安(1日1〜2単位 = 20〜40g)と比べる
function buildModerationText() {
  const grams = state.intakeLog.reduce((s, i) => s + i.grams, 0);
  if (grams < 0.5) return '';
  const units = grams / UNIT_G;
  const head = `今日飲んだのは純アルコール約<b>${Math.round(grams)}g</b>(<b>${units.toFixed(1)}単位</b>)。`;
  if (units <= MODERATE_MAX_UNITS) {
    return `${head}適量の目安(1日1〜2単位)の範囲内でした。`;
  }
  const lo = units / MODERATE_MAX_UNITS, hi = units;
  const ratio = lo.toFixed(1) === hi.toFixed(1) ? `約${hi.toFixed(1)}倍` : `約${lo.toFixed(1)}〜${hi.toFixed(1)}倍`;
  const lead = state.endedReason === 'mareLion' ? '' : '無事に帰れたとはいえ、';
  return `${head}${lead}適量の目安(1日1〜2単位 = 20〜40g)の<b>${ratio}</b>です。`;
}

/* ---------- result DOM (スコアアタック) ---------- */
function renderResultDom() {
  const tip = MODERATION_TIPS[Math.floor(Math.random() * MODERATION_TIPS.length)];
  const best = getHighScore(currentUser.id);
  const comparison = computeStandardComparison(state);

  let head;
  if (state.endedReason === 'mareLion') {
    resultTitleEl.textContent = '🌊 マーライオン!! 🌊';
    const revealText = state.fatalWhileStopping
      ? buildAfterStopText()
      : `実は、<b>${state.fatalName}</b>を飲んでいる最中に、すでに限界を超えていました。まだ効いてないだけだったんです…。`;
    head = `
      <div class="score-line">SCORE: ${state.finalScore}</div>
      <div>${state.isNewHighScore ? '🎉 ハイスコア更新!' : `ベスト: ${best}`}</div>
      <div style="margin-top:8px;">${revealText}</div>
      <div style="margin-top:8px;">${buildModerationText()}</div>
    `;
  } else {
    resultTitleEl.textContent = 'お疲れ様でした';
    head = `
      <div class="score-line">SCORE: ${state.finalScore}</div>
      <div>${state.isNewHighScore ? '🎉 ハイスコア更新!' : `ベスト: ${best}`}</div>
      <div style="margin-top:8px;">
        ${state.paceBonus > 0
          ? '最後まで安全ラインを守り切りました。ペース管理ボーナス +50!'
          : '危険ラインを超える場面もありましたが、無事に切り上げました。'}
      </div>
      <div style="margin-top:8px;">${buildAfterStopText()}</div>
      <div style="margin-top:8px;">${buildModerationText()}</div>
    `;
  }

  resultBodyEl.innerHTML = `
    ${head}
    ${comparison ? `<div style="margin-top:8px;">${comparison.verdict}<br>標準モデルとの平均乖離: <b>${comparison.avgAbsDiff.toFixed(1)}</b></div>` : ''}
    <div class="tip">${tip}<br>${STANDARD_MODEL_NOTE}</div>
  `;

  const rcCtx = resultChartCanvas.getContext('2d');
  rcCtx.imageSmoothingEnabled = false;
  drawComparisonChart(rcCtx, resultChartCanvas, state, comparison);
}

/* ---------- report DOM (練習モード) ---------- */
function buildCompareLine(current, past) {
  if (past.length === 0) return '';
  const parts = [];

  const pastIntervals = past.filter(p => p.avgIntervalMs != null);
  if (pastIntervals.length > 0 && current.avgIntervalMs != null) {
    const pastAvg = pastIntervals.reduce((s, p) => s + p.avgIntervalMs, 0) / pastIntervals.length;
    const diffPct = Math.round(((current.avgIntervalMs - pastAvg) / pastAvg) * 100);
    if (Math.abs(diffPct) >= 10) {
      parts.push(`平均飲酒間隔が過去平均より${diffPct > 0 ? '長く' : '短く'}なっています(${diffPct > 0 ? '+' : ''}${diffPct}%)`);
    }
  }

  const pastDangerAvg = past.reduce((s, p) => s + (p.dangerMs || 0), 0) / past.length;
  const diffDanger = current.dangerMs - pastDangerAvg;
  if (Math.abs(diffDanger) >= 3000) {
    parts.push(`危険水域の滞在時間が過去平均より${diffDanger > 0 ? '伸びて' : '短くなって'}います`);
  }

  return parts.join(' / ');
}

function renderReportDom() {
  const s = state.summary;
  reportTitleEl.textContent = s.outcome === 'mareLion' ? '🌊 マーライオンでした 🌊' : 'お疲れ様でした';

  const history = loadHistory(currentUser.id);
  const past = history.slice(0, -1);
  const compareLine = buildCompareLine(s, past);
  const tip = MODERATION_TIPS[Math.floor(Math.random() * MODERATION_TIPS.length)];
  const fmtInterval = s.avgIntervalMs != null ? `実時間${(s.avgIntervalMs / 1000).toFixed(1)}分` : '-';
  const comparison = computeStandardComparison(state);

  reportStatsEl.innerHTML = `
    <div>総飲酒量: <b>${s.totalGlassEq.toFixed(1)}単位</b>(純アルコール約${Math.round(s.totalGlassEq * UNIT_G)}g・お水 ${s.waterCount}回)</div>
    <div>${buildModerationText()}</div>
    <div>平均飲酒間隔: <b>${fmtInterval}</b></div>
    <div>危険水域(80%以上)滞在時間: <b>${(s.dangerMs / 1000).toFixed(1)}秒</b></div>
    <div>見込み飲みリスク指数: <b>${s.riskIndex.toFixed(1)}</b></div>
    ${s.outcome === 'mareLion' ? `<div>限界からのオーバーシュート: <b>+${s.overshoot}</b></div>` : ''}
    ${state.stopAtMs != null ? `<div style="margin-top:6px;">${buildAfterStopText()}</div>` : ''}
    ${comparison ? `<div style="margin-top:6px;">${comparison.verdict}(標準モデルとの平均乖離: ${comparison.avgAbsDiff.toFixed(1)})</div>` : ''}
    ${compareLine ? `<div style="margin-top:6px;">${compareLine}</div>` : ''}
    <div class="tip">${tip}<br>このレポートは自己観察の参考情報であり、医学的な診断ではありません。<br>${STANDARD_MODEL_NOTE}</div>
  `;

  const chCtx = reportChartCanvas.getContext('2d');
  chCtx.imageSmoothingEnabled = false;
  drawComparisonChart(chCtx, reportChartCanvas, state, comparison);
}
