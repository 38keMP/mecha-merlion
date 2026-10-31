'use strict';

// めっちゃマーライオン: 定数、お品書き(DRINKS)、練習モードの数値

const USERS_KEY = 'maerlion_users_v1';
const CURRENT_USER_KEY = 'maerlion_current_user_v1';
const HISTORY_KEY_PREFIX = 'maerlion_history_v1_';
const HIGHSCORE_KEY_PREFIX = 'maerlion_highscore_v1_';
const HISTORY_LIMIT = 20;
const GAUGE_SAMPLE_INTERVAL_MS = 500;

const POUR_TICK_MS = 100; // 長押し中、この間隔で少しずつ注ぎ込む

// 飲み会シナリオ: 実時間2時間の飲み会を120秒に圧縮 (1ゲーム秒 = 実時間1分 = 60倍速)。
// 飲むペースもこの比率に比例させる。
const PARTY_COMPRESSION = 60;
const GAME_MS = 120 * 1000;
const PARTY_START_MIN = 19 * 60; // 飲み会の開始時刻(19:00)
const GLASS_ML = 500;
const INTRO_MS = 4600;          // 入店アニメーション(のれん→光→19:00)の長さ
const INTRO_ENTER_MS = 1800;    // うち、店の外からのれんをくぐるまで
const INTRO_LIGHT_MS = 2600;    // 光が晴れて店内が見えるまで
const REPLAY_MS_PER_GAME_MS = 0.06; // 早送り: ゲーム内1秒(実時間1分)を60msで再生
const REPLAY_MIN_MS = 1500, REPLAY_MAX_MS = 4500;
const LIFT_MS = 260;   // 器を手に取って口元へ運ぶ時間(運び終わってから飲み始める)
const DROP_MS = 700;   // おかわりの器が上から「ドン!」と置かれる演出の長さ
const BURST_RESULT_DELAY_MS = 2200; // マーライオン(バースト)の吐き出し演出を見せてから結果へ

// 長押しの加速: ちびちびペース(実時間20分で1杯=ゲーム内20秒)から、
// 押し続けるほど加速して一気(実時間1分で1杯=ゲーム内1秒)に達する。
const SIP_GLASS_PER_SEC = 1 / 20;
const MAX_GLASS_PER_SEC = 1;
const RAMP_SECONDS = 8;

// 酔いゲージの自然減少: アセトアルデヒドなどの分解が常に進み、ゲージが少しずつ下がる。
// 1ポイント≒純アルコール1g。体重60kgの人が1時間に分解できる約7gに合わせ、実時間1時間(=60秒)で7ポイント。
const DECAY_POINTS_PER_HOUR = 7;
const GAUGE_DECAY_PER_MS = DECAY_POINTS_PER_HOUR / (60 * 1000);

const REF_RISE_MS = 45000;                  // 標準モデル: 摂取後、実時間45分(=45秒)かけて吸収される
const REF_ELIMINATION_PER_MS = GAUGE_DECAY_PER_MS; // 標準モデル: 1時間に7ポイントを一定速度で分解する簡易値

// 注文表(お品書き)。お酒はどれも1杯がおよそ1単位(純アルコール約20g)。
// 酔いゲージの上昇量 = 純アルコール量(g) = 量(ml) × 度数(%) ÷ 100 × 0.8
const pureAlcoholG = (ml, abv) => (ml * abv / 100) * 0.8;
const ALCOHOL_DELAY_MS = 45000, ALCOHOL_JITTER_MS = 15000;
const MENU = [
  { id: 'beer', name: 'ビール', abv: 5, serving: '中ジョッキ', glassMl: GLASS_ML, color: '#f2a81d' },
  { id: 'sake', name: '日本酒', abv: 15, serving: '1合(枡)', glassMl: 180, color: '#f3efd9' },
  { id: 'shochu', name: '焼酎', abv: 25, serving: 'ロック', glassMl: 110, color: '#e6eef0' },
  { id: 'whisky', name: 'ウイスキー', abv: 43, serving: 'ダブル', glassMl: 60, color: '#c8782a' },
  { id: 'wine', name: 'ワイン', abv: 14, serving: 'グラス', glassMl: 180, color: '#9b1d3a' },
  { id: 'chuhai', name: 'チューハイ', abv: 5, serving: '1.5缶分', glassMl: 520, color: '#e9f2b0' },
  // お水は酔いゲージに影響しない(その場の酔いは水では防げない)。一定のペースで飲む。
  { id: 'water', name: 'お水', abv: 0, serving: 'グラス', glassMl: 300, color: '#8fd3f4', mlPerSec: 75 },
];
// vessel は器の描き方(VESSELS のキー)。記録モードのマイドリンクも実行時にここへ登録する
const DRINKS = Object.fromEntries(MENU.map(d => [d.id, {
  ...d,
  vessel: d.id,
  amount: pureAlcoholG(d.glassMl, d.abv),
  delay: ALCOHOL_DELAY_MS, jitter: ALCOHOL_JITTER_MS,
}]));

// 練習モードで使う数値。記録が5回以上たまると、記録モードで推定した「あなた専用」の数値になる
const STANDARD_LIMIT_G = 100;
function standardGameParams() {
  return { pointsPerG: 100 / STANDARD_LIMIT_G, delayMs: ALCOHOL_DELAY_MS, jitterMs: ALCOHOL_JITTER_MS, decayPerMs: GAUGE_DECAY_PER_MS, personal: null };
}
const isAlcohol = id => DRINKS[id].abv > 0;
const UNIT_G = 20;               // 1単位 = 純アルコール20g
const MODERATE_MAX_UNITS = 2;    // 適量の目安: 1日1〜2単位
const EMPTY_CLEAR_MS = 700;      // 飲み干した器が下げられるまで

function glassRateAt(holdMs) {
  const ramp = Math.min(1, holdMs / (RAMP_SECONDS * 1000));
  return SIP_GLASS_PER_SEC + (MAX_GLASS_PER_SEC - SIP_GLASS_PER_SEC) * ramp;
}

const MODERATION_TIPS = [
  'お水を挟みながら飲むと、翌日の調子が変わります。',
  'お酒の効果はゆっくり遅れて出ます。「まだ平気」の時が一番危険。',
  '一気飲みは急性アルコール中毒のリスクを高めます。自分のペースを大切に。',
  '飲みすぎたと感じたら、無理せずその日はそこで切り上げましょう。',
];

const STANDARD_MODEL_NOTE =
  '※「標準モデル」は、摂取後ゆるやかに立ち上がり時間とともに一定速度で分解される、という簡易的な吸収・分解モデルによる参考曲線です。実際のBACや個人差を正確に表すものではありません。';
