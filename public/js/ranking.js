// ✅ ランキング表示
const DEFAULT_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23667eea'/%3E%3Ctext x='20' y='27' font-size='22' text-anchor='middle' fill='white'%3E👤%3C/text%3E%3C/svg%3E";

export async function loadRanking() {
  const res = await fetch("/ranking");
  const data = await res.json();
  const tbody = document.querySelector("#ranking tbody");
  tbody.innerHTML = "";
  data.forEach((user, index) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = index + 1;

    // ユーザー名セル: アイコン（縁デコ）＋ 名前（名前デコ）
    const nameTd = document.createElement("td");
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    const icon = document.createElement("img");
    icon.src = user.iconPath || DEFAULT_ICON;
    icon.alt = "";
    icon.style.width = "32px";
    icon.style.height = "32px";
    icon.style.borderRadius = "50%";
    icon.style.objectFit = "cover";
    icon.style.background = "#f0f0f0";
    icon.style.boxSizing = "border-box";
    if (user.iconDecoClass) icon.classList.add(user.iconDecoClass);
    icon.onerror = () => {
      icon.src = DEFAULT_ICON;
    };

    const nameSpan = document.createElement("span");
    nameSpan.textContent = user.username || user.userid;
    if (user.nameDecoClass) nameSpan.className = user.nameDecoClass;

    wrap.appendChild(icon);
    wrap.appendChild(nameSpan);
    nameTd.appendChild(wrap);

    const scoreTd = document.createElement("td");
    scoreTd.textContent = user.score;

    tr.appendChild(rankTd);
    tr.appendChild(nameTd);
    tr.appendChild(scoreTd);
    tbody.appendChild(tr);
  });
}
