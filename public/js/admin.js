// グローバル関数として定義（HTMLから呼び出せるように）
window.addHintField = function() {
  const container = document.getElementById("hintsContainer");
  const div = document.createElement("div");
  div.className = "hint-item";
  div.innerHTML = `
    <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
    <button type="button" class="remove-hint-btn" onclick="removeHintField(this)">-</button>
  `;
  container.appendChild(div);
};

// ヒントフィールドを削除
window.removeHintField = function(btn) {
  const container = document.getElementById("hintsContainer");
  if (container.children.length > 1) {
    btn.parentElement.remove();
  } else {
    alert("最低1つのヒントフィールドが必要です（空欄でも可）");
  }
};

function switchAdminTab(targetId) {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(t => t.classList.toggle("active", t.dataset.target === targetId));
  contents.forEach(c => c.classList.toggle("active", c.id === targetId));

  if (targetId === "quiz-list") {
    loadQuizzes();
  }
  if (targetId === "feedback") {
    loadFeedback();
  }
}

// タブ切り替え機能
function initAdminTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.target;
      if (targetId) {
        switchAdminTab(targetId);
      }
    });
  });
}

// 全ユーザーデータを保持（検索用）
let allUsersData = [];

// 答えの形式が変更された時の処理
document.addEventListener("DOMContentLoaded", () => {
  initAdminTabs();
  initQuizListFilters();
  loadQuizzes();
  
  // ユーザー検索フォームのイベントリスナー
  const feedbackRefreshBtn = document.getElementById("feedbackRefreshBtn");
  const feedbackStatusFilter = document.getElementById("feedbackStatusFilter");
  if (feedbackRefreshBtn) {
    feedbackRefreshBtn.addEventListener("click", () => loadFeedback());
  }
  if (feedbackStatusFilter) {
    feedbackStatusFilter.addEventListener("change", () => loadFeedback());
  }

  const userSearchForm = document.getElementById("userSearchForm");
  if (userSearchForm) {
    userSearchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const searchUserId = document.getElementById("searchUserId").value.trim();
      if (!searchUserId) {
        alert("ユーザーIDを入力してください");
        return;
      }
      await searchUser(searchUserId);
    });
  }

  const answerTypeSelect = document.getElementById("answerType");
  const coordinateToleranceGroup = document.getElementById("coordinateToleranceGroup");

  if (answerTypeSelect && coordinateToleranceGroup) {
    answerTypeSelect.addEventListener("change", (e) => {
      if (e.target.value === "coordinates") {
        coordinateToleranceGroup.style.display = "block";
      } else {
        coordinateToleranceGroup.style.display = "none";
      }
    });
  }

  // 追加フォーム
  document.getElementById("addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const quizData = {};
    
    // 必須項目を取得
    const category = formData.get("category")?.trim();
    const qid = formData.get("qid")?.trim();
    const title = formData.get("title")?.trim();
    const desc = formData.get("desc")?.trim();
    const answer = formData.get("answer")?.trim();
    const point = parseInt(formData.get("point")) || 0;

    // 必須項目のバリデーション
    if (!category || !qid || !title || !desc || !answer) {
      alert("必須項目（カテゴリ、問題ID、タイトル、説明文、答えフラグ）をすべて入力してください。");
      return;
    }

    // 必須項目を設定
    quizData.category = category;
    quizData.qid = qid;
    quizData.title = title;
    quizData.desc = desc;
    quizData.answer = answer;
    quizData.point = point;
    quizData.published = formData.get("published") !== "false";

    // 答えの形式
    const answerType = formData.get("answerType");
    if (answerType && answerType !== "flag") {
      quizData.answerType = answerType;
      if (answerType === "coordinates") {
        const tolerance = parseFloat(formData.get("coordinateTolerance"));
        if (!isNaN(tolerance) && tolerance > 0) {
          quizData.coordinateTolerance = tolerance;
        }
      }
    }

    // 任意項目：ヒント
    const hints = formData.getAll("hint[]").map(h => h.trim()).filter(h => h.length > 0);
    if (hints.length > 0) {
      quizData.hint = hints;
    }

    // 任意項目：解説URL
    const explanation = formData.get("explanation")?.trim();
    if (explanation) {
      quizData.explanation = explanation;
    }

    // ファイルアップロードの処理
    const files = formData.getAll("files");
    const fileNames = [];
    const formDataToSend = new FormData();
    
    // ファイルがある場合は別途送信
    for (let file of files) {
      if (file instanceof File && file.size > 0) {
        fileNames.push(file.name);
        formDataToSend.append("files", file);
      }
    }

    // JSONデータを追加
    formDataToSend.append("quizData", JSON.stringify(quizData));

    try {
      const res = await fetch("/admin/addQuiz", {
        method: "POST",
        body: formDataToSend,
        credentials: "include"
      });

      const result = await res.json();
      if (res.ok) {
        alert(result.message || "問題を追加しました");
        e.target.reset();
        // ヒントフィールドを1つに戻す
        const hintsContainer = document.getElementById("hintsContainer");
        hintsContainer.innerHTML = `
          <div class="hint-item">
            <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
            <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
          </div>
        `;
        coordinateToleranceGroup.style.display = "none";
        loadQuizzes();
      } else {
        alert(result.message || "エラーが発生しました");
      }
    } catch (err) {
      console.error("追加エラー:", err);
      alert("サーバーエラーが発生しました。");
    }
  });

  // 削除フォーム
  document.getElementById("deleteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const formData = Object.fromEntries(new FormData(e.target));
    const category = formData.category?.trim();
    const qid = formData.qid?.trim();

    if (!category || !qid) {
      alert("カテゴリと問題IDを入力してください。");
      return;
    }

    if (!confirm(`問題 "${category}/${qid}" を削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch("/admin/deleteQuiz", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, qid }),
        credentials: "include"
      });
      
      const result = await res.json();
      alert(result.message);
      
      if (res.ok) {
        e.target.reset();
        loadQuizzes();
      }
    } catch (err) {
      console.error("削除エラー:", err);
      alert("サーバーエラーが発生しました。");
    }
  });

  // リセットボタン
  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("addForm").reset();
    const hintsContainer = document.getElementById("hintsContainer");
    hintsContainer.innerHTML = `
      <div class="hint-item">
        <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
        <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
      </div>
    `;
    coordinateToleranceGroup.style.display = "none";
    document.getElementById("answerType").value = "flag";
    document.getElementById("published").value = "true";
  });

  // 問題一覧から編集ボタンの処理
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("edit-btn")) {
      const category = e.target.dataset.category;
      const qid = e.target.dataset.qid;
      if (category && qid) {
        editQuiz(category, qid);
      }
    } else if (e.target.classList.contains("delete-btn")) {
      const category = e.target.dataset.category;
      const qid = e.target.dataset.qid;
      if (confirm(`問題 "${category}/${qid}" を削除しますか？`)) {
        deleteQuiz(category, qid);
      }
    } else if (e.target.classList.contains("toggle-published-btn")) {
      const category = e.target.dataset.category;
      const qid = e.target.dataset.qid;
      const currentlyPublished = e.target.dataset.published !== "false";
      const nextPublished = !currentlyPublished;
      const actionLabel = nextPublished ? "公開" : "非公開";
      if (confirm(`問題 "${category}/${qid}" を${actionLabel}にしますか？`)) {
        toggleQuizPublished(category, qid, nextPublished);
      }
    }
  });
});

// 問題を編集フォームに読み込む
async function editQuiz(category, qid) {
  try {
    const res = await fetch("/admin/quizzes", { credentials: "include" });
    const data = await res.json();
    
    if (!data[category] || !data[category][qid]) {
      alert("問題が見つかりません");
      return;
    }

    const quiz = data[category][qid];
    
    // フォームに値を設定
    document.getElementById("category").value = category;
    document.getElementById("qid").value = qid;
    document.getElementById("title").value = quiz.title || "";
    document.getElementById("desc").value = quiz.desc || "";
    document.getElementById("answer").value = quiz.answer || "";
    document.getElementById("point").value = quiz.point || 10;
    document.getElementById("answerType").value = quiz.answerType || "flag";
    document.getElementById("explanation").value = quiz.explanation || "";
    document.getElementById("published").value = quiz.published === false ? "false" : "true";
    
    // 座標許容範囲
    if (quiz.answerType === "coordinates") {
      document.getElementById("coordinateToleranceGroup").style.display = "block";
      document.getElementById("coordinateTolerance").value = quiz.coordinateTolerance || 0.001;
    } else {
      document.getElementById("coordinateToleranceGroup").style.display = "none";
    }

    // ヒント
    const hintsContainer = document.getElementById("hintsContainer");
    hintsContainer.innerHTML = "";
    
    if (quiz.hint && Array.isArray(quiz.hint) && quiz.hint.length > 0) {
      quiz.hint.forEach((hint, index) => {
        const div = document.createElement("div");
        div.className = "hint-item";
        const isFirst = index === 0;
        div.innerHTML = `
          <input type="text" name="hint[]" value="${hint.replace(/"/g, '&quot;')}" placeholder="ヒントを入力（任意）">
          ${isFirst ? 
            '<button type="button" class="add-hint-btn" onclick="addHintField()">+</button>' :
            '<button type="button" class="remove-hint-btn" onclick="removeHintField(this)">-</button>'
          }
        `;
        hintsContainer.appendChild(div);
      });
    } else {
      hintsContainer.innerHTML = `
        <div class="hint-item">
          <input type="text" name="hint[]" placeholder="ヒントを入力（任意）">
          <button type="button" class="add-hint-btn" onclick="addHintField()">+</button>
        </div>
      `;
    }

    switchAdminTab("quiz-edit");
    document.getElementById("addForm").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("編集エラー:", err);
    alert("問題の読み込みに失敗しました");
  }
}

async function toggleQuizPublished(category, qid, published) {
  try {
    const res = await fetch("/admin/quizzes/published", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, qid, published }),
      credentials: "include"
    });

    const result = await res.json();
    alert(result.message);

    if (res.ok) {
      loadQuizzes();
    }
  } catch (err) {
    console.error("公開設定の更新エラー:", err);
    alert("サーバーエラーが発生しました。");
  }
}

// 問題を削除
async function deleteQuiz(category, qid) {
  try {
    const res = await fetch("/admin/deleteQuiz", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, qid }),
      credentials: "include"
    });
    
    const result = await res.json();
    alert(result.message);
    
    if (res.ok) {
      loadQuizzes();
    }
  } catch (err) {
    console.error("削除エラー:", err);
    alert("サーバーエラーが発生しました。");
  }
}

// 問題一覧を表示（グローバル関数として定義）
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateText(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

let allQuizzesData = {};

function initQuizListFilters() {
  const searchInput = document.getElementById("quizSearchInput");
  const categoryFilter = document.getElementById("quizFilterCategory");
  const publishedFilter = document.getElementById("quizFilterPublished");
  if (searchInput) {
    searchInput.addEventListener("input", renderQuizList);
  }
  if (categoryFilter) {
    categoryFilter.addEventListener("change", renderQuizList);
  }
  if (publishedFilter) {
    publishedFilter.addEventListener("change", renderQuizList);
  }
}

function collectQuizRows(data) {
  const rows = [];
  for (const [category, questions] of Object.entries(data || {})) {
    if (!questions || typeof questions !== "object") continue;
    for (const [qid, quiz] of Object.entries(questions)) {
      rows.push({ category, qid, quiz });
    }
  }
  return rows;
}

function matchesQuizFilters(row) {
  const searchInput = document.getElementById("quizSearchInput");
  const categoryFilter = document.getElementById("quizFilterCategory");
  const publishedFilter = document.getElementById("quizFilterPublished");
  const keyword = (searchInput?.value || "").trim().toLowerCase();
  const categoryValue = categoryFilter?.value || "";
  const publishedValue = publishedFilter?.value || "";
  const isPublished = row.quiz.published !== false;

  if (categoryValue && row.category !== categoryValue) return false;
  if (publishedValue === "published" && !isPublished) return false;
  if (publishedValue === "unpublished" && isPublished) return false;
  if (!keyword) return true;

  const haystack = [
    row.category,
    row.qid,
    row.quiz.title,
    row.quiz.desc,
    row.quiz.answer,
    row.quiz.categoryId,
    row.quiz.answerType,
    Array.isArray(row.quiz.files) ? row.quiz.files.join(" ") : ""
  ].join(" ").toLowerCase();
  return haystack.includes(keyword);
}

function updateQuizCategoryFilter(data) {
  const categoryFilter = document.getElementById("quizFilterCategory");
  if (!categoryFilter) return;
  const selected = categoryFilter.value;
  const categories = Object.keys(data || {});
  categoryFilter.innerHTML = `<option value="">すべてのカテゴリ</option>${
    categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join("")
  }`;
  if (categories.includes(selected)) {
    categoryFilter.value = selected;
  }
}

function renderQuizList() {
  const container = document.getElementById("quizList");
  const countEl = document.getElementById("quizListCount");
  if (!container) return;

  const allRows = collectQuizRows(allQuizzesData);
  const rows = allRows.filter(matchesQuizFilters);
  if (countEl) {
    countEl.textContent = `${rows.length} / ${allRows.length} 件`;
  }

  container.innerHTML = "";
  if (rows.length === 0) {
    container.innerHTML = `<p class="quiz-empty">一致する問題がありません</p>`;
    return;
  }

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push(row);
  }

  for (const [category, items] of grouped.entries()) {
    const categoryDiv = document.createElement("div");
    categoryDiv.className = "category-section";

    const categoryTitle = document.createElement("div");
    categoryTitle.className = "category-title";
    categoryTitle.innerHTML = `${escapeHtml(category)}<span class="category-count">${items.length}件</span>`;
    categoryDiv.appendChild(categoryTitle);

    const wrap = document.createElement("div");
    wrap.className = "quiz-table-wrap";
    const table = document.createElement("table");
    table.className = "quiz-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th class="quiz-col-pub">公開</th>
          <th class="quiz-col-id">ID</th>
          <th class="quiz-col-title">タイトル</th>
          <th class="quiz-col-point">点</th>
          <th class="quiz-col-type">形式</th>
          <th class="quiz-col-answer">答え</th>
          <th class="quiz-col-actions">操作</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");
    for (const { qid, quiz } of items) {
      const isPublished = quiz.published !== false;
      const publishedLabel = isPublished ? "公開" : "非公開";
      const toggleLabel = isPublished ? "非公開にする" : "公開する";
      const answerType = quiz.answerType === "coordinates" ? "座標" : "FLAG";
      const tr = document.createElement("tr");
      if (!isPublished) tr.className = "unpublished";
      tr.innerHTML = `
        <td><span class="visibility-badge ${isPublished ? "published" : "unpublished"}">${publishedLabel}</span></td>
        <td>${escapeHtml(qid)}</td>
        <td class="quiz-col-title" title="${escapeHtml(quiz.title || qid)}">
          <div class="quiz-title-main">${escapeHtml(quiz.title || qid)}</div>
          <div class="quiz-title-sub">${escapeHtml(truncateText(quiz.desc || "", 80))}</div>
        </td>
        <td>${escapeHtml(quiz.point || 0)}</td>
        <td>${answerType}</td>
        <td class="quiz-answer-cell" title="${escapeHtml(quiz.answer || "")}">${escapeHtml(quiz.answer || "")}</td>
        <td>
          <div class="quiz-actions">
            <button type="button" class="toggle-published-btn ${isPublished ? "" : "unpublished"}" data-category="${escapeHtml(category)}" data-qid="${escapeHtml(qid)}" data-published="${isPublished}">${toggleLabel}</button>
            <button type="button" class="edit-btn" data-category="${escapeHtml(category)}" data-qid="${escapeHtml(qid)}">編集</button>
            <button type="button" class="delete-btn delete" data-category="${escapeHtml(category)}" data-qid="${escapeHtml(qid)}">削除</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    categoryDiv.appendChild(wrap);
    container.appendChild(categoryDiv);
  }
}

