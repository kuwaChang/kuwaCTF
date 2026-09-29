const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();
const paths = require("../config/paths");
const { isQuestionPublished, filterPublishedQuizData } = require("../utils/quizVisibility");

// storageフォルダが存在しない場合は作成
const dbDir = paths.STORAGE;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(paths.STORAGE, "users.db");
//console.log("[quiz.js] データベースパス:", dbPath);
//console.log("[quiz.js] ファイル存在確認:", fs.existsSync(dbPath));
//console.log("[quiz.js] ディレクトリ存在確認:", fs.existsSync(path.dirname(dbPath)));
let db;
try {
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error("❌ データベース接続エラー (quiz.js):", err.message);
      console.error("   エラーコード:", err.code);
      console.error("   エラー番号:", err.errno);
      console.error("   データベースパス:", dbPath);
      console.error("   スタックトレース:", err.stack);
    } else {
      //console.log("✅ [quiz.js] データベース接続成功");
    }
  });
} catch (err) {
  console.error("❌ データベース作成時の例外 (quiz.js):", err.message);
  console.error("   スタックトレース:", err.stack);
  throw err;
}
db.on('error', (err) => {
  console.error("❌ データベースエラー (quiz.js):", err.message);
  console.error("   エラーコード:", err.code);
  console.error("   エラー番号:", err.errno);
  console.error("   データベースパス:", dbPath);
  if (err.stack) {
    console.error("   スタックトレース:", err.stack);
  }
});
const quizPath = path.join(paths.CONFIG, "quizData.json");

// サーバーのIPアドレスを取得する関数
function getServerHost() {
  // 環境変数が設定されている場合はそれを優先
  if (process.env.SERVER_HOST) {
    return process.env.SERVER_HOST;
  }
  
  // IPアドレスを取得
  const interfaces = os.networkInterfaces();
  const addresses = [];
  const preferredAddresses = []; // 192.168.x.xを優先
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4で、内部（非ループバック）アドレスのみ
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        // 192.168.x.xを優先リストに追加
        if (ip.startsWith('192.168.')) {
          preferredAddresses.push(ip);
        } else {
          addresses.push(ip);
        }
      }
    }
  }
  
  // 優先アドレスがあればそれを返す、なければ通常のアドレスを返す
  const ipList = preferredAddresses.length > 0 ? preferredAddresses : addresses;
  return ipList.length > 0 ? ipList[0] : 'localhost';
}

// quizData.jsonのlocalhostをサーバーのIPアドレスに置き換える関数
function replaceLocalhostInQuizData(data) {
  const serverHost = getServerHost();
  const dataString = JSON.stringify(data);
  const replacedString = dataString.replace(/http:\/\/localhost:(\d+)/g, `http://${serverHost}:$1`);
  return JSON.parse(replacedString);
}

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

// 全問題を返す（非公開は除外）
router.get("/all", requireLogin, (req, res) => {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const replacedData = replaceLocalhostInQuizData(data);
  res.json(filterPublishedQuizData(replacedData));
});

// 座標の距離を計算（ハーバサイン公式）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球の半径（km）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // 距離（km）
}


// 座標が許容範囲内かチェック（生の座標用）
function checkCoordinates(userAnswer, correctAnswer, tolerance = 0.001) {
  try {
    const userCoords = userAnswer.split(',').map(c => parseFloat(c.trim()));
    const correctCoords = correctAnswer.split(',').map(c => parseFloat(c.trim()));
    
    if (userCoords.length !== 2 || correctCoords.length !== 2) return false;
    if (isNaN(userCoords[0]) || isNaN(userCoords[1]) || 
        isNaN(correctCoords[0]) || isNaN(correctCoords[1])) return false;
    
    // 緯度経度の差分をチェック（簡易版）
    const latDiff = Math.abs(userCoords[0] - correctCoords[0]);
    const lonDiff = Math.abs(userCoords[1] - correctCoords[1]);
    
    // tolerance（デフォルト0.001度 ≈ 約111m）以内なら正解
    return latDiff <= tolerance && lonDiff <= tolerance;
  } catch (e) {
    return false;
  }
}

