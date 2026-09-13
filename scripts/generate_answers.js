// llama3.2 で各質問×3回の回答を生成し、逐次 JSON と Markdown に保存する。
// 使い方:
//   node scripts/generate_answers.js            # 全件（未完了のみ・再開可能）
//   node scripts/generate_answers.js 1 5        # qid 1..5 だけ（テスト用）
// 環境変数: OLLAMA_MODEL 未指定なら llama3.2（tutorService の既定）

const fs = require("fs");
const path = require("path");

const tutorService = require("../src/services/tutorService");

const RUNS_PER_Q = 3;
// EVAL_TAG で出力先を切替（未指定は従来どおり llama3.2）
const EVAL_TAG = process.env.EVAL_TAG || null;
const QUESTIONS_PATH = path.join(__dirname, "questions.json");
const ANSWERS_PATH = path.join(
  __dirname,
  EVAL_TAG ? `answers-${EVAL_TAG}.json` : "answers.json"
);
const MD_PATH = path.join(
  __dirname,
  "..",
  "docs",
  `eval-${EVAL_TAG || "llama3.2"}-answers.md`
);

const argStart = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const argEnd = process.argv[3] ? parseInt(process.argv[3], 10) : null;

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildMarkdown(questions, resultsByQid, model) {
  const lines = [];
  lines.push(`# AIチューター回答（人間評価用） モデル: ${model}`);
  lines.push("");
  lines.push(`- 生成日時: ${new Date().toISOString()}`);
  lines.push(`- 各質問につき ${RUNS_PER_Q} 回の独立生成（会話履歴はリセット）`);
  lines.push("- 評価者（人間）は、同じ質問ID・回答回数の生成AI採点と同一の回答を評価してください。");
  lines.push("");
  for (const q of questions) {
    const res = resultsByQid[q.qid];
    if (!res) continue;
    lines.push(`## 質問ID ${q.qid}（${q.category}）`);
    lines.push("");
    lines.push(`**質問文:** ${q.question}`);
    lines.push("");
    for (let i = 0; i < res.runs.length; i++) {
      const run = res.runs[i];
      lines.push(`### 回答回数 ${i + 1}`);
      lines.push("");
      lines.push(run.answer && run.answer.trim() ? run.answer : "（回答なし）");
      lines.push("");
      if (run.sources && run.sources.length) {
        const src = run.sources
          .map((s) => `${s.source}(${s.relevance})`)
          .join(", ");
        lines.push(`**参照ソース:** ${src}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const model = tutorService.getModelName();
  console.log(`使用モデル: ${model}`);
  if (!tutorService.initialize()) {
    console.error("Ollama 初期化に失敗しました。中止します。");
    process.exit(1);
  }

  let questions = loadJson(QUESTIONS_PATH, []);
  if (argStart != null) {
    const end = argEnd != null ? argEnd : argStart;
    questions = questions.filter((q) => q.qid >= argStart && q.qid <= end);
  }

  // 既存結果（再開）
  const existing = loadJson(ANSWERS_PATH, { model, results: [] });
  const resultsByQid = {};
  for (const r of existing.results || []) resultsByQid[r.qid] = r;

  const allQuestions = loadJson(QUESTIONS_PATH, []);

  let done = 0;
  for (const q of questions) {
    if (resultsByQid[q.qid] && resultsByQid[q.qid].runs.length >= RUNS_PER_Q) {
      console.log(`skip qid=${q.qid}（生成済み）`);
      continue;
    }
    const runs = [];
    for (let i = 0; i < RUNS_PER_Q; i++) {
      const uid = `eval_q${q.qid}_r${i + 1}`;
      tutorService.clearHistory(uid);
      const t0 = Date.now();
      let out;
      try {
        out = await tutorService.answerQuestion(uid, q.question, null, null);
      } catch (e) {
        out = { answer: "", sources: [], error: e.message };
      }
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      runs.push({ answer: out.answer || "", sources: out.sources || [], error: out.error });
      console.log(`qid=${q.qid} run=${i + 1} ${dt}s len=${(out.answer || "").length}`);
    }
    resultsByQid[q.qid] = { qid: q.qid, category: q.category, question: q.question, runs };

    // 逐次保存（JSON）
    const merged = {
      model,
      updatedAt: new Date().toISOString(),
      results: Object.values(resultsByQid).sort((a, b) => a.qid - b.qid)
    };
    fs.writeFileSync(ANSWERS_PATH, JSON.stringify(merged, null, 2), "utf8");
    // Markdown（都度上書き）
    fs.writeFileSync(MD_PATH, buildMarkdown(allQuestions, resultsByQid, model), "utf8");
    done++;
  }

  console.log(`完了: ${done} 問を新規生成。JSON=${ANSWERS_PATH} MD=${MD_PATH}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("致命的エラー:", e);
  process.exit(1);
});