window.loadQuizzes = async function() {
  try {
    const res = await fetch("/admin/quizzes", { credentials: "include" });
    if (!res.ok) {
      alert("読み込み失敗");
      return;
    }
    allQuizzesData = await res.json();
    updateQuizCategoryFilter(allQuizzesData);
    renderQuizList();
  } catch (err) {
    console.error("読み込みエラー:", err);
    alert("問題の読み込みに失敗しました");
  }
};

// 全ユーザーを取得（検索用に保持）
async function fetchAllUsers() {
  try {
    const res = await fetch("/admin/users", { credentials: "include" });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("アクセス権がありません");
      }
      throw new Error("読み込み失敗");
    }
    allUsersData = await res.json();
    return allUsersData;
  } catch (err) {
    console.error("ユーザー一覧取得エラー:", err);
    throw err;
  }
}

// ユーザーを検索して表示
async function searchUser(userid) {
  try {
    // 全ユーザーを取得（まだ取得していない場合）
    if (allUsersData.length === 0) {
      await fetchAllUsers();
    }
    
    // ユーザーIDで検索（部分一致）
    const searchTerm = userid.toLowerCase();
    const matchedUsers = allUsersData.filter(user => 
      user.userid.toLowerCase().includes(searchTerm)
    );
    
    const container = document.getElementById("userList");
    container.innerHTML = "";

    if (matchedUsers.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: #888; padding: 20px;">ユーザーID "${userid}" に一致するユーザーが見つかりませんでした</p>`;
      return;
    }

    // 検索結果を表示
    for (const user of matchedUsers) {
      const userDiv = document.createElement("div");
      userDiv.className = "quiz-item";
      
      const currentRole = user.role || 'user';
      const roleOptions = ['user', 'admin'];
      
      userDiv.innerHTML = `
        <div class="quiz-header">
          <h3>${user.username || user.userid}</h3>
        </div>
        <p><strong>ユーザーID:</strong> ${user.userid}</p>
        <p><strong>ユーザー名:</strong> ${user.username || '（未設定）'}</p>
        <p><strong>スコア:</strong> ${user.score || 0}</p>
        <p><strong>現在のロール:</strong> <span style="color: #667eea; font-weight: 600;">${currentRole}</span></p>
        <div class="form-group" style="margin-top: 15px;">
          <label>新しいロール</label>
          <select id="role-${user.userid}" style="max-width: 200px;">
            ${roleOptions.map(role => 
              `<option value="${role}" ${role === currentRole ? 'selected' : ''}>${role}</option>`
            ).join('')}
          </select>
          <button 
            type="button" 
            class="edit-btn" 
            onclick="updateUserRole('${user.userid}')"
            style="margin-top: 10px;"
          >
            ロールを変更
          </button>
        </div>
        <!-- [一時機能 / TEMP] ユーザー削除（今後削除予定） -->
        <div class="form-group" style="margin-top: 15px;">
          <button 
            type="button" 
            class="user-delete-btn" 
            onclick="deleteUser('${user.userid}')"
            style="margin-top: 10px; background: #f5576c; color: #fff;"
          >
            このユーザーを削除
          </button>
        </div>
      `;
      
      container.appendChild(userDiv);
    }
  } catch (err) {
    console.error("ユーザー検索エラー:", err);
    const container = document.getElementById("userList");
    container.innerHTML = `<p style="text-align: center; color: #f5576c; padding: 20px;">${err.message || "ユーザー検索に失敗しました"}</p>`;
  }
}

