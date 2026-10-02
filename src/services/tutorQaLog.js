const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");

const PENDING_PATH = path.join(paths.STORAGE, "tutor_qa_pending.jsonl");
const DOCS_DIR = paths.DOCS;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * チューターへの質問・回答を追記（rebuild 時に docs へまとめて書き出す）。
 * entry に model（例: Ollama のモデル名）が含まれる場合はそのまま保存される。
 */
function append(entry) {
  try {
    ensureDir(path.dirname(PENDING_PATH));
    const line =
      JSON.stringify({
        ...entry,
        recordedAt: new Date().toISOString()
      }) + "\n";
    fs.appendFileSync(PENDING_PATH, line, "utf8");
  } catch (e) {
    console.error("❌ tutor Q&A ログ追記エラー:", e.message);
  }
}

/**
 * 未書き出しの Q&A を docs に1ファイル出力し、pending を空にする。
 * @returns {{ filename: string, count: number } | null}
 */
function flushPendingToDocs() {
  try {
    ensureDir(DOCS_DIR);
    if (!fs.existsSync(PENDING_PATH) || fs.statSync(PENDING_PATH).size === 0) {
      return null;
    }
    const raw = fs.readFileSync(PENDING_PATH, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    const entries = lines.map((l) => JSON.parse(l));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tutor-qa-${stamp}.json`;
    const outPath = path.join(DOCS_DIR, filename);

    const payload = {
      exportedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    fs.unlinkSync(PENDING_PATH);
    console.log(`📝 チューターQ&Aを書き出しました: ${outPath} (${entries.length}件)`);
    return { filename, count: entries.length };
  } catch (e) {
    console.error("❌ tutor Q&A フラッシュエラー:", e.message);
    throw e;
  }
}

/**
 * 指定ユーザーの質問ログを未書き出し分と docs の書き出し済みファイルから除く。
 */
function removeByUserid(userid) {
  let pendingRemoved = 0;
  let docsUpdated = 0;

  if (fs.existsSync(PENDING_PATH)) {
    const raw = fs.readFileSync(PENDING_PATH, "utf8");
    const kept = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.userid === userid) {
          pendingRemoved += 1;
          continue;
        }
      } catch {
        // 壊れた行は残す
      }
      kept.push(line);
    }
    if (pendingRemoved > 0) {
      if (kept.length === 0) {
        fs.unlinkSync(PENDING_PATH);
      } else {
        fs.writeFileSync(PENDING_PATH, kept.join("\n") + "\n", "utf8");
      }
    }
  }

  if (fs.existsSync(DOCS_DIR)) {
    for (const name of fs.readdirSync(DOCS_DIR)) {
      if (!/^tutor-qa-.+\.json$/.test(name)) continue;
      const filePath = path.join(DOCS_DIR, name);
      let payload;
      try {
        payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (e) {
        console.error("❌ tutor Q&A ファイルの読み込みエラー:", filePath, e.message);
        continue;
      }
      if (!payload || !Array.isArray(payload.entries)) continue;
      const before = payload.entries.length;
      payload.entries = payload.entries.filter((entry) => entry.userid !== userid);
      if (payload.entries.length === before) continue;
      docsUpdated += 1;
      if (payload.entries.length === 0) {
        fs.unlinkSync(filePath);
      } else {
        payload.entryCount = payload.entries.length;
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
      }
    }
  }

  return { pendingRemoved, docsUpdated };
}

module.exports = { append, flushPendingToDocs, removeByUserid };
