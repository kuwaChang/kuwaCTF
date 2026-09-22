export let quizData = {};
let solvedList = [];
let currentCategory = null;
let currentQid = null;
let currentPoint = 0;
let firstModalChecked = false;

/** 難易度別タブに出すストレージキー（ストーリー／サブシステム単位）。WEB 等のジャンル専用ブロックは含めない */
const DIFFICULTY_SECTION_ORDER = [
  "OpenCampus",
  "Easy1",
  "Easy2",
  "Medium1",
  "Medium2",
  "Hard1",
  "Hard2",
];

const DIFFICULTY_SECTION_TITLES = {
  OpenCampus: "OpenCampus",
  Easy1: "Easy 1",
  Easy2: "Easy 2",
  Medium1: "Medium 1",
  Medium2: "Medium 2",
  Hard1: "Hard 1",
  Hard2: "Hard 2",
};

const CATEGORY_TAB_LABELS = {
  crypto: "Crypto",
  osint: "OSINT",
  forensics: "Forensics",
  web: "WEB",
  "sad server": "Sad Server"
};

const CATEGORY_GROUP_ORDER = ["Crypto", "Forensics", "WEB", "OSINT", "Sad Server", "その他"];

function normalizeCategoryIdKey(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (s.toLowerCase() === "sad server") return "sad server";
  return s.toLowerCase();
}

function categoryTabLabelForQuestion(q, storageCategory) {
  const fromQ = q.categoryId != null ? q.categoryId : storageCategory;
  const key = normalizeCategoryIdKey(fromQ);
  if (CATEGORY_TAB_LABELS[key]) return CATEGORY_TAB_LABELS[key];
  const st = String(storageCategory);
  if (/^(WEB|Forensics|Crypto|OSINT)$/i.test(st)) {
    if (st.toUpperCase() === "WEB") return "WEB";
    return st.charAt(0).toUpperCase() + st.slice(1).toLowerCase();
  }
  return "その他";
}

function categoryBadgeClass(label) {
  const map = {
    Crypto: "crypto",
    OSINT: "osint",
    Forensics: "forensics",
    WEB: "web",
    "Sad Server": "sad-server"
  };
  return map[label] || "other";
}

function createChallengeTile(storageCategory, qid, q, solvedSet) {
  const div = document.createElement("div");
  div.className = "challenge";

  const key = `${storageCategory}:${qid}`;
  const isSolved = solvedSet.has(key);
  div.classList.add(isSolved ? "solved" : "unsolved");

  const header = document.createElement("div");
  header.className = "challenge-header";

  const categoryLabel = categoryTabLabelForQuestion(q, storageCategory);
  const badge = document.createElement("span");
  badge.className = `challenge-badge ${categoryBadgeClass(categoryLabel)}`;
  badge.textContent = categoryLabel;
  header.appendChild(badge);

  const status = document.createElement("span");
  status.className = "challenge-status";
  status.textContent = isSolved ? "UNLOCKED" : "LOCKED";
  header.appendChild(status);
  div.appendChild(header);

  const titleDiv = document.createElement("div");
  titleDiv.className = "challenge-title";
  titleDiv.textContent = q.title;
  div.appendChild(titleDiv);

  const pointsDiv = document.createElement("div");
  pointsDiv.className = "points";
  pointsDiv.textContent = `${q.point}pt`;
  div.appendChild(pointsDiv);

  div.onclick = (evt) => openModal(storageCategory, qid, evt);
  return div;
}

function renderGroupedChallenges(container, groups, solvedSet) {
  container.innerHTML = "";
  for (const group of groups) {
    if (!group.items.length) continue;

    const section = document.createElement("section");
    section.className = "challenge-section";

    const header = document.createElement("div");
    header.className = "challenge-section-header";

    const h1 = document.createElement("h1");
    h1.className = "challenge-section-title";
    h1.textContent = group.title;
    header.appendChild(h1);

    const solvedCount = group.items.filter(({ storageCategory, qid }) =>
      solvedSet.has(`${storageCategory}:${qid}`)
    ).length;
    const totalCount = group.items.length;

    const progress = document.createElement("div");
    progress.className = "lock-progress";

    const progressLabel = document.createElement("span");
    progressLabel.className = "lock-progress-label";
    progressLabel.textContent = `${solvedCount} / ${totalCount} 解除`;
    progress.appendChild(progressLabel);

    const track = document.createElement("div");
    track.className = "lock-progress-track";
    const fill = document.createElement("div");
    fill.className = "lock-progress-fill";
    fill.style.width = `${Math.round((solvedCount / totalCount) * 100)}%`;
    track.appendChild(fill);
    progress.appendChild(track);
    header.appendChild(progress);

    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "grid";
    for (const { storageCategory, qid, q } of group.items) {
      grid.appendChild(createChallengeTile(storageCategory, qid, q, solvedSet));
    }
    section.appendChild(grid);
    container.appendChild(section);
  }
}

function buildDifficultyGroups(data) {
  const groups = [];
  for (const storageKey of DIFFICULTY_SECTION_ORDER) {
    const questions = data[storageKey];
    if (!questions || typeof questions !== "object") continue;
    const title = DIFFICULTY_SECTION_TITLES[storageKey] || storageKey;
    const items = Object.entries(questions).map(([qid, q]) => ({
      storageCategory: storageKey,
      qid,
      q
    }));
    groups.push({ title, items });
  }
  return groups;
}

