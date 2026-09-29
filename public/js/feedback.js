function setStatus(el, message, ok) {
  el.textContent = message;
  el.classList.toggle("ok", ok);
  el.classList.toggle("ng", !ok && Boolean(message));
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP");
}

function renderMine(items) {
  const list = document.getElementById("mineList");
  list.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "まだ意見はありません。";
    list.appendChild(empty);
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "item";

    const title = document.createElement("strong");
    title.className = "item-title";
    title.textContent = item.title;

    const metaRow = document.createElement("div");
    metaRow.className = "item-meta";
    const category = document.createElement("span");
    category.className = "badge";
    category.textContent = item.categoryLabel;
    const status = document.createElement("span");
    status.className = `badge ${item.status}`;
    status.textContent = item.statusLabel;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = formatTime(item.createdAt);
    metaRow.append(category, status, meta);

    const body = document.createElement("p");
    body.className = "body-text";
    body.textContent = item.body;

    article.append(title, metaRow, body);

    if (item.adminReply) {
      const reply = document.createElement("div");
      reply.className = "reply";
      const label = document.createElement("strong");
      label.textContent = "管理者からの返信";
      const text = document.createElement("p");
      text.className = "reply-text";
      text.textContent = item.adminReply;
      reply.append(label, text);
      article.appendChild(reply);
    }

    if (item.status === "open") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "削除";
      button.addEventListener("click", () => deleteMine(item.id));
      article.appendChild(button);
    }

    list.appendChild(article);
  }
}

async function loadMine() {
  const res = await fetch("/feedback/mine", { credentials: "include" });
  if (res.status === 401) {
    location.href = "/";
    return;
  }
  const data = await res.json();
  renderMine(data.items || []);
}

async function deleteMine(id) {
  if (!confirm("この意見を削除しますか？")) {
    return;
  }
  const res = await fetch(`/feedback/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json();
  const status = document.getElementById("formStatus");
  setStatus(status, data.message || "削除に失敗しました", res.ok);
  if (res.ok) {
    await loadMine();
  }
}

document.getElementById("feedbackForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.getElementById("formStatus");
  setStatus(status, "送信中...", true);

  const res = await fetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      category: document.getElementById("category").value,
      title: document.getElementById("title").value,
      body: document.getElementById("body").value,
    }),
  });
  const data = await res.json().catch(() => ({}));
  setStatus(status, data.message || "送信に失敗しました", res.ok);
  if (res.ok) {
    event.target.reset();
    await loadMine();
  }
});

loadMine().catch(() => {
  setStatus(document.getElementById("formStatus"), "意見の読み込みに失敗しました", false);
});
