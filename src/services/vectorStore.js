const { ChromaClient } = require("chromadb");
const { OllamaEmbeddings } = require("@langchain/ollama");
const fs = require("fs");
const path = require("path");

const DEFAULT_OLLAMA_EMBEDDING_MODEL = "bge-m3";

/**
 * 問題ごとのヒント集（easy1.md 〜 hard2.md）。
 * 一般知識と一緒に検索すると無関係な質問に問題のヒントが混ざるため、ベクトル検索には載せない。
 * 学習者がその問題を開いているときだけ getProblemHint() で該当の節を直接読む。
 */
const PROBLEM_HINT_FILE_RE = /^(easy|medium|hard)\d+\.md$/i;

/**
 * 知識ベースの中身や分割方法を変えたら上げる。
 * コレクション名が変わるので、次回起動時に自動で作り直される。
 */
const KNOWLEDGE_INDEX_VERSION = 3;

/**
 * 見出し境界で区切り、1チャンクが次の見出しに入り込まないようにする。
 * 節が chunkSize を超えるときだけ、その節の本文を改行・空白で再分割する。
 */
const OMITTED_SECTION_NAMES = ["ローカルLLM回答方針", "安全な回答方針", "情報開示の注意"];

/** モデル向けの指示節は検索に載せない */
function omitInstructionSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (heading) {
      skipping = OMITTED_SECTION_NAMES.some((name) => heading[1].includes(name));
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function splitTextIntoChunks(text, chunkSize = 1000, chunkOverlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastNewline = slice.lastIndexOf("\n");
      const lastSpace = slice.lastIndexOf(" ");
      const breakAt = lastNewline >= 0 ? lastNewline + 1 : (lastSpace >= 0 ? lastSpace + 1 : slice.length);
      end = start + breakAt;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - (end - start > chunkOverlap ? chunkOverlap : 0);
  }
  return chunks;
}

/**
 * 見出し（# 〜 ######）ごとに節へ分ける。
 * 本文が空の見出しはチャンクにせず、子の節の先頭に祖先見出しとして残す。
 * コードフェンス内の # 行は見出しにしない。
 */