function buildCategoryGroups(data) {
  const bucket = new Map();
  for (const [storageCategory, questions] of Object.entries(data)) {
    // 難易度別タブで表示するセクションは、カテゴリー別タブでは除外する（重複防止）
    if (DIFFICULTY_SECTION_ORDER.includes(storageCategory)) continue;
    if (!questions || typeof questions !== "object") continue;
    for (const [qid, q] of Object.entries(questions)) {
      const label = categoryTabLabelForQuestion(q, storageCategory);
      if (!bucket.has(label)) bucket.set(label, []);
      bucket.get(label).push({ storageCategory, qid, q });
    }
  }

  const titles = [...bucket.keys()];
  const ordered = [];
  for (const p of CATEGORY_GROUP_ORDER) {
    if (titles.includes(p)) ordered.push(p);
  }
  const rest = titles
    .filter((t) => !ordered.includes(t))
    .sort((a, b) => a.localeCompare(b, "ja"));
  const sortedTitles = [...ordered, ...rest];

  return sortedTitles.map((title) => ({ title, items: bucket.get(title) }));
}

// Sad Server用のグローバル変数
let currentSadInstanceId = null;
let currentSadSocket = null;
let currentSadWindow = null; // 別ウィンドウのターミナル参照
let currentSadScenarioId = null;
let currentSadWsPath = null;

// 別ウィンドウの固定名（リロード後も同じウィンドウを再取得するため）
const SAD_WINDOW_NAME = "sadServerTerminal";
// 起動状態の永続化キー（リロードしても Create の多重起動を防ぐ）
const SAD_STORAGE_KEY = "sadServerState";
// サーバー側の自動停止時間（30分）に合わせて状態を無効化する
const SAD_STATE_TTL_MS = 30 * 60 * 1000;

// 起動状態を localStorage に保存
function saveSadState(instanceId, scenarioId, wsPath) {
  try {
    localStorage.setItem(
      SAD_STORAGE_KEY,
      JSON.stringify({ instanceId, scenarioId, wsPath, createdAt: Date.now() })
    );
  } catch (e) { /* noop */ }
}

// 起動状態を localStorage から読み込み（期限切れは破棄）
function loadSadState() {
  try {
    const raw = localStorage.getItem(SAD_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || !state.instanceId) return null;
    // 期限切れ（サーバー側で自動停止済み）の場合は破棄
    if (state.createdAt && Date.now() - state.createdAt > SAD_STATE_TTL_MS) {
      clearSadState();
      return null;
    }
    return state;
  } catch (e) {
    return null;
  }
}

// 起動状態をクリア
function clearSadState() {
  try {
    localStorage.removeItem(SAD_STORAGE_KEY);
  } catch (e) { /* noop */ }
}

// リロード時: 保存済みの起動状態をメモリに復元
(function restoreSadStateFromStorage() {
  const state = loadSadState();
  if (state) {
    currentSadInstanceId = state.instanceId;
    currentSadScenarioId = state.scenarioId || null;
    currentSadWsPath = state.wsPath || null;
  }
})();

// JSONから問題一覧を読み込み
export async function loadQuizData() {
  console.log("📡 loadQuizData開始");
  const res = await fetch("/api/quizData");
  if (!res.ok) {
    console.error("サーバーエラー:", res.status);
    return Promise.resolve();
  }
  quizData = await res.json();
  //console.log("📦 取得したデータ:", quizData);
  const difficultyContainer = document.getElementById("quizContainer");
  const categoryContainer = document.getElementById("categoryQuizContainer");

  // ✅ 解いた問題リストを先に取得
  const solvedRes = await fetch("/quiz/solvedList", { credentials: "include" });
  
  console.log("📡 /api/quizData応答:", res.status);
  solvedList = await solvedRes.json();
  const solvedSet = new Set(solvedList.map(s => `${s.category}:${s.qid}`));

  renderGroupedChallenges(difficultyContainer, buildDifficultyGroups(quizData), solvedSet);
  if (categoryContainer) {
    renderGroupedChallenges(categoryContainer, buildCategoryGroups(quizData), solvedSet);
  }
  
  // Promiseを返す（DOMの再構築が完了したことを示す）
  return Promise.resolve();
}

// ヒントを1つずつ表示する関数
// skipRecord: trueの場合、サーバーへの記録送信をスキップ（既に開いた状態で自動表示する場合など）
function showNextHint(container, skipRecord = false) {
  if (container.currentHintIndex < container.allHints.length) {
    const hintDiv = document.createElement("div");
    hintDiv.className = "hint-line";
    hintDiv.textContent = `・${container.allHints[container.currentHintIndex]}`;
    container.appendChild(hintDiv);
    container.currentHintIndex++;
    
    // 最初のヒントを開いた時にサーバーに記録を送信（skipRecordがfalseの場合のみ）
    if (!skipRecord && container.currentHintIndex === 1 && currentCategory && currentQid) {
      fetch("/quiz/hintOpened", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: currentCategory,
          qid: currentQid
        }),
        credentials: "include"
      }).catch(err => {
        console.error("ヒント記録送信エラー:", err);
      });
    }
    
    // 既存のボタンを削除
    const existingBtn = container.querySelector(".next-hint-btn");
    if (existingBtn) existingBtn.remove();
    
    // 残りのヒントがある場合は「次へ」ボタンを表示
    if (container.currentHintIndex < container.allHints.length) {
      // 新しいボタンを追加
      const nextBtn = document.createElement("button");
      nextBtn.textContent = "次のヒントを見る";
      nextBtn.className = "next-hint-btn";
      nextBtn.style.marginTop = "10px";
      nextBtn.style.padding = "8px 16px";
      nextBtn.style.backgroundColor = "#0078ff";
      nextBtn.style.border = "none";
      nextBtn.style.borderRadius = "5px";
      nextBtn.style.color = "white";
      nextBtn.style.cursor = "pointer";
      nextBtn.onclick = () => showNextHint(container);
      container.appendChild(nextBtn);
    }
  }
}