// ユーザー一覧を表示（後方互換性のため残す）
window.loadUsers = async function() {
  // 検索フォームが表示されている場合は何もしない
  const searchForm = document.getElementById("userSearchForm");
  if (searchForm) {
    return;
  }
  
  // 旧形式の場合は全ユーザーを表示
  try {
    const users = await fetchAllUsers();
    const container = document.getElementById("userList");
    container.innerHTML = "";

    if (users.length === 0) {
      container.innerHTML = "<p>ユーザーが見つかりません</p>";
      return;
    }

    for (const user of users) {
      const userDiv = document.createElement("div");
      userDiv.className = "quiz-item";
      
      const currentRole = user.role || 'user';
      const roleOptions = ['user', 'admin'];
      
      userDiv.innerHTML = `
        <div class="quiz-header">
          <h3>${user.username || user.userid}</h3>
        </div>
        <p><strong>ユーザーID:</strong> ${user.userid}</p>
        <p><strong>スコア:</strong> ${user.score || 0}</p>
        <div class="form-group" style="margin-top: 15px;">
          <label>ロール</label>
          <select id="role-${user.userid}" style="max-width: 200px;">
            ${roleOptions.map(role => 
              `<option value="${role}" ${role === currentRole ? 'selected' : ''}>${role}</option>`
            ).join('')}
          </select>
          <button 
            type="button" 
            class="edit-btn" 
            onclick="updateUserRole('${user.userid}')"
            style="margin-top: 10px;"
          >
            ロールを変更
          </button>
        </div>
      `;
      
      container.appendChild(userDiv);
    }
  } catch (err) {
    console.error("ユーザー一覧読み込みエラー:", err);
    alert("ユーザー一覧の読み込みに失敗しました");
  }
};