function splitMarkdownByHeadings(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  const stack = [];
  let body = [];
  let inFence = false;

  function flush() {
    const text = body.join("\n").trim();
    body = [];
    if (!text) return;
    sections.push({
      prefix: stack.map((heading) => heading.line).join("\n"),
      body: text
    });
  }

  for (const line of lines) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      body.push(line);
      continue;
    }
    const heading = !inFence && line.match(/^(#{1,6})\s+\S/);
    if (heading) {
      flush();
      const level = heading[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      stack.push({ level, line });
      continue;
    }
    body.push(line);
  }
  flush();
  return sections;
}

function splitMarkdownIntoChunks(markdown, chunkSize = 1000, chunkOverlap = 100) {
  const chunks = [];
  for (const section of splitMarkdownByHeadings(markdown)) {
    const header = section.prefix ? `${section.prefix}\n` : "";
    const whole = `${header}${section.body}`.trim();
    if (whole.length <= chunkSize) {
      chunks.push(whole);
      continue;
    }

    const budget = header.length < chunkSize ? chunkSize - header.length : chunkSize;
    const overlap = Math.min(chunkOverlap, Math.max(0, budget - 1));
    for (const piece of splitTextIntoChunks(section.body, budget, overlap)) {
      const chunk = `${header}${piece}`.trim();
      if (chunk) chunks.push(chunk);
    }
  }
  return chunks;
}

const paths = require("../config/paths");

// ChromaDBのデータ保存用ディレクトリ（Chromaサーバーを --path で起動する場合に使用）
const chromaDir = path.join(paths.STORAGE, "chroma");
if (!fs.existsSync(chromaDir)) {
  fs.mkdirSync(chromaDir, { recursive: true });
}

// ChromaDBのJSクライアントは path に「HTTPのURL」を指定する必要があります。
// ローカルで永続化する場合は別ターミナルで: chroma run --path ./storage/chroma
const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

class VectorStoreService {
  constructor() {
    try {
      this.client = new ChromaClient({
        path: CHROMA_URL
      });
    } catch (error) {
      console.error("❌ ChromaClient初期化エラー:", error);
      console.warn("⚠️ ChromaDBの初期化に失敗しましたが、サーバーは起動を続行します。");
      this.client = null;
    }
    this.collectionName = `ctf_knowledge_v${KNOWLEDGE_INDEX_VERSION}`;
    this.embeddings = null;
    this.collection = null;
    this.initialized = false;
    this.embeddingType = null;
    this.connectionFailed = false; // Chroma接続失敗を1回だけ検出し、以降は検索をスキップ
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    if (this.connectionFailed) {
      return; // 過去に接続失敗している場合はスキップ（LLMのみで継続）
    }
    if (!this.client) {
      throw new Error("ChromaClientが初期化されていません。");
    }

    try {
      const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      const ollamaEmbeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || DEFAULT_OLLAMA_EMBEDDING_MODEL;

      this.embeddings = new OllamaEmbeddings({
        baseUrl: ollamaBaseUrl,
        model: ollamaEmbeddingModel,
        // 埋め込みはCPUで動かし、GPUはチャットモデル専用にする（モデルの入れ替えを防ぐ）
        // OLLAMA_EMBEDDING_NUM_GPU を設定すれば従来どおりGPUも使える
        requestOptions: { numGpu: parseInt(process.env.OLLAMA_EMBEDDING_NUM_GPU || "0", 10) },
      });
      this.embeddingType = "ollama";
      console.log(`✅ ローカル埋め込みモデル（Ollama）を初期化しました: ${ollamaEmbeddingModel} at ${ollamaBaseUrl}`);

      // コレクションの取得または作成
      try {
        this.collection = await this.client.getOrCreateCollection({
          name: this.collectionName,
          metadata: { description: "CTF知識ベース" }
        });
        console.log("✅ ChromaDBコレクション準備完了");
      } catch (error) {
        console.error("❌ ChromaDBコレクション作成エラー:", error);
        this.connectionFailed = true;
        console.warn("💡 Chroma未使用: チューターはLLMのみで動作します。知識ベースを使う場合は chroma run --path ./storage/chroma でサーバーを起動してください。");
        throw error;
      }

      this.initialized = true;
    } catch (error) {
      console.error("❌ VectorStore初期化エラー:", error);
      throw error;
    }
  }

  async loadKnowledgeBase() {
    await this.initialize();
    if (this.connectionFailed || !this.collection) {
      return; // Chroma未接続のためスキップ（チューターはLLMのみで動作）
    }

    if (!this.embeddings) {
      const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || DEFAULT_OLLAMA_EMBEDDING_MODEL;
      throw new Error(`ローカル埋め込みモデル（Ollama）の初期化に失敗しました。Ollamaが起動しているか確認してください。\n\n解決方法:\n1. Ollamaが起動しているか確認: \`ollama list\`\n2. 埋め込みモデルをダウンロード: \`ollama pull ${embeddingModel}\`\n3. Ollamaのインストール: https://ollama.com/download`);
    }

    const knowledgeDir = path.join(paths.CONTENT, "knowledge");
    const files = fs
      .readdirSync(knowledgeDir)
      .filter((f) => f.endsWith(".md") && !PROBLEM_HINT_FILE_RE.test(f));

    // 既存のデータを確認
    const existingCount = await this.collection.count();
    if (existingCount > 0) {
      console.log(`📚 既存の知識ベースが見つかりました（${existingCount}件）`);
      return;
    }

    console.log("📚 知識ベースを読み込み中...");

    const CHUNK_SIZE = 400;
    const CHUNK_OVERLAP = 40;

    const allChunks = [];
    const allMetadata = [];

    for (const file of files) {
      const filePath = path.join(knowledgeDir, file);
      const content = omitInstructionSections(fs.readFileSync(filePath, "utf-8"));
      const category = path.basename(file, ".md");

      const chunks = splitMarkdownIntoChunks(content, CHUNK_SIZE, CHUNK_OVERLAP);

      for (let i = 0; i < chunks.length; i++) {
        allChunks.push(chunks[i]);
        allMetadata.push({
          source: file,
          category: category,
          chunkIndex: i
        });
      }
    }

    console.log(`📝 ${allChunks.length}個のチャンクを生成しました`);

    // 埋め込みベクトルの生成
    console.log("🔄 埋め込みベクトルを生成中...");
    const embeddings = await this.embeddings.embedDocuments(allChunks);

    // ChromaDBに保存
    const ids = allChunks.map((_, i) => `${Date.now()}_${i}`);
    
    await this.collection.add({
      ids: ids,
      embeddings: embeddings,
      documents: allChunks,
      metadatas: allMetadata
    });

    console.log("✅ 知識ベースのインデックス化が完了しました");
  }

  async search(query, topK = 3) {
    if (this.connectionFailed || !this.client) {
      return []; // Chroma未接続時は空で返し、LLMのみで回答
    }
    await this.initialize();

    if (!this.embeddings) {
      throw new Error("ローカル埋め込みモデル（Ollama）の初期化に失敗しました。Ollamaが起動しているか確認してください。");
    }

    try {
      // クエリの埋め込みベクトルを生成
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // 類似度検索
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK
      });

      return results.documents[0].map((doc, i) => ({
        content: doc,
        metadata: results.metadatas[0][i],
        distance: results.distances[0][i]
      }));
    } catch (error) {
      console.error("❌ 検索エラー:", error);
      throw error;
    }
  }

  /**
   * 開いている問題のヒント節を返す（例: category="Easy1", questionId="beginner2"）。
   * 該当するヒント集や節が無ければ空文字。
   */
  getProblemHint(category, questionId) {
    if (!category || !questionId) return "";
    const file = `${String(category).toLowerCase()}.md`;
    if (!PROBLEM_HINT_FILE_RE.test(file)) return "";
    const filePath = path.join(paths.CONTENT, "knowledge", file);
    if (!fs.existsSync(filePath)) return "";

    const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
    const id = String(questionId).toLowerCase();
    const start = lines.findIndex((line) => {
      const m = line.match(/^##\s+([A-Za-z0-9_-]+)/);
      return m && m[1].toLowerCase() === id;
    });
    if (start === -1) return "";
    let end = lines.findIndex((line, i) => i > start && /^#{1,2}\s/.test(line));
    if (end === -1) end = lines.length;
    return lines.slice(start + 1, end).join("\n").trim();
  }

  async clear() {
    await this.initialize();
    try {
      await this.client.deleteCollection({ name: this.collectionName });
      console.log("✅ コレクションを削除しました");
      // 削除後は古い collection 参照が無効になるため再初期化を強制
      this.collection = null;
      this.initialized = false;
    } catch (error) {
      console.error("❌ コレクション削除エラー:", error);
    }
  }
}

module.exports = new VectorStoreService();