// 地図関連の変数
let map = null;
let marker = null;
let toleranceCircle = null;

function getCoordinateToleranceDegrees() {
  const q = quizData[currentCategory]?.[currentQid];
  const value = Number(q?.coordinateTolerance);
  return Number.isFinite(value) && value > 0 ? value : 0.001;
}

function coordinateToleranceMeters(lat) {
  const toleranceDeg = getCoordinateToleranceDegrees();
  const latMeters = toleranceDeg * 111320;
  const lonMeters = toleranceDeg * 111320 * Math.cos((lat * Math.PI) / 180);
  return Math.max(1, Math.min(latMeters, Math.abs(lonMeters) || latMeters));
}

function updateToleranceCircle(lat, lng) {
  if (!map || typeof L === "undefined") return;
  const radius = coordinateToleranceMeters(lat);
  if (toleranceCircle) {
    toleranceCircle.setLatLng([lat, lng]);
    toleranceCircle.setRadius(radius);
  } else {
    toleranceCircle = L.circle([lat, lng], {
      radius,
      color: "#22d3ee",
      weight: 2,
      fillColor: "#22d3ee",
      fillOpacity: 0.18,
      interactive: false
    }).addTo(map);
  }
}

// 地図を初期化
function initMapForCoordinates() {
  const mapContainer = document.getElementById("map-container");
  const mapDiv = document.getElementById("map");
  
  // Leaflet + キー不要のタイル（Esri / 国土地理院）
  if (typeof L !== 'undefined') {
    map = L.map(mapDiv).setView([35.6812, 139.7671], 10);

    const streets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    });
    const gsi = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院</a>',
      maxZoom: 18
    });

    streets.addTo(map);
    L.control.layers(
      {
        "ストリート": streets,
        "航空写真": satellite,
        "地理院地図": gsi
      },
      null,
      { collapsed: false }
    ).addTo(map);
    
    // マーカーを追加
    const pinIcon = L.divIcon({
      className: "coord-pin",
      html: '<span class="coord-pin-inner"></span>',
      iconSize: [28, 40],
      iconAnchor: [14, 38]
    });
    marker = L.marker([35.6812, 139.7671], { draggable: true, icon: pinIcon }).addTo(map);
    updateToleranceCircle(35.6812, 139.7671);

    marker.on("drag", function () {
      const position = marker.getLatLng();
      updateToleranceCircle(position.lat, position.lng);
    });
    marker.on("dragend", function () {
      const position = marker.getLatLng();
      updateCoordinatesInput(position.lat, position.lng);
    });

    map.on("click", function (e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      marker.setLatLng([lat, lng]);
      updateCoordinatesInput(lat, lng);
    });

    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 200);
  } else {
    // Leafletが読み込まれていない場合のフォールバック
    mapDiv.innerHTML = '<p style="padding: 20px; text-align: center;">地図ライブラリを読み込んでいます...</p>';
    loadLeafletLibrary().then(() => {
      initMapForCoordinates();
    }).catch((err) => {
      console.error(err);
      mapDiv.innerHTML = '<p style="padding: 20px; text-align: center; color: #c00;">地図を読み込めませんでした。ページを再読み込みしてください。</p>';
    });
  }
}

// Leafletライブラリを動的に読み込む
// Monaco Editor の loader.js が AMD の define を置くため、Leaflet の UMD が
// define() を呼び「Can only have one anonymous define call per script file」になる。
// 読み込み中だけ define.amd を無効化し、グローバル window.L として登録させる。
function loadLeafletLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof L !== 'undefined') {
      resolve();
      return;
    }
    
    // Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    
    const globalDefine = window.define;
    let savedAmd = null;
    if (typeof globalDefine === 'function' && globalDefine.amd) {
      savedAmd = globalDefine.amd;
      globalDefine.amd = false;
    }

    const restoreAmd = () => {
      if (savedAmd !== null && typeof globalDefine === 'function') {
        globalDefine.amd = savedAmd;
      }
    };

    // Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => {
      restoreAmd();
      resolve();
    };
    script.onerror = () => {
      restoreAmd();
      reject(new Error('Leaflet の読み込みに失敗しました'));
    };
    document.head.appendChild(script);
  });
}

// 座標入力欄を更新
function updateCoordinatesInput(lat, lng, options = {}) {
  const answerInput = document.getElementById("answer");
  const selectedCoords = document.getElementById("selected-coords");
  const coordsStr = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const radiusMeters = Math.round(coordinateToleranceMeters(lat));
  if (options.updateInput !== false) {
    answerInput.value = coordsStr;
  }
  selectedCoords.textContent = `選択した座標: ${coordsStr}（許容範囲: 約${radiusMeters}m）`;
  updateToleranceCircle(lat, lng);
}

// 入力欄から座標を読み取ってマーカーを更新
function updateMarkerFromInput() {
  if (!map || !marker) return;
  
  const answerInput = document.getElementById("answer");
  const value = answerInput.value.trim();
  
  // 座標形式（緯度,経度）をパース
  const coordsMatch = value.match(/^([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)$/);
  if (coordsMatch) {
    const lat = parseFloat(coordsMatch[1]);
    const lng = parseFloat(coordsMatch[2]);
    
    // 有効な緯度経度の範囲内かチェック
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(10, map.getZoom()));
      updateCoordinatesInput(lat, lng, { updateInput: false });
    }
  }
}

