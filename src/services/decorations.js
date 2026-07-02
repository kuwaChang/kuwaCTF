const fs = require("fs");
const path = require("path");
const paths = require("../config/paths");

const decorationsPath = path.join(paths.CONFIG, "decorations.json");
const achievementsPath = path.join(paths.CONFIG, "achievements.json");

// デコレーション定義を読み込む（type("name"/"icon") ごとの配列を持つオブジェクト）
function loadDecorations() {
  try {
    const data = fs.readFileSync(decorationsPath, "utf-8");
    const parsed = JSON.parse(data);
    return {
      name: Array.isArray(parsed.name) ? parsed.name : [],
      icon: Array.isArray(parsed.icon) ? parsed.icon : []
    };
  } catch (err) {
    console.error("デコレーション定義読み込みエラー:", err);
    return { name: [], icon: [] };
  }
}

// 全デコレーションを id -> 定義 のマップで返す
function getDecorationMap() {
  const catalog = loadDecorations();
  const map = {};
  [...catalog.name, ...catalog.icon].forEach((deco) => {
    if (deco && deco.id) map[deco.id] = deco;
  });
  return map;
}

// 指定 id のデコレーション定義を返す（存在しなければ null）
function getDecoration(id) {
  if (!id) return null;
  return getDecorationMap()[id] || null;
}

// 各タイプのデフォルト（cost 0・default:true）デコレーションを返す
function getDefaultDecoration(type) {
  const catalog = loadDecorations();
  const list = catalog[type] || [];
  return list.find((d) => d.default) || list.find((d) => (d.cost || 0) === 0) || null;
}

// 装備中デコレーションID（未設定ならデフォルト）を className に解決する
function resolveClass(type, equippedId) {
  const deco = getDecoration(equippedId) || getDefaultDecoration(type);
  return deco ? deco.className || "" : "";
}

// 実績定義を読み込む
function loadAchievementPoints() {
  try {
    const data = fs.readFileSync(achievementsPath, "utf-8");
    const parsed = JSON.parse(data);
    const map = {};
    for (const [id, ach] of Object.entries(parsed)) {
      map[id] = Number(ach.points) || 0;
    }
    return map;
  } catch (err) {
    console.error("実績ポイント定義読み込みエラー:", err);
    return {};
  }
}

module.exports = {
  loadDecorations,
  getDecorationMap,
  getDecoration,
  getDefaultDecoration,
  resolveClass,
  loadAchievementPoints
};
