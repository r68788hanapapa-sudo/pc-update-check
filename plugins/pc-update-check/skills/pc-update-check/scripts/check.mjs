// pc-update-check: 署名つきデータ × 手元の版 → 報告の文を作る。Node 18 以上・依存なし。
// 通信 = DATA_URL (+ ".sig") への GET だけ。結果は保存しない・ログは残さない。
// 実行される外部コマンドは PROBES の表と VERIFY_CMD だけ (spawnFixed が唯一の spawn)。
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DATA_URL = "https://hanapapa-pc-update-check.pages.dev/data/advisories.json"; // advisories.json の URL (.sig は末尾に ".sig" を付けた物)
const PAGE_URL = "https://hanapapa-pc-update-check.pages.dev/"; // 人が直接見るページ
const SKILL_LABEL = "パソコンのソフト更新チェック";
const MIN_DATA_VERSION = "2026-10-24.2"; // これより古いデータは判定に使わない

const FETCH_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 20_000;
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_DATA_BYTES = 256 * 1024;
const MAX_OUT_BYTES = 64 * 1024;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNERS_PATH = join(HERE, "..", "allowed_signers");
const PRODUCTS_PATH = join(HERE, "products.json");

// ssh-keygen -Y verify -f <signers> -I <identity> -n <namespace> -s <sig>  (データは stdin)
const VERIFY_IDENTITY = "sec-kit@hanapapa";
const VERIFY_NAMESPACE = "sec-kit";
// 署名の確かめに使う ssh-keygen は固定の絶対パスだけ (PATH も環境変数 SystemRoot も引かない・偽物を置かれても拾わない)。
// Windows が C: 以外に入っている PC では見つからず「判定しません」になる (安全側)
export function sshKeygenPath(platform = process.platform) {
  if (platform === "win32") return "C:\\Windows\\System32\\OpenSSH\\ssh-keygen.exe";
  return "/usr/bin/ssh-keygen";
}
// Windows が C:\Windows に入っている PC だけ (違えば固定パスに別の物を置かれうる → 判定しない)
export function windowsDirOk(platform, systemRoot) {
  return platform !== "win32" || String(systemRoot ?? "").replace(/[\\/]+$/, "").toLowerCase() === "c:\\windows";
}

