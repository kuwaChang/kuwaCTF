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
const KNOWLEDGE_INDEX_VERSION = 5;

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

/** チャンクと、そのチャンクが属する節の全文を組にして返す */
function splitMarkdownIntoChunkRecords(markdown, chunkSize = 1000, chunkOverlap = 100) {
  const records = [];
  for (const section of splitMarkdownByHeadings(markdown)) {
    const header = section.prefix ? `${section.prefix}\n` : "";
    const whole = `${header}${section.body}`.trim();
    if (whole.length <= chunkSize) {
      records.push({ chunk: whole, section: whole });
      continue;
    }

    const budget = header.length < chunkSize ? chunkSize - header.length : chunkSize;
    const overlap = Math.min(chunkOverlap, Math.max(0, budget - 1));
    for (const piece of splitTextIntoChunks(section.body, budget, overlap)) {
      const chunk = `${header}${piece}`.trim();
      if (chunk) records.push({ chunk, section: whole });
    }
  }
  return records;
}

function splitMarkdownIntoChunks(markdown, chunkSize = 1000, chunkOverlap = 100) {
  return splitMarkdownIntoChunkRecords(markdown, chunkSize, chunkOverlap).map((r) => r.chunk);
}

const paths = require("../config/paths");

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 40;

/**
 * 知識ベース（問題別ヒント集を除く）をチャンクに分ける。
 * Chroma への登録とキーワード検索の両方で使うので、同じ入力なら同じ並び・同じ chunkIndex になる。
 */
function buildKnowledgeChunks() {
  const knowledgeDir = path.join(paths.CONTENT, "knowledge");
  const files = fs
    .readdirSync(knowledgeDir)
    .filter((f) => f.endsWith(".md") && !PROBLEM_HINT_FILE_RE.test(f))
    .sort();

  const chunks = [];
  const metadatas = [];
  const sections = []; // チャンクが属する節の全文（Chroma には保存しない）
  for (const file of files) {
    const content = omitInstructionSections(fs.readFileSync(path.join(knowledgeDir, file), "utf-8"));
    const category = path.basename(file, ".md");
    splitMarkdownIntoChunkRecords(content, CHUNK_SIZE, CHUNK_OVERLAP).forEach(({ chunk, section }, i) => {
      chunks.push(chunk);
      metadatas.push({ source: file, category, chunkIndex: i });
      sections.push(section);
    });
  }
  return { chunks, metadatas, sections };
}

/**
 * 検索で当たったチャンクを、節の全文に広げるときの上限。
 * 節の途中で切れたチャンク（「5ステップ」の2つ目まで、など）だけを渡すと、モデルは続きを書けない。
 * 一方で numCtx 4096 に会話履歴も入るので、参考メモ全体の文字数は抑える。
 */
const MAX_SECTION_CHARS = 1200;
const MAX_CONTEXT_CHARS = 2400;

/**
 * ベクトル検索の関連度（1 - 距離）がこれ未満のチャンクは使わない。
 * bge-m3 は正規化済みで Chroma の既定は二乗L2距離なので、関連度 = 2×コサイン類似度 − 1。
 * 0.15 はコサイン類似度 約0.58 に当たる。
 */
const MIN_VECTOR_RELEVANCE = parseFloat(process.env.TUTOR_MIN_RELEVANCE || "0.15");

/** 全チャンクのうちこの割合より多くに出る語は、ありふれた語としてキーワード検索に使わない */
const MAX_TERM_DOC_RATIO = 0.08;

/** キーワード検索で、この点（IDFの合計）に届かないチャンクは使わない */
const MIN_KEYWORD_SCORE = 3.0;

/**
 * 質問の特徴的な語（IDFの合計）のうち、この割合以上がチャンクに出ていないと使わない。
 * 知識ベースに1つも出てこない語も分母に入れるので、
 * 「Brainfuck」のように資料に無い話題では、「言語」などの周辺語だけで一致したチャンクは返らない。
 */
const MIN_KEYWORD_COVERAGE = 0.4;

/** 長い漢字語から切り出した2文字の組は、元の語ほど意味を持たないので重みを下げる */
const KANJI_FRAGMENT_WEIGHT = 0.5;