// 正解判定
router.post("/checkAnswer", requireLogin, (req, res) => {
  const { category, qid, answer, answerType: clientAnswerType, point, usedHint } = req.body;
  const userid = req.session.userid;
  const rawData = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  const data = replaceLocalhostInQuizData(rawData);
  const question = data[category]?.[qid];
  
  if (!question) return res.status(404).json({ message: "問題が見つかりません" });
  if (!isQuestionPublished(question) && req.session.role !== "admin") {
    return res.status(404).json({ message: "問題が見つかりません" });
  }
  
  // 問題のcategoryIdを取得（実績チェック用）
  const questionCategoryId = question.categoryId || null;
  
  const correct = question.answer;
  const answerType = question.answerType || "flag"; // デフォルトはflag形式
  let isCorrect = false;

  if (answerType === "coordinates") {
    // 座標形式の検証（生の座標で比較）
    const tolerance = question.coordinateTolerance || 0.001;
    // 複数の正解をサポート（配列の場合）
    if (Array.isArray(correct)) {
      isCorrect = correct.some(corr => checkCoordinates(answer, corr.trim(), tolerance));
    } else {
      isCorrect = checkCoordinates(answer, correct.trim(), tolerance);
    }
  } else {
    // 通常のFLAG形式の検証（生の答えを直接比較）
    // 複数の正解をサポート（配列の場合）
    if (Array.isArray(correct)) {
      isCorrect = correct.some(corr => answer.trim() === corr.trim());
    } else {
      isCorrect = answer.trim() === correct.trim();
    }
  }

  if (isCorrect) {
    db.get("SELECT * FROM solved WHERE userid=? AND category=? AND qid=?", [userid, category, qid], (err, row) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ message: "DBエラー" });
      }
      if (row) {
        // 既に解答済みでも「挑戦」としてログに残す（CTF中毒の日次挑戦カウント用）
        logAnswerAttempt(userid, category, qid, true, false);
        return res.json({ correct: true, alreadySolved: true, message: "既に解答済みです" });
      }

      // クライアント申告と hint_opened の両方で判定する。
      // 申告が未送信でも、ヒント欄を開いた記録があればヒント使用とみなす。
      db.get(
        "SELECT 1 AS opened FROM hint_opened WHERE userid = ? AND category = ? AND qid = ?",
        [userid, category, qid],
        (hintErr, hintRow) => {
          if (hintErr) {
            console.error("ヒント使用確認エラー:", hintErr);
          }
          const hintWasUsed = !!usedHint || !!hintRow;
          beginSolveRecord(hintWasUsed);
        }
      );

      function beginSolveRecord(hintWasUsed) {
      // スコア更新と実績チェックを実行する関数
      const executeScoreUpdateAndAchievementCheck = () => {
        // 新規正解を解答ログに記録（連続正解・日次正解・ノーミス判定用）
        logAnswerAttempt(userid, category, qid, true, true);

        db.run("UPDATE users SET score = score + ? WHERE userid = ?", [point, userid], (err) => {
          if (err) {
            console.error("DB update error:", err);
            return res.status(500).json({ message: "DBエラー" });
          }
          
          // 実績チェック
          const { checkAchievements } = require("./achievements");
          checkAchievements(userid, "solve_count", { solved: true })
            .then(unlocked => {
              if (unlocked.length > 0) {
                // 実績解除通知はクライアント側で処理
              }
            })
            .catch(err => console.error("実績チェックエラー:", err));
          
          // カテゴリー別実績チェック（categoryIdを使用）
          if (questionCategoryId) {
            checkAchievements(userid, "category_solve", { solved: true, category: questionCategoryId })
              .then(unlocked => {
                if (unlocked.length > 0) {
                  // 実績解除通知はクライアント側で処理
                }
              })
              .catch(err => console.error("実績チェックエラー:", err));
          }
          
          // 全カテゴリー制覇チェック
          checkAchievements(userid, "all_categories", { solved: true })
            .then(unlocked => {
              if (unlocked.length > 0) {
                // 実績解除通知はクライアント側で処理
              }
            })
            .catch(err => console.error("実績チェックエラー:", err));
          
          // ヒントなし解答実績チェック
          if (!hintWasUsed) {
            checkAchievements(userid, "no_hint_solve", { solved: true, used_hint: false })
              .then(unlocked => {
                if (unlocked.length > 0) {
                  // 実績解除通知はクライアント側で処理
                }
              })
              .catch(err => console.error("実績チェックエラー:", err));
          }

          // 解答ログ系の実績チェック（連続正解・日次正解・1日の挑戦数・ノーミス）
          checkAchievements(userid, "consecutive_correct", { solved: true })
            .catch(err => console.error("実績チェックエラー:", err));
          checkAchievements(userid, "daily_solve", { solved: true })
            .catch(err => console.error("実績チェックエラー:", err));
          checkAchievements(userid, "daily_attempt", { attempted: true })
            .catch(err => console.error("実績チェックエラー:", err));
          checkAchievements(userid, "no_miss", { solved: true, category, qid })
            .catch(err => console.error("実績チェックエラー:", err));
          checkAchievements(userid, "speed_solve", { solved: true })
            .catch(err => console.error("実績チェックエラー:", err));
          
          // スコア実績チェック
          db.get("SELECT score FROM users WHERE userid = ?", [userid], (err, scoreRow) => {
            if (!err && scoreRow) {
              checkAchievements(userid, "score", { score: scoreRow.score })
                .catch(err => console.error("実績チェックエラー:", err));
            }
          });
          
          res.json({ correct: true, message: "正解！" });
        });
      };
      
      // INSERTを実行する関数
      const executeInsert = () => {
        // ヒント使用フラグ（0または1）を記録
        const usedHintFlag = hintWasUsed ? 1 : 0;
        
        // まず、used_hintカラムが存在するかどうかを確認してから適切なINSERT文を実行
        // テーブル構造を確認するために、まず4カラムで試行
        db.run("INSERT INTO solved (userid, category, qid, used_hint) VALUES (?, ?, ?, ?)", 
          [userid, category, qid, usedHintFlag], (err) => {
          if (err) {
            // used_hintカラムが存在しない場合は、カラム名を指定せずにINSERT
            // ただし、テーブルに既に4カラムある場合はエラーになる可能性がある
            // その場合は、明示的に3カラムを指定
            db.run("INSERT INTO solved (userid, category, qid) VALUES (?, ?, ?)", 
              [userid, category, qid], (err2) => {
              if (err2) {
                console.error("DB insert error:", err2);
                return res.status(500).json({ message: "DBエラー" });
              }
              // 3カラムでの挿入成功時も同じ処理を実行
              executeScoreUpdateAndAchievementCheck();
            });
          } else {
            // 4カラムでの挿入成功時
            executeScoreUpdateAndAchievementCheck();
          }
        });
      };

      // solvedテーブルにused_hintカラムを追加（存在しない場合）
      // カラム追加を同期的に実行してからINSERTを実行
      db.run(`ALTER TABLE solved ADD COLUMN used_hint INTEGER DEFAULT 0`, (err) => {
        // カラムが既に存在する場合はエラーになるが無視
        if (err && !err.message.includes("duplicate column") && !err.message.includes("duplicate column name")) {
          console.error("used_hintカラム追加エラー:", err);
        }
        
        // カラム追加後（または既に存在する場合）にINSERTを実行
        executeInsert();
      });
      }
    });
  } else {
    // 不正解も「挑戦」としてログに記録（CTF中毒の日次挑戦カウント用）
    logAnswerAttempt(userid, category, qid, false, false);

    // 1日の挑戦数の実績チェック（不正解でも挑戦としてカウント）
    const { checkAchievements } = require("./achievements");
    checkAchievements(userid, "daily_attempt", { attempted: true })
      .catch(err => console.error("実績チェックエラー:", err));

    res.json({ correct: false, message: "不正解..." });
  }
});

