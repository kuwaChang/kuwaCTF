// achievements.js - マインクラフト風の実績システム

// 実績データを取得
export async function loadAchievements() {
  try {
    const response = await fetch("/achievements/list");
    if (!response.ok) {
      throw new Error("実績データの取得に失敗しました");
    }
    const achievements = await response.json();
    displayAchievements(achievements);
  } catch (error) {
    console.error("実績読み込みエラー:", error);
    document.getElementById("achievementsContainer").innerHTML = 
      "<p style='color: red;'>実績データの読み込みに失敗しました</p>";
  }
}

// 実績を表示
function displayAchievements(achievements) {
  const container = document.getElementById("achievementsContainer");
  container.innerHTML = "";

  // カテゴリー別にグループ化
  const categories = {};
  for (const [id, achievement] of Object.entries(achievements)) {
    const category = achievement.category || "other";
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({ id, ...achievement });
  }

  // 表示順を決定する: 初心者 → カテゴリー別(Web/暗号/フォレンジック/OSINT) → それ以外
  const PRIORITY_ORDER = ["beginner", "web", "crypto", "forensics", "osint"];
  const orderedCategories = Object.keys(categories).sort((a, b) => {
    const ia = PRIORITY_ORDER.indexOf(a);
    const ib = PRIORITY_ORDER.indexOf(b);
    // 優先リストにあるものは指定順、ないものはその後ろ（元の並び順を維持）
    const ra = ia === -1 ? PRIORITY_ORDER.length : ia;
    const rb = ib === -1 ? PRIORITY_ORDER.length : ib;
    return ra - rb;
  });

  // カテゴリーごとに表示
  for (const category of orderedCategories) {
    const items = categories[category];
    const categoryDiv = document.createElement("div");
    categoryDiv.className = "achievement-category";
    categoryDiv.style.marginBottom = "30px";

    const categoryTitle = document.createElement("h3");
    categoryTitle.textContent = getCategoryName(category);
    categoryTitle.style.color = "#000";
    categoryTitle.style.backgroundColor = "#fff";
    categoryTitle.style.padding = "10px 15px";
    categoryTitle.style.borderRadius = "8px";
    categoryTitle.style.marginBottom = "15px";
    categoryTitle.style.borderBottom = "3px solid #667eea";
    categoryTitle.style.fontWeight = "bold";
    categoryTitle.style.fontSize = "20px";
    categoryTitle.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
    categoryDiv.appendChild(categoryTitle);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
    grid.style.gap = "15px";

    items.forEach(achievement => {
      const achievementCard = createAchievementCard(achievement);
      grid.appendChild(achievementCard);
    });

    categoryDiv.appendChild(grid);
    container.appendChild(categoryDiv);
  }
}

// カテゴリー名を取得
function getCategoryName(category) {
  const names = {
    "beginner": "初心者",
    "crypto": "暗号",
    "forensics": "フォレンジック",
    "web": "Web",
    "osint": "OSINT",
    "milestone": "マイルストーン",
    "streak": "連続記録",
    "study": "学習",
    "speed": "スピード",
    "completion": "完全制覇",
    "skill": "スキル",
    "other": "その他"
  };
  return names[category] || category;
}

