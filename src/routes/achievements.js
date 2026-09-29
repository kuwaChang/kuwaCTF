const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const router = express.Router();
const paths = require("../config/paths");

// storageフォルダが存在しない場合は作成
const dbDir = paths.STORAGE;
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(paths.STORAGE, "users.db");
const achievementsPath = path.join(paths.CONFIG, "achievements.json");

// データベース接続
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error("❌ データベース接続エラー (achievements.js):", err.message);
  }
});

function requireLogin(req, res, next) {
  if (!req.session.userid) return res.status(401).json({ message: "ログインが必要です" });
  next();
}

// 実績定義を読み込む
function loadAchievements() {
  try {
    const data = fs.readFileSync(achievementsPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("実績定義読み込みエラー:", err);
    return {};
  }
}

// Promise化されたデータベースクエリ
function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// 日本時間(JST, UTC+9)の日付文字列(YYYY-MM-DD)を返す（サーバーのタイムゾーンに依存しない）
function getJstDateString(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split("T")[0];
}

// 指定時間幅(ミリ秒)のウィンドウ内で新規正解した最大問題数を返す（スピード系実績用）
async function getMaxSolvesInWindow(userid, timeLimitMs) {
  try {
    const rows = await dbAll(
      "SELECT created_at FROM answer_attempts WHERE userid = ? AND is_new_solve = 1 ORDER BY created_at ASC",
      [userid]
    );
    const times = rows
      .map((r) => new Date(r.created_at).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);
    let maxCount = 0;
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      while (times[end] - times[start] > timeLimitMs) start++;
      const count = end - start + 1;
      if (count > maxCount) maxCount = count;
    }
    return maxCount;
  } catch (err) {
    return 0;
  }
}

// "YYYY-MM-DD" を比較用の通日（整数）に変換する
function dayNumberFromDateString(ds) {
  if (!ds) return NaN;
  const [y, m, d] = String(ds).split("T")[0].split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// ログイン日付配列(YYYY-MM-DD)から、JSTの今日を起点とした連続ログイン日数を計算する
function calcLoginStreak(dateStrings) {
  if (!dateStrings || dateStrings.length === 0) return 0;
  const todayNum = dayNumberFromDateString(getJstDateString());
  // 重複を除いて降順ソート
  const days = [...new Set(dateStrings.map(dayNumberFromDateString))]
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a);
  if (days.length === 0) return 0;
  // 今日ログインしていなければ連続記録は0（既存仕様を踏襲）
  if (days[0] !== todayNum) return 0;
  let streak = 1;
  let expected = todayNum - 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === expected) {
      streak++;
      expected--;
    } else if (days[i] < expected) {
      break;
    }
  }
  return streak;
}

// 連続正解数（最大連勝記録）を計算する
// 新規正解を「勝ち」、不正解を「連勝リセット」とみなす。解答済み問題への再送信は無視する
async function getMaxConsecutiveCorrect(userid) {
  try {
    const rows = await dbAll(
      "SELECT correct, is_new_solve FROM answer_attempts WHERE userid = ? ORDER BY id ASC",
      [userid]
    );
    let streak = 0;
    let maxStreak = 0;
    for (const row of rows) {
      if (row.correct === 1 && row.is_new_solve === 1) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else if (row.correct === 0) {
        streak = 0;
      }
      // 解答済みへの再送信(correct=1, is_new_solve=0)は連勝に影響させない
    }
    return maxStreak;
  } catch (err) {
    return 0;
  }
}

// 今日新規に正解した「異なる問題」数（UTC基準）
async function getDailySolveCount(userid) {
  try {
    const row = await dbGet(
      "SELECT COUNT(DISTINCT category || '|' || qid) as count FROM answer_attempts WHERE userid = ? AND is_new_solve = 1 AND date(created_at, '+9 hours') = date('now', '+9 hours')",
      [userid]
    );
    return row ? row.count : 0;
  } catch (err) {
    return 0;
  }
}

// 今日挑戦した「異なる問題」数（正解・不正解を問わない／UTC基準）
async function getDailyAttemptCount(userid) {
  try {
    const row = await dbGet(
      "SELECT COUNT(DISTINCT category || '|' || qid) as count FROM answer_attempts WHERE userid = ? AND date(created_at, '+9 hours') = date('now', '+9 hours')",
      [userid]
    );
    return row ? row.count : 0;
  } catch (err) {
    return 0;
  }
}