// hint_openedテーブルを作成（存在しない場合）
db.run(`CREATE TABLE IF NOT EXISTS hint_opened (
  userid TEXT NOT NULL,
  category TEXT NOT NULL,
  qid TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userid, category, qid)
)`, (err) => {
  if (err) {
    console.error("hint_openedテーブル作成エラー:", err);
  } else {
    console.log("✅ hint_openedテーブル確認/作成完了");
  }
});

// 解答ログテーブルを作成（連続正解・日次正解/挑戦・ノーミス判定用）
// 正解・不正解を問わず、全ての解答送信を1行ずつ記録する
db.run(`CREATE TABLE IF NOT EXISTS answer_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userid TEXT NOT NULL,
  category TEXT NOT NULL,
  qid TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  is_new_solve INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) {
    console.error("answer_attemptsテーブル作成エラー:", err);
  } else {
    console.log("✅ answer_attemptsテーブル確認/作成完了");
  }
});

const WRITEUP_MAX = 10000;
const REPLY_MAX = 1000;

db.run(`CREATE TABLE IF NOT EXISTS writeups (
  userid TEXT NOT NULL,
  category TEXT NOT NULL,
  qid TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userid, category, qid)
)`, (err) => {
  if (err) {
    console.error("writeupsテーブル作成エラー:", err);
  } else {
    console.log("✅ writeupsテーブル確認/作成完了");
  }
});

db.run(`CREATE TABLE IF NOT EXISTS writeup_votes (
  writeup_userid TEXT NOT NULL,
  category TEXT NOT NULL,
  qid TEXT NOT NULL,
  voter_userid TEXT NOT NULL,
  vote TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (writeup_userid, category, qid, voter_userid)
)`, (err) => {
  if (err) console.error("writeup_votesテーブル作成エラー:", err);
});

db.run(`CREATE TABLE IF NOT EXISTS writeup_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  writeup_userid TEXT NOT NULL,
  category TEXT NOT NULL,
  qid TEXT NOT NULL,
  userid TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`, (err) => {
  if (err) console.error("writeup_repliesテーブル作成エラー:", err);
});

function cleanWriteup(value, maxLength = WRITEUP_MAX) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function loadQuestion(category, qid) {
  const data = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
  return data[category]?.[qid] || null;
}

function findSolved(userid, category, qid, callback) {
  db.get(
    "SELECT 1 AS solved FROM solved WHERE userid = ? AND category = ? AND qid = ?",
    [userid, category, qid],
    callback
  );
}

// 解いた問題の writeup 一覧。未解答の問題は本文を返さない。
router.get("/writeups", requireLogin, (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const qid = typeof req.query.qid === "string" ? req.query.qid : "";
  const userid = req.session.userid;

  if (!category || !qid) {
    return res.status(400).json({ message: "問題が指定されていません" });
  }

  const question = loadQuestion(category, qid);
  if (!question || (!isQuestionPublished(question) && req.session.role !== "admin")) {
    return res.status(404).json({ message: "問題が見つかりません" });
  }

  findSolved(userid, category, qid, (err, solved) => {
    if (err) {
      console.error("writeup閲覧の解答確認エラー:", err);
      return res.status(500).json({ message: "writeupの取得に失敗しました" });
    }
    if (!solved) {
      return res.status(403).json({ message: "解いた問題のwriteupだけ閲覧できます" });
    }

    db.all(
      `SELECT w.userid, COALESCE(u.username, w.userid) AS username, w.body, w.updated_at,
              (SELECT COUNT(*) FROM writeup_votes v
                WHERE v.writeup_userid = w.userid AND v.category = w.category AND v.qid = w.qid AND v.vote = 'good') AS good_count,
              (SELECT COUNT(*) FROM writeup_votes v
                WHERE v.writeup_userid = w.userid AND v.category = w.category AND v.qid = w.qid AND v.vote = 'bad') AS bad_count,
              (SELECT vote FROM writeup_votes v
                WHERE v.writeup_userid = w.userid AND v.category = w.category AND v.qid = w.qid AND v.voter_userid = ?) AS my_vote
       FROM writeups w
       LEFT JOIN users u ON u.userid = w.userid
       WHERE w.category = ? AND w.qid = ?
       ORDER BY CASE WHEN w.userid = ? THEN 0 ELSE 1 END, w.updated_at DESC`,
      [userid, category, qid, userid],
      (listErr, rows) => {
        if (listErr) {
          console.error("writeup取得エラー:", listErr);
          return res.status(500).json({ message: "writeupの取得に失敗しました" });
        }
        db.all(
          `SELECT r.id, r.writeup_userid, r.userid, COALESCE(u.username, r.userid) AS username, r.body, r.created_at
           FROM writeup_replies r
           LEFT JOIN users u ON u.userid = r.userid
           WHERE r.category = ? AND r.qid = ?
           ORDER BY r.id ASC`,
          [category, qid],
          (replyErr, replyRows) => {
            if (replyErr) {
              console.error("writeup返信取得エラー:", replyErr);
              return res.status(500).json({ message: "writeupの取得に失敗しました" });
            }
            const repliesByAuthor = new Map();
            for (const reply of replyRows || []) {
              const list = repliesByAuthor.get(reply.writeup_userid) || [];
              list.push({
                id: reply.id,
                username: reply.username,
                body: reply.body,
                createdAt: reply.created_at,
                mine: reply.userid === userid,
              });
              repliesByAuthor.set(reply.writeup_userid, list);
            }
            const items = (rows || []).map((row) => ({
              authorId: row.userid,
              username: row.username,
              body: row.body,
              updatedAt: row.updated_at,
              mine: row.userid === userid,
              goodCount: row.good_count || 0,
              badCount: row.bad_count || 0,
              myVote: row.my_vote || null,
              replies: repliesByAuthor.get(row.userid) || [],
            }));
            const mine = items.find((item) => item.mine) || null;
            res.json({
              items,
              mine: mine ? { body: mine.body, updatedAt: mine.updatedAt } : null,
            });
          }
        );
      }
    );
  });
});

// 自分の writeup を保存する。未解答の問題には書けない。
router.put("/writeups", requireLogin, (req, res) => {
  const category = req.body && typeof req.body.category === "string" ? req.body.category : "";
  const qid = req.body && typeof req.body.qid === "string" ? req.body.qid : "";
  const body = cleanWriteup(req.body && req.body.body);
  const userid = req.session.userid;

  if (!category || !qid) {
    return res.status(400).json({ message: "問題が指定されていません" });
  }
  if (!body) {
    return res.status(400).json({ message: "writeupを入力してください" });
  }

  const question = loadQuestion(category, qid);
  if (!question || (!isQuestionPublished(question) && req.session.role !== "admin")) {
    return res.status(404).json({ message: "問題が見つかりません" });
  }

  findSolved(userid, category, qid, (err, solved) => {
    if (err) {
      console.error("writeup保存の解答確認エラー:", err);
      return res.status(500).json({ message: "writeupの保存に失敗しました" });
    }
    if (!solved) {
      return res.status(403).json({ message: "解いた問題にだけwriteupを書けます" });
    }

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO writeups (userid, category, qid, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(userid, category, qid) DO UPDATE SET
         body = excluded.body,
         updated_at = excluded.updated_at`,
      [userid, category, qid, body, now, now],
      (saveErr) => {
        if (saveErr) {
          console.error("writeup保存エラー:", saveErr);
          return res.status(500).json({ message: "writeupの保存に失敗しました" });
        }
        res.json({ message: "writeupを保存しました", updatedAt: now });
      }
    );
  });
});

