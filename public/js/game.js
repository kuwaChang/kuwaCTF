const SAVE_KEY = "ctfRpgSaveV1";
const SAVE_SIGNATURE_KEY = "ctfRpgSaveSigV1";
const GAME_DATA_URL = "/data/game-data.json";
const CHEAT_ACHIEVEMENT_ID = "rpg_cheat";

let stageTable = [];
let shopItems = [];
let runtimeSaveSnapshot = null;
let runtimeSigSnapshot = null;
let isInternalSaveWrite = false;
let storageTamperHooked = false;
let cheatAchievementConfirmed = false;
let lastCheatReportAt = 0;
let lastReportedTamperFingerprint = null;
const CHEAT_REPORT_COOLDOWN_MS = 30 * 1000;

// レベルアップ関連設定
const MAX_LEVEL = 99;
// レベルアップ時に上昇するステータス量
const LEVEL_GROWTH = { maxHp: 12, atk: 3, def: 2, lucky: 1 };

// 次のレベルまでに必要な経験値。レベルが上がるほど必要量が増加する。
function expRequiredForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(80 * Math.pow(1.25, lv - 1));
}

function createDefaultState() {
  const firstStageId = stageTable[0]?.id ?? 1;
  const firstEnemy = stageTable[0]?.enemies?.[0] ?? {};
  const firstEnemyHp = firstEnemy.maxHp ?? 100;
  const stageClears = {};
  stageTable.forEach((stage) => {
    stageClears[stage.id] = [];
  });
  if (!stageClears[firstStageId]) {
    stageClears[firstStageId] = [];
  }
  return {
    gp: 0,
    syncedScore: 0,
    gpAwardedProblems: [],
    player: {
      level: 1,
      exp: 0,
      maxHp: 120,
      hp: 120,
      atk: 20,
      def: 12,
      lucky: 5,
      guard: false
    },
    equipment: { weapon: null, armor: null, accessory: null },
    inventory: [],
    selectedStage: firstStageId,
    currentEnemyIndex: 0,
    stageClears,
    enemyHp: firstEnemyHp,
    enemyActionCount: getEnemyActionInterval(firstEnemy),
    log: ["RPGモードへようこそ。CTF得点を同期して育成を始めよう。"],
    cheatFlags: {
      detected: false,
      reported: false,
      reasons: []
    }
  };
}

let state = null;

// 1ターン中に発生した演出をためておき、render()後にまとめて再生する。
// render()はenemyAreaのHTMLを作り直すため、演出はDOM再構築後に実行する必要がある。
let pendingEffects = [];

const ui = {
  playerSummary: document.getElementById("playerSummary"),
  enemyArea: document.getElementById("enemyArea"),
  battleLog: document.getElementById("battleLog"),
  growthInfo: document.getElementById("growthInfo"),
  shopList: document.getElementById("shopList"),
  syncMessage: document.getElementById("syncMessage"),
  syncScoreBtn: document.getElementById("syncScoreBtn"),
  stageSelection: document.getElementById("stageSelection"),
  currentStageInfo: document.getElementById("currentStageInfo"),
  attackBtn: document.getElementById("attackBtn"),
  guardBtn: document.getElementById("guardBtn"),
  nextEnemyBtn: document.getElementById("nextEnemyBtn"),
  stageClearActions: document.getElementById("stageClearActions"),
  playerHpFill: document.getElementById("playerHpFill"),
  playerHpText: document.getElementById("playerHpText")
};

init();

async function init() {
  try {
    await loadGameData();
  } catch (err) {
    console.error(err);
    if (ui.syncMessage) {
      ui.syncMessage.textContent = "ゲームデータの読み込みに失敗しました。";
    }
    return;
  }
  state = await loadState();
  bindEvents();
  render();
}

async function loadGameData() {
  const res = await fetch(GAME_DATA_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("ゲームデータの取得に失敗しました。");
  }
  const data = await res.json();
  if (!Array.isArray(data?.stages) || data.stages.length === 0) {
    throw new Error("ゲームデータ形式が不正です。");
  }
  stageTable = data.stages;
  shopItems = Array.isArray(data?.shopItems) ? data.shopItems : [];
}

function bindEvents() {
  installStorageTamperHooks();
  // 初回のユーザー操作（クリック）時に効果音を事前読み込みしておく。
  // 自動再生ポリシー対策も兼ね、一度だけ実行する。
  window.addEventListener("pointerdown", preloadSfx, { once: true });
  if (ui.syncScoreBtn) {
    ui.syncScoreBtn.addEventListener("click", syncScoreFromServer);
  }
  if (ui.attackBtn) {
    ui.attackBtn.addEventListener("click", onAttack);
  }
  if (ui.guardBtn) {
    ui.guardBtn.addEventListener("click", onGuard);
  }
  if (ui.nextEnemyBtn) {
    ui.nextEnemyBtn.addEventListener("click", onNextEnemy);
  }
  if (ui.stageSelection) {
    ui.stageSelection.addEventListener("click", onStageSelectionClick);
  }
  setInterval(() => {
    checkAndHandleLocalTamper("local_storage_poll");
  }, 1500);
  window.addEventListener("focus", () => {
    checkAndHandleLocalTamper("local_storage_focus");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkAndHandleLocalTamper("local_storage_visible");
    }
  });
}

