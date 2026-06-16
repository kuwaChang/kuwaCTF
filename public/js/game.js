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

const ui = {
  playerSummary: document.getElementById("playerSummary"),
  enemyArea: document.getElementById("enemyArea"),
  battleLog: document.getElementById("battleLog"),
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
  document.querySelectorAll("[data-upgrade]").forEach((btn) => {
    btn.addEventListener("click", () => upgradeStat(btn.dataset.upgrade));
  });
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
  if (isStageCleared(state.selectedStage)) {
    pushLog("このステージは全クリア済みです。未クリアのステージを選択してください。");
    render();
    return;
  }
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
  if (isStageCleared(state.selectedStage)) {
    pushLog("このステージは全クリア済みです。未クリアのステージを選択してください。");
    render();
    return;
  }
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
  const nextIdx = getNextUnclearedEnemyIndex(stage.id);
  if (nextIdx === -1) {
    pushLog("このステージは全クリア済みです。トップで次ステージへ進んでください。");
    saveState();
    render();
    return;
  }
  state.currentEnemyIndex = nextIdx;
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
}

function playerAction(action, enemy, stats) {
  if (action === "guard") {
    pushLog("防御体勢に入った。受けるダメージを軽減する。");
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

function upgradeStat(kind) {
  checkAndHandleLocalTamper("local_storage_upgrade");
  const costMap = { maxHp: 50, atk: 60, def: 60, lucky: 80 };
  const cost = costMap[kind];
  if (state.gp < cost) {
    pushLog(`GP不足: ${kind} 強化には ${cost} GP 必要。`);
    render();
    return;
  }
  state.gp -= cost;
  if (kind === "maxHp") {
    state.player.maxHp += 12;
    state.player.hp += 12;
  } else {
    state.player[kind] += 2;
  }
  pushLog(`${kind} を強化した。`);
  saveState();
  render();
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
        撃破報酬: ${enemy.reward} GP
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
    ui.attackBtn.disabled = stageCleared || !battleOngoing;
  }
  if (ui.guardBtn) {
    ui.guardBtn.disabled = stageCleared || !battleOngoing;
  }
  if (ui.nextEnemyBtn) {
    // 戦闘決着（敵撃破 or 敗北）まで押せない。全クリア後も不要なので無効化。
    ui.nextEnemyBtn.disabled = stageCleared || battleOngoing;
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
  renderShop();
  renderStageSelection();
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
  const firstUncleared = getNextUnclearedEnemyIndex(stage.id, merged.stageClears);
  merged.currentEnemyIndex = firstUncleared === -1 ? 0 : firstUncleared;
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
  if (!isStageUnlocked(stageId)) {
    pushLog(`Stage ${stageId} はロック中です。前ステージを全クリアしてください。`);
    render();
    return;
  }
  if (isStageCleared(stageId)) {
    pushLog(`Stage ${stageId} は全クリア済みのため再戦できません。`);
    render();
    return;
  }
  selectStage(stageId);
  window.location.href = "/game-battle";
}

function selectStage(stageId) {
  checkAndHandleLocalTamper("local_storage_stage_select");
  const stage = stageTable.find((s) => s.id === stageId);
  if (!stage) return;
  state.selectedStage = stageId;
  const nextIdx = getNextUnclearedEnemyIndex(stageId);
  state.currentEnemyIndex = nextIdx === -1 ? 0 : nextIdx;
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
    const unlocked = isStageUnlocked(stage.id);
    const cleared = getClearedCount(stage.id);
    const total = stage.enemies.length;
    const percent = Math.round((cleared / total) * 100);
    const clearedAll = cleared === total;
    const selected = stage.id === state.selectedStage;
    return `
      <article class="stage-card stage-theme-${stage.id} ${unlocked ? "" : "locked"} ${selected ? "selected" : ""} ${clearedAll ? "cleared" : ""}">
        <div class="stage-card-head">
          <h3>${stage.name}</h3>
          <span class="stage-status">${clearedAll ? "CLEAR" : (unlocked ? "OPEN" : "LOCK")}</span>
        </div>
        <p class="stage-desc">${stage.description}</p>
        <div class="stage-progress">
          <div class="stage-progress-fill" style="width: ${percent}%;"></div>
        </div>
        <p class="stage-count">${cleared}/${total} 体撃破</p>
        <div class="stage-card-actions">
          <button data-battle-stage="${stage.id}" ${(unlocked && !clearedAll) ? "" : "disabled"}>このステージに挑戦</button>
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

function isStageUnlocked(stageId, clearState = state.stageClears) {
  if (stageId === 1) return true;
  for (let i = 1; i < stageId; i++) {
    const stage = stageTable.find((s) => s.id === i);
    if (!stage) return false;
    const list = clearState[i] || [];
    if (list.length < stage.enemies.length) return false;
  }
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