// 「1発正解（ノーミス）」した問題があるか（=各問題の最初の解答が正解）。1以上で達成
async function getFirstTrySolveCount(userid) {
  try {
    const row = await dbGet(
      `SELECT COUNT(*) as count FROM answer_attempts a
       JOIN (SELECT category, qid, MIN(id) AS minid FROM answer_attempts WHERE userid = ? GROUP BY category, qid) g
         ON a.id = g.minid
       WHERE a.correct = 1`,
      [userid]
    );
    return row ? row.count : 0;
  } catch (err) {
    return 0;
  }
}

// 実績の進捗を更新
async function updateAchievementProgress(userid, achievementId, progress, maxProgress) {
  try {
    const row = await dbGet(
      "SELECT * FROM user_achievements WHERE userid = ? AND achievement_id = ?",
      [userid, achievementId]
    );

    const now = new Date().toISOString();
    if (row) {
      // 既に存在する場合は進捗を更新
      const newProgress = Math.max(row.progress, progress);
      if (newProgress >= maxProgress && !row.unlocked_at) {
        // 実績解除
        await dbRun(
          "UPDATE user_achievements SET progress = ?, max_progress = ?, unlocked_at = ? WHERE userid = ? AND achievement_id = ?",
          [newProgress, maxProgress, now, userid, achievementId]
        );
        return { unlocked: true, achievementId };
      } else {
        // 進捗のみ更新
        await dbRun(
          "UPDATE user_achievements SET progress = ?, max_progress = ? WHERE userid = ? AND achievement_id = ?",
          [newProgress, maxProgress, userid, achievementId]
        );
        return { unlocked: false, achievementId, progress: newProgress, maxProgress };
      }
    } else {
      // 新規作成
      if (progress >= maxProgress) {
        // すぐに解除
        await dbRun(
          "INSERT INTO user_achievements (userid, achievement_id, progress, max_progress, unlocked_at) VALUES (?, ?, ?, ?, ?)",
          [userid, achievementId, progress, maxProgress, now]
        );
        return { unlocked: true, achievementId };
      } else {
        // 進捗のみ記録
        await dbRun(
          "INSERT INTO user_achievements (userid, achievement_id, progress, max_progress) VALUES (?, ?, ?, ?)",
          [userid, achievementId, progress, maxProgress]
        );
        return { unlocked: false, achievementId, progress, maxProgress };
      }
    }
  } catch (err) {
    console.error(`実績進捗更新エラー (${achievementId}):`, err);
    throw err;
  }
}