// ✅ モーダル表示
function openModal(category, qid, evt = null) {
  const q = quizData[category][qid];
  currentCategory = category;
  currentQid = qid;
  currentPoint = q.point;

  const modal = document.getElementById("modal");
  const modalContent = modal.querySelector(".modal-content");
  const isSolved = solvedList.some((s) => s.category === category && s.qid === qid);
  modalContent.classList.toggle("solved", isSolved);
  modalContent.classList.toggle("unsolved", !isSolved);
  modalContent.style.borderColor = "";

  document.getElementById("modal-title").textContent = q.title;

  const categoryIdEl = document.getElementById("modal-category-id");
  const cid =
    q.categoryId != null && String(q.categoryId).trim() !== ""
      ? String(q.categoryId).trim()
      : "";
  if (cid) {
    categoryIdEl.textContent = `categoryId: ${cid}`;
    categoryIdEl.classList.remove("hidden");
  } else {
    categoryIdEl.textContent = "";
    categoryIdEl.classList.add("hidden");
  }
  
  // descとurlの表示（XSS対策: innerHTMLの代わりに安全なDOM操作を使用）
  const descElement = document.getElementById("modal-desc");
  // 既存の内容をクリア
  descElement.textContent = "";
  
  // 説明文を安全に追加（改行文字を<br>タグに変換）
  if (q.desc) {
    // 改行文字で分割して、各行を安全に追加
    const lines = q.desc.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        // 2行目以降の前に<br>タグを追加
        descElement.appendChild(document.createElement("br"));
      }
      // テキストを安全に追加
      const textNode = document.createTextNode(line);
      descElement.appendChild(textNode);
    });
  }
  
  // URLがある場合、安全にリンクを追加
  if (q.url) {
    const br = document.createElement("br");
    descElement.appendChild(br);
    
    const link = document.createElement("a");
    // URLの検証（javascript:やdata:などの危険なスキームを防ぐ）
    try {
      const urlObj = new URL(q.url, window.location.href);
      // javascript:やdata:などの危険なスキームをブロック
      if (urlObj.protocol === 'javascript:' || urlObj.protocol === 'data:' || urlObj.protocol === 'vbscript:') {
        console.warn("危険なURLスキームが検出されました:", q.url);
        // リンクとして機能させず、テキストのみ表示
        link.textContent = q.url;
      } else {
        // 安全なURLの場合のみリンクとして設定
        link.href = urlObj.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer"; // セキュリティ向上
        link.textContent = q.url; // リンクテキストも安全に設定
      }
    } catch (e) {
      // 無効なURLの場合はリンクとして機能させない
      console.warn("無効なURL:", q.url);
      link.textContent = q.url;
    }
    
    link.style.color = "#0078ff";
    link.style.textDecoration = "underline";
    link.style.fontWeight = "600";
    
    descElement.appendChild(link);
  }
  
  document.getElementById("modal-point").textContent = q.point;
  
  // ヒントの初期化
  const hintsContainer = document.getElementById("modal-hints");
  hintsContainer.innerHTML = "";
  hintsContainer.currentHintIndex = 0;
  const rawHints = Array.isArray(q.hint) ? q.hint : (q.hint ? [q.hint] : []);
  const hintsArray = rawHints.filter(h => h && String(h).trim() !== "");
  hintsContainer.allHints = hintsArray;
  
  // ヒントが存在する場合のみ「最初のヒントを見る」ボタンを表示する
  if (hintsArray.length > 0) {
    // 既にヒントを開いたかどうかをサーバーから取得
    fetch(`/quiz/hintOpened/${encodeURIComponent(category)}/${encodeURIComponent(qid)}`, {
      credentials: "include"
    })
    .then(res => res.json())
    .then(data => {
      if (data.opened) {
        // 既にヒントを開いていた場合は、すべてのヒントを自動表示（記録送信はスキップ）
        hintsContainer.currentHintIndex = 0;
        hintsArray.forEach(() => {
          showNextHint(hintsContainer, true);
        });
      } else {
        // まだヒントを開いていない場合は「最初のヒントを見る」ボタンを表示
        const firstHintBtn = document.createElement("button");
        firstHintBtn.textContent = "最初のヒントを見る";
        firstHintBtn.className = "next-hint-btn";
        firstHintBtn.style.marginTop = "10px";
        firstHintBtn.style.padding = "8px 16px";
        firstHintBtn.style.backgroundColor = "#0078ff";
        firstHintBtn.style.border = "none";
        firstHintBtn.style.borderRadius = "5px";
        firstHintBtn.style.color = "white";
        firstHintBtn.style.cursor = "pointer";
        firstHintBtn.onclick = () => showNextHint(hintsContainer);
        hintsContainer.appendChild(firstHintBtn);
      }
    })
    .catch(err => {
      console.error("ヒント記録取得エラー:", err);
      // エラー時は通常通り「最初のヒントを見る」ボタンを表示
      const firstHintBtn = document.createElement("button");
      firstHintBtn.textContent = "最初のヒントを見る";
      firstHintBtn.className = "next-hint-btn";
      firstHintBtn.style.marginTop = "10px";
      firstHintBtn.style.padding = "8px 16px";
      firstHintBtn.style.backgroundColor = "#0078ff";
      firstHintBtn.style.border = "none";
      firstHintBtn.style.borderRadius = "5px";
      firstHintBtn.style.color = "white";
      firstHintBtn.style.cursor = "pointer";
      firstHintBtn.onclick = () => showNextHint(hintsContainer);
      hintsContainer.appendChild(firstHintBtn);
    });
  }

  // 🔽 ファイルボタン生成（XSS対策: innerHTMLの代わりに安全なDOM操作を使用）
  
  const filesDiv = document.getElementById("modal-files");
  filesDiv.textContent = ""; // 一旦クリア（textContentで安全にクリア）
  if (q.files && q.files.length > 0) {
    const downloadSection = document.createElement("div");
    downloadSection.className = "download-section";
    
    // 各ファイルリンクを安全に作成
    q.files.forEach((f, index) => {
      if (index > 0) {
        // 2つ目以降のファイルの前に改行を追加
        downloadSection.appendChild(document.createElement("br"));
      }
      
      const link = document.createElement("a");
      // パストラバーサル対策: ファイル名とカテゴリ名をサニタイズ
      const sanitizedCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedFile = f.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.\./g, '');
      
      // セキュリティ: サーバー側のエンドポイント経由でファイルをダウンロード
      // サーバー側でパストラバーサル対策が実装されている
      link.href = `/files/${sanitizedCategory}/${sanitizedFile}`;
      link.download = sanitizedFile; // ダウンロード時のファイル名もサニタイズ済み
      link.className = "download-btn";
      link.textContent = `📄 ${f}`; // 表示用のファイル名（元のファイル名を表示）
      
      downloadSection.appendChild(link);
    });
    
    filesDiv.appendChild(downloadSection);
  } else {
    filesDiv.textContent = ""; // ファイルがない場合は非表示
  }

  // Sad Server用のターミナルコンテナの表示/非表示
  const sadContainer = document.getElementById("sad-terminal-container");
  const scenarioSelect = document.getElementById("sad-scenario-select");
  if (category === "sad server" && q.scenarioId) {
    sadContainer.style.display = "block";
    // scenarioIdに合わせてセレクトの値を設定（非表示にするが念のため値を保持）
    if (scenarioSelect) {
      scenarioSelect.value = q.scenarioId;
      scenarioSelect.style.display = "none"; // セレクトボックスを非表示
    }
    // ラベルも非表示にする
    const label = sadContainer.querySelector("label");
    if (label) label.style.display = "none";
    // 起動状態に応じてボタン・ステータスを同期
    syncSadControls();
  } else {
    sadContainer.style.display = "none";
    if (scenarioSelect) scenarioSelect.style.display = "block";
    const label = sadContainer.querySelector("label");
    if (label) label.style.display = "block";
  }


  // 解説リンクの表示（正解前でも表示）
  const explanationLink = document.getElementById("explanation-link");
  if (q.explanation) {
    const explanationAnchor = document.getElementById("explanation-link-anchor");
    explanationAnchor.href = q.explanation;
    explanationLink.style.display = "block";
  } else {
    explanationLink.style.display = "none";
  }

  // 解答フィードバック（正解/不正解表示）をリセット
  const resultFeedback = document.getElementById("result");
  if (resultFeedback) {
    resultFeedback.textContent = "";
    resultFeedback.className = "";
  }

  // 座標入力用の地図の表示/非表示
  const mapContainer = document.getElementById("map-container");
  const answerInput = document.getElementById("answer");
  const selectedCoords = document.getElementById("selected-coords");
  
  if (q.answerType === "coordinates") {
    // 座標形式の問題の場合、地図を表示
    mapContainer.style.display = "block";
    answerInput.placeholder = "例: 35.6812,139.7671";
    answerInput.value = ""; // 入力欄をクリア
    selectedCoords.textContent = "";
    
    // 少し遅延させてから地図を初期化（DOM要素が確実に存在するように）
    setTimeout(() => {
      const mapDiv = document.getElementById("map");
      if (!mapDiv) return;
      
      // 既存の地図がある場合は削除
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.log("地図の削除エラー（無視）:", e);
        }
        map = null;
        marker = null;
        toleranceCircle = null;
      }
      
      // 地図コンテナをクリア
      mapDiv.innerHTML = "";
      
      // 新しい地図を初期化
      loadLeafletLibrary().then(() => {
        initMapForCoordinates();
        
        // 入力欄の変更時にマーカーを更新
        answerInput.addEventListener('input', updateMarkerFromInput);
        answerInput.addEventListener('blur', updateMarkerFromInput);
      }).catch((err) => {
        console.error(err);
        if (mapDiv) {
          mapDiv.innerHTML = '<p style="padding: 20px; text-align: center; color: #c00;">地図を読み込めませんでした。ページを再読み込みしてください。</p>';
        }
      });
    }, 100);
  } else {
    // 通常のFLAG形式の問題の場合、地図を非表示
    mapContainer.style.display = "none";
    answerInput.placeholder = "FLAG{...}";
    answerInput.value = ""; // 前の問題で入力したフラグが残らないようにクリア
    selectedCoords.textContent = "";
    
    // 地図を破棄（メモリリーク防止）
    if (map) {
      map.remove();
      map = null;
      marker = null;
    }
  }

  // ✅ すでに解いたか確認
  const solved = solvedList.some(s => s.category === category && s.qid === qid);
  if (solved) {
    modalContent.style.borderColor = "#6cd463";
  }
  modalContent.classList.remove("visible");
  modalContent.style.top = "";
  modal.style.display = "flex";

  requestAnimationFrame(() => {
    modalContent.classList.add("visible");
  });

  // 初めて問題モーダルを開いた実績をチェック（セッション中は1回だけ送信）
  if (!firstModalChecked) {
    firstModalChecked = true;
    checkOpenModalAchievement();
  }

  //console.log(`📝 openModal: ${category} - ${qid}`);
}