/** どの話題にも出てくる語。これだけで一致しても関係があるとは言えないので使わない */
const KEYWORD_STOPWORDS = new Set([
  "方法", "手順", "基本", "基本的", "用途", "言語", "手法", "機能", "構造", "特定", "違い", "説明",
  "問題", "使い方", "意味", "具体", "具体的", "具体例", "初心者", "理由", "場合", "必要", "情報",
  "確認", "注意", "一般", "簡単", "全部", "最初", "次", "今", "何", "時", "例", "観点", "目的",
  "解説", "教え", "表示", "出力", "入力", "利用", "使用", "可能", "有効", "向け", "対策", "種類",
  "ctf", "the", "and", "for", "how", "what"
]);

/** 2つの検索結果を順位で混ぜる（Reciprocal Rank Fusion）ときの定数 */
const RRF_K = 60;

/** 全角半角・大小文字をそろえ、英数字の間のハイフンを除く（「Wi-Fi」と「WiFi」を同じ語にする） */
const normalizeForMatch = (text) =>
  String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?<=[a-z0-9])-(?=[a-z0-9])/g, "");

/**
 * 質問からキーワード検索に使う語を取り出す。
 * 日本語は分かち書きしないので、文字種の切れ目で区切る（英数字の語・カタカナ語・漢字語）。
 * 3文字以上の漢字語は2文字ずつの組も加え、「ゼロ幅文字」と「文字幅」のような言い回しの差を吸収する。
 */