// 実績チェック関数（外部から呼び出し可能）
async function checkAchievements(userid, eventType, eventData) {
  const achievements = loadAchievements();
  const unlockedAchievements = [];

  for (const [achievementId, achievement] of Object.entries(achievements)) {
    if (achievement.type !== eventType) continue;

    try {
      let progress = 0;
      let maxProgress = 1;

      switch (achievement.type) {
        case "solve_count":
          // 解いた問題数のカウント
          if (eventData.solved) {
            const row = await dbGet(
              "SELECT COUNT(*) as count FROM solved WHERE userid = ?",
              [userid]
            );
            if (row) {
              progress = row.count;
              maxProgress = achievement.condition.count;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            }
          }
          break;

        case "category_solve":
          // カテゴリー別の問題数（categoryIdでカウント）
          if (eventData.solved && eventData.category === achievement.condition.category) {
            // 問題データを読み込んで、categoryIdが一致する問題を探す
            const quizData = JSON.parse(fs.readFileSync(path.join(paths.CONFIG, "quizData.json"), "utf-8"));
            const targetCategoryId = achievement.condition.category;
            
            // 解いた問題リストを取得
            const solvedRows = await dbAll(
              "SELECT category, qid FROM solved WHERE userid = ?",
              [userid]
            );
            
            // categoryIdが一致する問題をカウント
            let count = 0;
            for (const solvedRow of solvedRows) {
              const question = quizData[solvedRow.category]?.[solvedRow.qid];
              if (question && question.categoryId === targetCategoryId) {
                count++;
              }
            }
            
            progress = count;
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "score":
          // スコア達成
          const scoreRow = await dbGet(
            "SELECT score FROM users WHERE userid = ?",
            [userid]
          );
          if (scoreRow && scoreRow.score >= achievement.condition.score) {
            progress = achievement.condition.score;
            maxProgress = achievement.condition.score;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "all_categories":
          // 全カテゴリー制覇
          if (eventData.solved) {
            const rows = await dbAll(
              "SELECT DISTINCT category FROM solved WHERE userid = ?",
              [userid]
            );
            const solvedCategories = rows.map(r => r.category);
            const requiredCategories = achievement.condition.categories;
            const allSolved = requiredCategories.every(cat => solvedCategories.includes(cat));
            
            if (allSolved) {
              progress = requiredCategories.length;
              maxProgress = requiredCategories.length;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            }
          }
          break;

        case "login_streak":
          // 連続ログイン日数（日本時間基準）
          if (eventData.logged_in) {
            try {
              const loginRows = await dbAll(
                "SELECT login_date FROM login_logs WHERE userid = ? ORDER BY login_date DESC",
                [userid]
              );
              progress = calcLoginStreak(loginRows.map((r) => r.login_date));
              maxProgress = achievement.condition.days;
              const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
              if (result.unlocked) {
                unlockedAchievements.push(achievement);
              }
            } catch (err) {
              // テーブルが存在しない場合はスキップ
              console.error(`ログイン履歴取得エラー (${achievementId}):`, err);
            }
          }
          break;

        case "study_time":
          // 累計学習時間
          if (eventData.study_time_updated) {
            try {
              const studyRows = await dbAll(
                "SELECT SUM(duration_ms) as total_ms FROM study_sessions WHERE userid = ?",
                [userid]
              );
              
              if (studyRows && studyRows[0] && studyRows[0].total_ms) {
                const totalHours = studyRows[0].total_ms / (1000 * 60 * 60); // ミリ秒を時間に変換
                progress = totalHours;
                maxProgress = achievement.condition.hours;
                const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
                if (result.unlocked) {
                  unlockedAchievements.push(achievement);
                }
              }
            } catch (err) {
              console.error(`学習時間取得エラー (${achievementId}):`, err);
            }
          }
          break;

        case "no_hint_solve":
          // ヒントを使わずに解いた問題数
          if (eventData.solved && !eventData.used_hint) {
            try {
              // solvedテーブルにused_hintカラムがある場合
              const noHintRows = await dbAll(
                `SELECT COUNT(*) as count FROM solved s
                 WHERE s.userid = ? AND (s.used_hint = 0 OR s.used_hint IS NULL)
                 AND NOT EXISTS (
                   SELECT 1 FROM hint_opened h
                   WHERE h.userid = s.userid AND h.category = s.category AND h.qid = s.qid
                 )`,
                [userid]
              );
              
              if (noHintRows && noHintRows[0]) {
                progress = noHintRows[0].count;
                maxProgress = achievement.condition.count;
                const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
                if (result.unlocked) {
                  unlockedAchievements.push(achievement);
                }
              }
            } catch (err) {
              // カラムが存在しない場合は、全ての解答をカウント（後方互換性）
              console.error(`ヒントなし解答カウントエラー (${achievementId}):`, err);
            }
          }
          break;

        case "rpg_cheat":
          // RPGの改ざん検知（1回で解除）
          if (eventData.cheat_detected) {
            progress = 1;
            maxProgress = achievement.condition?.count || 1;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "open_modal":
          // 初めて問題モーダルを開いた（1回で解除）
          if (eventData.opened) {
            progress = 1;
            maxProgress = achievement.condition?.count || 1;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "consecutive_correct":
          // 連続正解（最大連勝記録で判定）
          if (eventData.solved) {
            progress = await getMaxConsecutiveCorrect(userid);
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "daily_solve":
          // 1日の正解数（異なる問題）
          if (eventData.solved) {
            progress = await getDailySolveCount(userid);
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "daily_attempt":
          // 1日の挑戦数（異なる問題）
          if (eventData.attempted) {
            progress = await getDailyAttemptCount(userid);
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "no_miss":
          // ノーミス（1発正解）した問題があれば解除
          if (eventData.solved) {
            progress = (await getFirstTrySolveCount(userid)) > 0 ? 1 : 0;
            maxProgress = achievement.condition?.count || 1;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;

        case "speed_solve":
          // 制限時間内に指定問題数を解く
          if (eventData.solved) {
            const timeLimit = achievement.condition.time_limit || 3600000;
            progress = await getMaxSolvesInWindow(userid, timeLimit);
            maxProgress = achievement.condition.count;
            const result = await updateAchievementProgress(userid, achievementId, progress, maxProgress);
            if (result.unlocked) {
              unlockedAchievements.push(achievement);
            }
          }
          break;
      }
    } catch (err) {
      console.error(`実績チェックエラー (${achievementId}):`, err);
    }
  }

  return unlockedAchievements;
}

// ユーザーの実績一覧を取得
router.get("/list", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const achievements = loadAchievements();
  
  try {
    const rows = await dbAll(
      "SELECT achievement_id, progress, max_progress, unlocked_at FROM user_achievements WHERE userid = ?",
      [userid]
    );

    const userAchievements = {};
    rows.forEach(row => {
      userAchievements[row.achievement_id] = {
        progress: row.progress,
        maxProgress: row.max_progress,
        unlocked: !!row.unlocked_at,
        unlockedAt: row.unlocked_at
      };
    });

    // 問題データを読み込む（進捗再計算用）
    const quizData = JSON.parse(fs.readFileSync(path.join(paths.CONFIG, "quizData.json"), "utf-8"));
    
    // 解いた問題リストを取得
    const solvedRows = await dbAll(
      "SELECT category, qid FROM solved WHERE userid = ?",
      [userid]
    );
    
    // スコアを取得
    const scoreRow = await dbGet("SELECT score FROM users WHERE userid = ?", [userid]);
    const currentScore = scoreRow ? scoreRow.score : 0;

    // 全実績を返す（進捗情報を含む）
    const result = {};
    for (const [id, achievement] of Object.entries(achievements)) {
      let progress = 0;
      let maxProgress = 1;
      let unlocked = false;
      let unlockedAt = null;
      
      // データベースから既存の進捗を取得
      if (userAchievements[id]) {
        progress = userAchievements[id].progress;
        maxProgress = userAchievements[id].maxProgress;
        unlocked = userAchievements[id].unlocked;
        unlockedAt = userAchievements[id].unlockedAt;
      }
      
      // 実績タイプに応じて進捗を再計算
      switch (achievement.type) {
        case "solve_count":
          progress = solvedRows.length;
          maxProgress = achievement.condition.count;
          break;
          
        case "category_solve":
          // categoryIdが一致する問題をカウント
          const targetCategoryId = achievement.condition.category;
          let categoryCount = 0;
          for (const solvedRow of solvedRows) {
            const question = quizData[solvedRow.category]?.[solvedRow.qid];
            if (question && question.categoryId === targetCategoryId) {
              categoryCount++;
            }
          }
          progress = categoryCount;
          maxProgress = achievement.condition.count;
          break;
          
        case "score":
          progress = Math.min(currentScore, achievement.condition.score);
          maxProgress = achievement.condition.score;
          break;
          
        case "all_categories":
          const solvedCategoryIds = new Set();
          for (const solvedRow of solvedRows) {
            const question = quizData[solvedRow.category]?.[solvedRow.qid];
            if (question && question.categoryId) {
              solvedCategoryIds.add(question.categoryId);
            }
          }
          const requiredCategories = achievement.condition.categories;
          const solvedCount = requiredCategories.filter(cat => solvedCategoryIds.has(cat)).length;
          progress = solvedCount;
          maxProgress = requiredCategories.length;
          break;

        case "login_streak":
          // 連続ログイン日数の計算（日本時間基準）
          try {
            const loginRows = await dbAll(
              "SELECT login_date FROM login_logs WHERE userid = ? ORDER BY login_date DESC",
              [userid]
            );
            progress = calcLoginStreak(loginRows.map((r) => r.login_date));
            maxProgress = achievement.condition.days;
          } catch (err) {
            // テーブルが存在しない場合は進捗0のまま
            console.error(`ログイン履歴取得エラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.days;
          }
          break;

        case "study_time":
          // 累計学習時間の計算
          try {
            const studyRows = await dbAll(
              "SELECT SUM(duration_ms) as total_ms FROM study_sessions WHERE userid = ?",
              [userid]
            );
            
            if (studyRows && studyRows[0] && studyRows[0].total_ms) {
              const totalHours = studyRows[0].total_ms / (1000 * 60 * 60); // ミリ秒を時間に変換
              progress = totalHours;
            } else {
              progress = 0;
            }
            maxProgress = achievement.condition.hours;
          } catch (err) {
            console.error(`学習時間取得エラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.hours;
          }
          break;

        case "no_hint_solve":
          // ヒントを使わずに解いた問題数の計算
          try {
            const noHintRows = await dbAll(
              `SELECT COUNT(*) as count FROM solved s
               WHERE s.userid = ? AND (s.used_hint = 0 OR s.used_hint IS NULL)
               AND NOT EXISTS (
                 SELECT 1 FROM hint_opened h
                 WHERE h.userid = s.userid AND h.category = s.category AND h.qid = s.qid
               )`,
              [userid]
            );
            
            if (noHintRows && noHintRows[0]) {
              progress = noHintRows[0].count;
            } else {
              progress = 0;
            }
            maxProgress = achievement.condition.count;
          } catch (err) {
            // カラムが存在しない場合は、全ての解答をカウント（後方互換性）
            console.error(`ヒントなし解答カウントエラー (進捗計算):`, err);
            progress = 0;
            maxProgress = achievement.condition.count;
          }
          break;

        case "rpg_cheat":
          progress = userAchievements[id]?.progress || 0;
          maxProgress = achievement.condition?.count || 1;
          break;

        case "open_modal":
          progress = userAchievements[id]?.progress || 0;
          maxProgress = achievement.condition?.count || 1;
          break;

        case "consecutive_correct":
          progress = await getMaxConsecutiveCorrect(userid);
          maxProgress = achievement.condition.count;
          break;

        case "daily_solve":
          progress = await getDailySolveCount(userid);
          maxProgress = achievement.condition.count;
          break;

        case "daily_attempt":
          progress = await getDailyAttemptCount(userid);
          maxProgress = achievement.condition.count;
          break;

        case "no_miss":
          progress = (await getFirstTrySolveCount(userid)) > 0 ? 1 : 0;
          maxProgress = achievement.condition?.count || 1;
          break;

        case "speed_solve":
          progress = await getMaxSolvesInWindow(userid, achievement.condition.time_limit || 3600000);
          maxProgress = achievement.condition.count;
          break;
      }
      
      // 解除状態を更新
      if (progress >= maxProgress && !unlocked) {
        unlocked = true;
        unlockedAt = new Date().toISOString();
        // データベースも更新
        await updateAchievementProgress(userid, id, progress, maxProgress);
      } else if (progress < maxProgress && unlocked) {
        // 解除済みのまま（一度解除されたら解除状態を維持）
      } else {
        // 進捗を更新（解除されていない場合でも）
        await updateAchievementProgress(userid, id, progress, maxProgress);
      }
      
      result[id] = {
        ...achievement,
        progress: progress,
        maxProgress: maxProgress,
        unlocked: unlocked,
        unlockedAt: unlockedAt
      };
    }

    res.json(result);
  } catch (err) {
    console.error("実績取得エラー:", err);
    res.status(500).json({ message: "エラーが発生しました" });
  }
});

// 実績定義を取得（管理者用）
router.get("/definitions", requireLogin, (req, res) => {
  const achievements = loadAchievements();
  res.json(achievements);
});

// 実績チェックを手動実行（デバッグ用）
router.post("/check", requireLogin, async (req, res) => {
  const userid = req.session.userid;
  const { eventType, eventData } = req.body;
  
  try {
    const unlocked = await checkAchievements(userid, eventType, eventData);
    res.json({ unlocked: unlocked.map(a => a.id) });
  } catch (err) {
    console.error("実績チェックエラー:", err);
    res.status(500).json({ message: "エラーが発生しました" });
  }
});

// 外部から呼び出し可能にする
module.exports = { router, checkAchievements };