// 「初めて問題を開いた」実績チェックと解除通知
async function checkOpenModalAchievement() {
  try {
    const res = await fetch("/achievements/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "open_modal",
        eventData: { opened: true }
      }),
      credentials: "include"
    });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.unlocked || data.unlocked.length === 0) return;

    // 解除された実績の詳細を取得して通知を表示
    const listRes = await fetch("/achievements/list", { credentials: "include" });
    if (!listRes.ok) return;
    const achievements = await listRes.json();
    const { showAchievementUnlocked } = await import("./achievements.js");
    for (const id of data.unlocked) {
      if (achievements[id]) {
        showAchievementUnlocked(achievements[id]);
      }
    }
  } catch (err) {
    console.error("モーダル実績チェックエラー:", err);
  }
}

export function closeModal() {
  // スクロール位置を保存
  const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
  
  // モーダルを閉じる前にフォーカスを維持（スクロールを防ぐため）
  const activeElement = document.activeElement;
  
  const modal = document.getElementById("modal");
  const modalContent = document.querySelector("#modal .modal-content");
  
  if (modalContent) {
    modalContent.classList.remove("visible");
  }
  
  // フェードアウトアニメーションを開始
  modal.classList.add("fade-out");
  
  // アニメーション完了後にモーダルを非表示にする
  setTimeout(() => {
    modal.style.display = "none";
    modal.classList.remove("fade-out");
    if (modalContent) {
      modalContent.style.top = "";
    }
  }, 400); // アニメーション時間（0.4s）に合わせる
  
  // 地図を破棄（メモリリーク防止）
  const mapContainer = document.getElementById("map-container");
  if (map && mapContainer) {
    mapContainer.style.display = "none";
    // 地図は再利用するため、完全には破棄しない
    // map.remove();
    // map = null;
    // marker = null;
  }
  
  // モーダルを閉じた後、スクロール位置を維持するため非同期で処理
  loadQuizData().then(() => {
    // DOMが再構築された後、保存したスクロール位置に戻す
    // requestAnimationFrameを2回使って、レンダリングの完了を待つ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // スクロール位置を復元
        window.scrollTo({
          top: scrollPosition,
          behavior: 'instant' // アニメーションなしで即座にスクロール
        });
        
        // 念のため、少し遅延して再度スクロール位置を設定（DOMの再レンダリングに対応）
        setTimeout(() => {
          window.scrollTo({
            top: scrollPosition,
            behavior: 'instant'
          });
        }, 10);
      });
    });
  });
  
  // ラベルとセレクトボックスを再表示
  const sadContainer = document.getElementById("sad-terminal-container");
  const scenarioSelect = document.getElementById("sad-scenario-select");
  const label = sadContainer?.querySelector("label");
  if (scenarioSelect) scenarioSelect.style.display = "block";
  if (label) label.style.display = "block";

  // Sad Server用: モーダルを閉じてもコンテナ・別ウィンドウは維持する。
  // 停止は Destroy Server ボタンでのみ行う。

  //console.log("closeModal");
}

