/**
 * カテゴリ別ナレッジ（.md + _index.md + _qa.md）を1ファイルに統合
 * 実行: node scripts/consolidate-category-knowledge.js
 */
const fs = require("fs");
const path = require("path");

const KNOWLEDGE = path.join(__dirname, "..", "content", "knowledge");

function read(name) {
  return fs.readFileSync(path.join(KNOWLEDGE, name), "utf-8").trimEnd();
}

function write(name, content) {
  fs.writeFileSync(path.join(KNOWLEDGE, name), content.trimEnd() + "\n", "utf-8");
}

function remove(name) {
  const p = path.join(KNOWLEDGE, name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function retitleIndex(content, newTitle) {
  return content.replace(/^# .+\n/, `${newTitle}\n`);
}

function extractTutorSupplement(content, marker) {
  const idx = content.indexOf(marker);
  if (idx === -1) return "";
  return content.slice(idx + marker.length).trim();
}

function extractSectionsBeforeMarker(content, marker) {
  const idx = content.indexOf(marker);
  const body = idx === -1 ? content : content.slice(0, idx);
  const parts = body.split(/\n(?=## )/);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.startsWith("## ") && !p.startsWith("# "));
}

function normalizeForCompare(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicateSection(section, baseContent) {
  const title = section.match(/^## (.+)/)?.[1] || "";
  const body = section.replace(/^## .+\n/, "");
  const titleNorm = normalizeForCompare(title);
  const baseNorm = normalizeForCompare(baseContent);

  if (titleNorm && baseNorm.includes(titleNorm)) return true;

  const keywords = titleNorm.split(" ").filter((w) => w.length >= 2);
  if (keywords.length === 0) return false;
  const hit = keywords.filter((k) => baseNorm.includes(k)).length;
  return hit / keywords.length >= 0.7;
}

function extractQaBlocks(qaContent) {
  const blocks = [];
  const re = /^# (\d+\..+)$/gm;
  const matches = [...qaContent.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : qaContent.length;
    const block = qaContent.slice(start, end).trim();
    const question = matches[i][1].trim();
    blocks.push({ question, block });
  }
  return blocks;
}

function extractForensicsQaBlocks(qaContent) {
  const blocks = [];
  const parts = qaContent.split(/\n(?=## \d+\.)/);
  for (const part of parts) {
    const m = part.match(/^## (\d+\..+)/);
    if (!m) continue;
    blocks.push({ question: m[1].trim(), block: part.trim() });
  }
  return blocks;
}

function extractOsintQaBlocks(qaContent) {
  const blocks = [];
  const parts = qaContent.split(/\n(?=### Q:)/);
  for (const part of parts) {
    const m = part.match(/^### Q:\s*(.+)/);
    if (!m) continue;
    blocks.push({ question: m[1].trim(), block: part.trim() });
  }
  return blocks;
}

function filterQaBlocks(blocks, keepPatterns) {
  return blocks.filter(({ question }) => keepPatterns.some((re) => re.test(question)));
}

function mergeCategory({
  output,
  title,
  indexFile,
  supplementFile,
  qaFile,
  tutorMarker,
  forceSections = [],
  qaKeepPatterns = [],
  qaExtractor = extractQaBlocks,
}) {
  let merged = retitleIndex(read(indexFile), title);
  const supplement = read(supplementFile);

  const forced = extractSectionsBeforeMarker(supplement, tutorMarker).filter((sec) => {
    const heading = sec.match(/^## (.+)/)?.[1] || "";
    return forceSections.some((f) => heading.includes(f) || f.includes(heading));
  });

  const extra = extractSectionsBeforeMarker(supplement, tutorMarker).filter((sec) => {
    const heading = sec.match(/^## (.+)/)?.[1] || "";
    if (forceSections.some((f) => heading.includes(f) || f.includes(heading))) return false;
    return !isDuplicateSection(sec, merged);
  });

  const tutor = extractTutorSupplement(supplement, tutorMarker);
  const sections = [...forced, ...extra];

  if (sections.length > 0) {
    merged += "\n\n---\n\n## 補足知識\n\n" + sections.join("\n\n");
  }

  if (tutor) {
    merged += `\n\n---\n\n${tutorMarker.trim()}\n\n${tutor}`;
  }

  if (qaFile && fs.existsSync(path.join(KNOWLEDGE, qaFile))) {
    const qa = read(qaFile);
    const blocks = qaExtractor(qa);
    const kept = filterQaBlocks(blocks, qaKeepPatterns);
    if (kept.length > 0) {
      merged += "\n\n---\n\n## よくある質問・誤解\n\n";
      merged += kept.map(({ block }) => block).join("\n\n---\n\n");
    }
  }

  write(output, merged);
  remove(indexFile);
  if (qaFile) remove(qaFile);
  console.log(`consolidated: ${output} (removed ${indexFile}, ${qaFile || "n/a"})`);
}

const categories = [
  {
    output: "crypto.md",
    title: "# Crypto ナレッジ",
    indexFile: "crypto_index.md",
    supplementFile: "crypto.md",
    qaFile: "crypto_qa.md",
    tutorMarker: "## Crypto チューター補足",
    forceSections: [
      "Minecraft Enchantment Table Language",
      "Shakespeare Programming Language",
      "座標暗号",
    ],
    qaKeepPatterns: [
      /PDFのパスワード/,
      /ROT26/,
      /john the ripper/,
      /quipqiup/,
      /ウイルス対策/,
    ],
  },
  {
    output: "forensics.md",
    title: "# Forensics ナレッジ",
    indexFile: "forensics_index.md",
    supplementFile: "forensics.md",
    qaFile: "forensics_qa.md",
    tutorMarker: "## Forensics チューター補足",
    forceSections: [
      "整合性",
      "改ざん検知",
      "チューン・オブ・カストディ",
      "よくある落とし穴",
      "解き方の方向性",
    ],
    qaKeepPatterns: [/チェーン・オブ・カストディ/, /整合性.*とは/],
    qaExtractor: extractForensicsQaBlocks,
  },
  {
    output: "web.md",
    title: "# Web ナレッジ",
    indexFile: "web_index.md",
    supplementFile: "web.md",
    qaFile: "web_qa.md",
    tutorMarker: "## Web チューター補足",
    forceSections: ["パラメータ改ざん", "典型的な攻撃フロー", "よくあるミス"],
    qaKeepPatterns: [/CSRF/, /SameSite/, /プリペアド/],
  },
  {
    output: "osint.md",
    title: "# OSINT ナレッジ",
    indexFile: "osint_index.md",
    supplementFile: "osint.md",
    qaFile: "osint_qa.md",
    tutorMarker: "## OSINT チューター補足",
    forceSections: ["Google Patents", "特許"],
    qaKeepPatterns: [/Google Patents/, /特許/, /J-PlatPat/],
    qaExtractor: extractOsintQaBlocks,
  },
];

for (const cat of categories) {
  mergeCategory(cat);
}

const count = fs.readdirSync(KNOWLEDGE).filter((f) => f.endsWith(".md")).length;
console.log(`\nDone. knowledge/ now has ${count} markdown files.`);