// 自分の writeup を削除する。
router.delete("/writeups", requireLogin, (req, res) => {
  const category = req.body && typeof req.body.category === "string" ? req.body.category : "";
  const qid = req.body && typeof req.body.qid === "string" ? req.body.qid : "";
  const userid = req.session.userid;

  if (!category || !qid) {
    return res.status(400).json({ message: "問題が指定されていません" });
  }

  db.run(
    "DELETE FROM writeups WHERE userid = ? AND category = ? AND qid = ?",
    [userid, category, qid],
    function (err) {
      if (err) {
        console.error("writeup削除エラー:", err);
        return res.status(500).json({ message: "writeupの削除に失敗しました" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "writeupが見つかりません" });
      }
      db.run(
        "DELETE FROM writeup_votes WHERE writeup_userid = ? AND category = ? AND qid = ?",
        [userid, category, qid],
        () => {
          db.run(
            "DELETE FROM writeup_replies WHERE writeup_userid = ? AND category = ? AND qid = ?",
            [userid, category, qid],
            () => res.json({ message: "writeupを削除しました" })
          );
        }
      );
    }
  );
});

function requireSolvedWriteup(req, res, category, qid, authorId, onOk) {
  if (!category || !qid || !authorId) {
    return res.status(400).json({ message: "writeupが指定されていません" });
  }
  const question = loadQuestion(category, qid);
  if (!question || (!isQuestionPublished(question) && req.session.role !== "admin")) {
    return res.status(404).json({ message: "問題が見つかりません" });
  }
  findSolved(req.session.userid, category, qid, (err, solved) => {
    if (err) {
      console.error("writeup操作の解答確認エラー:", err);
      return res.status(500).json({ message: "操作に失敗しました" });
    }
    if (!solved) {
      return res.status(403).json({ message: "解いた問題のwriteupだけ操作できます" });
    }
    db.get(
      "SELECT 1 AS ok FROM writeups WHERE userid = ? AND category = ? AND qid = ?",
      [authorId, category, qid],
      (writeupErr, writeup) => {
        if (writeupErr) {
          console.error("writeup確認エラー:", writeupErr);
          return res.status(500).json({ message: "操作に失敗しました" });
        }
        if (!writeup) {
          return res.status(404).json({ message: "writeupが見つかりません" });
        }
        onOk();
      }
    );
  });
}