window.onclick = (e) => {
  if (e.target === document.getElementById("modal")) closeModal();
};


// ✅ 答え送信
document.getElementById("submitBtn").addEventListener("click", async (e) => {
  e.preventDefault();
  const answer = document.getElementById("answer").value;
  const q = quizData[currentCategory][currentQid];
  const answerType = q?.answerType || "flag";

  // 答えをそのまま送信（HTTP環境対応のためハッシュ化を削除）
  const answerToSend = answer.trim();

  const res = await fetch("/quiz/checkAnswer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: currentCategory,
      qid: currentQid,
      answer: answerToSend,
      answerType: answerType,
      point: currentPoint
    }),
    credentials: "include"
  });
console.log("📡 /checkAnswer応答:", res.status);

  const data = await res.json();
  const resultEl = document.getElementById("result");
  const modal = document.getElementById("modal");
  const modalContent = modal.querySelector(".modal-content");

  if (data.alreadySolved) {
    resultEl.className = "warn";
    resultEl.textContent = "この問題はすでに解いています！";
    // 既解答でも「挑戦」として実績が解除される場合があるためチェック
    notifyRecentlyUnlockedAchievements();
  } else if (data.correct) {
    const msg = (data.message && String(data.message).trim()) || "正解！";
    resultEl.className = "success result-correct-bounce";
    resultEl.textContent = `〇 ${msg}`;
    solvedList.push({ category: currentCategory, qid: currentQid });
    modalContent.classList.remove("unsolved");
    modalContent.classList.add("solved");
    modalContent.style.borderColor = "";
    
    // 解説がある場合はリンクを表示
    const q = quizData[currentCategory][currentQid];
    if (q && q.explanation) {
      const explanationLink = document.getElementById("explanation-link");
      const explanationAnchor = document.getElementById("explanation-link-anchor");
      explanationAnchor.href = q.explanation;
      explanationLink.style.display = "block";
    }
    
    // 実績チェック（少し遅延させてサーバー側の処理を待つ）
    notifyRecentlyUnlockedAchievements();
  } else {
    resultEl.className = "error";
    resultEl.textContent = "不正解...";
    // 不正解でも「挑戦」系の実績が解除される場合があるためチェック
    notifyRecentlyUnlockedAchievements();
  }
});

// 直近で解除された実績を取得して通知を表示する（サーバー処理を待つため少し遅延）
function notifyRecentlyUnlockedAchievements() {
  setTimeout(async () => {
    try {
      const achievementsRes = await fetch("/achievements/list", { credentials: "include" });
      if (!achievementsRes.ok) return;
      const achievements = await achievementsRes.json();
      const { showAchievementUnlocked } = await import("./achievements.js");
      // 新しく解除された実績を検出（5秒以内に解除されたもののみ通知）
      for (const [id, achievement] of Object.entries(achievements)) {
        if (achievement.unlocked && achievement.unlockedAt) {
          const unlockDate = new Date(achievement.unlockedAt);
          const now = new Date();
          if (now - unlockDate < 5000) {
            showAchievementUnlocked(achievement);
          }
        }
      }
    } catch (err) {
      console.error("実績チェックエラー:", err);
    }
  }, 500);
}

