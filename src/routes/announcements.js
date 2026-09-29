const express = require("express");
const db = require("../db/usersDb");

const TITLE_MAX = 80;
const BODY_MAX = 4000;

const router = express.Router();
const adminRouter = express.Router();

db.run(`CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
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

function parsePublished(value) {
  if (value === true || value === 1 || value === "true" || value === "1") {
    return 1;
  }
  if (value === false || value === 0 || value === "false" || value === "0") {
    return 0;
  }
  return null;
}

function toItem(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    published: row.published === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", requireLogin, (req, res) => {
  db.all(
    `SELECT id, title, body, published, created_at, updated_at
     FROM announcements
     WHERE published = 1
     ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error("お知らせの取得エラー:", err);
        return res.status(500).json({ message: "お知らせの取得に失敗しました" });
      }
      res.json({ items: (rows || []).map(toItem) });
    }
  );
});

adminRouter.use(requireAdmin);

adminRouter.get("/", (req, res) => {
  db.all(
    `SELECT id, title, body, published, created_at, updated_at
     FROM announcements
     ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error("管理者のお知らせ取得エラー:", err);
        return res.status(500).json({ message: "お知らせの取得に失敗しました" });
      }
      res.json({ items: (rows || []).map(toItem) });
    }
  );
});

adminRouter.post("/", (req, res) => {
  const title = cleanText(req.body && req.body.title, TITLE_MAX);
  const body = cleanText(req.body && req.body.body, BODY_MAX);
  const published = parsePublished(req.body && req.body.published);

  if (!title) {
    return res.status(400).json({ message: "件名を入力してください" });
  }
  if (!body) {
    return res.status(400).json({ message: "本文を入力してください" });
  }
  if (published === null) {
    return res.status(400).json({ message: "公開設定を選んでください" });
  }

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO announcements (title, body, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [title, body, published, now, now],
    function (err) {
      if (err) {
        console.error("お知らせの保存エラー:", err);
        return res.status(500).json({ message: "お知らせの保存に失敗しました" });
      }
      res.json({
        message: published ? "お知らせを公開しました" : "お知らせを非公開で保存しました",
        item: {
          id: this.lastID,
          title,
          body,
          published: published === 1,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  );
});

adminRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const title = cleanText(req.body && req.body.title, TITLE_MAX);
  const body = cleanText(req.body && req.body.body, BODY_MAX);
  const published = parsePublished(req.body && req.body.published);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "無効なお知らせです" });
  }
  if (!title) {
    return res.status(400).json({ message: "件名を入力してください" });
  }
  if (!body) {
    return res.status(400).json({ message: "本文を入力してください" });
  }
  if (published === null) {
    return res.status(400).json({ message: "公開設定を選んでください" });
  }

  const now = new Date().toISOString();
  db.run(
    `UPDATE announcements
     SET title = ?, body = ?, published = ?, updated_at = ?
     WHERE id = ?`,
    [title, body, published, now, id],
    function (err) {
      if (err) {
        console.error("お知らせの更新エラー:", err);
        return res.status(500).json({ message: "お知らせの更新に失敗しました" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "お知らせが見つかりません" });
      }
      res.json({ message: "お知らせを更新しました" });
    }
  );
});

adminRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "無効なお知らせです" });
  }

  db.run("DELETE FROM announcements WHERE id = ?", [id], function (err) {
    if (err) {
      console.error("お知らせの削除エラー:", err);
      return res.status(500).json({ message: "お知らせの削除に失敗しました" });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: "お知らせが見つかりません" });
    }
    res.json({ message: "お知らせを削除しました" });
  });
});

module.exports = { router, adminRouter };