// 同じ問題を解いた人だけが Good / Bad を付けられる。同じボタンをもう一度押すと取り消す。
router.post("/writeups/vote", requireLogin, (req, res) => {
  const category = req.body && typeof req.body.category === "string" ? req.body.category : "";
  const qid = req.body && typeof req.body.qid === "string" ? req.body.qid : "";
  const authorId = req.body && typeof req.body.authorId === "string" ? req.body.authorId : "";
  const vote = req.body && req.body.vote;
  const userid = req.session.userid;

  if (vote !== "good" && vote !== "bad") {
    return res.status(400).json({ message: "GoodまたはBadを選んでください" });
  }
  if (authorId === userid) {
    return res.status(400).json({ message: "自分のwriteupは評価できません" });
  }

  requireSolvedWriteup(req, res, category, qid, authorId, () => {
    db.get(
      `SELECT vote FROM writeup_votes
       WHERE writeup_userid = ? AND category = ? AND qid = ? AND voter_userid = ?`,
      [authorId, category, qid, userid],
      (err, row) => {
        if (err) {
          console.error("writeup評価確認エラー:", err);
          return res.status(500).json({ message: "評価に失敗しました" });
        }
        if (row && row.vote === vote) {
          db.run(
            `DELETE FROM writeup_votes
             WHERE writeup_userid = ? AND category = ? AND qid = ? AND voter_userid = ?`,
            [authorId, category, qid, userid],
            (deleteErr) => {
              if (deleteErr) {
                console.error("writeup評価取消エラー:", deleteErr);
                return res.status(500).json({ message: "評価に失敗しました" });
              }
              res.json({ message: "評価を取り消しました" });
            }
          );
          return;
        }
        const now = new Date().toISOString();
        db.run(
          `INSERT INTO writeup_votes (writeup_userid, category, qid, voter_userid, vote, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(writeup_userid, category, qid, voter_userid) DO UPDATE SET
             vote = excluded.vote,
             created_at = excluded.created_at`,
          [authorId, category, qid, userid, vote, now],
          (saveErr) => {
            if (saveErr) {
              console.error("writeup評価保存エラー:", saveErr);
              return res.status(500).json({ message: "評価に失敗しました" });
            }
            res.json({ message: vote === "good" ? "Goodを付けました" : "Badを付けました" });
          }
        );
      }
    );
  });
});

