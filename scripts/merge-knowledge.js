/**
 * content/drafts と content/knowledge を合併するスクリプト
 * 実行: node scripts/merge-knowledge.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DRAFTS = path.join(ROOT, "content", "drafts");
const KNOWLEDGE = path.join(ROOT, "content", "knowledge");

function read(filePath) {
  return fs.readFileSync(filePath, "utf-8").trimEnd();
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content.trimEnd() + "\n", "utf-8");
}

function appendSection(base, sectionTitle, addition) {
  if (!addition) return base;
  return `${base}\n\n---\n\n${sectionTitle}\n\n${addition}`;
}

// knowledge 既存ファイルへ drafts の補足を追記
const appendMap = [
  { draft: "00_common_response_policy.md", target: "meta.md", title: "## AI先生 共通回答ポリシー" },
  { draft: "01_forensics.md", target: "forensics.md", title: "## Forensics チューター補足" },
  { draft: "03_crypto.md", target: "crypto.md", title: "## Crypto チューター補足" },
  { draft: "04_web.md", target: "web.md", title: "## Web チューター補足" },
  { draft: "05_osint.md", target: "osint.md", title: "## OSINT チューター補足" },
];

// drafts をそのまま knowledge に新規作成
const copyMap = [
  { draft: "02_steganography.md", target: "steganography.md" },
  { draft: "06_reversing_pwn.md", target: "reversing_pwn.md" },
  { draft: "07_tools_and_commands.md", target: "tools_and_commands.md" },
  { draft: "08_learning_sites_and_terms.md", target: "learning_sites_and_terms.md" },
  { draft: "ctf_crypto_index.md", target: "crypto_index.md" },
  { draft: "crypto_qa_index.md", target: "crypto_qa.md" },
  { draft: "ctf_forensics_index.md", target: "forensics_index.md" },
  { draft: "forensics_qa_index.md", target: "forensics_qa.md" },
  { draft: "ctf_web_index.md", target: "web_index.md" },
  { draft: "web_qa_index.md", target: "web_qa.md" },
  { draft: "ctf_osint_index.md", target: "osint_index.md" },
  { draft: "osint_qa_index.md", target: "osint_qa.md" },
];

// 問題別: drafts のメタ情報を knowledge に追記（解法手順は含めない）
const problemMap = [
  { draft: "Easy1.md", target: "easy1.md" },
  { draft: "Easy2.md", target: "easy2.md" },
  { draft: "Medium1.md", target: "medium1.md" },
  { draft: "Medium2.md", target: "medium2.md" },
  { draft: "Hard1.md", target: "hard1.md" },
  { draft: "Hard2.md", target: "hard2.md" },
];

function extractProblemMeta(draftContent) {
  const blocks = draftContent.split(/\n(?=## )/);
  const sections = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;
    const heading = lines[0].replace(/^##\s*/, "").trim();
    if (!heading || heading === lines[0].replace(/^#\s*/, "").trim() && block.startsWith("# ")) continue;

    const titleMatch = block.match(/- タイトル[：:](.+)/);
    const categoryMatch = block.match(/- カテゴリー[：:](.+)/);
    const descMatch = block.match(/- 説明文[：:]([\s\S]*?)(?=\n\*\*解く手順\*\*|\n## |$)/);

    if (titleMatch || categoryMatch || descMatch) {
      let section = `### ${heading}`;
      if (titleMatch) section += `\n- タイトル: ${titleMatch[1].trim()}`;
      if (categoryMatch) section += `\n- カテゴリー: ${categoryMatch[1].trim()}`;
      if (descMatch) {
        const desc = descMatch[1].replace(/\\n/g, "\n").trim();
        section += `\n- 説明文: ${desc}`;
      }
      sections.push(section);
    }
  }

  return sections.join("\n\n");
}

function mergeAppends() {
  for (const { draft, target, title } of appendMap) {
    const targetPath = path.join(KNOWLEDGE, target);
    const draftPath = path.join(DRAFTS, draft);
    if (!fs.existsSync(draftPath)) {
      console.warn(`skip (draft missing): ${draft}`);
      continue;
    }
    const base = fs.existsSync(targetPath) ? read(targetPath) : "";
    const addition = read(draftPath);
    // 00_common は draft 側の H1 を除いて追記
    const cleaned = draft === "00_common_response_policy.md"
      ? addition.replace(/^# .+\n/, "")
      : addition.replace(/^# .+\n/, "");
    write(targetPath, appendSection(base, title, cleaned));
    console.log(`appended: ${draft} -> ${target}`);
  }
}

function mergeCopies() {
  for (const { draft, target } of copyMap) {
    const draftPath = path.join(DRAFTS, draft);
    if (!fs.existsSync(draftPath)) {
      console.warn(`skip (draft missing): ${draft}`);
      continue;
    }
    write(path.join(KNOWLEDGE, target), read(draftPath));
    console.log(`copied: ${draft} -> ${target}`);
  }
}

function mergeProblems() {
  for (const { draft, target } of problemMap) {
    const targetPath = path.join(KNOWLEDGE, target);
    const draftPath = path.join(DRAFTS, draft);
    if (!fs.existsSync(draftPath) || !fs.existsSync(targetPath)) {
      console.warn(`skip (missing): ${draft} / ${target}`);
      continue;
    }
    const base = read(targetPath);
    const meta = extractProblemMeta(read(draftPath));
    if (meta) {
      write(targetPath, appendSection(base, "## 問題メタ情報（補足）", meta));
      console.log(`enriched: ${draft} -> ${target}`);
    }
  }
}

function removeDrafts() {
  const files = fs.readdirSync(DRAFTS).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    fs.unlinkSync(path.join(DRAFTS, file));
    console.log(`deleted: drafts/${file}`);
  }
}

mergeAppends();
mergeCopies();
mergeProblems();
removeDrafts();

const count = fs.readdirSync(KNOWLEDGE).filter((f) => f.endsWith(".md")).length;
console.log(`\nDone. knowledge/ now has ${count} markdown files.`);