// ✅ ミリ秒を読みやすい形式に変換
function formatStudyTime(ms) {
  if (!ms || ms <= 0) return "0分";
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  
  let timeStr = "";
  if (hours > 0) {
    timeStr += hours + "時間";
  }
  if (remainingMinutes > 0) {
    timeStr += remainingMinutes + "分";
  }
  if (hours === 0 && remainingSeconds > 0) {
    timeStr += remainingSeconds + "秒";
  }
  
  return timeStr || "0分";
}

// ✅ スコア表示
export async function loadScore() {
  const res = await fetch("/getScore", { credentials: "include" });
  const result = await res.json();
  document.getElementById("scoreDisplay").innerText =
    "現在の得点: " + (result.score || 0);
  
  // 学習時間を表示
  const studyTimeMs = result.studyTime || 0;
  const studyTimeDisplay = document.getElementById("studyTimeDisplay");
  if (studyTimeDisplay) {
    studyTimeDisplay.innerText = "学習時間: " + formatStudyTime(studyTimeMs);
  }

  // カテゴリー別解答状況を取得して円グラフを表示
  await loadCategoryChart();
  
  // スコア実績チェック（バックグラウンドで実行）
  setTimeout(async () => {
    try {
      await fetch("/achievements/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "score",
          eventData: { score: result.score || 0 }
        }),
        credentials: "include"
      });
    } catch (err) {
      console.error("スコア実績チェックエラー:", err);
    }
  }, 100);
}

// カテゴリー別解答状況の円グラフを表示
async function loadCategoryChart() {
  // 解いた問題リストを取得
  const solvedRes = await fetch("/quiz/solvedList", { credentials: "include" });
  if (!solvedRes.ok) return;
  
  const solvedList = await solvedRes.json();
  
  // 問題データを取得
  const quizRes = await fetch("/api/quizData");
  if (!quizRes.ok) return;
  
  const quizData = await quizRes.json();
  
  // categoryId別に解いた問題数を集計
  const categoryCounts = {};
  const categoryTotals = {};
  
  // カテゴリー名のマッピング（表示用）
  const categoryNameMap = {
    'crypto': 'Crypto',
    'osint': 'OSINT',
    'forensics': 'Forensics',
    'web': 'WEB',
    "sad server": "Sad Server"
  };
  
  // 全問題数をcategoryId別に集計
  for (const [topCategory, questions] of Object.entries(quizData)) {
    for (const [qid, question] of Object.entries(questions)) {
      let displayName;
      
      // categoryIdを使用（question.categoryIdがない場合はtopCategoryをcategoryIdとして使用）
      const categoryId = question.categoryId || topCategory;
      // categoryNameMapに存在する場合のみ集計対象にする
      if (!categoryNameMap[categoryId]) {
        continue; // 存在しないカテゴリーIDはスキップ
      }
      displayName = categoryNameMap[categoryId];
      
      if (!categoryTotals[displayName]) {
        categoryTotals[displayName] = 0;
        categoryCounts[displayName] = 0;
      }
      categoryTotals[displayName]++;
    }
  }
  
  // 解いた問題数をcategoryId別に集計
  for (const solved of solvedList) {
    const question = quizData[solved.category]?.[solved.qid];
    if (!question) continue;
    
    // categoryIdを使用（question.categoryIdがない場合はsolved.categoryをcategoryIdとして使用）
    const categoryId = question.categoryId || solved.category;
    // categoryNameMapに存在する場合のみ集計対象にする
    if (!categoryNameMap[categoryId]) {
      continue; // 存在しないカテゴリーIDはスキップ
    }
    const displayName = categoryNameMap[categoryId];
    
    if (categoryCounts.hasOwnProperty(displayName)) {
      categoryCounts[displayName]++;
    }
  }
  
  // 円グラフ用のデータを準備（解いた問題数が0より大きいカテゴリーのみ）
  const labels = [];
  const data = [];
  const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', 
    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
  ];
  
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > 0) {
      labels.push(`${category} (${count}/${categoryTotals[category]})`);
      data.push(count);
    }
  }
  
  // 円グラフを描画
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;
  
  // 既存のチャートがあれば破棄
  if (window.categoryChartInstance) {
    window.categoryChartInstance.destroy();
  }
  
  // データが空の場合は何も表示しない
  if (labels.length === 0 || data.length === 0) {
    return;
  }
  
  window.categoryChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            padding: 15,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return `${label}: ${value}問`;
            }
          }
        }
      }
    }
  });
}



// モーダルを閉じるボタン
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".close");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }
});


// ✅ 「最新スコア取得」ボタン
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scoreRefresh");
  if (btn) btn.addEventListener("click", loadScore);

  // Sad Server用のサーバー作成/破棄処理
  const sadCreateBtn = document.getElementById("sad-create-btn");
  if (sadCreateBtn) {
    sadCreateBtn.addEventListener("click", createSadServer);
  }
  const sadDestroyBtn = document.getElementById("sad-destroy-btn");
  if (sadDestroyBtn) {
    sadDestroyBtn.addEventListener("click", () => destroySadServer());
  }
});

// Sad Server用: ステータス表示ヘルパー
function setSadStatus(message, isError) {
  const statusEl = document.getElementById("sad-status");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#ff8a80" : "#9fd3ff";
}

// Sad Server用: ボタン・ステータスを初期状態に戻す
function resetSadControls() {
  const createBtn = document.getElementById("sad-create-btn");
  const destroyBtn = document.getElementById("sad-destroy-btn");
  if (createBtn) {
    createBtn.disabled = false;
    createBtn.textContent = "Create Server";
  }
  if (destroyBtn) {
    destroyBtn.disabled = true;
    destroyBtn.textContent = "Destroy Server";
  }
  setSadStatus("");
}