// 同じ問題を解いた人だけが返信できる。
router.post("/writeups/replies", requireLogin, (req, res) => {
  const category = req.body && typeof req.body.category === "string" ? req.body.category : "";
  const qid = req.body && typeof req.body.qid === "string" ? req.body.qid : "";
  const authorId = req.body && typeof req.body.authorId === "string" ? req.body.authorId : "";
  const body = cleanWriteup(req.body && req.body.body, REPLY_MAX);
  const userid = req.session.userid;

  if (!body) {
    return res.status(400).json({ message: "返信を入力してください" });
  }

  requireSolvedWriteup(req, res, category, qid, authorId, () => {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO writeup_replies (writeup_userid, category, qid, userid, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [authorId, category, qid, userid, body, now],
      function (err) {
        if (err) {
          console.error("writeup返信保存エラー:", err);
          return res.status(500).json({ message: "返信に失敗しました" });
        }
        res.json({ message: "返信しました", id: this.lastID });
      }
    );
  });
});

router.delete("/writeups/replies", requireLogin, (req, res) => {
  const id = Number(req.body && req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: "返信が指定されていません" });
  }
  db.run(
    "DELETE FROM writeup_replies WHERE id = ? AND userid = ?",
    [id, req.session.userid],
    function (err) {
      if (err) {
        console.error("writeup返信削除エラー:", err);
        return res.status(500).json({ message: "返信の削除に失敗しました" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: "自分の返信だけ削除できます" });
      }
      res.json({ message: "返信を削除しました" });
    }
  );
});

