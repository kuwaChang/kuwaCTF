import { renderMarkdown } from "./markdown.js";

const SEEN_KEY = "kuwa-announcements-seen-at";

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "";
  }
  return date.toLocaleString("ja-JP");
}

function seenAt() {
  return localStorage.getItem(SEEN_KEY) || "";
}

function unreadItems(items) {
  const seen = seenAt();
  if (!seen) {
    return items;
  }
  return items.filter((item) => item.updatedAt > seen);
}

function markSeen(items) {
  const newest = items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), "");
  localStorage.setItem(SEEN_KEY, newest || new Date().toISOString());
  updateBadge(0);
}

function updateBadge(count) {
  const badge = document.getElementById("announcementBadge");
  if (!badge) {
    return;
  }
  if (!count) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }
  badge.hidden = false;
  badge.textContent = count > 9 ? "9+" : String(count);
}

export async function refreshAnnouncementBadge() {
  try {
    const res = await fetch("/announcements", { credentials: "include" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    updateBadge(unreadItems(data.items || []).length);
  } catch (err) {
    console.error("お知らせ件数の取得エラー:", err);
  }
}

export async function loadAnnouncements() {
  const list = document.getElementById("announcementList");
  if (!list) {
    return;
  }

  list.textContent = "読み込み中...";

  try {
    const res = await fetch("/announcements", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      list.textContent = data.message || "お知らせの取得に失敗しました";
      return;
    }

    const items = data.items || [];
    const unreadIds = new Set(unreadItems(items).map((item) => item.id));
    list.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "announcement-empty";
      empty.textContent = "現在、お知らせはありません。";
      list.appendChild(empty);
      markSeen(items);
      return;
    }

    for (const item of items) {
      list.appendChild(renderAnnouncement(item, unreadIds.has(item.id)));
    }
    markSeen(items);
  } catch (err) {
    console.error("お知らせの読み込みエラー:", err);
    list.textContent = "お知らせの取得に失敗しました";
  }
}

function renderAnnouncement(item, isNew) {
  const card = document.createElement("article");
  card.className = "announcement-card";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.className = "announcement-meta";
  const posted = formatTime(item.createdAt);
  const updated = item.updatedAt && item.updatedAt !== item.createdAt
    ? `（更新: ${formatTime(item.updatedAt)}）`
    : "";
  meta.textContent = `${posted}${updated}`;

  if (isNew) {
    const badge = document.createElement("span");
    badge.className = "announcement-new";
    badge.textContent = "新着";
    meta.prepend(badge);
  }

  const body = document.createElement("div");
  body.className = "announcement-body";
  body.innerHTML = renderMarkdown(item.body);

  card.append(title, meta, body);
  return card;
}