// 実績カードを作成（マインクラフト風）
function createAchievementCard(achievement) {
  const card = document.createElement("div");
  card.className = "achievement-card";
  
  const isUnlocked = achievement.unlocked;
  const progress = achievement.progress || 0;
  const maxProgress = achievement.maxProgress || 1;
  const progressPercent = Math.min((progress / maxProgress) * 100, 100);

  // マインクラフト風のスタイル
  card.style.cssText = `
    background: ${isUnlocked ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)'};
    border: 3px solid ${isUnlocked ? '#fbbf24' : '#4a5568'};
    border-radius: 12px;
    padding: 15px;
    text-align: center;
    position: relative;
    overflow: hidden;
    transition: all 0.3s ease;
    cursor: pointer;
    box-shadow: ${isUnlocked ? '0 4px 15px rgba(251, 191, 36, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.3)'};
  `;

  // ホバーエフェクト
  card.addEventListener("mouseenter", () => {
    card.style.transform = "translateY(-5px) scale(1.02)";
    card.style.boxShadow = isUnlocked 
      ? "0 8px 25px rgba(251, 191, 36, 0.5)" 
      : "0 4px 15px rgba(102, 126, 234, 0.4)";
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "translateY(0) scale(1)";
    card.style.boxShadow = isUnlocked 
      ? "0 4px 15px rgba(251, 191, 36, 0.3)" 
      : "0 2px 8px rgba(0, 0, 0, 0.3)";
  });

  // アイコン
  const icon = document.createElement("div");
  icon.style.cssText = `
    font-size: 48px;
    margin-bottom: 10px;
    filter: ${isUnlocked ? 'none' : 'grayscale(100%) brightness(0.5)'};
    transition: filter 0.3s ease;
  `;
  icon.textContent = achievement.icon || "🏆";
  card.appendChild(icon);

  // タイトル
  const title = document.createElement("div");
  title.style.cssText = `
    font-weight: bold;
    font-size: 16px;
    color: ${isUnlocked ? '#fff' : '#9ca3af'};
    margin-bottom: 8px;
  `;
  title.textContent = achievement.title || achievement.id;
  card.appendChild(title);

  // 説明
  const desc = document.createElement("div");
  desc.style.cssText = `
    font-size: 12px;
    color: ${isUnlocked ? '#e5e7eb' : '#6b7280'};
    margin-bottom: 10px;
    min-height: 32px;
  `;
  desc.textContent = achievement.description || "";
  card.appendChild(desc);

  // 進捗バー（未解除の場合）
  if (!isUnlocked && maxProgress > 1) {
    const progressBarContainer = document.createElement("div");
    progressBarContainer.style.cssText = `
      width: 100%;
      height: 6px;
      background: #374151;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 8px;
    `;

    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
      height: 100%;
      width: ${progressPercent}%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
    `;
    progressBarContainer.appendChild(progressBar);
    card.appendChild(progressBarContainer);

    // 進捗テキスト
    const progressText = document.createElement("div");
    progressText.style.cssText = `
      font-size: 11px;
      color: #9ca3af;
      margin-top: 5px;
    `;
    progressText.textContent = `${progress} / ${maxProgress}`;
    card.appendChild(progressText);
  }

  // 解除済みバッジ
  if (isUnlocked) {
    const badge = document.createElement("div");
    badge.style.cssText = `
      position: absolute;
      top: 5px;
      right: 5px;
      background: #fbbf24;
      color: #000;
      font-size: 10px;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 10px;
    `;
    badge.textContent = "✓";
    card.appendChild(badge);

    // 解除日時
    if (achievement.unlockedAt) {
      const date = document.createElement("div");
      date.style.cssText = `
        font-size: 10px;
        color: #d1d5db;
        margin-top: 8px;
      `;
      const unlockDate = new Date(achievement.unlockedAt);
      date.textContent = unlockDate.toLocaleDateString("ja-JP");
      card.appendChild(date);
    }
  }

  // 隠し実績の場合
  if (achievement.hidden && !isUnlocked) {
    icon.textContent = "❓";
    title.textContent = "???";
    desc.textContent = "この実績は隠されています";
    desc.style.fontStyle = "italic";
  }

  return card;
}

// 実績解除通知を表示（マインクラフト風）
export function showAchievementUnlocked(achievement) {
  // 既存の通知があれば削除
  const existingNotification = document.getElementById("achievement-notification");
  if (existingNotification) {
    existingNotification.remove();
  }

  // 通知用の要素を作成
  const notification = document.createElement("div");
  notification.id = "achievement-notification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: 4px solid #fbbf24;
    border-radius: 16px;
    padding: 25px;
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.6), 0 0 20px rgba(251, 191, 36, 0.3);
    z-index: 10000;
    animation: achievementSlideIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    max-width: 320px;
    cursor: pointer;
  `;

  // アニメーションスタイル（一度だけ追加）
  if (!document.getElementById("achievement-animation-style")) {
    const style = document.createElement("style");
    style.id = "achievement-animation-style";
    style.textContent = `
      @keyframes achievementSlideIn {
        0% {
          transform: translateX(400px) scale(0.8);
          opacity: 0;
        }
        60% {
          transform: translateX(-10px) scale(1.05);
        }
        100% {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
      }
      @keyframes achievementSlideOut {
        from {
          transform: translateX(0) scale(1);
          opacity: 1;
        }
        to {
          transform: translateX(400px) scale(0.8);
          opacity: 0;
        }
      }
      @keyframes achievementPulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 15px;">
      <div style="font-size: 48px; animation: achievementPulse 1s ease-in-out infinite;">
        ${achievement.icon || "🏆"}
      </div>
      <div style="flex: 1;">
        <div style="font-weight: bold; font-size: 20px; color: #fbbf24; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); margin-bottom: 5px;">
          実績解除！
        </div>
        <div style="font-size: 16px; color: #fff; font-weight: 600; margin-bottom: 3px;">
          ${achievement.title}
        </div>
        <div style="font-size: 12px; color: #e5e7eb;">
          ${achievement.description || ""}
        </div>
      </div>
    </div>
  `;

  // クリックで閉じる
  notification.addEventListener("click", () => {
    notification.style.animation = "achievementSlideOut 0.5s ease";
    setTimeout(() => {
      notification.remove();
    }, 500);
  });

  document.body.appendChild(notification);

  // 7秒後に自動で削除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = "achievementSlideOut 0.5s ease";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 500);
    }
  }, 7000);
}

