/**
 * 統合済みカテゴリナレッジから重複セクションを除去
 */
const fs = require("fs");
const path = require("path");

const KNOWLEDGE = path.join(__dirname, "..", "content", "knowledge");

function read(name) {
  return fs.readFileSync(path.join(KNOWLEDGE, name), "utf-8");
}

function write(name, content) {
  fs.writeFileSync(path.join(KNOWLEDGE, name), content.trimEnd() + "\n", "utf-8");
}

function sliceBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start === -1) return "";
  const from = start + startMarker.length;
  const end = endMarker ? content.indexOf(endMarker, from) : content.length;
  if (end === -1) return content.slice(from).trim();
  return content.slice(from, end).trim();
}

function extractSections(block) {
  return block.split(/\n(?=## )/).map((s) => s.trim()).filter((s) => s.startsWith("## "));
}

function extractQaByPattern(faqBlock, patterns) {
  const blocks = faqBlock.split(/\n(?=# \d+\.)/).filter(Boolean);
  return blocks
    .filter((b) => patterns.some((re) => re.test(b)))
    .map((b) => b.trim())
    .join("\n\n---\n\n");
}

function extractForensicsQaByPattern(faqBlock, patterns) {
  const blocks = faqBlock.split(/\n(?=## \d+\.)/).filter(Boolean);
  return blocks
    .filter((b) => patterns.some((re) => re.test(b)))
    .map((b) => b.trim())
    .join("\n\n---\n\n");
}

function cleanupCrypto() {
  const raw = read("crypto.md");
  const base = sliceBetween(raw, "", "\n---\n\n## 補足知識");
  const supplementBlock = sliceBetween(raw, "## 補足知識\n\n", "\n---\n\n---\n\n## Crypto チューター補足");
  const tutor = sliceBetween(raw, "## Crypto チューター補足\n\n", "\n---\n\n## よくある質問・誤解");

  const keepHeadings = ["座標暗号", "Minecraft", "Shakespeare"];
  const supplement = extractSections(supplementBlock)
    .filter((sec) => keepHeadings.some((h) => sec.includes(h)))
    .join("\n\n");

  const faqBlock = sliceBetween(raw, "## よくある質問・誤解\n\n", "");
  const faq = extractQaByPattern(faqBlock, [
    /quipqiup/,
    /PDFのパスワード/,
    /ROT26/,
    /john the ripper/,
  ]);

  let out = base.trim();
  if (supplement) out += "\n\n---\n\n## 補足知識\n\n" + supplement;
  if (tutor) out += "\n\n---\n\n## Crypto チューター補足\n\n" + tutor;
  if (faq) out += "\n\n---\n\n## よくある質問・誤解\n\n" + faq;

  write("crypto.md", out);
  console.log("cleaned: crypto.md");
}

function cleanupForensics() {
  const raw = read("forensics.md");
  const base = sliceBetween(raw, "", "\n---\n\n## 補足知識");
  const supplementBlock = sliceBetween(raw, "## 補足知識\n\n", "\n---\n\n## Forensics チューター補足");
  const tutor = sliceBetween(raw, "## Forensics チューター補足\n\n", "\n---\n\n## よくある質問・誤解");

  const keepHeadings = ["整合性", "改ざん検知", "チューン・オブ・カストディ", "よくある落とし穴", "解き方の方向性"];
  const supplement = extractSections(supplementBlock)
    .filter((sec) => keepHeadings.some((h) => sec.includes(h)))
    .join("\n\n");

  let out = base.trim();
  if (supplement) out += "\n\n---\n\n## 補足知識\n\n" + supplement;
  if (tutor) out += "\n\n---\n\n## Forensics チューター補足\n\n" + tutor;

  write("forensics.md", out);
  console.log("cleaned: forensics.md");
}

function cleanupWeb() {
  const raw = read("web.md");
  const base = sliceBetween(raw, "", "\n---\n\n## 補足知識");
  const supplementBlock = sliceBetween(raw, "## 補足知識\n\n", "\n---\n\n## Web チューター補足");
  const tutor = sliceBetween(raw, "## Web チューター補足\n\n", "");

  const keepHeadings = ["パラメータ改ざん", "典型的な攻撃フロー", "よくあるミス"];
  const supplement = extractSections(supplementBlock)
    .filter((sec) => keepHeadings.some((h) => sec.includes(h)))
    .join("\n\n");

  let out = base.trim();
  if (supplement) out += "\n\n---\n\n## 補足知識\n\n" + supplement;
  if (tutor) out += "\n\n---\n\n## Web チューター補足\n\n" + tutor;

  write("web.md", out);
  console.log("cleaned: web.md");
}

function cleanupOsint() {
  const raw = read("osint.md");
  const base = sliceBetween(raw, "", "\n---\n\n## 補足知識");
  const supplementBlock = sliceBetween(raw, "## 補足知識\n\n", "\n---\n\n## OSINT チューター補足");
  const tutor = sliceBetween(raw, "## OSINT チューター補足\n\n", "\n---\n\n## よくある質問・誤解");

  const keepHeadings = [
    "重要な考え方",
    "最低限の初動テンプレ",
    "OSINT / フォレンジック手順まとめ",
    "OSINTの適切な利用",
  ];
  const supplement = extractSections(supplementBlock)
    .filter((sec) => keepHeadings.some((h) => sec.includes(h)))
    .join("\n\n");

  let out = base.trim();
  if (supplement) out += "\n\n---\n\n## 補足知識\n\n" + supplement;
  if (tutor) out += "\n\n---\n\n## OSINT チューター補足\n\n" + tutor;

  write("osint.md", out);
  console.log("cleaned: osint.md");
}

cleanupCrypto();
cleanupForensics();
cleanupWeb();
cleanupOsint();
