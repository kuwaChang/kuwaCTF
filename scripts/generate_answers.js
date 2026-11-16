// AIチューター（tutorService）に評価用の質問を投げ、回答を JSON と Markdown に保存する。
// 本番と同じプロンプト・知識ベース検索・後処理（finalizeAnswer）を通した回答が得られる。
//
// 使い方（プロジェクトルートで。Ollama と、必要なら Chroma を起動しておく）:
//   node scripts/generate_answers.js              # 全件（生成済みはスキップ・中断しても再開可）
//   node scripts/generate_answers.js 1 5          # qid 1〜5 だけ
//   node scripts/generate_answers.js 175 186      # 追加した質問だけ
//
// 環境変数:
//   EVAL_TAG   出力名（既定: elyza-r5）→ scripts/answers-<tag>.json / docs/eval-<tag>-answers.md
//   EVAL_RUNS  1問あたりの独立生成回数（既定: 3）
//   OLLAMA_MODEL 未指定なら tutorService の既定（ELYZA）
//
// questions.json の1件の形:
//   { "qid": 1, "category": "OSINT", "question": "..." }
//   { "qid": 179, "category": "Hint", "quizCategory": "Crypto", "quizId": "crypto2",
//     "turns": ["この問題のヒントください", "もう少し詳しく"] }   // 同じ会話で続けて質問

// サーバーと同じく .env の設定（OLLAMA_MODEL など）を使う
require("../src/config/env");

const fs = require("fs");
const path = require("path");

// 評価中の回答を本番の Q&A ログ（storage/tutor_qa_pending.jsonl）に混ぜない
require("../src/services/tutorQaLog").append = () => {};

const tutorService = require("../src/services/tutorService");

const RUNS_PER_Q = parseInt(process.env.EVAL_RUNS || "3", 10);
const EVAL_TAG = process.env.EVAL_TAG || "elyza-r5";
const QUESTIONS_PATH = path.join(__dirname, "questions.json");
const ANSWERS_PATH = path.join(__dirname, `answers-${EVAL_TAG}.json`);
const MD_PATH = path.join(__dirname, "..", "docs", `eval-${EVAL_TAG}-answers.md`);

const argStart = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const argEnd = process.argv[3] ? parseInt(process.argv[3], 10) : null;

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function turnsOf(q) {
  return Array.isArray(q.turns) && q.turns.length ? q.turns : [q.question];
}

function buildMarkdown(questions, resultsByQid, model) {
  const lines = [];
  lines.push(`# AIチューター回答（評価用） モデル: ${model}`);
  lines.push("");
  lines.push(`- 生成日時: ${new Date().toISOString()}`);
  lines.push(`- 各質問につき ${RUNS_PER_Q} 回の独立生成（回ごとに会話履歴をリセット）`);
  lines.push("");
  for (const q of questions) {
    const res = resultsByQid[q.qid];
    if (!res) continue;
    lines.push(`## 質問ID ${q.qid}（${q.category}）`);
    lines.push("");
    if (q.quizCategory) lines.push(`**問題コンテキスト:** ${q.quizCategory} / ${q.quizId}`);
    const turns = turnsOf(q);
    if (turns.length === 1) {
      lines.push(`**質問文:** ${turns[0]}`);
    } else {
      lines.push(`**会話（${turns.length}ターン）:** ${turns.map((t) => `「${t}」`).join(" → ")}`);
    }
    lines.push("");
    res.runs.forEach((run, i) => {
      lines.push(`### 回答回数 ${i + 1}`);
      lines.push("");
      run.turns.forEach((t, j) => {
        if (run.turns.length > 1) {
          lines.push(`**ターン${j + 1} 質問:** ${t.question}`);
          lines.push("");
        }
        lines.push(t.answer && t.answer.trim() ? t.answer : "（回答なし）");
        lines.push("");
        if (t.sources && t.sources.length) {
          lines.push(`**参照ソース:** ${t.sources.map((s) => `${s.source}(${s.relevance})`).join(", ")}`);
          lines.push("");
        }
      });
      lines.push("---");
      lines.push("");
    });
  }
  return lines.join("\n");
}

async function main() {
  const model = tutorService.getModelName();
  console.log(`使用モデル: ${model} / 出力タグ: ${EVAL_TAG} / 回数: ${RUNS_PER_Q}`);
  if (!tutorService.initialize()) {
    console.error("Ollama の初期化に失敗しました。中止します。");
    process.exit(1);
  }

  // 後処理（finalizeAnswer）で何が消えたか確かめられるよう、LLMの生の出力も記録する
  let lastRaw = "";
  const originalInvoke = tutorService.llm.invoke.bind(tutorService.llm);
  tutorService.llm.invoke = async (...args) => {
    const res = await originalInvoke(...args);
    lastRaw = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    return res;
  };

  // 知識ベースのインデックスが無ければ作る（本番ではチューター画面を開いたときに作られる）
  try {
    await require("../src/services/vectorStore").loadKnowledgeBase();
  } catch (e) {
    console.warn("知識ベースを読み込めませんでした（検索なしで続行）:", e.message);
  }

  const allQuestions = loadJson(QUESTIONS_PATH, []);
  let questions = allQuestions;
  if (argStart != null) {
    const end = argEnd != null ? argEnd : argStart;
    questions = questions.filter((q) => q.qid >= argStart && q.qid <= end);
  }

  const existing = loadJson(ANSWERS_PATH, { model, results: [] });
  const resultsByQid = {};
  for (const r of existing.results || []) resultsByQid[r.qid] = r;

  let done = 0;
  const startedAt = Date.now();
  for (const q of questions) {
    if (resultsByQid[q.qid] && resultsByQid[q.qid].runs.length >= RUNS_PER_Q) {
      console.log(`skip qid=${q.qid}（生成済み）`);
      continue;
    }
    const runs = [];
    for (let i = 0; i < RUNS_PER_Q; i++) {
      const uid = `eval_${EVAL_TAG}_q${q.qid}_r${i + 1}`;
      tutorService.clearHistory(uid);
      const turns = [];
      for (const text of turnsOf(q)) {
        const t0 = Date.now();
        let out;
        lastRaw = "";
        try {
          out = await tutorService.answerQuestion(uid, text, q.quizCategory || null, q.quizId || null);
        } catch (e) {
          out = { answer: "", sources: [], error: e.message };
        }
        const sec = (Date.now() - t0) / 1000;
        turns.push({
          question: text,
          answer: out.answer || "",
          raw: lastRaw,
          sources: out.sources || [],
          error: out.error,
          seconds: Math.round(sec * 10) / 10
        });
        console.log(`qid=${q.qid} run=${i + 1} turn=${turns.length} ${sec.toFixed(1)}s len=${(out.answer || "").length}`);
      }
      tutorService.clearHistory(uid);
      runs.push({ answer: turns[turns.length - 1].answer, turns });
    }
    resultsByQid[q.qid] = { qid: q.qid, category: q.category, question: turnsOf(q).join(" → "), runs };

    const merged = {
      model,
      tag: EVAL_TAG,
      updatedAt: new Date().toISOString(),
      results: Object.values(resultsByQid).sort((a, b) => a.qid - b.qid)
    };
    fs.writeFileSync(ANSWERS_PATH, JSON.stringify(merged, null, 2), "utf8");
    fs.writeFileSync(MD_PATH, buildMarkdown(allQuestions, resultsByQid, model), "utf8");
    done++;
  }

  const min = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`完了: ${done} 問を新規生成（${min} 分）。\nJSON=${ANSWERS_PATH}\nMD=${MD_PATH}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("致命的エラー:", e);
  process.exit(1);
});
