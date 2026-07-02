const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();
const paths = require("../config/paths");
const {
  loadDecorations,
  getDecoration,
  getDefaultDecoration,
  loadAchievementPoints
} = require("../services/decorations");

const dbDir = paths.STORAGE;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(paths.STORAGE, "users.db");
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error("❌ データベース接続エラー (decorations.js):", err.message);
  }
});

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// 解除済み実績の合計ポイント（獲得ポイント）を計算する
async function calcEarnedPoints(userid) {
  const pointMap = loadAchievementPoints();
  const rows = await dbAll(
    "SELECT achievement_id FROM user_achievements WHERE userid = ? AND unlocked_at IS NOT NULL",
    [userid]
  );
  let total = 0;
  for (const row of rows) {
    total += pointMap[row.achievement_id] || 0;
  }
  return total;
}

// ユーザーのポイント収支・所持・装備状態をまとめて取得する
async function getUserDecoState(userid) {
  const earned = await calcEarnedPoints(userid);
  const userRow = await dbGet(
    "SELECT spent_points, equipped_name_deco, equipped_icon_deco FROM users WHERE userid = ?",
    [userid]
  );
  const spent = userRow ? Number(userRow.spent_points) || 0 : 0;
  const ownedRows = await dbAll(
    "SELECT decoration_id FROM user_decorations WHERE userid = ?",
    [userid]
  );
  const owned = new Set(ownedRows.map((r) => r.decoration_id));

  // デフォルト（cost 0）は常に所持扱い
  const catalog = loadDecorations();
  [...catalog.name, ...catalog.icon].forEach((deco) => {
    if ((deco.cost || 0) === 0) owned.add(deco.id);
  });

  const defaultName = getDefaultDecoration("name");
  const defaultIcon = getDefaultDecoration("icon");
  const equippedName = (userRow && userRow.equipped_name_deco) || (defaultName ? defaultName.id : null);
  const equippedIcon = (userRow && userRow.equipped_icon_deco) || (defaultIcon ? defaultIcon.id : null);

  return {
    earned,
    spent,
    balance: earned - spent,
    owned,
    equippedName,
    equippedIcon,
    catalog
  };
}

// 装備中デコレーションの className を解決する（server.js の session-check からも利用）
async function getEquippedClasses(userid) {
  try {
    const state = await getUserDecoState(userid);
    const nameDeco = getDecoration(state.equippedName);
    const iconDeco = getDecoration(state.equippedIcon);
    return {
      nameDecoClass: nameDeco ? nameDeco.className || "" : "",
      iconDecoClass: iconDeco ? iconDeco.className || "" : ""
    };
  } catch (err) {
    console.error("装備デコレーション取得エラー:", err);
    return { nameDecoClass: "", iconDecoClass: "" };
  }
}

// デコレーション一覧＋ポイント収支＋所持/装備状態を返す
router.get("/list", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  try {
    const state = await getUserDecoState(userid);
    const decorate = (deco) => ({
      id: deco.id,
      type: deco.type,
      title: deco.title,
      description: deco.description || "",
      cost: deco.cost || 0,
      className: deco.className || "",
      owned: state.owned.has(deco.id) || (deco.cost || 0) === 0,
      equipped: deco.id === state.equippedName || deco.id === state.equippedIcon
    });

    res.json({
      earnedPoints: state.earned,
      spentPoints: state.spent,
      balance: state.balance,
      equippedName: state.equippedName,
      equippedIcon: state.equippedIcon,
      decorations: {
        name: state.catalog.name.map(decorate),
        icon: state.catalog.icon.map(decorate)
      }
    });
  } catch (err) {
    console.error("デコレーション一覧取得エラー:", err);
    res.status(500).json({ message: "エラーが発生しました" });
  }
});

// デコレーションを購入する（ポイントを消費）
router.post("/purchase", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const { decorationId } = req.body || {};

  const deco = getDecoration(decorationId);
  if (!deco) {
    return res.status(400).json({ success: false, message: "存在しないデコレーションです" });
  }

  try {
    const state = await getUserDecoState(userid);

    if (state.owned.has(decorationId) || (deco.cost || 0) === 0) {
      return res.status(400).json({ success: false, message: "すでに所持しています" });
    }
    if (state.balance < deco.cost) {
      return res.status(400).json({
        success: false,
        message: `ポイントが不足しています（必要: ${deco.cost} / 残高: ${state.balance}）`
      });
    }

    // 所持テーブルへ追加 → 消費ポイントを加算
    await dbRun(
      "INSERT OR IGNORE INTO user_decorations (userid, decoration_id, owned_at) VALUES (?, ?, ?)",
      [userid, decorationId, new Date().toISOString()]
    );
    await dbRun(
      "UPDATE users SET spent_points = COALESCE(spent_points, 0) + ? WHERE userid = ?",
      [deco.cost, userid]
    );

    const newState = await getUserDecoState(userid);
    res.json({
      success: true,
      message: `${deco.title} を購入しました`,
      balance: newState.balance,
      earnedPoints: newState.earned,
      spentPoints: newState.spent
    });
  } catch (err) {
    console.error("デコレーション購入エラー:", err);
    res.status(500).json({ success: false, message: "エラーが発生しました" });
  }
});

// デコレーションを装備する（所持済みのみ）
router.post("/equip", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const { decorationId } = req.body || {};

  const deco = getDecoration(decorationId);
  if (!deco || (deco.type !== "name" && deco.type !== "icon")) {
    return res.status(400).json({ success: false, message: "存在しないデコレーションです" });
  }

  try {
    const state = await getUserDecoState(userid);
    if (!state.owned.has(decorationId) && (deco.cost || 0) !== 0) {
      return res.status(400).json({ success: false, message: "このデコレーションを所持していません" });
    }

    const column = deco.type === "name" ? "equipped_name_deco" : "equipped_icon_deco";
    await dbRun(`UPDATE users SET ${column} = ? WHERE userid = ?`, [decorationId, userid]);

    res.json({
      success: true,
      message: `${deco.title} を装備しました`,
      type: deco.type,
      className: deco.className || ""
    });
  } catch (err) {
    console.error("デコレーション装備エラー:", err);
    res.status(500).json({ success: false, message: "エラーが発生しました" });
  }
});

module.exports = { router, getEquippedClasses };