// ユーザーのroleを変更（グローバル関数として定義）
window.updateUserRole = async function(userid) {
  const selectElement = document.getElementById(`role-${userid}`);
  if (!selectElement) {
    alert("エラー: role選択要素が見つかりません");
    return;
  }

  const newRole = selectElement.value;
  
  if (!confirm(`ユーザー ${userid} のロールを ${newRole} に変更しますか？`)) {
    return;
  }

  try {
    const res = await fetch(`/admin/users/${encodeURIComponent(userid)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
      credentials: "include"
    });
    
    const result = await res.json();
    
    if (res.ok) {
      alert(result.message || "ロールを変更しました");
      // 検索結果を再表示（検索フォームの値を使用）
      const searchUserId = document.getElementById("searchUserId");
      if (searchUserId && searchUserId.value.trim()) {
        await searchUser(searchUserId.value.trim());
      }
    } else {
      alert(result.message || "ロールの変更に失敗しました");
    }
  } catch (err) {
    console.error("ロール変更エラー:", err);
    alert("サーバーエラーが発生しました");
  }
}

// ============================================================
// [一時機能 / TEMP] 指定ユーザーをDBから削除する（今後削除予定）
// このブロックをまるごと消せば機能を撤去できます。
// ============================================================
window.deleteUser = async function(userid) {
  if (!confirm(`ユーザー ${userid} をデータベースから完全に削除します。\nこの操作は取り消せません。よろしいですか？`)) {
    return;
  }

  try {
    const res = await fetch(`/admin/users/${encodeURIComponent(userid)}`, {
      method: "DELETE",
      credentials: "include"
    });

    const result = await res.json();

    if (res.ok) {
      alert(result.message || "ユーザーを削除しました");
      // キャッシュを無効化して検索結果を再取得
      allUsersData = [];
      const searchUserId = document.getElementById("searchUserId");
      if (searchUserId && searchUserId.value.trim()) {
        await searchUser(searchUserId.value.trim());
      }
    } else {
      alert(result.message || "ユーザーの削除に失敗しました");
    }
  } catch (err) {
    console.error("ユーザー削除エラー:", err);
    alert("サーバーエラーが発生しました");
  }
}
// ============================================================
// [一時機能 / TEMP] ここまで
// ============================================================

const FEEDBACK_STATUSES = [
  ["open", "未対応"],
  ["in_progress", "対応中"],
  ["done", "対応済み"],
  ["declined", "見送り"],
];

function formatFeedbackTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "";
  }
  return date.toLocaleString("ja-JP");
}

async function loadFeedback() {
  const list = document.getElementById("feedbackList");
  const count = document.getElementById("feedbackCount");
  if (!list) {
    return;
  }

  const status = document.getElementById("feedbackStatusFilter")?.value || "";
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  list.textContent = "読み込み中...";

  try {
    const res = await fetch(`/admin/feedback${query}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      list.textContent = data.message || "意見の取得に失敗しました";
      return;
    }

    const counts = data.counts || {};
    if (count) {
      count.textContent = `未対応 ${counts.open || 0} / 対応中 ${counts.in_progress || 0} / 対応済み ${counts.done || 0} / 見送り ${counts.declined || 0}`;
    }

    list.replaceChildren();
    if (!data.items || data.items.length === 0) {
      list.textContent = "意見はありません。";
      return;
    }

    for (const item of data.items) {
      list.appendChild(renderFeedbackItem(item));
    }
  } catch (err) {
    console.error("意見箱の読み込みエラー:", err);
    list.textContent = "意見の取得に失敗しました";
  }
}

