/**
 * アクセスを許可するネットワーク（接続元IPの範囲）。
 *
 * 既定はループバックとプライベートIP。学内の端末にグローバルIPが割り当てられている場合は、
 * 環境変数 ALLOWED_NETWORKS に学内のアドレス帯を CIDR 形式で足す（カンマ区切り）。
 *   例: ALLOWED_NETWORKS=133.10.0.0/16,133.11.20.0/24
 * 単独のIPアドレス（例: 133.10.1.5）も書ける。
 */
const net = require("net");

const DEFAULT_NETWORKS = [
  "127.0.0.0/8", // ループバック
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "::1/128", // IPv6 ループバック
  "fe80::/10" // IPv6 リンクローカル
];

/** "133.10.0.0/16" や "133.10.1.5" を { address, prefix, family } にする。書式が不正なら null */
function parseNetwork(text) {
  const [address, prefixText] = String(text).trim().split("/");
  const version = net.isIP(address);
  if (!version) return null;
  const family = version === 4 ? "ipv4" : "ipv6";
  const maxPrefix = version === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) return null;
  return { address, prefix, family };
}

function buildAllowList() {
  const extra = String(process.env.ALLOWED_NETWORKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const list = new net.BlockList();
  const networks = [];
  const invalid = [];
  for (const text of [...DEFAULT_NETWORKS, ...extra]) {
    const parsed = parseNetwork(text);
    if (!parsed) {
      invalid.push(text);
      continue;
    }
    list.addSubnet(parsed.address, parsed.prefix, parsed.family);
    networks.push(`${parsed.address}/${parsed.prefix}`);
  }
  return { list, networks, extra: networks.slice(DEFAULT_NETWORKS.length), invalid };
}

const allowList = buildAllowList();

/** 接続元IPが許可範囲に入っているか。「::ffff:133.10.1.5」のような IPv4 射影アドレスも IPv4 として判定する */
function isAllowedIp(ip) {
  let address = String(ip || "").trim();
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) address = mapped[1];
  const version = net.isIP(address);
  if (!version) return false;
  return allowList.list.check(address, version === 4 ? "ipv4" : "ipv6");
}

/**
 * CORS 用: ブラウザが送ってきたオリジンのホスト名を許可するか。
 * localhost と、許可範囲に入るIPアドレス（IPv6 は [] 付き）を許可する。
 */
function isAllowedHostname(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "");
  if (host === "localhost") return true;
  if (process.env.SERVER_HOST && host === process.env.SERVER_HOST) return true;
  return isAllowedIp(host);
}

/** 起動時のログ用 */
function describeAllowedNetworks() {
  return {
    networks: allowList.networks,
    extra: allowList.extra,
    invalid: allowList.invalid
  };
}

module.exports = { isAllowedIp, isAllowedHostname, describeAllowedNetworks };