// 子プロセスに渡さない環境変数 (Python / Node の読み込み経路を固定する・ollama --version が別の機械へつながないようにする)
const STRIP_ENV = ["PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "NODE_OPTIONS", "NODE_PATH", "OLLAMA_HOST"];

// ───── 命令の表 (ここに無い物は実行しない) ─────
// re = 標準出力から版の文字列だけを取る正規表現 (1 つ目の括弧)。stderr は捨てる。
// notInstalledExit = この終了コードなら「見つからなかった」。
const PS = ["-NoProfile", "-NonInteractive", "-Command"];
// 決まった場所の exe の「ファイルの版」を読むだけ (起動しない)。
// 場所が複数あって 2 つ以上見つかった時は全部読み、一番古い版を出す (ユーザー用と全員用の 2 つ入っている人で、古い方を見落とさない)
export const PS_FILE = (paths) =>
  `$ErrorActionPreference='Stop'; try { $v=@(@(${paths.map((x) => `"${x}"`).join(",")}) | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { (Get-Item -LiteralPath $_).VersionInfo.ProductVersion }); ` +
  `if ($v.Count -eq 0) { 'NOTFOUND' } else { ($v | Sort-Object { [version]($_ -replace '^([0-9]+(\.[0-9]+)+).*$','$1') } | Select-Object -First 1) } } catch { 'ERROR' }`;
const PS_EXE = (rel) => PS_FILE([`$env:ProgramFiles\\${rel}`, `\${env:ProgramFiles(x86)}\\${rel}`, `$env:LocalAppData\\${rel}`]);
// Claude のアプリ (Windows のストア版・出版元 ID が Anthropic の物だけ)
const PS_CLAUDE_DESKTOP = "$p=Get-AppxPackage -Name Claude | Where-Object { $_.PublisherId -eq 'pzs8sxrjxfjjc' } | Select-Object -First 1; if ($p) { $p.Version.ToString() } else { 'NOTFOUND' }";
const DOTTED = "(\\d+(?:\\.\\d+)+)";

export const PROBES = {
  win32: {
    windows: { cmd: "powershell.exe", args: [...PS, "$v=Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -Name CurrentBuild,UBR; '10.0.' + $v.CurrentBuild + '.' + $v.UBR"], re: "^(10\\.0\\.\\d+\\.\\d+)" },
    chrome: { cmd: "powershell.exe", args: [...PS, PS_EXE("Google\\Chrome\\Application\\chrome.exe")], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    edge: { cmd: "powershell.exe", args: [...PS, PS_EXE("Microsoft\\Edge\\Application\\msedge.exe")], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    firefox: { cmd: "powershell.exe", args: [...PS, PS_EXE("Mozilla Firefox\\firefox.exe")], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    tailscale: { cmd: "powershell.exe", args: [...PS, PS_EXE("Tailscale\\tailscale.exe")], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    zoom: { cmd: "powershell.exe", args: [...PS, PS_FILE(["$env:AppData\\Zoom\\bin\\Zoom.exe", "$env:ProgramFiles\\Zoom\\bin\\Zoom.exe", "\${env:ProgramFiles(x86)}\\Zoom\\bin\\Zoom.exe"])], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    "claude-desktop": { cmd: "powershell.exe", args: [...PS, PS_CLAUDE_DESKTOP], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    vscode: { cmd: "powershell.exe", args: [...PS, PS_FILE(["$env:LocalAppData\\Programs\\Microsoft VS Code\\Code.exe", "$env:ProgramFiles\\Microsoft VS Code\\Code.exe", "\${env:ProgramFiles(x86)}\\Microsoft VS Code\\Code.exe"])], re: "^" + DOTTED, notInstalledRe: "^NOTFOUND" },
    "claude-code": { cmd: "claude", args: ["--version"], re: "^" + DOTTED },
    codex: { cmd: "cmd.exe", args: ["/d", "/c", "codex", "--version"], re: DOTTED, notInstalledExit: 9009 },
    ollama: { cmd: "ollama", args: ["--version"], re: "version is " + DOTTED },
    python: { cmd: "python", args: ["-I", "--version"], re: "^Python " + DOTTED },
    pip: { cmd: "python", args: ["-I", "-m", "pip", "--version"], re: "^pip " + DOTTED },
    certifi: { cmd: "python", args: ["-I", "-m", "pip", "show", "certifi"], re: "^Version:\\s*" + DOTTED },
    uv: { cmd: "uv", args: ["--version"], re: "^uv " + DOTTED },
    bun: { cmd: "bun", args: ["--version"], re: "^" + DOTTED },
    node: { internal: "node" },
    npm: { cmd: "cmd.exe", args: ["/d", "/c", "npm", "--version"], re: "^" + DOTTED, notInstalledExit: 9009 },
  },
  darwin: {
    macos: { cmd: "sw_vers", args: ["-productVersion"], re: "^" + DOTTED },
    chrome: { cmd: "defaults", args: ["read", "/Applications/Google Chrome.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    edge: { cmd: "defaults", args: ["read", "/Applications/Microsoft Edge.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    firefox: { cmd: "defaults", args: ["read", "/Applications/Firefox.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    tailscale: { cmd: "defaults", args: ["read", "/Applications/Tailscale.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    zoom: { cmd: "defaults", args: ["read", "/Applications/zoom.us.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    "claude-desktop": { cmd: "defaults", args: ["read", "/Applications/Claude.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    vscode: { cmd: "defaults", args: ["read", "/Applications/Visual Studio Code.app/Contents/Info.plist", "CFBundleShortVersionString"], re: "^" + DOTTED, notInstalledExit: 1 },
    "claude-code": { cmd: "claude", args: ["--version"], re: "^" + DOTTED },
    codex: { cmd: "codex", args: ["--version"], re: DOTTED },
    ollama: { cmd: "ollama", args: ["--version"], re: "version is " + DOTTED },
    python: { cmd: "python3", args: ["-I", "--version"], re: "^Python " + DOTTED },
    pip: { cmd: "python3", args: ["-I", "-m", "pip", "--version"], re: "^pip " + DOTTED },
    certifi: { cmd: "python3", args: ["-I", "-m", "pip", "show", "certifi"], re: "^Version:\\s*" + DOTTED },
    uv: { cmd: "uv", args: ["--version"], re: "^uv " + DOTTED },
    bun: { cmd: "bun", args: ["--version"], re: "^" + DOTTED },
    node: { internal: "node" },
    npm: { cmd: "npm", args: ["--version"], re: "^" + DOTTED },
  },
};

// 手元を調べない製品 (報告の「調べていない物」の 1 行に名前だけ出す・聞き返さない。本人 10/25 0:37「一つ質問といいながら一つじゃない」)
const ASK = new Set(["java", "wordpress", "mcp-sdk"]);

// 「やること」と「手で確かめる 1 手」は script が持つ (データからは取らない)
const STEPS = {
  windows: "設定 → Windows Update → 「更新プログラムのチェック」→ インストール → 再起動",
  macos: "システム設定 → 一般 → ソフトウェアアップデート",
  chrome: "右上の ︙ → ヘルプ → Google Chrome について → 「再起動」(3 分)",
  edge: "右上の … → ヘルプとフィードバック → Microsoft Edge について → 「再起動」",
  firefox: "右上の ≡ → ヘルプ → Firefox について → 更新を待って「再起動」",
  tailscale: "Tailscale のアイコン (Windows は画面右下・Mac は画面上のバー) を押して、更新の知らせが出ていればそこから入れる。出ない時は tailscale.com/download から新しい版を上から入れる (設定は残ります)",
  zoom: "Zoom を開いて、右上の自分の絵 → 「アップデートを確認」",
  "claude-desktop": "Claude のアプリを閉じて開き直す (自動で更新されます)。更新されない時は claude.ai/download の新しい版を入れ直す",
  vscode: "メニューの「ヘルプ」→「更新の確認」(Mac は「Code」→「更新の確認」)。出た更新を入れて再起動",
  bun: "「Bun を更新して」と言ってください (公式の手段を提案します)",
  node: "公式の配布ページ (nodejs.org) から該当の系統の最新版を入れ直す",
  python: "公式の配布ページ (python.org) から最新版を入れ直す",
  npm: "「npm を更新して」と言ってください (公式の手段を提案します)",
  pip: "「pip を更新して」と言ってください (公式の手段を提案します)",
  certifi: "「certifi を更新して」と言ってください (公式の手段を提案します)",
  uv: "「uv を更新して」と言ってください (公式の手段を提案します)",
  "claude-code": "「Claude Code を更新して」と言ってください (公式の手段を提案します)",
  codex: "「Codex を更新して」と言ってください (公式の手段を提案します)",
  ollama: "公式の配布ページ (ollama.com) から最新版を入れ直す",
};
const MANUAL = {
  windows: "設定 → Windows Update で「最新の状態です」と出るか見る",
  macos: "システム設定 → 一般 → ソフトウェアアップデートを見る",
  chrome: "Chrome の右上の ︙ → ヘルプ → Google Chrome について",
  edge: "Edge の右上の … → ヘルプとフィードバック → Microsoft Edge について",
  firefox: "Firefox の右上の ≡ → ヘルプ → Firefox について",
  tailscale: "Tailscale のアイコンを押して版を見る (またはターミナルで tailscale version)",
  zoom: "Zoom の右上の自分の絵 → 設定 → 一般 の下の方の「バージョン」",
  "claude-desktop": "Claude のアプリの設定 (または「Claude について」) で版を見る",
  vscode: "VS Code のメニューの「ヘルプ」→「バージョン情報」(Mac は「Code」→「Code について」)",
  bun: "AI との会話で版を聞くか、ターミナルで bun --version",
  node: "AI との会話で版を聞くか、ターミナルで node -v",
  npm: "AI との会話で版を聞くか、ターミナルで npm -v",
  python: "AI との会話で版を聞くか、ターミナルで python --version・Mac は python3 --version",
  pip: "AI との会話で版を聞くか、ターミナルで python -m pip --version",
  certifi: "AI との会話で版を聞くか、ターミナルで python -m pip show certifi",
  uv: "AI との会話で版を聞くか、ターミナルで uv --version",
  "claude-code": "AI との会話で版を聞くか、ターミナルで claude --version",
  codex: "AI との会話で版を聞くか、ターミナルで codex --version",
  ollama: "AI との会話で版を聞くか、ターミナルで ollama --version",
};
// 「比べられない」の理由が製品ごとに違う物 (script が持つ・データからは取らない)
const UNKNOWN_REASON = {
  macos: "この一覧に、この Mac の系統 (macOS 15 と 26 の外) と比べられる直った版が載っていないので、判定できません。システム設定 → 一般 → ソフトウェアアップデートで、出ている更新を確かめてください",
};
const GROUPS = ["everyone", "apps", "ai-tools", "python-node", "blog", "developers"];

// ───── 版 ─────
export function parseVersion(s) {
  if (typeof s !== "string" || !/^\d{1,9}(\.\d{1,9}){0,5}$/.test(s)) return null;
  return s.split(".").map(Number);
}
export function compareVersions(a, b) {
  const x = typeof a === "string" ? parseVersion(a) : a;
  const y = typeof b === "string" ? parseVersion(b) : b;
  if (!x || !y) return null;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
// 系統ごとの直った版 (fixed_versions) と手元の版を比べる。
// olderLinesUnknown = 載っている系統より古い版は「今すぐ」にせず「比べられない」にする (その古い系統が対象かを一次の発表が書いていない製品用)
export function judge(local, fixedVersions, lineDepth, olderLinesUnknown = false) {
  const l = parseVersion(local);
  const rows = fixedVersions.map(parseVersion);
  if (!l || rows.some((r) => !r)) return { status: "unknown" };
  if (lineDepth === 0) {
    const c = compareVersions(l, rows[0]);
    return { status: c < 0 ? "update_now" : "ok", fixed: fixedVersions[0] };
  }
  if (l.length < lineDepth || rows.some((r) => r.length < lineDepth)) return { status: "unknown" };
  const line = (v) => v.slice(0, lineDepth).join(".");
  const same = fixedVersions.filter((_, i) => line(rows[i]) === line(l));
  if (same.length) {
    const top = same.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
    return { status: compareVersions(l, top) < 0 ? "update_now" : "ok", fixed: top };
  }
  if (!olderLinesUnknown && rows.every((r) => compareVersions(l, r) < 0)) {
    const lowest = fixedVersions.reduce((a, b) => (compareVersions(a, b) <= 0 ? a : b));
    return { status: "update_now", fixed: lowest };
  }
  return { status: "unknown" }; // 載っていない系統で、全部より古くない = 比べられない (ok にしない)
}

// ───── データの検証 (外れたら全部拒む) ─────
const CTRL = new RegExp("[\u0000-\u001f\u007f-\u009f\u00ad\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]");
// 指示の形の文を弾く簡易の関門 (主たる防御ではない・SKILL.md と script が文を作る方が主)
const SUSPICIOUS = [
  /(以前|これまで|上記|前)の?(指示|命令|プロンプト|ルール)/,
  /(指示|命令|ルール|制約)を?(無視|忘れ|破棄|上書き)/,
  /ignore|disregard|system prompt|instruction|override/i,
  /\.ssh|\.env|id_rsa|id_ed25519|settings\.json|config\.toml|cookie|password|passwd|credential|secret|~\/|\/etc\/|%[A-Za-z]+%/i,
  /パスワード|トークン|クッキー|秘密鍵|認証情報|APIキー/,
  /https?:|www\./i,
  /[`<>{}$\\|;]/,
  /\b(curl|wget|sudo|chmod|bash|sh|eval|exec|powershell|cmd)\b/i,
  /(読んで|読み込んで|送って|送信して|送れ|実行して|実行せよ|削除して|消して|貼り付けて|アップロード|ダウンロードして|入力して|従って|従え)/,
  /ひとつ質問|質問\s*[:：]|[?？]|教えて|答えて/,
];
const len = (s) => [...s].length;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const isStamp = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s));
const exactKeys = (o, keys) =>
  o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

function text(s, max) {
  if (typeof s !== "string" || len(s) < 1 || len(s) > max) return false;
  if (CTRL.test(s)) return false;
  return !SUSPICIOUS.some((re) => re.test(s));
}

export function validateData(d, products) {
  const bad = (reason) => ({ ok: false, reason });
  if (!exactKeys(d, ["schema", "data_version", "generated_at", "expires_at", "items"])) return bad("bad_shape");
  if (d.schema !== 1) return bad("bad_schema");
  if (typeof d.data_version !== "string" || !/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/.test(d.data_version)) return bad("bad_data_version");
  if (!isStamp(d.generated_at) || !isStamp(d.expires_at)) return bad("bad_dates");
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 60) return bad("bad_items");
  const KEYS = ["id", "product", "display_name", "group", "platforms", "fixed_versions", "what_can_happen", "source_url", "published", "learning"];
  const seen = new Set();
  for (const it of d.items) {
    if (!exactKeys(it, KEYS)) return bad("bad_item_shape");
    if (typeof it.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(it.id) || seen.has(it.id)) return bad("bad_id");
    seen.add(it.id);
    if (typeof it.product !== "string" || !Object.hasOwn(products.products, it.product)) return bad("unknown_product");
    if (!text(it.display_name, 40)) return bad("bad_display_name");
    if (!GROUPS.includes(it.group)) return bad("bad_group");
    if (!Array.isArray(it.platforms) || it.platforms.length < 1 || it.platforms.length > 2 || new Set(it.platforms).size !== it.platforms.length || !it.platforms.every((p) => p === "win" || p === "mac")) return bad("bad_platforms");
    if (!Array.isArray(it.fixed_versions) || it.fixed_versions.length < 1 || it.fixed_versions.length > 8 || !it.fixed_versions.every((v) => parseVersion(v))) return bad("bad_fixed_versions");
    const depth = products.products[it.product].line_depth;
    if (depth === 0 && it.fixed_versions.length !== 1) return bad("bad_fixed_versions");
    if (depth > 0) {
      const parts = it.fixed_versions.map(parseVersion);
      if (parts.some((p) => p.length <= depth)) return bad("bad_fixed_versions");
      const lines = parts.map((p) => p.slice(0, depth).join("."));
      if (new Set(lines).size !== lines.length) return bad("bad_fixed_versions");
    }
    if (!text(it.what_can_happen, 80)) return bad("bad_what_can_happen");
    if (!text(it.learning, 60)) return bad("bad_learning");
    if (!isDate(it.published)) return bad("bad_published");
    if (!validSource(it.source_url, it.product, products)) return bad("bad_source_url");
  }
  return { ok: true };
}
function validSource(s, product, products) {
  if (typeof s !== "string" || s.length > 300 || !/^https:\/\/[A-Za-z0-9._~:/?#@&=+%,-]+$/.test(s)) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const p = products.products[product];
  const hosts = [...p.source_hosts, ...(products.common_source_hosts ?? [])];
  if (!hosts.includes(u.hostname)) return false;
  // github.com は誰でもリポを作れるので、製品ごとの公式のリポの前方一致を必須にする (正規化した後の href で見る)
  if (u.hostname === "github.com") return (p.source_prefixes ?? []).some((pre) => u.href.startsWith(pre));
  return true;
}

// ───── 子プロセス (唯一の spawn) ─────
export function spawnFixed(cmd, args, { cwd, env, timeoutMs, input } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    let child;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => {
      try { child?.kill(); child?.unref(); child?.stdout?.destroy(); } catch {}
      finish({ timedOut: true });
    }, timeoutMs);
    try {
      child = spawn(cmd, args, { cwd, env, shell: false, windowsHide: true, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"] });
    } catch (e) {
      return finish({ error: e.code || "SPAWN" });
    }
    child.on("error", (e) => finish({ error: e.code || "ERR" }));
    child.stdout.on("data", (b) => { if (out.length < MAX_OUT_BYTES) out += b.toString("utf8"); });
    child.on("close", (code) => finish({ code, stdout: out }));
    child.on("exit", (code) => setTimeout(() => finish({ code, stdout: out }), 300));
    if (input !== undefined) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (STRIP_ENV.includes(k.toUpperCase())) delete env[k]; // Ollama_Host なども外す
  return env;
}

// 1 つの命令を打って版の文字列だけを取る
export async function runProbe(spec, { cwd, env = cleanEnv(), timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  if (spec.internal === "node") return { state: "version", version: process.version.replace(/^v/, "") };
  const r = await spawnFixed(spec.cmd, spec.args, { cwd, env, timeoutMs });
  if (r.timedOut) return { state: "timeout" };
  if (r.error) return { state: r.error === "ENOENT" ? "not_installed" : "error" };
  const out = (r.stdout ?? "").trim();
  if (spec.notInstalledRe && new RegExp(spec.notInstalledRe).test(out)) return { state: "not_installed" };
  if (r.code !== 0) return { state: spec.notInstalledExit === r.code ? "not_installed" : "error" };
  const m = new RegExp(spec.re, "m").exec(out);
  if (!m || !m[1]) return { state: "error" };
  return { state: "version", version: m[1] };
}

// ───── 取得と署名 ─────
async function readLimited(res, max) {
  const chunks = [];
  let n = 0;
  for await (const c of res.body) {
    n += c.length;
    if (n > max) throw new Error("too_big");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function get(url) {
  const res = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json, text/plain" } });
  if (res.status !== 200) throw new Error("http_" + res.status);
  return readLimited(res, MAX_DATA_BYTES);
}
async function verifySignature(dataBuf, sigBuf, signersPath, env, keygen) {
  let signers;
  try { signers = await readFile(signersPath, "utf8"); } catch { return "signers_unreadable"; }
  if (signers.includes("<") || !/ssh-ed25519 AAAA/.test(signers)) return "signers_placeholder";
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), "seckit-"));
    const sigPath = join(dir, "data.sig");
    await writeFile(sigPath, sigBuf);
    const r = await spawnFixed(keygen, ["-Y", "verify", "-f", signersPath, "-I", VERIFY_IDENTITY, "-n", VERIFY_NAMESPACE, "-s", sigPath], { cwd: dir, env, timeoutMs: VERIFY_TIMEOUT_MS, input: dataBuf });
    if (r.error === "ENOENT") return "ssh_keygen_missing";
    if (r.timedOut || r.error) return "verify_failed";
    return r.code === 0 && /^Good /.test(r.stdout ?? "") ? null : "bad_signature";
  } catch {
    return "verify_failed";
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}); // 自分で作った一時フォルダだけ
  }
}
const dataVersionKey = (v) => { const [d, n] = v.split("."); return d + "." + String(n).padStart(3, "0"); };
const MAX_VALID_MS = 14 * 86_400_000;
// 日付の関門 (build_data.py と同じ: 作った日 ≦ 今・期限は作った日から 14 日以内)。署名の前 (tools/check_data.mjs) にも使う
export function checkDates(d, now) {
  const gen = Date.parse(d.generated_at);
  const exp = Date.parse(d.expires_at);
  if (gen > now + CLOCK_SKEW_MS || exp <= gen || exp - gen > MAX_VALID_MS) return "bad_dates";
  if (now >= exp) return "expired";
  return null;
}

// ───── 本体 ─────
export async function run(opts = {}) {
  const o = {
    dataUrl: DATA_URL, platform: process.platform, now: Date.now(), allowLoopback: false,
    signersPath: SIGNERS_PATH, productsPath: PRODUCTS_PATH, probes: PROBES, probeTimeoutMs: PROBE_TIMEOUT_MS,
    minDataVersion: MIN_DATA_VERSION, runProbe: null, sshKeygen: null, ...opts,
  };
  const fail = (reason) => ({ verified: false, reason });
  // NODE_OPTIONS / NODE_PATH は最初の node の起動前に効くので、script からは外せない → 検出して止める
  if ((process.env.NODE_OPTIONS ?? "") !== "" || (process.env.NODE_PATH ?? "") !== "") return fail("env_node");
  let u;
  try { u = new URL(o.dataUrl); } catch { return fail("no_data_url"); }
  if (!(u.protocol === "https:" || (o.allowLoopback && u.protocol === "http:" && u.hostname === "127.0.0.1"))) return fail("bad_data_url");

  let products;
  try { products = JSON.parse(await readFile(o.productsPath, "utf8")); } catch { return fail("products_unreadable"); }

  let dataBuf, sigBuf;
  try {
    dataBuf = await get(o.dataUrl);
    sigBuf = await get(o.dataUrl + ".sig");
  } catch { return fail("fetch_failed"); }

  const env = cleanEnv();
  if (!windowsDirOk(o.platform, o.systemRoot ?? process.env.SystemRoot)) return fail("windows_dir");
  const sigErr = await verifySignature(dataBuf, sigBuf, o.signersPath, env, o.sshKeygen ?? sshKeygenPath(o.platform));
  if (sigErr) return fail(sigErr);

  let data;
  try { data = JSON.parse(dataBuf.toString("utf8")); } catch { return fail("bad_json"); }
  const v = validateData(data, products);
  if (!v.ok) return fail(v.reason);

  const gen = Date.parse(data.generated_at);
  const dateErr = checkDates(data, o.now);
  if (dateErr) return fail(dateErr);
  if (dataVersionKey(data.data_version) < dataVersionKey(o.minDataVersion)) return fail("data_too_old");

  // C5: Windows・Mac 以外は何も調べられない → 「見つからなかった」と混ぜずに判定しない
  const platKey = o.platform === "win32" ? "win" : o.platform === "darwin" ? "mac" : null;
  if (!platKey) return fail("unsupported_os");
  const table = o.probes[o.platform] ?? {};
  let cwd;
  try {
    cwd = await mkdtemp(join(tmpdir(), "seckit-cwd-")); // 空の作業フォルダ (自分で作る)
    const seen = new Map(); // 同じ製品の項目が 2 つあっても、版を聞くのは 1 回
    const probe1 = o.runProbe ?? ((id) => runProbe(table[id], { cwd, env, timeoutMs: o.probeTimeoutMs }));
    const probe = (id) => { if (!seen.has(id)) seen.set(id, probe1(id)); return seen.get(id); };
    const items = await Promise.all(data.items.map(async (it) => {
      const base = { id: it.id, product: it.product, display_name: it.display_name, what_can_happen: it.what_can_happen, source_url: it.source_url, learning: it.learning, local_version: null, fixed_version: it.fixed_versions[0], how_to_check_manually: MANUAL[it.product] ?? null, checked: false };
      if (!it.platforms.includes(platKey)) return { ...base, status: "not_installed" };
      if (ASK.has(it.product)) return { ...base, status: "ask" };
      if (!Object.hasOwn(table, it.product)) return { ...base, status: "unknown" };
      const r = await probe(it.product); // ここから先 = この PC で版を調べた物 (checked)
      if (r.state === "not_installed") return { ...base, checked: true, status: "not_installed" };
      if (r.state !== "version") return { ...base, checked: true, status: "unknown" };
      const j = judge(r.version, it.fixed_versions, products.products[it.product].line_depth, products.products[it.product].older_lines_unknown === true);
      return { ...base, checked: true, local_version: r.version, status: j.status, fixed_version: j.fixed ?? base.fixed_version };
    }));
    const learnings = [];
    for (const it of [...items.filter((i) => i.status === "update_now"), ...items.filter((i) => i.status === "ok")]) {
      if (learnings.length < 3 && !learnings.includes(it.learning)) learnings.push(it.learning);
    }
    return {
      verified: true, data_version: data.data_version, generated_at: data.generated_at,
      data_age_days: Math.max(0, Math.floor((o.now - gen) / 86_400_000)), items, learnings,
    };
  } finally {
    if (cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {}); // 自分で作った一時フォルダだけ
  }
}

// ───── 報告の文 (AI は写すだけ) ─────
// 自由文の中の Markdown / HTML の記号を全角にする (画像の記法などが画面に出ないように)
const FULL = { "!": "！", "[": "［", "]": "］", "(": "（", ")": "）", "<": "＜", ">": "＞", "`": "｀" };
const safe = (s) => String(s).replace(/[!\[\]()<>`]/g, (c) => FULL[c]);

export function render(r) {
  if (!r.verified) {
    if (r.reason === "env_node") return "環境変数 NODE_OPTIONS (または NODE_PATH) が設定されているので判定しません。設定を外した状態で、もう一度実行してください。";
    if (r.reason === "data_too_old") return `古いデータです。ページを見てください: ${PAGE_URL}`;
    if (r.reason === "unsupported_os") return `この OS (Windows・Mac 以外) では判定しません。ページを直接見てください: ${PAGE_URL}`;
    return `データを確かめられなかったので今日は判定しません。ページを直接見てください: ${PAGE_URL}`;
  }
  const by = (s) => r.items.filter((i) => i.status === s);
  const now = by("update_now"), ok = by("ok"), none = by("not_installed"), unk = by("unknown"), ask = by("ask");
  const box = (title, lines) => `■ ${title}\n${lines.length ? lines.join("\n") : "   (なし)"}`;
  const L = [];
  L.push(`【${SKILL_LABEL}】 データの版 ${r.data_version} (${r.generated_at.slice(0, 10)} 作成・${r.data_age_days} 日前)`);
  // 「大丈夫」は使わない (PC 全体が安全と読めるため)。言うのは「見つかった物が直った版以上だった」ことだけ
  const rest = unk.length === 0 && ask.length === 0 && ok.length > 0 ? (now.length === 0 ? "見つかった物は、全部更新済みでした。" : "ほかに見つかった物は、更新済みでした。") : "";
  L.push(`今すぐやることは ${now.length} 件。調べられなかった物は ${unk.length} 件。` + rest);
  L.push("");
  L.push(box(`今すぐやること (${now.length})`, now.flatMap((i, n) => [
    ` ${n + 1}. ${safe(i.display_name)} — 今 ${i.local_version} / 直った版 ${i.fixed_version} 以上`,
    `    何が起きうる: ${safe(i.what_can_happen)}`,
    `    やること: ${STEPS[i.product] ?? "公式の更新手順に従う"}`,
    `    出典: ${i.source_url}`,
  ])));
  L.push(box(`更新済みだった物 (一覧の直った版以上) (${ok.length})`, ok.map((i) => `   ${safe(i.display_name)} (今 ${i.local_version})`)));
  L.push(box(`見つからなかった物 (入っていなければ関係ありません) (${none.length})`, none.length ? [...none.map((i) => `   ${safe(i.display_name)}`), "   (入っているはずの物があれば、ページの「自分で版を見る」で確かめてください)"] : []));
  L.push(box("学び: こういうことが起こりうる", r.learnings.map((t) => `   ・${safe(t)}`)));
  L.push(box(`調べられなかった物 (${unk.length})`, unk.flatMap((i) => [
    `   ${safe(i.display_name)} → ` + ((i.local_version && UNKNOWN_REASON[i.product]) || `${i.how_to_check_manually ?? "公式の画面で版を確かめ"}、直った版 ${i.fixed_version} 以上か見比べてください`),
  ])));
  const askNames = [...new Set(ask.map((i) => safe(i.display_name)))];
  if (askNames.length) L.push(`■ 調べていない物: ${askNames.join("・")} (使っている人は、ページで版を見比べてください)`);
  L.push("─");
  L.push("更新したら、もう一度「ソフト更新チェックして」で確かめられます。");
  L.push("このチェックのプログラムが外と通信するのは、データと署名の 2 つを取りに行く時だけで、結果を送る通信はしません。ただし、結果の文 (手元のソフトの版を含みます) は、いつもの AI との会話と同じく、あなたが使っている AI の会社のサーバーに送られます。");
  return L.join("\n");
}

// CLI: node check.mjs [--json]  (終了コード 0 = 判定した / 2 = 判定しない)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.slice(2).includes("--json");
  const r = await run();
  process.stdout.write((json ? JSON.stringify({ ...r, report: r.verified ? render(r) : undefined }) : render(r)) + "\n");
  process.exitCode = r.verified ? 0 : 2;
}