async function syncScoreFromServer() {
  checkAndHandleLocalTamper("local_storage_sync");
  if (ui.syncMessage) ui.syncMessage.textContent = "同期中...";
  try {
    const res = await fetch("/getScore", { credentials: "include" });
    if (!res.ok) {
      throw new Error("ログイン状態を確認してください");
    }
    const data = await res.json();
    const incoming = Number(data.score || 0);
    if (!Number.isFinite(incoming)) {
      throw new Error("得点データが不正です");
    }

    const reward = await syncGpFromSolvedProblems();
    state.syncedScore = incoming;
    if (reward > 0) {
      pushLog(`CTF解答を同期: +${reward} GP`);
    } else {
      pushLog("CTF解答を同期: 新しいGP獲得はありません。");
    }
    if (ui.syncMessage) ui.syncMessage.textContent = `同期完了: score ${incoming} / GP ${state.gp}`;
    saveState();
    render();
  } catch (err) {
    if (ui.syncMessage) ui.syncMessage.textContent = "同期失敗: ログイン後に再実行してください。";
    pushLog(`同期エラー: ${err.message}`);
    render();
  }
}

async function syncGpFromSolvedProblems() {
  const [solvedRes, quizRes] = await Promise.all([
    fetch("/quiz/solvedList", { credentials: "include" }),
    fetch("/api/quizData", { credentials: "include" })
  ]);
  if (!solvedRes.ok || !quizRes.ok) {
    throw new Error("問題同期に失敗しました");
  }

  const solvedList = await solvedRes.json();
  const quizData = await quizRes.json();
  const rewardedSet = new Set(Array.isArray(state.gpAwardedProblems) ? state.gpAwardedProblems : []);

  let gained = 0;
  for (const solved of solvedList) {
    const key = `${solved.category}:${solved.qid}`;
    if (rewardedSet.has(key)) continue;

    const problem = quizData?.[solved.category]?.[solved.qid];
    const basePoint = Number(problem?.point || 0);
    const gpReward = calcProblemGp(basePoint);
    gained += gpReward;
    rewardedSet.add(key);
  }

  if (gained > 0) {
    state.gp += gained;
  }
  state.gpAwardedProblems = Array.from(rewardedSet);
  return gained;
}

function onAttack() {
  checkAndHandleLocalTamper("local_storage_attack");
  if (state.player.hp <= 0) {
    pushLog("あなたは戦闘不能です。次の敵へ進んで再挑戦してください。");
    render();
    return;
  }
  if (state.enemyHp <= 0) {
    pushLog("敵はすでに倒れています。次の敵へ進みましょう。");
    render();
    return;
  }
  runBattleTurn("attack");
}

function onGuard() {
  checkAndHandleLocalTamper("local_storage_guard");
  if (state.player.hp <= 0 || state.enemyHp <= 0) {
    pushLog("今は防御できません。");
    render();
    return;
  }
  state.player.guard = true;
  runBattleTurn("guard");
}

function onNextEnemy() {
  checkAndHandleLocalTamper("local_storage_next_enemy");
  if (state.enemyHp > 0 && state.player.hp > 0) {
    pushLog("敵を倒してから次へ進んでください。");
    render();
    return;
  }
  const stage = getCurrentStage();
  // 敵を撃破済みなら次の敵へ。最後の敵を倒した後は先頭に戻って周回できる。
  // 敗北した場合は同じ敵に再挑戦する（インデックス据え置き）。
  if (state.enemyHp <= 0) {
    const looped = state.currentEnemyIndex + 1 >= stage.enemies.length;
    state.currentEnemyIndex = looped ? 0 : state.currentEnemyIndex + 1;
    if (looped) {
      pushLog(`${stage.name} を周回。先頭の敵から再挑戦する。`);
    }
  }
  const enemy = getCurrentEnemy();
  state.enemyHp = enemy.maxHp;
  state.enemyActionCount = getEnemyActionInterval(enemy);
  state.player.hp = state.player.maxHp;
  state.player.guard = false;
  pushLog(`次の敵「${enemy.name}」が現れた。HPが全回復した。`);
  saveState();
  render();
}

function runBattleTurn(action) {
  const enemy = getCurrentEnemy();
  const playerStats = effectivePlayerStats();
  playerAction(action, enemy, playerStats);
  if (state.enemyHp > 0 && state.player.hp > 0) {
    tickEnemyAction(enemy, playerStats);
  }

  if (state.enemyHp <= 0) {
    state.enemyHp = 0;
    state.gp += enemy.reward;
    markEnemyCleared(getCurrentStage().id, enemy.key);
    pushLog(`${enemy.name}を撃破。${enemy.reward} GPを獲得。`);
    gainExp(getEnemyExp(enemy));
    if (isStageCleared(getCurrentStage().id)) {
      pushLog(`${getCurrentStage().name} を全クリア。次のステージが解放されます。`);
    }
  }
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    pushLog("敗北した。次の敵へ進むとHPが回復します。");
  }

  state.player.guard = false;
  saveState();
  render();
  flushEffects();
}

function playerAction(action, enemy, stats) {
  if (action === "guard") {
    pushLog("防御体勢に入った。受けるダメージを軽減する。");
    pendingEffects.push({ type: "guard" });
    return;
  }
  const baseDmg = calcDamage(stats.atk, enemy.def);
  const critical = isCriticalHit(stats.lucky);
  const dmg = critical ? Math.floor(baseDmg * 1.5) : baseDmg;
  state.enemyHp -= dmg;
  if (critical) {
    pushLog(`クリティカル！ あなたの攻撃: ${enemy.name}に ${dmg} ダメージ。`);
  } else {
    pushLog(`あなたの攻撃: ${enemy.name}に ${dmg} ダメージ。`);
  }
  pendingEffects.push({ type: "enemyHit", dmg, critical });
}

