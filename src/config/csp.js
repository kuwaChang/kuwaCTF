const helmet = require("helmet");

// 脆弱性演習ページ（XSS等の学習のため緩いCSP）
const LAB_PATHS = new Set([
  "/xss",
  "/xss_index",
  "/sql",
  "/sql_index",
  "/sqli",
  "/path-traversal",
  "/path-traversal_index",
  "/pt",
]);

// インライン<script>を含むページ（段階的に外部JSへ移行予定）
const INLINE_SCRIPT_PATHS = new Set([
  "/register",
  "/register_form.html",
  "/tutor",
  "/advertisement",
]);

function isLabPath(req) {
  const path = req.path.split("?")[0].toLowerCase();
  if (LAB_PATHS.has(path)) {
    return true;
  }
  if (path.startsWith("/xss/") || path.startsWith("/path-traversal/download")) {
    return true;
  }
  return false;
}

function isInlineScriptPath(req) {
  return INLINE_SCRIPT_PATHS.has(req.path.split("?")[0].toLowerCase());
}

// メインアプリ用（CDN・Monaco・Socket.io・Leaflet等）
const mainDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  imgSrc: [
    "'self'",
    "data:",
    "blob:",
    "https://*.tile.openstreetmap.org",
    "https://tile.openstreetmap.org",
  ],
  objectSrc: ["'none'"],
  scriptSrc: [
    "'self'",
    "https://cdn.socket.io",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
    "'unsafe-eval'", // Monaco Editor
  ],
  scriptSrcAttr: ["'unsafe-inline'"], // admin/tutor の onclick 等
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
  ],
  connectSrc: [
    "'self'",
    "ws:",
    "wss:",
    "http:",
    "https:", // LAN内の演習サーバー・SAD(3333)・動的ポート
  ],
  workerSrc: ["'self'", "blob:"],
  upgradeInsecureRequests: null, // LAN内HTTP運用のため無効
};

// インライン<script>付きページ用
const inlineScriptDirectives = {
  ...mainDirectives,
  scriptSrc: [...mainDirectives.scriptSrc, "'unsafe-inline'"],
};

// 脆弱性演習ページ用（XSSペイロード実行を許可）
const labDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
  objectSrc: ["'none'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
  upgradeInsecureRequests: null,
};

function createHelmetMiddleware(directives) {
  return helmet({
    hsts: false,
    // LAN内 HTTP (192.168.x.x 等) では「信頼できるオリジン」にならず COOP は無視される。
    // Origin-Agent-Cluster も混在するとコンソール警告の原因になるため無効化。
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    contentSecurityPolicy: { directives },
  });
}

const mainHelmet = createHelmetMiddleware(mainDirectives);
const inlineScriptHelmet = createHelmetMiddleware(inlineScriptDirectives);
const labHelmet = createHelmetMiddleware(labDirectives);

// LAN HTTP: COOP を送らない。OAC は全レスポンスで site-keyed (?0) に統一。
function finalizeLanSecurityHeaders(req, res, next) {
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.setHeader("Origin-Agent-Cluster", "?0");
  next();
}

function runHelmetThenFinalize(helmetMw, req, res, next) {
  helmetMw(req, res, (err) => {
    if (err) return next(err);
    finalizeLanSecurityHeaders(req, res, next);
  });
}

function cspMiddleware(req, res, next) {
  if (isLabPath(req)) {
    return runHelmetThenFinalize(labHelmet, req, res, next);
  }
  if (isInlineScriptPath(req)) {
    return runHelmetThenFinalize(inlineScriptHelmet, req, res, next);
  }
  return runHelmetThenFinalize(mainHelmet, req, res, next);
}

module.exports = {
  cspMiddleware,
  isLabPath,
  isInlineScriptPath,
  mainDirectives,
  inlineScriptDirectives,
  labDirectives,
};