function extractKeywordTerms(query) {
  const text = normalizeForMatch(query);
  const terms = new Map(); // 語 -> 重み
  const add = (word, weight = 1) => {
    if (KEYWORD_STOPWORDS.has(word)) return;
    terms.set(word, Math.max(terms.get(word) || 0, weight));
  };
  for (const m of text.matchAll(/[a-z0-9][a-z0-9_.+#-]*[a-z0-9+#]/g)) {
    const word = m[0];
    // 数字だけの語（座標・桁の多い数）は一致しても意味が薄いので使わない
    if (/^[0-9.,-]+$/.test(word)) continue;
    // 「pdf2john.py」は資料では「pdf2john」と書かれることが多いので、拡張子を外した形も探す
    const stem = word.match(/^(.+)\.(?:py|sh|exe|pl|rb|js|txt)$/);
    if (stem) add(stem[1]);
    else add(word);
  }
  for (const m of text.matchAll(/[ァ-ヶー]{2,}/g)) {
    if (!/^ー+$/.test(m[0])) add(m[0]);
  }
  for (const m of text.matchAll(/[一-龠々]{2,}/g)) {
    const word = m[0];
    add(word);
    if (word.length >= 3) {
      for (let i = 0; i + 2 <= word.length; i++) add(word.slice(i, i + 2), KANJI_FRAGMENT_WEIGHT);
    }
  }
  return [...terms].map(([term, weight]) => ({ term, weight }));
}
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

    // 既存のデータを確認
    const existingCount = await this.collection.count();
    if (existingCount > 0) {
      console.log(`📚 既存の知識ベースが見つかりました（${existingCount}件）`);
      return;
    }

    console.log("📚 知識ベースを読み込み中...");

    const { chunks: allChunks, metadatas: allMetadata } = buildKnowledgeChunks();

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

  /** キーワード検索用に、チャンクを正規化した形でメモリに持つ（初回だけ作る） */
  _getKeywordIndex() {
    if (!this.keywordIndex) {
      const { chunks, metadatas, sections } = buildKnowledgeChunks();
      this.keywordIndex = chunks.map((content, i) => {
        const heading = content
          .split(/\r?\n/)
          .filter((line) => /^#{1,6}\s/.test(line))
          .join("\n");
        return {
          content,
          section: sections[i],
          metadata: metadatas[i],
          text: normalizeForMatch(content),
          heading: normalizeForMatch(heading)
        };
      });
    }
    return this.keywordIndex;
  }

  /**
   * 質問の語がそのまま出てくるチャンクを探す。固有名詞やコマンド名（Brainfuck, pdf2john など）に強い。
   * 点は一致した語の IDF の合計（見出しに出る語は1.5倍）。
   */
  keywordSearch(query, topK = 5) {
    const index = this._getKeywordIndex();
    const n = index.length;
    if (n === 0) return [];

    const specificTerms = extractKeywordTerms(query)
      .map(({ term, weight }) => {
        const df = index.reduce((count, doc) => count + (doc.text.includes(term) ? 1 : 0), 0);
        return { term, df, idf: Math.log(n / Math.max(df, 1)) * weight };
      })
      .filter((t) => t.df / n <= MAX_TERM_DOC_RATIO);
    // 網羅率の分母。知識ベースに出てこない語（df=0）も含める
    const totalIdf = specificTerms.reduce((sum, t) => sum + t.idf, 0);
    const terms = specificTerms.filter((t) => t.df > 0);
    if (terms.length === 0) return [];

    // 長い語に含まれる短い語（「ハッシュ」と「ハッシュ値」など）が二重に数えられないよう、
    // チャンクごとに、より長い一致語に含まれる語は除く
    const scored = [];
    for (const doc of index) {
      const matched = terms.filter((t) => doc.text.includes(t.term));
      if (matched.length === 0) continue;
      const kept = matched.filter(
        (t) => !matched.some((o) => o.term !== t.term && o.term.length > t.term.length && o.term.includes(t.term))
      );
      const coverage = kept.reduce((sum, t) => sum + t.idf, 0) / totalIdf;
      const score = kept.reduce((sum, t) => sum + t.idf * (doc.heading.includes(t.term) ? 1.5 : 1), 0);
      if (score >= MIN_KEYWORD_SCORE && coverage >= MIN_KEYWORD_COVERAGE) {
        scored.push({ doc, score, coverage, matchedTerms: kept.map((t) => t.term) });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ doc, score, coverage, matchedTerms }) => ({
      content: doc.content,
      metadata: doc.metadata,
      relevance: coverage,
      keywordScore: score,
      matchedTerms
    }));
  }

  /**
   * ベクトル検索とキーワード検索を合わせる（ハイブリッド検索）。
   * どちらも関連の薄い結果は捨ててから順位で混ぜるので、無関係なチャンクは返さない（0件もありうる）。
   */
  async search(query, topK = 5) {
    let vectorDocs = [];
    try {
      vectorDocs = (await this.vectorSearch(query, topK * 2)).filter(
        (doc) => 1 - doc.distance >= MIN_VECTOR_RELEVANCE
      );
    } catch (error) {
      console.error("❌ ベクトル検索エラー（キーワード検索だけで続行）:", error.message);
    }

    let keywordDocs = [];
    try {
      keywordDocs = this.keywordSearch(query, topK * 2);
    } catch (error) {
      console.error("❌ キーワード検索エラー:", error.message);
    }

    const merged = new Map();
    const keyOf = (doc) => `${doc.metadata.source}#${doc.metadata.chunkIndex}`;
    const add = (docs, kind) => {
      docs.forEach((doc, rank) => {
        const key = keyOf(doc);
        const entry = merged.get(key) || {
          content: doc.content,
          metadata: doc.metadata,
          rrf: 0,
          matchedBy: [],
          vectorRelevance: null,
          keywordRelevance: null
        };
        entry.rrf += 1 / (RRF_K + rank + 1);
        entry.matchedBy.push(kind);
        if (kind === "vector") entry.vectorRelevance = 1 - doc.distance;
        else entry.keywordRelevance = doc.relevance;
        merged.set(key, entry);
      });
    };
    add(vectorDocs, "vector");
    add(keywordDocs, "keyword");

    const ranked = [...merged.values()].sort((a, b) => b.rrf - a.rrf).slice(0, topK);
    return this._expandToSections(ranked).map((entry) => ({
      content: entry.content,
      metadata: entry.metadata,
      matchedBy: entry.matchedBy,
      relevance: Math.max(entry.vectorRelevance ?? 0, entry.keywordRelevance ?? 0)
    }));
  }

  /**
   * 途中で切れたチャンクを節の全文に置き換える（節が長すぎるときはチャンクのまま）。
   * 同じ節のチャンクが複数当たったら1つにまとめ、合計が MAX_CONTEXT_CHARS を超える分は落とす。
   */
  _expandToSections(entries) {
    const sectionByKey = new Map(
      this._getKeywordIndex().map((doc) => [`${doc.metadata.source}#${doc.metadata.chunkIndex}`, doc.section])
    );
    const seen = new Set();
    const out = [];
    let total = 0;
    for (const entry of entries) {
      const section = sectionByKey.get(`${entry.metadata.source}#${entry.metadata.chunkIndex}`);
      const content = section && section.length <= MAX_SECTION_CHARS ? section : entry.content;
      if (seen.has(content)) continue;
      // 1件目は必ず入れる。2件目以降は上限を超えるなら入れない
      if (out.length > 0 && total + content.length > MAX_CONTEXT_CHARS) continue;
      seen.add(content);
      total += content.length;
      out.push({ ...entry, content });
    }
    return out;
  }

  /** 埋め込みベクトルの近さで探す（関連度での絞り込みはしない） */
  async vectorSearch(query, topK = 3) {
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
    this.keywordIndex = null; // 知識ベースの再読み込み時はキーワード索引も作り直す
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