// luckyの値がそのままクリティカル発生率(%)になる（上限100%）
function isCriticalHit(lucky) {
  const chance = Math.max(0, Math.min(100, Number(lucky) || 0));
  return Math.random() * 100 < chance;
}

function enemyAction(enemy, stats) {
  const raw = calcDamage(enemy.atk, stats.def);
  const dmg = state.player.guard ? Math.max(1, Math.floor(raw * 0.45)) : raw;
  state.player.hp -= dmg;
  pushLog(`${enemy.name}の攻撃: あなたに ${dmg} ダメージ。`);
  pendingEffects.push({ type: "playerHit", dmg, guarded: state.player.guard });
}

function tickEnemyAction(enemy, stats) {
  state.enemyActionCount -= 1;
  if (state.enemyActionCount <= 0) {
    enemyAction(enemy, stats);
    state.enemyActionCount = getEnemyActionInterval(enemy);
    return;
  }
  pushLog(`${enemy.name}は様子を見ている…（攻撃まで ${state.enemyActionCount}）`);
}

// 敵撃破時に得られる経験値。game-data.json の exp を優先し、未設定なら reward 値を使う。
function getEnemyExp(enemy) {
  const exp = Number(enemy?.exp);
  if (Number.isFinite(exp) && exp >= 0) {
    return Math.floor(exp);
  }
  const reward = Number(enemy?.reward);
  return Number.isFinite(reward) && reward >= 0 ? Math.floor(reward) : 0;
}

function getEnemyActionInterval(enemy) {
  const interval = Number(enemy?.actionInterval);
  if (Number.isFinite(interval) && interval >= 1) {
    return Math.floor(interval);
  }
  return 2;
}

function calcDamage(attackerAtk, defenderDef) {
  const base = attackerAtk - Math.floor(defenderDef * 0.45);
  const spread = Math.floor(Math.random() * 6);
  return Math.max(1, base + spread);
}

// 経験値を加算し、必要経験値に達していればレベルアップする。
function gainExp(amount) {
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  if (gained <= 0) return;

  if (state.player.level >= MAX_LEVEL) {
    state.player.exp = 0;
    pushLog(`経験値 +${gained}（最大レベル到達済み）`);
    return;
  }

  state.player.exp = (Number(state.player.exp) || 0) + gained;
  pushLog(`経験値を ${gained} 獲得。`);

  while (state.player.level < MAX_LEVEL) {
    const need = expRequiredForLevel(state.player.level);
    if (state.player.exp < need) break;
    state.player.exp -= need;
    levelUp();
  }

  if (state.player.level >= MAX_LEVEL) {
    state.player.exp = 0;
  }
}

// レベルアップでステータスを強化する（GP消費なし）。
function levelUp() {
  state.player.level += 1;
  state.player.maxHp += LEVEL_GROWTH.maxHp;
  state.player.hp += LEVEL_GROWTH.maxHp;
  state.player.atk += LEVEL_GROWTH.atk;
  state.player.def += LEVEL_GROWTH.def;
  state.player.lucky += LEVEL_GROWTH.lucky;
  pushLog(
    `🎉 レベルアップ！ Lv${state.player.level} になった。` +
      `HP+${LEVEL_GROWTH.maxHp} ATK+${LEVEL_GROWTH.atk} DEF+${LEVEL_GROWTH.def} LUCKY+${LEVEL_GROWTH.lucky}`
  );
}

const SHOP_SLOTS = [
  { slot: "weapon", label: "武器" },
  { slot: "armor", label: "防具" },
  { slot: "accessory", label: "装飾" }
];

function renderShop() {
  if (!ui.shopList) return;
  ui.shopList.innerHTML = "";
  SHOP_SLOTS.forEach(({ slot, label }) => {
    const items = shopItems.filter((item) => item.slot === slot);
    if (items.length === 0) return;

    const group = document.createElement("section");
    group.className = "shop-group";

    const title = document.createElement("h3");
    title.className = "shop-group-title";
    title.textContent = label;
    group.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "shop-group-grid";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "shop-item";
      const owned = state.inventory.includes(item.id);
      const equipped = state.equipment[item.slot] === item.id;
      card.innerHTML = `
        <strong>${item.name}</strong><br>
        費用: ${item.cost} GP<br>
        補正: ATK ${signed(item.atk)} / DEF ${signed(item.def)} / LUCKY ${signed(item.lucky ?? 0)}<br>
        <button data-buy="${item.id}" ${owned ? "disabled" : ""}>${owned ? "購入済み" : "購入"}</button>
        <button data-equip="${item.id}" ${owned ? "" : "disabled"}>${equipped ? "装備中" : "装備"}</button>
      `;
      grid.appendChild(card);
    });
    group.appendChild(grid);

    ui.shopList.appendChild(group);
  });

  ui.shopList.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => buyItem(btn.dataset.buy));
  });
  ui.shopList.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.addEventListener("click", () => equipItem(btn.dataset.equip));
  });
}

function buyItem(itemId) {
  checkAndHandleLocalTamper("local_storage_buy");
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) return;
  if (state.inventory.includes(item.id)) return;
  if (state.gp < item.cost) {
    pushLog(`GP不足: ${item.name} は ${item.cost} GP 必要。`);
    render();
    return;
  }
  state.gp -= item.cost;
  state.inventory.push(item.id);
  pushLog(`${item.name} を購入した。`);
  saveState();
  render();
}

function equipItem(itemId) {
  checkAndHandleLocalTamper("local_storage_equip");
  if (!state.inventory.includes(itemId)) return;
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) return;
  state.equipment[item.slot] = item.id;
  pushLog(`${item.name} を装備した。`);
  saveState();
  render();
}