// Sad Server用: 現在の起動状態にボタン・ステータスを同期する
// （モーダルを再度開いたとき、起動済みなら Destroy を有効表示にする）
function syncSadControls() {
  const createBtn = document.getElementById("sad-create-btn");
  const destroyBtn = document.getElementById("sad-destroy-btn");
  if (currentSadInstanceId) {
    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = "Server 起動中";
    }
    if (destroyBtn) {
      destroyBtn.disabled = false;
      destroyBtn.textContent = "Destroy Server";
    }
    setSadStatus(`サーバー起動中: ${currentSadInstanceId}（別ウィンドウのターミナルで操作してください）`);
  } else {
    resetSadControls();
  }
}

// Create Server: コンテナを起動し、別ウィンドウでターミナルを開いて接続する
async function createSadServer() {
  const scenarioSelect = document.getElementById("sad-scenario-select");
  const createBtn = document.getElementById("sad-create-btn");
  const destroyBtn = document.getElementById("sad-destroy-btn");

  if (!scenarioSelect || !createBtn || !destroyBtn) {
    console.error("Sad Server用の要素が見つかりません");
    return;
  }

  // 既にサーバーが起動している場合は先に破棄
  if (currentSadInstanceId) {
    await destroySadServer(true);
  }

  const scenarioId = scenarioSelect.value;
  console.log(`🚀 Sad Serverシナリオ起動: ${scenarioId}`);

  createBtn.disabled = true;
  createBtn.textContent = "起動中...";
  setSadStatus("コンテナを起動しています...");

  try {
    const res = await fetch("/sad/start-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId }),
    });

    if (!res.ok) {
      let msg = `サーバーエラー: ${res.status}`;
      try {
        const errData = await res.json();
        msg = errData.error || errData.detail || msg;
      } catch (e) { /* noop */ }
      throw new Error(msg);
    }

    const { wsPath, instanceId } = await res.json();
    console.log(`✅ シナリオ起動成功: ${instanceId}, wsPath: ${wsPath}`);

    currentSadInstanceId = instanceId;
    currentSadScenarioId = scenarioId;
    currentSadWsPath = wsPath;
    // リロード後も多重起動を防ぐため状態を永続化
    saveSadState(instanceId, scenarioId, wsPath);

    // 別ウィンドウでターミナルページを開く（固定名でリロード後も再取得可能に）
    const url =
      `/sad-terminal?instanceId=${encodeURIComponent(instanceId)}` +
      `&wsPath=${encodeURIComponent(wsPath)}` +
      `&scenarioId=${encodeURIComponent(scenarioId)}`;
    const features = "width=900,height=600,menubar=no,toolbar=no,location=no,resizable=yes,scrollbars=yes";
    const win = window.open(url, SAD_WINDOW_NAME, features);

    if (!win) {
      // ポップアップがブロックされた場合はコンテナを停止して通知
      setSadStatus("ポップアップがブロックされました。ブラウザの設定で許可してください。", true);
      await destroySadServer(true);
      resetSadControls();
      return;
    }

    currentSadWindow = win;
    try { win.focus(); } catch (e) { /* noop */ }

    createBtn.textContent = "Server 起動中";
    destroyBtn.disabled = false;
    setSadStatus(`サーバー起動: ${instanceId}（別ウィンドウのターミナルで操作してください）`);
  } catch (error) {
    console.error("❌ シナリオ起動エラー:", error);
    setSadStatus(`エラー: ${error.message}`, true);
    currentSadInstanceId = null;
    currentSadWindow = null;
    resetSadControls();
  }
}

// Destroy Server: コンテナを停止し、ターミナルウィンドウを閉じる
// silent=true の場合はステータス表示・ボタンリセットを行わない（内部呼び出し用）
async function destroySadServer(silent) {
  const instanceId = currentSadInstanceId;

  // ターミナルウィンドウを閉じる。
  // リロード後は参照が失われているため、固定名で再取得を試みる。
  let win = currentSadWindow;
  if ((!win || win.closed) && instanceId) {
    try {
      // 既存の同名ウィンドウがあれば参照を取得できる（無ければ空ウィンドウが返る）
      win = window.open("", SAD_WINDOW_NAME);
    } catch (e) { win = null; }
  }
  if (win && !win.closed) {
    try {
      win.postMessage({ type: "sad-disconnect" }, window.location.origin);
    } catch (e) { /* noop */ }
    try { win.close(); } catch (e) { /* noop */ }
  }
  currentSadWindow = null;

  // 状態をクリア（重複停止を防ぐため先にクリア）
  currentSadInstanceId = null;
  currentSadScenarioId = null;
  currentSadWsPath = null;
  clearSadState();
  if (currentSadSocket) {
    try { currentSadSocket.disconnect(); } catch (e) { /* noop */ }
    currentSadSocket = null;
  }

  if (!instanceId || typeof instanceId !== "string" || instanceId.trim() === "") {
    if (!silent) resetSadControls();
    return;
  }

  if (!silent) {
    setSadStatus("サーバーを停止しています...");
    const destroyBtn = document.getElementById("sad-destroy-btn");
    if (destroyBtn) destroyBtn.disabled = true;
  }

  try {
    const res = await fetch("/sad/stop-sad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    if (res.ok) {
      console.log(`✅ コンテナ停止成功: ${instanceId}`);
      if (!silent) setSadStatus("サーバーを停止しました。");
    } else {
      let msg = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        msg = errData.error || errData.message || msg;
      } catch (e) { /* noop */ }
      console.error(`❌ コンテナ停止失敗: ${instanceId}`, msg);
      if (!silent) setSadStatus(`停止エラー: ${msg}`, true);
    }
  } catch (err) {
    console.error("❌ コンテナ停止エラー:", err);
    if (!silent) setSadStatus(`停止エラー: ${err.message}`, true);
  } finally {
    if (!silent) resetSadControls();
  }
}

