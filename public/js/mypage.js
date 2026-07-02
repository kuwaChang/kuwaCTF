// マイページのデータを読み込む
async function loadMyPageData() {
  const loadingMessage = document.getElementById("loadingMessage");
  const errorMessage = document.getElementById("errorMessage");
  const userInfo = document.getElementById("userInfo");

  try {
    // セッションチェック
    const sessionRes = await fetch("/session-check", { credentials: "include" });
    const sessionData = await sessionRes.json();

    if (!sessionData.loggedIn) {
      loadingMessage.style.display = "none";
      errorMessage.style.display = "block";
      errorMessage.textContent = "ログインが必要です。";
      return;
    }

    // スコアと学習時間を取得
    const scoreRes = await fetch("/getScore", { credentials: "include" });
    const scoreData = await scoreRes.json();

    if (!scoreData.success) {
      loadingMessage.style.display = "none";
      errorMessage.style.display = "block";
      errorMessage.textContent = "データの取得に失敗しました。";
      return;
    }

    // ユーザー情報を表示
    document.getElementById("userid").textContent = sessionData.userid || "-";
    document.getElementById("username").textContent = sessionData.username || "-";
    document.getElementById("score").textContent = (scoreData.score || 0) + " 点";
    
    // 現在のユーザー名をフォームに表示
    const usernameInput = document.getElementById("usernameInput");
    if (usernameInput) {
      usernameInput.placeholder = `現在: ${sessionData.username || ""}`;
    }

    // 学習時間をフォーマット（ミリ秒を時間:分:秒に変換）
    const studyTimeMs = scoreData.studyTime || 0;
    const hours = Math.floor(studyTimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((studyTimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((studyTimeMs % (1000 * 60)) / 1000);
    
    let studyTimeText = "";
    if (hours > 0) {
      studyTimeText = `${hours}時間 ${minutes}分 ${seconds}秒`;
    } else if (minutes > 0) {
      studyTimeText = `${minutes}分 ${seconds}秒`;
    } else {
      studyTimeText = `${seconds}秒`;
    }
    document.getElementById("studyTime").textContent = studyTimeText || "0秒";

    // アイコンを表示
    const userIcon = document.getElementById("userIcon");
    if (sessionData.iconPath) {
      userIcon.src = sessionData.iconPath;
      userIcon.onerror = () => {
        // アイコン読み込み失敗時はデフォルトアイコンを表示
        userIcon.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Ccircle cx='60' cy='60' r='60' fill='%23667eea'/%3E%3Ctext x='60' y='75' font-size='60' text-anchor='middle' fill='white'%3E👤%3C/text%3E%3C/svg%3E";
      };
    } else {
      // デフォルトアイコンを表示
      userIcon.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Ccircle cx='60' cy='60' r='60' fill='%23667eea'/%3E%3Ctext x='60' y='75' font-size='60' text-anchor='middle' fill='white'%3E👤%3C/text%3E%3C/svg%3E";
    }

    // 装備中デコレーションを反映
    applyNameDeco(sessionData.nameDecoClass);
    applyIconDeco(sessionData.iconDecoClass);

    // 表示を切り替え
    loadingMessage.style.display = "none";
    userInfo.style.display = "block";

    // デコレーションショップを読み込む
    loadDecorationShop();

  } catch (error) {
    console.error("マイページデータ読み込みエラー:", error);
    loadingMessage.style.display = "none";
    errorMessage.style.display = "block";
    errorMessage.textContent = "エラーが発生しました: " + error.message;
  }
}

// アイコンアップロード処理
async function uploadIcon(file) {
  const formData = new FormData();
  formData.append('icon', file);

  const statusElement = document.getElementById("iconUploadStatus");
  statusElement.textContent = "アップロード中...";
  statusElement.style.color = "#667eea";

  try {
    const res = await fetch("/api/upload-icon", {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    const result = await res.json();

    if (result.success) {
      // アイコンを更新
      const userIcon = document.getElementById("userIcon");
      userIcon.src = result.iconPath + "?t=" + Date.now(); // キャッシュ回避
      statusElement.textContent = "アイコンを更新しました！";
      statusElement.style.color = "#28a745";
      setTimeout(() => {
        statusElement.textContent = "";
      }, 3000);
    } else {
      statusElement.textContent = result.message || "アップロードに失敗しました";
      statusElement.style.color = "#dc3545";
    }
  } catch (error) {
    console.error("アイコンアップロードエラー:", error);
    statusElement.textContent = "エラーが発生しました: " + error.message;
    statusElement.style.color = "#dc3545";
  }
}

// ユーザー名更新処理
async function updateUsername() {
  const usernameInput = document.getElementById("usernameInput");
  const statusElement = document.getElementById("usernameUpdateStatus");
  const updateBtn = document.getElementById("updateUsernameBtn");
  
  const newUsername = usernameInput.value.trim();
  
  if (!newUsername) {
    statusElement.textContent = "ユーザー名を入力してください";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  if (newUsername.length < 3 || newUsername.length > 50) {
    statusElement.textContent = "ユーザー名は3-50文字で入力してください";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  updateBtn.disabled = true;
  updateBtn.textContent = "更新中...";
  statusElement.textContent = "更新中...";
  statusElement.style.color = "#667eea";
  
  try {
    const res = await fetch("/auth/update-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username: newUsername }),
      credentials: "include"
    });
    
    const result = await res.json();
    
    if (result.success) {
      statusElement.textContent = result.message || "ユーザー名を更新しました！";
      statusElement.style.color = "#28a745";
      usernameInput.value = "";
      // ページを再読み込みして最新の情報を表示
      setTimeout(() => {
        loadMyPageData();
      }, 1000);
    } else {
      statusElement.textContent = result.message || "更新に失敗しました";
      statusElement.style.color = "#dc3545";
    }
  } catch (error) {
    console.error("ユーザー名更新エラー:", error);
    statusElement.textContent = "エラーが発生しました: " + error.message;
    statusElement.style.color = "#dc3545";
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = "ユーザー名を更新";
  }
}

// パスワード更新処理
async function updatePassword() {
  const currentPasswordInput = document.getElementById("currentPasswordInput");
  const newPasswordInput = document.getElementById("newPasswordInput");
  const confirmPasswordInput = document.getElementById("confirmPasswordInput");
  const statusElement = document.getElementById("passwordUpdateStatus");
  const updateBtn = document.getElementById("updatePasswordBtn");
  
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (!currentPassword) {
    statusElement.textContent = "現在のパスワードを入力してください";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  if (!newPassword) {
    statusElement.textContent = "新しいパスワードを入力してください";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  if (newPassword.length < 8) {
    statusElement.textContent = "パスワードは8文字以上で入力してください";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  if (newPassword !== confirmPassword) {
    statusElement.textContent = "新しいパスワードが一致しません";
    statusElement.style.color = "#dc3545";
    return;
  }
  
  updateBtn.disabled = true;
  updateBtn.textContent = "更新中...";
  statusElement.textContent = "更新中...";
  statusElement.style.color = "#667eea";
  
  try {
    const res = await fetch("/auth/update-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        password: newPassword,
        currentPassword: currentPassword
      }),
      credentials: "include"
    });
    
    const result = await res.json();
    
    if (result.success) {
      statusElement.textContent = result.message || "パスワードを更新しました！";
      statusElement.style.color = "#28a745";
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";
    } else {
      statusElement.textContent = result.message || "更新に失敗しました";
      statusElement.style.color = "#dc3545";
    }
  } catch (error) {
    console.error("パスワード更新エラー:", error);
    statusElement.textContent = "エラーが発生しました: " + error.message;
    statusElement.style.color = "#dc3545";
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = "パスワードを更新";
  }
}

// ===== デコレーション =====

let decoState = null;

// ユーザー名要素へデコレーションclassを適用する
function applyNameDeco(className) {
  const el = document.getElementById("username");
  if (!el) return;
  el.className = "info-value";
  if (className) el.classList.add(className);
}

// アイコン要素へ縁デコレーションclassを適用する
function applyIconDeco(className) {
  const el = document.getElementById("userIcon");
  if (!el) return;
  [...el.classList].forEach((c) => {
    if (c.startsWith("deco-icon-")) el.classList.remove(c);
  });
  if (className) el.classList.add(className);
}

// デコレーション一覧を取得してショップを描画する
async function loadDecorationShop() {
  try {
    const res = await fetch("/decorations/list", { credentials: "include" });
    if (!res.ok) return;
    decoState = await res.json();

    const balanceEl = document.getElementById("pointBalance");
    if (balanceEl) balanceEl.textContent = `${decoState.balance} pt`;
    const detailEl = document.getElementById("pointDetail");
    if (detailEl) {
      detailEl.textContent = `獲得: ${decoState.earnedPoints} pt / 使用済み: ${decoState.spentPoints} pt`;
    }

    renderDecoGrid("nameDecoGrid", decoState.decorations.name, "name");
    renderDecoGrid("iconDecoGrid", decoState.decorations.icon, "icon");
  } catch (error) {
    console.error("デコレーション読み込みエラー:", error);
  }
}

function renderDecoGrid(containerId, items, kind) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const previewName = document.getElementById("username")?.textContent || "ユーザー名";

  items.forEach((deco) => {
    const card = document.createElement("div");
    card.className = "deco-card" + (deco.equipped ? " equipped" : "");

    const preview = document.createElement("div");
    preview.className = "deco-preview";
    if (kind === "name") {
      const span = document.createElement("span");
      span.textContent = previewName;
      if (deco.className) span.className = deco.className;
      preview.appendChild(span);
    } else {
      const circle = document.createElement("div");
      circle.className = "deco-preview-icon" + (deco.className ? " " + deco.className : "");
      preview.appendChild(circle);
    }
    card.appendChild(preview);

    const title = document.createElement("div");
    title.className = "deco-name";
    title.textContent = deco.title;
    card.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "deco-desc";
    desc.textContent = deco.description;
    card.appendChild(desc);

    const cost = document.createElement("div");
    cost.className = "deco-cost";
    cost.textContent = deco.cost > 0 ? `${deco.cost} pt` : "無料";
    card.appendChild(cost);

    const btn = document.createElement("button");
    btn.className = "deco-btn";
    if (deco.equipped) {
      btn.textContent = "装備中";
      btn.classList.add("equipped-btn");
      btn.disabled = true;
    } else if (deco.owned) {
      btn.textContent = "装備する";
      btn.addEventListener("click", () => equipDecoration(deco.id));
    } else {
      btn.textContent = "購入する";
      btn.classList.add("buy");
      btn.disabled = decoState.balance < deco.cost;
      btn.addEventListener("click", () => purchaseDecoration(deco.id));
    }
    card.appendChild(btn);

    container.appendChild(card);
  });
}

function setDecoStatus(message, isError) {
  const statusEl = document.getElementById("decoStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#dc3545" : "#28a745";
}

async function purchaseDecoration(decorationId) {
  try {
    const res = await fetch("/decorations/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decorationId }),
      credentials: "include"
    });
    const result = await res.json();
    if (result.success) {
      setDecoStatus(result.message, false);
      await loadDecorationShop();
    } else {
      setDecoStatus(result.message || "購入に失敗しました", true);
    }
  } catch (error) {
    console.error("デコレーション購入エラー:", error);
    setDecoStatus("エラーが発生しました", true);
  }
}

async function equipDecoration(decorationId) {
  try {
    const res = await fetch("/decorations/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decorationId }),
      credentials: "include"
    });
    const result = await res.json();
    if (result.success) {
      setDecoStatus(result.message, false);
      if (result.type === "name") {
        applyNameDeco(result.className);
      } else if (result.type === "icon") {
        applyIconDeco(result.className);
      }
      await loadDecorationShop();
    } else {
      setDecoStatus(result.message || "装備に失敗しました", true);
    }
  } catch (error) {
    console.error("デコレーション装備エラー:", error);
    setDecoStatus("エラーが発生しました", true);
  }
}

// ページ読み込み時にデータをロード
window.addEventListener("DOMContentLoaded", () => {
  loadMyPageData();

  // アイコンアップロードのイベントリスナーを設定
  const iconInput = document.getElementById("iconInput");
  if (iconInput) {
    iconInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        // ファイルサイズチェック（5MB以下）
        if (file.size > 5 * 1024 * 1024) {
          alert("ファイルサイズが大きすぎます。5MB以下の画像を選択してください。");
          return;
        }
        // 画像ファイルかチェック
        if (!file.type.startsWith('image/')) {
          alert("画像ファイルを選択してください。");
          return;
        }
        uploadIcon(file);
      }
    });
  }
  
  // ユーザー名更新ボタンのイベントリスナー
  const updateUsernameBtn = document.getElementById("updateUsernameBtn");
  if (updateUsernameBtn) {
    updateUsernameBtn.addEventListener("click", updateUsername);
    
    // Enterキーでも送信できるように
    const usernameInput = document.getElementById("usernameInput");
    if (usernameInput) {
      usernameInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          updateUsername();
        }
      });
    }
  }
  
  // パスワード更新ボタンのイベントリスナー
  const updatePasswordBtn = document.getElementById("updatePasswordBtn");
  if (updatePasswordBtn) {
    updatePasswordBtn.addEventListener("click", updatePassword);
    
    // Enterキーでも送信できるように
    const passwordInputs = [
      document.getElementById("currentPasswordInput"),
      document.getElementById("newPasswordInput"),
      document.getElementById("confirmPasswordInput")
    ];
    passwordInputs.forEach(input => {
      if (input) {
        input.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            updatePassword();
          }
        });
      }
    });
  }
});