function effectivePlayerStats() {
  const stats = {
    maxHp: state.player.maxHp,
    atk: state.player.atk,
    def: state.player.def,
    lucky: state.player.lucky ?? 0
  };
  Object.values(state.equipment).forEach((itemId) => {
    if (!itemId) return;
    const item = shopItems.find((i) => i.id === itemId);
    if (!item) return;
    stats.atk += item.atk;
    stats.def += item.def;
    stats.lucky += item.lucky ?? 0;
  });
  return stats;
}

// render()でDOMを作り直した後に、ためておいた演出をまとめて再生する。
function flushEffects() {
  if (!pendingEffects.length) return;
  const effects = pendingEffects;
  pendingEffects = [];
  effects.forEach((fx) => {
    if (fx.type === "enemyHit") {
      playEnemyHitEffect(fx.dmg, fx.critical);
    } else if (fx.type === "playerHit") {
      playPlayerHitEffect(fx.dmg, fx.guarded);
    } else if (fx.type === "guard") {
      playGuardEffect();
    }
  });
}

// 一定時間後に要素を取り除くヘルパー
function removeAfter(el, ms) {
  if (!el) return;
  setTimeout(() => {
    el.remove();
  }, ms);
}

// ===== サウンド（mp3などの音声ファイルを再生） =====
const SFX_SOURCES = {
  attack: "/audio/attack.mp3",       // 通常攻撃の命中音
  critical: "/audio/critical.mp3",   // クリティカル時に重ねる音
  playerHit: "/audio/player_hit.mp3",// プレイヤー被弾音
  guard: "/audio/guard.mp3"          // 防御音
};

// 全体の音量（0.0〜1.0）
const SFX_VOLUME = 0.4;

let audioCtx = null;
const sfxBuffers = {};   // key -> AudioBuffer（デコード済み）
const sfxLoading = {};   // key -> Promise（多重ロード防止）
const sfxWarned = {};    // key -> true（読み込み失敗の警告を一度だけ出す）

// ユーザー操作（攻撃ボタン等）起点で初回に生成する。自動再生ポリシー対策で resume も行う。
function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// 音声ファイルを取得してデコードし、AudioBufferをキャッシュする。
function loadSfx(key) {
  const url = SFX_SOURCES[key];
  if (!url) return Promise.resolve(null);
  if (sfxBuffers[key]) return Promise.resolve(sfxBuffers[key]);
  if (sfxLoading[key]) return sfxLoading[key];

  const ctx = getAudioContext();
  if (!ctx) return Promise.resolve(null);

  sfxLoading[key] = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
    .then((buffer) => {
      sfxBuffers[key] = buffer;
      return buffer;
    })
    .catch((err) => {
      if (!sfxWarned[key]) {
        sfxWarned[key] = true;
        console.warn(`効果音の読み込みに失敗しました (${key}: ${url})`, err);
      }
      return null;
    });
  return sfxLoading[key];
}

