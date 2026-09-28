const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const paths = require("../config/paths");

const CATEGORIES = {
  improvement: "改善点",
  bug: "不具合",
  other: "その他",
};

const STATUSES = {
  open: "未対応",
  in_progress: "対応中",
  done: "対応済み",
  declined: "見送り",
};

const TITLE_MAX = 80;
const BODY_MAX = 2000;
const REPLY_MAX = 1000;
const DAILY_LIMIT = 10;

const router = express.Router();
const adminRouter = express.Router();

if (!fs.existsSync(paths.STORAGE)) {
  fs.mkdirSync(paths.STORAGE, { recursive: true });
}

const db = new sqlite3.Database(path.join(paths.STORAGE, "users.db"));

db.run(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  username TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userid) {
    return res.status(401).json({ message: "ログインが必要です" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userid) {
    return res.status(401).json({ message: "ログインが必要です" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ message: "管理者専用です" });
  }
  next();
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function toItem(row) {
  return {
    id: row.id,
    userid: row.userid,
    username: row.username,
    category: row.category,
    categoryLabel: CATEGORIES[row.category] || row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    statusLabel: STATUSES[row.status] || row.status,
    adminReply: row.admin_reply || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", (req, res) => {
  if (!req.session || !req.session.userid) {
    return res.redirect("/");
  }
  res.sendFile(path.join(paths.VIEWS, "pages", "feedback.html"));
});

router.get("/mine", requireLogin, (req, res) => {
  db.all(
    `SELECT id, userid, username, category, title, body, status, admin_reply, created_at, updated_at
     FROM feedback
     WHERE userid = ?
     ORDER BY id DESC`,
    [req.session.userid],
    (err, rows) => {
      if (err) {
        console.error("意見箱の取得エラー:", err);
        return res.status(500).json({ message: "意見の取得に失敗しました" });
      }
      res.json({ items: (rows || []).map(toItem) });
    }
  );
});

router.post("/", requireLogin, (req, res) => {
  const category = req.body && req.body.category;
  const title = cleanText(req.body && req.body.title, TITLE_MAX);
  const body = cleanText(req.body && req.body.body, BODY_MAX);

  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) {
    return res.status(400).json({ message: "種類を選んでください" });
  }
  if (!title) {
    return res.status(400).json({ message: "件名を入力してください" });
  }
  if (!body) {
    return res.status(400).json({ message: "内容を入力してください" });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.get(
    "SELECT COUNT(*) AS n FROM feedback WHERE userid = ? AND created_at >= ?",
    [req.session.userid, since],
    (countErr, countRow) => {
      if (countErr) {
        console.error("意見箱の件数確認エラー:", countErr);
        return res.status(500).json({ message: "送信に失敗しました" });
      }
      if (countRow && countRow.n >= DAILY_LIMIT) {
        return res.status(429).json({ message: "24時間に送れる意見は10件までです" });
      }

      db.get(
        "SELECT username FROM users WHERE userid = ?",
        [req.session.userid],
        (userErr, user) => {
          if (userErr || !user) {
            console.error("意見箱のユーザー確認エラー:", userErr);
            return res.status(500).json({ message: "送信に失敗しました" });
          }

          const now = new Date().toISOString();
          db.run(
            `INSERT INTO feedback (userid, username, category, title, body, status, admin_reply, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'open', '', ?, ?)`,
            [req.session.userid, user.username, category, title, body, now, now],
            function (insertErr) {
              if (insertErr) {
                console.error("意見箱の保存エラー:", insertErr);
                return res.status(500).json({ message: "送信に失敗しました" });
              }
              res.json({
                message: "意見を送りました",
                item: {
                  id: this.lastID,
                  category,
                  categoryLabel: CATEGORIES[category],
                  title,
                  body,
                  status: "open",
                  statusLabel: STATUSES.open,
                  adminReply: "",
                  createdAt: now,
                  updatedAt: now,
                },
              });
            }
          );
        }
      );
    }
  );
});

router.delete("/:id", requireLogin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "無効な意見です" });
  }

  db.run(
    "DELETE FROM feedback WHERE id = ? AND userid = ? AND status = 'open'",
    [id, req.session.userid],
    function (err) {
      if (err) {
        console.error("意見箱の削除エラー:", err);
        return res.status(500).json({ message: "削除に失敗しました" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "未対応の自分の意見だけ削除できます" });
      }
      res.json({ message: "意見を削除しました" });
    }
  );
});

adminRouter.use(requireAdmin);

adminRouter.get("/", (req, res) => {
  const status = req.query.status;
  const params = [];
  let where = "";
  if (status && Object.prototype.hasOwnProperty.call(STATUSES, status)) {
    where = "WHERE status = ?";
    params.push(status);
  }

  db.all(
    `SELECT id, userid, username, category, title, body, status, admin_reply, created_at, updated_at
     FROM feedback
     ${where}
     ORDER BY CASE status
       WHEN 'open' THEN 0
       WHEN 'in_progress' THEN 1
       WHEN 'done' THEN 2
       ELSE 3
     END, id DESC`,
    params,
    (err, rows) => {
      if (err) {
        console.error("管理者の意見箱取得エラー:", err);
        return res.status(500).json({ message: "意見の取得に失敗しました" });
      }
      db.all(
        "SELECT status, COUNT(*) AS n FROM feedback GROUP BY status",
        [],
        (countErr, counts) => {
          if (countErr) {
            console.error("管理者の意見箱件数エラー:", countErr);
            return res.status(500).json({ message: "意見の取得に失敗しました" });
          }
          const summary = { open: 0, in_progress: 0, done: 0, declined: 0 };
          for (const row of counts || []) {
            if (Object.prototype.hasOwnProperty.call(summary, row.status)) {
              summary[row.status] = row.n;
            }
          }
          res.json({
            items: (rows || []).map(toItem),
            counts: summary,
          });
        }
      );
    }
  );
});

adminRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const status = req.body && req.body.status;
  const adminReply = cleanText(req.body && req.body.adminReply, REPLY_MAX);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "無効な意見です" });
  }
  if (!Object.prototype.hasOwnProperty.call(STATUSES, status)) {
    return res.status(400).json({ message: "状態を選んでください" });
  }

  const now = new Date().toISOString();
  db.run(
    "UPDATE feedback SET status = ?, admin_reply = ?, updated_at = ? WHERE id = ?",
    [status, adminReply, now, id],
    function (err) {
      if (err) {
        console.error("意見箱の更新エラー:", err);
        return res.status(500).json({ message: "更新に失敗しました" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "意見が見つかりません" });
      }
      res.json({ message: "意見を更新しました" });
    }
  );
});

module.exports = { router, adminRouter };
