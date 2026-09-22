/**
 * 問題の公開・非公開判定。
 * published が未設定の既存データは公開として扱う。
 */
function isQuestionPublished(question) {
  if (!question || typeof question !== "object") return false;
  return question.published !== false && question.published !== "false";
}

function parsePublished(value) {
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return true;
}

function filterPublishedQuizData(data) {
  const filtered = {};
  for (const [category, questions] of Object.entries(data || {})) {
    if (!questions || typeof questions !== "object" || Array.isArray(questions)) {
      continue;
    }
    const visible = {};
    for (const [qid, question] of Object.entries(questions)) {
      if (isQuestionPublished(question)) {
        visible[qid] = question;
      }
    }
    if (Object.keys(visible).length > 0) {
      filtered[category] = visible;
    }
  }
  return filtered;
}

module.exports = {
  isQuestionPublished,
  parsePublished,
  filterPublishedQuizData
};
