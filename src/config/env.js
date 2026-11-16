/**
 * プロジェクト直下の .env を読み込み、環境変数（process.env）に入れる。
 * 他のモジュールが環境変数を読む前に読み込む必要があるので、起動スクリプトの先頭で require する。
 *
 * - .env が無ければ何もしない（環境変数は未設定として既定値が使われる）
 * - PowerShell の $env: や setx ですでに設定されている変数は上書きしない（そちらが優先）
 * - 書き方は .env.example を参照
 */
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./paths");

const ENV_PATH = path.join(ROOT, ".env");

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;

  if (typeof process.loadEnvFile !== "function") {
    console.warn(
      `⚠️ .env を読み込めません。Node.js ${process.versions.node} は .env の読み込みに対応していないため、20.12 以降に更新してください。`
    );
    return;
  }

  const before = new Set(Object.keys(process.env));
  try {
    process.loadEnvFile(ENV_PATH);
  } catch (error) {
    console.warn(`⚠️ .env の読み込みに失敗しました: ${error.message}`);
    return;
  }
  // 値（SESSION_SECRET など）はログに出さず、名前だけ出す
  const loaded = Object.keys(process.env).filter((key) => !before.has(key));
  console.log(`⚙️ .env を読み込みました${loaded.length ? `: ${loaded.join(", ")}` : "（新しく設定された変数はありません）"}`);
}

loadEnv();

module.exports = { ENV_PATH };