// 解答ログを記録するヘルパー
function logAnswerAttempt(userid, category, qid, correct, isNewSolve) {
  db.run(
    "INSERT INTO answer_attempts (userid, category, qid, correct, is_new_solve, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [userid, category, qid, correct ? 1 : 0, isNewSolve ? 1 : 0, new Date().toISOString()],
    (err) => {
      if (err) console.error("解答ログ記録エラー:", err);
    }
  );
}

// 解いた問題一覧
router.get("/solvedList", requireLogin, (req, res) => {
  db.all("SELECT category, qid FROM solved WHERE userid = ?", [req.session.userid], (err, rows) => {
    if (err) return res.status(500).json({ message: "DBエラー" });
    res.json(rows);
  });
});

// ヒントを開いた記録を保存
router.post("/hintOpened", requireLogin, (req, res) => {
  const { category, qid } = req.body;
  const userid = req.session.userid;
  
  if (!category || !qid) {
    return res.status(400).json({ message: "categoryとqidが必要です" });
  }
  
  // 既に記録があるか確認
  db.get("SELECT * FROM hint_opened WHERE userid = ? AND category = ? AND qid = ?", 
    [userid, category, qid], (err, row) => {
    if (err) {
      console.error("ヒント記録確認エラー:", err);
      return res.status(500).json({ message: "DBエラー" });
    }
    
    // 既に記録がある場合は何もしない
    if (row) {
      return res.json({ success: true, message: "既に記録済み" });
    }
    
    // 新規記録を追加
    db.run("INSERT INTO hint_opened (userid, category, qid) VALUES (?, ?, ?)", 
      [userid, category, qid], (err) => {
      if (err) {
        console.error("ヒント記録保存エラー:", err);
        return res.status(500).json({ message: "DBエラー" });
      }
      res.json({ success: true, message: "ヒント記録を保存しました" });
    });
  });
});

// ヒントを開いたかどうかを取得
router.get("/hintOpened/:category/:qid", requireLogin, (req, res) => {
  const { category, qid } = req.params;
  const userid = req.session.userid;
  
  db.get("SELECT * FROM hint_opened WHERE userid = ? AND category = ? AND qid = ?", 
    [userid, category, qid], (err, row) => {
    if (err) {
      console.error("ヒント記録取得エラー:", err);
      return res.status(500).json({ message: "DBエラー" });
    }
    res.json({ opened: !!row });
  });
});

// ファイルダウンロード用エンドポイント
router.get("/file/:category/:filename", requireLogin, (req, res) => {
  const { category, filename } = req.params;
  const filesDir = paths.UPLOADS;
  
  // セキュリティ: ファイル名のサニタイゼーション
  const sanitizeFilename = (name) => {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.\./g, '')
      .replace(/^\.+/, '')
      .substring(0, 255);
  };
  
  const safeFilename = sanitizeFilename(filename);
  const safeCategory = sanitizeFilename(category);
  
  // 複数のパスを試す（カテゴリー名とディレクトリ名の不一致に対応）
  const possiblePaths = [
    path.join(filesDir, safeCategory, safeFilename), // カテゴリー名でディレクトリを探す
    path.join(filesDir, safeFilename), // ルートディレクトリ
  ];
  
  // カテゴリー名のマッピング（Easy1 -> beginner1 など）
  const categoryMapping = {
    "Easy1": "beginner1",
    "Easy2": "beginner2",
  };
  
  if (categoryMapping[safeCategory]) {
    possiblePaths.unshift(path.join(filesDir, categoryMapping[safeCategory], safeFilename));
  }
  
  // ファイルを探す
  let fileFound = false;
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      // セキュリティ: パストラバーサル対策（filesDir内か確認）
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(filesDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        return res.status(403).json({ message: "アクセスが拒否されました" });
      }
      
      res.sendFile(resolvedPath);
      fileFound = true;
      break;
    }
  }
  
  if (!fileFound) {
    res.status(404).json({ message: "ファイルが見つかりません" });
  }
});

// ランキング
router.get("/ranking", (req, res) => {
  db.all("SELECT userid, SUM(point) as total FROM solves GROUP BY userid ORDER BY total DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: "ランキング取得失敗" });
    res.json(rows);
  });
});

module.exports = router;