// デコード済みバッファを再生する。連打時も重ねて再生できる。
function playBuffer(key, { volume = 1, delay = 0 } = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const buffer = sfxBuffers[key];
  if (!buffer) {
    // 未ロードなら読み込んでから再生（初回はわずかに遅れる可能性あり）
    loadSfx(key).then((buf) => {
      if (buf) playBuffer(key, { volume, delay });
    });
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = SFX_VOLUME * volume;
  src.connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}

// 事前読み込み（初回のユーザー操作時に呼ぶと、以降の再生が途切れない）
function preloadSfx() {
  Object.keys(SFX_SOURCES).forEach((key) => loadSfx(key));
}

// 敵への攻撃命中音
function playAttackSound(critical) {
  playBuffer("attack");
  if (critical) {
    // クリティカルは専用音を少し遅らせて重ねる（ファイルが無ければ無音でスキップ）
    playBuffer("critical", { delay: 0.05 });
  }
}

// プレイヤー被弾音
function playPlayerHitSound(guarded) {
  // ガード時は音量を控えめにする
  playBuffer("playerHit", { volume: guarded ? 0.5 : 1 });
}

// 防御音
function playGuardSound() {
  playBuffer("guard");
}

// 敵への攻撃命中演出（斬撃・被弾フラッシュ・シェイク・ダメージ数値）
function playEnemyHitEffect(dmg, critical) {
  const wrap = ui.enemyArea?.querySelector(".enemy-visual-wrap");
  const image = ui.enemyArea?.querySelector(".enemy-image");
  if (!wrap) return;

  // エフェクトと同時に攻撃音を鳴らす
  playAttackSound(critical);

  const slash = document.createElement("div");
  slash.className = "fx-slash" + (critical ? " critical" : "");
  wrap.appendChild(slash);
  removeAfter(slash, critical ? 650 : 480);

  if (critical) {
    const burst = document.createElement("div");
    burst.className = "fx-crit-burst";
    burst.textContent = "CRITICAL!";
    wrap.appendChild(burst);
    removeAfter(burst, 900);
  }

  const hitTarget = image || wrap;
  hitTarget.classList.remove("fx-hit-shake", "fx-hit-flash");
  // リフローを挟んでアニメーションを確実に再スタートさせる
  void hitTarget.offsetWidth;
  hitTarget.classList.add("fx-hit-shake", "fx-hit-flash");
  setTimeout(() => {
    hitTarget.classList.remove("fx-hit-shake", "fx-hit-flash");
  }, critical ? 600 : 450);

  spawnDamageNumber(wrap, dmg, critical ? "enemy critical" : "enemy");
}

// プレイヤーの被弾演出（画面の赤フラッシュ・揺れ・ダメージ数値）
function playPlayerHitEffect(dmg, guarded) {
  // エフェクトと同時に被弾音を鳴らす
  playPlayerHitSound(guarded);

  const screen = document.querySelector(".battle-screen");
  if (screen) {
    screen.classList.remove("fx-screen-hit");
    void screen.offsetWidth;
    screen.classList.add("fx-screen-hit");
    setTimeout(() => screen.classList.remove("fx-screen-hit"), 450);
  }
  const hpWrap = document.querySelector(".player-hp-wrap");
  if (hpWrap) {
    spawnDamageNumber(hpWrap, dmg, guarded ? "player guarded" : "player");
  }
}

// 防御演出（プレイヤーHPバー周りに青いシールドフラッシュ）
function playGuardEffect() {
  // エフェクトと同時に防御音を鳴らす
  playGuardSound();

  const hpWrap = document.querySelector(".player-hp-wrap");
  if (!hpWrap) return;
  const shield = document.createElement("div");
  shield.className = "fx-guard-shield";
  hpWrap.appendChild(shield);
  removeAfter(shield, 600);
}

// 指定要素の中央付近に、ふわっと浮き上がるダメージ数値を出す
function spawnDamageNumber(container, dmg, variantClass) {
  const num = document.createElement("div");
  num.className = `fx-damage-number ${variantClass}`;
  num.textContent = `-${dmg}`;
  // 少しランダムに左右へずらして連打時の重なりを避ける
  const offsetX = Math.floor(Math.random() * 40) - 20;
  num.style.setProperty("--fx-x", `${offsetX}px`);
  container.appendChild(num);
  removeAfter(num, 900);
}

function hpBarColor(percent) {
  // 100% -> 緑 (hue 120), 0% -> 赤 (hue 0)
  const hue = Math.round(Math.max(0, Math.min(100, percent)) * 1.2);
  return `hsl(${hue}, 75%, 45%)`;
}

function render() {
  const stage = getCurrentStage();
  const enemy = getCurrentEnemy();
  const stats = effectivePlayerStats();
  if (ui.playerSummary) {
    const playerHp = Math.max(0, state.player.hp);
    const playerHpPercent = Math.max(0, Math.min(100, Math.round((playerHp / stats.maxHp) * 100)));
    const atMaxLevel = state.player.level >= MAX_LEVEL;
    const expNow = Math.max(0, Number(state.player.exp) || 0);
    const expNeed = expRequiredForLevel(state.player.level);
    const expPercent = atMaxLevel ? 100 : Math.max(0, Math.min(100, Math.round((expNow / expNeed) * 100)));
    const expValueText = atMaxLevel ? "MAX" : `${expNow} / ${expNeed}`;
    const statRow = (label, value, max, cls) => {
      const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      return `
        <div class="player-stat-row">
          <span class="player-stat-label">${label}</span>
          <div class="player-stat-bar"><div class="player-stat-fill ${cls}" style="width: ${percent}%;"></div></div>
          <span class="player-stat-value">${value}</span>
        </div>`;
    };
    ui.playerSummary.innerHTML = `
      <div class="player-card">
        <div class="player-portrait">
          <img src="/images/player.png" alt="プレイヤー">
          <div class="player-level-badge">Lv ${state.player.level}</div>
        </div>
        <div class="player-detail">
          <div class="player-headline">
            <span class="player-name">プレイヤー</span>
            <span class="player-gp-badge">GP ${state.gp}</span>
          </div>
          <div class="player-stat-row">
            <span class="player-stat-label">HP</span>
            <div class="player-stat-bar"><div class="player-stat-fill hp" style="width: ${playerHpPercent}%; background: ${hpBarColor(playerHpPercent)};"></div></div>
            <span class="player-stat-value">${playerHp} / ${stats.maxHp}</span>
          </div>
          <div class="player-stat-row">
            <span class="player-stat-label">EXP</span>
            <div class="player-stat-bar"><div class="player-stat-fill exp" style="width: ${expPercent}%;"></div></div>
            <span class="player-stat-value">${expValueText}</span>
          </div>
          ${statRow("ATK", stats.atk, 120, "atk")}
          ${statRow("DEF", stats.def, 120, "def")}
          ${statRow("LUCKY", stats.lucky, 100, "lucky")}
          <div class="player-equip-list">
            <span class="player-equip-chip">武器: ${equipName("weapon")}</span>
            <span class="player-equip-chip">防具: ${equipName("armor")}</span>
            <span class="player-equip-chip">装飾: ${equipName("accessory")}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (ui.enemyArea) {
    const enemyHp = Math.max(0, state.enemyHp);
    const hpPercent = Math.max(0, Math.min(100, Math.round((enemyHp / enemy.maxHp) * 100)));
    const enemyActionCount = Math.max(0, Number(state.enemyActionCount ?? getEnemyActionInterval(enemy)));
    const enemyVisual = enemy.image
      ? `<img class="enemy-image" src="${enemy.image}" alt="${enemy.name}">`
      : `<div class="enemy-image-placeholder">${enemy.name}</div>`;

    ui.enemyArea.innerHTML = `
      <div class="enemy-box">
        <div class="enemy-name">${enemy.name}</div>
        <div class="enemy-visual-wrap">
          <div class="enemy-action-count">行動 ${enemyActionCount}</div>
          ${enemyVisual}
        </div>
        <div class="enemy-hp-wrap">
          <div class="enemy-hp-bar">
            <div class="enemy-hp-fill" style="width: ${hpPercent}%; background: ${hpBarColor(hpPercent)};"></div>
          </div>
          <div class="enemy-hp-text">HP: ${enemyHp} / ${enemy.maxHp}</div>
        </div>
        <div class="enemy-meta">ATK: ${enemy.atk} / DEF: ${enemy.def}</div>
        撃破報酬: ${enemy.reward} GP / EXP ${getEnemyExp(enemy)}
      </div>
    `;
  }

  if (ui.currentStageInfo) {
    const cleared = getClearedCount(stage.id);
    const total = stage.enemies.length;
    ui.currentStageInfo.textContent = `${stage.name} (${cleared}/${total} クリア)`;
  }

  const stageCleared = isStageCleared(stage.id);
  const battleOngoing = state.enemyHp > 0 && state.player.hp > 0;
  if (ui.attackBtn) {
    ui.attackBtn.disabled = !battleOngoing;
  }
  if (ui.guardBtn) {
    ui.guardBtn.disabled = !battleOngoing;
  }
  if (ui.nextEnemyBtn) {
    // 戦闘決着（敵撃破 or 敗北）まで押せない。クリア後も周回できるよう有効のまま。
    ui.nextEnemyBtn.disabled = battleOngoing;
  }
  if (ui.stageClearActions) {
    ui.stageClearActions.classList.toggle("visible", stageCleared);
  }

  if (ui.battleLog) {
    ui.battleLog.textContent = state.log.slice(-3).join("\n");
  }
  if (ui.playerHpFill && ui.playerHpText) {
    const hp = Math.max(0, state.player.hp);
    const hpPercent = Math.max(0, Math.min(100, Math.round((hp / stats.maxHp) * 100)));
    ui.playerHpFill.style.width = `${hpPercent}%`;
    ui.playerHpFill.style.background = hpBarColor(hpPercent);
    ui.playerHpText.textContent = `${hp} / ${stats.maxHp}`;
  }
  renderGrowthInfo();
  renderShop();
  renderStageSelection();
}

function renderGrowthInfo() {
  if (!ui.growthInfo) return;
  const atMaxLevel = state.player.level >= MAX_LEVEL;
  const expNow = Math.max(0, Number(state.player.exp) || 0);
  const expNeed = expRequiredForLevel(state.player.level);
  const remaining = atMaxLevel ? 0 : Math.max(0, expNeed - expNow);
  ui.growthInfo.innerHTML = `
    <p class="growth-lead">敵を倒して経験値を貯めると自動でレベルアップし、ステータスが強化されます。レベルが上がるほど次のレベルに必要な経験値は増加します。</p>
    <div class="growth-stats">
      <span class="growth-chip">現在 Lv ${state.player.level}${atMaxLevel ? "（MAX）" : ""}</span>
      <span class="growth-chip">EXP ${atMaxLevel ? "MAX" : `${expNow} / ${expNeed}`}</span>
      <span class="growth-chip">${atMaxLevel ? "最大レベル到達" : `次のレベルまで ${remaining}`}</span>
    </div>
    <p class="growth-bonus">レベルアップ毎の上昇: HP +${LEVEL_GROWTH.maxHp} / ATK +${LEVEL_GROWTH.atk} / DEF +${LEVEL_GROWTH.def} / LUCKY +${LEVEL_GROWTH.lucky}</p>
  `;
}

function equipName(slot) {
  const itemId = state.equipment[slot];
  if (!itemId) return "なし";
  const item = shopItems.find((i) => i.id === itemId);
  return item ? item.name : "なし";
}

function getCurrentStage() {
  const found = stageTable.find((s) => s.id === state.selectedStage);
  return found || stageTable[0];
}

function getCurrentEnemy() {
  const stage = getCurrentStage();
  const index = Math.max(0, Math.min(stage.enemies.length - 1, state.currentEnemyIndex));
  return stage.enemies[index];
}

function pushLog(text) {
  state.log.push(text);
}

async function loadState() {
  const defaultState = createDefaultState();
  try {
    const { state: localState, tampered } = loadStateFromLocalStorage();
    if (localState) {
      const mergedLocal = mergeStateWithDefaults(localState, defaultState);
      if (tampered) {
        await recordCheatDetected("save_signature_mismatch", mergedLocal);
      }
      writeStateToLocal(mergedLocal);
      updateRuntimeSaveSnapshot(mergedLocal);
      return mergedLocal;
    }

    const initialState = structuredClone(defaultState);
    updateRuntimeSaveSnapshot(initialState);
    return initialState;
  } catch {
    const fallbackState = structuredClone(defaultState);
    updateRuntimeSaveSnapshot(fallbackState);
    return fallbackState;
  }
}

function saveState() {
  writeStateToLocal(state);
  updateRuntimeSaveSnapshot(state);
}

function loadStateFromLocalStorage() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return { state: null, tampered: false };
  try {
    const parsed = JSON.parse(raw);
    const savedSig = localStorage.getItem(SAVE_SIGNATURE_KEY);
    const currentSig = hashString(raw);
    const tampered = Boolean(savedSig) && savedSig !== currentSig;
    return { state: parsed, tampered };
  } catch {
    return { state: null, tampered: true };
  }
}

function writeStateToLocal(nextState) {
  const raw = JSON.stringify(nextState);
  isInternalSaveWrite = true;
  try {
    localStorage.setItem(SAVE_KEY, raw);
    localStorage.setItem(SAVE_SIGNATURE_KEY, hashString(raw));
  } finally {
    isInternalSaveWrite = false;
  }
}

function updateRuntimeSaveSnapshot(targetState) {
  const raw = JSON.stringify(targetState);
  runtimeSaveSnapshot = raw;
  runtimeSigSnapshot = hashString(raw);
}

function installStorageTamperHooks() {
  if (storageTamperHooked || typeof Storage === "undefined") return;
  storageTamperHooked = true;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    const targetKey = String(key);
    const isSaveKey = targetKey === SAVE_KEY || targetKey === SAVE_SIGNATURE_KEY;
    if (!isInternalSaveWrite && isSaveKey) {
      recordCheatDetected(`local_storage_setitem_${targetKey}`).catch((err) => {
        console.warn("storage setItem cheat report failed", err);
      });
    }
    return originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    const targetKey = String(key);
    const isSaveKey = targetKey === SAVE_KEY || targetKey === SAVE_SIGNATURE_KEY;
    if (!isInternalSaveWrite && isSaveKey) {
      recordCheatDetected(`local_storage_remove_${targetKey}`).catch((err) => {
        console.warn("storage removeItem cheat report failed", err);
      });
    }
    return originalRemoveItem.call(this, key);
  };

  Storage.prototype.clear = function patchedClear() {
    if (!isInternalSaveWrite) {
      recordCheatDetected("local_storage_clear").catch((err) => {
        console.warn("storage clear cheat report failed", err);
      });
    }
    return originalClear.call(this);
  };
}

function checkAndHandleLocalTamper(baseReason) {
  if (!state?.cheatFlags) return;
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  const sig = localStorage.getItem(SAVE_SIGNATURE_KEY);
  const currentRawSig = hashString(raw);
  const saveChangedInRuntime = runtimeSaveSnapshot !== null && raw !== runtimeSaveSnapshot;
  const signatureMismatch = Boolean(sig) && sig !== currentRawSig;
  const signatureChangedInRuntime = runtimeSigSnapshot !== null && sig !== runtimeSigSnapshot;

  if (!saveChangedInRuntime && !signatureMismatch && !signatureChangedInRuntime) {
    return;
  }

  // 改ざん内容を上書きせずに残す（改ざん値はリロード時にそのまま反映させるのがゲームの仕様）。
  // 同一の改ざん内容を毎ポーリングで再通報しないようフィンガープリントで判定する
  const fingerprint = `${currentRawSig}:${sig ?? ""}`;
  if (fingerprint === lastReportedTamperFingerprint) {
    return;
  }
  lastReportedTamperFingerprint = fingerprint;

  const reason = signatureMismatch ? `${baseReason}_signature_mismatch` : `${baseReason}_runtime_changed`;
  recordCheatDetected(reason).catch((err) => {
    console.warn("runtime cheat report failed", err);
  });
  runtimeSaveSnapshot = raw;
  runtimeSigSnapshot = sig ?? currentRawSig;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function recordCheatDetected(reason, targetState = state) {
  if (!targetState?.cheatFlags) return;
  if (!targetState.cheatFlags.reasons.includes(reason)) {
    targetState.cheatFlags.reasons.push(reason);
  }
  targetState.cheatFlags.detected = true;
  targetState.log.push("不正改ざんの痕跡を検知。隠し実績を判定します。");

  // 実績解除確認済みなら以降サーバーへ問い合わせない
  if (cheatAchievementConfirmed) return;

  // 失敗時の再試行が高頻度ポーリングと重なってリクエストが暴発しないようクールダウンを設ける
  const now = Date.now();
  if (now - lastCheatReportAt < CHEAT_REPORT_COOLDOWN_MS) return;
  lastCheatReportAt = now;

  if (targetState.cheatFlags.reported) {
    const alreadyUnlocked = await fetchCheatAchievementDetail();
    if (alreadyUnlocked?.unlocked) {
      cheatAchievementConfirmed = true;
      return;
    }
    targetState.cheatFlags.reported = false;
    targetState.log.push("チート実績の解除が未反映のため、再判定を行います。");
  }

  try {
    const res = await fetch("/achievements/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        eventType: "rpg_cheat",
        eventData: { cheat_detected: true, reason }
      })
    });
    if (!res.ok) return;
    const data = await res.json();
    const unlocked = Array.isArray(data?.unlocked) ? data.unlocked : [];
    const unlockedByCheck = unlocked.includes(CHEAT_ACHIEVEMENT_ID);
    const cheatAchievement = await fetchCheatAchievementDetail();
    const confirmedUnlocked = unlockedByCheck || Boolean(cheatAchievement?.unlocked);
    if (confirmedUnlocked) {
      cheatAchievementConfirmed = true;
      targetState.log.push("🏆 隠し実績解除: チートコード（改ざんを検知）");
      if (cheatAchievement?.unlocked) {
        try {
          const { showAchievementUnlocked } = await import("./achievements.js");
          showAchievementUnlocked(cheatAchievement);
        } catch (notifyErr) {
          console.warn("cheat achievement notification failed", notifyErr);
        }
      }
      targetState.cheatFlags.reported = true;
    } else {
      targetState.cheatFlags.reported = false;
      targetState.log.push("チート実績の解除確認に失敗。次回操作時に再試行します。");
    }
  } catch (err) {
    console.warn("cheat achievement report failed", err);
    targetState.cheatFlags.reported = false;
  }
}

async function fetchCheatAchievementDetail() {
  try {
    const listRes = await fetch("/achievements/list", {
      credentials: "include",
      cache: "no-store"
    });
    if (!listRes.ok) return null;
    const achievements = await listRes.json();
    return achievements?.[CHEAT_ACHIEVEMENT_ID] || null;
  } catch (err) {
    console.warn("cheat achievement fetch failed", err);
    return null;
  }
}

function mergeStateWithDefaults(parsed, defaultState) {
  const merged = {
    ...structuredClone(defaultState),
    ...parsed,
    player: { ...structuredClone(defaultState).player, ...(parsed.player || {}) },
    equipment: { ...structuredClone(defaultState).equipment, ...(parsed.equipment || {}) },
    inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
    stageClears: normalizeStageClears(parsed.stageClears),
    log: Array.isArray(parsed.log) && parsed.log.length > 0 ? parsed.log : structuredClone(defaultState).log,
    cheatFlags: {
      ...structuredClone(defaultState).cheatFlags,
      ...(parsed.cheatFlags || {})
    }
  };
  if (!isStageUnlocked(merged.selectedStage, merged.stageClears)) {
    merged.selectedStage = 1;
  }
  const stage = stageTable.find((s) => s.id === merged.selectedStage) || stageTable[0];
  // 保存済みのインデックスが有効ならそのまま（周回中の位置を維持）。
  // 無効な場合は未クリアの敵、無ければ先頭から。
  const savedIdx = Number(parsed.currentEnemyIndex);
  if (Number.isInteger(savedIdx) && savedIdx >= 0 && savedIdx < stage.enemies.length) {
    merged.currentEnemyIndex = savedIdx;
  } else {
    const firstUncleared = getNextUnclearedEnemyIndex(stage.id, merged.stageClears);
    merged.currentEnemyIndex = firstUncleared === -1 ? 0 : firstUncleared;
  }
  const curEnemy = stage.enemies[merged.currentEnemyIndex];
  if (!Number.isFinite(merged.enemyHp) || merged.enemyHp <= 0 || merged.enemyHp > curEnemy.maxHp) {
    merged.enemyHp = curEnemy.maxHp;
  }
  if (!Number.isFinite(merged.enemyActionCount) || merged.enemyActionCount < 0) {
    merged.enemyActionCount = getEnemyActionInterval(curEnemy);
  }
  return merged;
}

function signed(n) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function calcProblemGp(point) {
  let normalized = Number(point);
  if (!Number.isFinite(normalized)) {
    const extracted = String(point ?? "").match(/-?\d+(\.\d+)?/);
    normalized = extracted ? Number(extracted[0]) : NaN;
  }
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.floor(normalized);
}

function normalizeStageClears(input) {
  const base = {};
  stageTable.forEach((stage) => {
    base[stage.id] = [];
  });
  if (!input || typeof input !== "object") return base;
  stageTable.forEach((stage) => {
    const list = input[stage.id];
    base[stage.id] = Array.isArray(list) ? list : [];
  });
  return base;
}

function onStageSelectionClick(event) {
  const battleBtn = event.target.closest("[data-battle-stage]");
  if (!battleBtn) return;
  const stageId = Number(battleBtn.dataset.battleStage);
  selectStage(stageId);
  window.location.href = "/game-battle";
}

function selectStage(stageId) {
  checkAndHandleLocalTamper("local_storage_stage_select");
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return;
  state.selectedStage = stageId;
  // 周回できるよう、ステージ選択時は常に先頭の敵から開始する。
  state.currentEnemyIndex = 0;
  state.enemyHp = stage.enemies[state.currentEnemyIndex].maxHp;
  state.enemyActionCount = getEnemyActionInterval(stage.enemies[state.currentEnemyIndex]);
  state.player.hp = state.player.maxHp;
  state.player.guard = false;
  pushLog(`${stage.name} を選択。`);
  saveState();
  render();
}

function renderStageSelection() {
  if (!ui.stageSelection) return;
  ui.stageSelection.innerHTML = stageTable.map((stage) => {
    const cleared = getClearedCount(stage.id);
    const total = stage.enemies.length;
    const percent = Math.round((cleared / total) * 100);
    const clearedAll = cleared === total;
    const selected = stage.id === state.selectedStage;
    return `
      <article class="stage-card stage-theme-${stage.id} ${selected ? "selected" : ""} ${clearedAll ? "cleared" : ""}">
        <div class="stage-card-head">
          <h3>${stage.name}</h3>
          <span class="stage-status">${clearedAll ? "CLEAR" : "OPEN"}</span>
        </div>
        <p class="stage-desc">${stage.description}</p>
        <div class="stage-progress">
          <div class="stage-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <p class="stage-count">${cleared}/${total} 体撃破</p>
        <div class="stage-card-actions">
          <button data-battle-stage="${stage.id}">${clearedAll ? "周回する" : "このステージに挑戦"}</button>
        </div>
        ${clearedAll ? `<div class="stage-clear-aura" aria-hidden="true"></div>` : ""}
      </article>
    `;
  }).join("");
}

function getClearedCount(stageId) {
  return (state.stageClears[stageId] || []).length;
}

function markEnemyCleared(stageId, enemyKey) {
  const list = state.stageClears[stageId] || [];
  if (!list.includes(enemyKey)) {
    list.push(enemyKey);
    state.stageClears[stageId] = list;
  }
}

function isStageUnlocked() {
  // 全ステージのロックを解除。いつでも挑戦・周回できる。
  return true;
}

function isStageCleared(stageId) {
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return false;
  return getClearedCount(stageId) >= stage.enemies.length;
}

function getNextUnclearedEnemyIndex(stageId, clearState = state.stageClears) {
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return -1;
  const clearedList = clearState[stageId] || [];
  const idx = stage.enemies.findIndex((enemy) => !clearedList.includes(enemy.key));
  return idx;
}
