const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const paths = require("../config/paths");

// users.db はプロセス内でこの1接続だけを使う。
// ルートごとに別接続を開くと、同時の書き込みが SQLITE_BUSY で失敗する。
if (!fs.existsSync(paths.STORAGE)) {
  fs.mkdirSync(paths.STORAGE, { recursive: true });
}

const dbPath = path.join(paths.STORAGE, "users.db");
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error("❌ データベース接続エラー (users.db):", err.message);
  }
});

db.configure("busyTimeout", 5000);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA busy_timeout = 5000");

db.on("error", (err) => {
  console.error("❌ データベースエラー (users.db):", err.message);
});

module.exports = db;