function renderFeedbackItem(item) {
  const card = document.createElement("article");
  card.className = "feedback-item";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.className = "feedback-meta";
  meta.textContent = `${item.categoryLabel} / ${item.username}（${item.userid}） / ${formatFeedbackTime(item.createdAt)}`;

  const body = document.createElement("p");
  body.className = "feedback-body";
  body.textContent = item.body;

  const statusLabel = document.createElement("label");
  statusLabel.textContent = "状態";
  const statusSelect = document.createElement("select");
  for (const [value, label] of FEEDBACK_STATUSES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === item.status;
    statusSelect.appendChild(option);
  }

  const replyLabel = document.createElement("label");
  replyLabel.textContent = "返信（送信者に表示されます）";
  const reply = document.createElement("textarea");
  reply.maxLength = 1000;
  reply.value = item.adminReply || "";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存";
  const result = document.createElement("p");
  result.className = "feedback-result";

  save.addEventListener("click", async () => {
    result.textContent = "保存中...";
    try {
      const res = await fetch(`/admin/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: statusSelect.value,
          adminReply: reply.value,
        }),
      });
      const data = await res.json();
      result.textContent = data.message || "更新に失敗しました";
      if (res.ok) {
        await loadFeedback();
      }
    } catch (err) {
      console.error("意見箱の更新エラー:", err);
      result.textContent = "更新に失敗しました";
    }
  });

  card.append(title, meta, body, statusLabel, statusSelect, replyLabel, reply, save, result);
  return card;
}