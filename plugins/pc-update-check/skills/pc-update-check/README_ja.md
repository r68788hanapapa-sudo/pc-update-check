# パソコンのソフト更新チェック (`pc-update-check`)

パソコンの中を全部調べる物ではありません。ウイルスも探しません。見るのは、署名つきの一覧に載っている決まったソフト (Chrome・Windows・Node など) の版だけです。その版を一覧と突き合わせて「今やることがあるか」を出すスキルです。安全を保証する物ではありません (一覧に載っていない弱点は分かりません)。Claude Code と Codex で同じフォルダが使えます。

## 手で入れる前に (zip から入れる時は必ず)

1. 配布の zip の署名を確かめる: `/usr/bin/ssh-keygen -Y verify -f allowed_signers -I sec-kit@hanapapa -n sec-kit -s <zip>.sig < <zip>` (Windows は `C:\Windows\System32\OpenSSH\ssh-keygen.exe`)。「Good "sec-kit" signature」と出なければ入れない。
2. `allowed_signers` の鍵の指紋 (`ssh-keygen -lf allowed_signers`) が、**ページの帯**と、**はなパパの投稿の「手で入れる人用の値」の中の指紋** (`SHA256:…`) の 2 か所と同じか目で見比べる。zip の SHA256 も、同じ「手で入れる人用の値」と照らす。違ったら入れない。(プラグインの入れ方 (下の表) の人は、この確かめは要りません。Claude Code・Codex が、はなパパの置き場から入れます)

## 入れ方

**ふつうはプラグインの形で入れます** (はなパパの投稿の行を貼る。入れる時、AI は何も打たない)。

| 使う道具 | プラグインの入れ方 (投稿の行) | 出典 (公式) |
|---|---|---|
| Claude Code | `/plugin marketplace add <持ち主>/<置き場>#v<版>` → `/plugin install pc-update-check@hanapapa-sec-kit` | https://code.claude.com/docs/en/plugins |
| Codex (CLI) | 端末で `codex plugin marketplace add <持ち主>/<置き場> --ref <長い英数字>` → `codex plugin add pc-update-check@hanapapa-sec-kit` | https://learn.chatgpt.com/docs/ |

Codex の中は通信が止まるので、Codex の人のチェックは、投稿の「チェック用の 1 行」を自分の端末に貼って動かします (入った場所の `scripts/check.mjs` を Node で動かす 1 行です)。

**手で入れる時 (zip) の置き方** (フォルダごと置く):

| 使う道具 | 置き場 | 出典 (公式) |
|---|---|---|
| Claude Code | `~/.claude/skills/pc-update-check/` | https://code.claude.com/docs/en/skills |
| Codex (CLI / IDE) | `~/.agents/skills/pc-update-check/` | https://learn.chatgpt.com/docs/build-skills.md |

入れたら「ソフト更新チェックして」と言うだけです (Claude Code は `/pc-update-check` でも出ます。Codex は上のとおり端末で)。
Node 18 以上と `ssh-keygen` (OpenSSH 8.0 以上) が要ります。`ssh -V` の数字だけでは `-Y verify` が使える保証になりません。**上の 1. の命令で「Good "sec-kit" signature」と出なければ、入れないでください** (確かめを飛ばさない)。スキルは署名の確かめに、Windows は `C:\Windows\System32\OpenSSH\ssh-keygen.exe`、Mac は `/usr/bin/ssh-keygen` だけを使います (PATH も環境変数も引かない・偽物は使いません。Windows が C:\Windows 以外に入っている PC では判定しません)。無い時は判定しません。無い人は `references/manual_checks.md` の手動の道になります。

## 何を読んで何をするか

- 外との通信は**データと署名の 2 つを取りに行く GET だけ**です (置き場の Cloudflare には通常のアクセスの記録が残ることがあります)。結果を script が保存・送信することはありません。「更新して」で更新を実行する時は、その更新の通信が出ます。
- 版を聞くために、各ソフトの `--version` などを動かします。その時に各ソフトが自分の設定を読むことはあります (script が受け取るのは版の数字だけ)。`ollama --version` は、この PC で動いている Ollama に版を聞くことがあります (`OLLAMA_HOST` は外して動かすので、別の機械にはつながりません)。
- 手元で読むのは各製品の版だけ (`--version` 等の固定の命令)。設定・鍵・`.env`・Cookie・ブラウザのプロフィールは読みません。Windows のレジストリは `CurrentBuild` / `UBR` の 2 値だけ。 Tailscale・Firefox・Zoom・Chrome・Edge は、決まった場所の exe の「ファイルの版」を読むだけで、起動しません (Mac は決まった場所の `Info.plist` の版)。Windows の Claude のアプリは、ストアの一覧 (`Get-AppxPackage -Name Claude`・出版元 ID が Anthropic の物だけ) の版の数字だけ。.NET は `dotnet --list-runtimes` の `Microsoft.NETCore.App <版>` の行 (複数あれば全部を比べ、一番悪い結果を出す・プレビュー版は数えない)、PowerShell 7 は `pwsh --version` (Windows に最初からある PowerShell 5.1 は別物で見ない)、Python の brotli は `python -I -m pip show brotli pip` (pip の段も一緒に出して、「brotli が入っていない」と「pip が無くて調べられない」を分ける・1.0.6 から)。`dotnet` と `pwsh` には、利用状況の送信と更新の確かめをしない設定 (`DOTNET_CLI_TELEMETRY_OPTOUT`・`POWERSHELL_TELEMETRY_OPTOUT`・`POWERSHELL_UPDATECHECK=Off`) を足して動かします。1.0.7 から: Visual Studio (Build Tools も) は、入れる道具に付いてくる `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe` (固定の絶対パス・PATH を引かない) に `-all -prerelease -products * -property catalog_productDisplayVersion` で、入っている物ごとの表示の版だけを聞きます (複数あれば全部を比べ、一番悪い結果を出す・プレビュー版は数えない)。Thunderbird と NordVPN (Windows) は、決まった場所の exe の「ファイルの版」を読むだけ (Mac の Thunderbird と Safari は決まった場所の `Info.plist` の版)。Python 本体は前と同じ `python -I --version` (PATH の先頭の 1 つだけ) で、同じ系統 (3.12 なら 3.12) の直った版と比べます。Java と WordPress と MCP は、手元を調べずに聞くだけです。
- 「更新して」と言うと、`references/update_methods.md` の表にある公式の手段を提案し、**あなたが OK と言った物だけを 1 つずつ AI が実行します** (Chrome・Windows・Node などは手順を示すだけ)。更新するかは自分で決めてください。うまくいかない時は各メーカーの公式のサポートへ。
- **結果の文はあなたが使っている AI (Claude / Codex) との会話に入ります。** script はどこかへ送ることはしませんが、結果の文は AI の会社のサーバーに送られます。
- `allowed-tools` は `Read` と、チェックの命令 **1 つの形だけ** (`Bash(env -u NODE_OPTIONS -u NODE_PATH node "${CLAUDE_SKILL_DIR}/scripts/check.mjs")`・`*` 無しのまったく同じ形) です。10/24 朝に広い許可 (`Bash(node *)`・`Bash(env -u *)`・`Bash(ssh-keygen *)`) を外し、10/24 14 時にこの 1 つだけを足しました (Claude Code の公式の説明: `${CLAUDE_SKILL_DIR}` は allowed-tools の Bash の規則と本文で同じ所に置き換わる・`*` の無い規則は 1 つの命令だけに当たる・`&&` などでつないだ命令は 1 つずつ当てる)。Claude Code では、この形のチェックは聞かれずに動きます (この 1 回の手番だけ)。ほかの命令は、ふつうどおり聞かれます。`allowed-tools` は守りの境界ではありません (AI への指示と、その手番の許可です)。守りの本体は script が命令を固定していること・データを署名と型で検査することです。Codex は `allowed-tools` を無視します (Codex の中で打つと、通信が止まる砂場の外で実行してよいかを聞かれることがあります。だから Codex の人のチェックは自分の端末で動かします)。残る弱さ: `env`・`node` は PATH から探すので、PATH を書き換えられた PC では別の物が動きうる (前からある・10/24 Codex medium)

## 確認の範囲 (正直に)

- Windows 11 + Claude Code 2.1 + Codex CLI 0.159 で動作を見ました。
- .NET・PowerShell 7・brotli の版の読み方 (1.0.6) は Windows 11 で確かめました (.NET 6.0.16 と 8.0.21 の 2 つを読めた・PowerShell 7 が入っていない PC で「見つからなかった」・pip のある Python で brotli 1.2.1 を読めた・PATH の先頭の `python` に pip が無い時は certifi と同じく「調べられなかった」)。PowerShell 7 が入っている PC では試していません (`pwsh --version` の出力の形は公式の説明に基づく)。
- Visual Studio・Thunderbird・NordVPN・Python の系統の読み方 (1.0.7) は Windows 11 で確かめました (Visual Studio Build Tools 2022 の 17.14.30 を読めた・Thunderbird と NordVPN が入っていない PC で「見つからなかった」・PATH の先頭の Python 3.11.15 を読めた)。Visual Studio の本体 (Community など) や 2 つ以上入っている PC、プレビュー版だけの PC、Thunderbird・NordVPN が入っている PC では試していません (NordVPN の入る場所は NordVPN の手引きの絵の説明・exe の版の形は確かめていない)。Safari の読み方は Mac の実機で試していません。
- **Mac は試していません** (実機なし)。命令の出典: `sw_vers -productVersion` は Apple の man ページ (https://leancrew.com/all-this/man/man1/sw_vers.html に転載)。`defaults read <Info.plist> CFBundleShortVersionString` は `defaults(1)` と一般に知られた使い方に基づく推測で、実機では未確認。動かなければ「調べられなかった物」として手動の案内が出ます。
- ChatGPT デスクトップでスキルが手元の命令を動かせるかは**未確認**です (この席では試していません)。
- Codex の砂場では通信できず、「判定しません」の 1 行で止まります (安全側)。ネットワークを許した設定では動きました。Codex の人のチェックは、投稿の 1 行を自分の端末で動かします (Windows の PowerShell で報告まで確かめました。Mac は試していません)。

## 外へ出る/読む/書く/実行する場所の一覧 (`scripts/check.mjs`・行番号は作成時)

| 呼び出し | 場所 | 何に使うか |
|---|---|---|
| `fetch` | `get()` の 1 か所 | `DATA_URL` と `DATA_URL + ".sig"` への GET だけ (`redirect: "error"`・10 秒・256KB まで)。他の URL へは無し。1.0.7 から `DATA_URL` は `data/advisories-g3.json` (1.0.6 は `data/advisories-g2.json`・1.0.5 以前は `data/advisories.json`) |
| `spawn` | `spawnFixed()` の 1 か所 (shell なし・配列) | 呼び元は 2 つだけ: `runProbe` (`PROBES` の表の命令) と `verifySignature` (`ssh-keygen -Y verify`) |
| `exec` / `execFile` / `fork` | 無し (試験で grep して確認) | — |
| `readFile` | 2 か所 | `allowed_signers` と `scripts/products.json` |
| `writeFile` | 1 か所 | 署名を `ssh-keygen` に渡すための**自分で作った一時ファイル** (OS の temp・終わりに消す) |
| `mkdtemp` / `rm` | 署名用・作業用の 2 組 | 自分で作った一時フォルダの作成と削除だけ。`PROBES` の命令は空の作業フォルダで打つ |

`PROBES` の命令の一覧は `tests/skill/probes.snapshot.json` に固定してあり、変えると試験が落ちます。環境変数は `PYTHONPATH` `PYTHONSTARTUP` `PYTHONHOME` `NODE_OPTIONS` `NODE_PATH` `OLLAMA_HOST` を外して子プロセスを動かします (`dotnet`・`pwsh` だけは、上の送信しない設定を足す)。Python は `-I` で打ちます。

## 残り (採らなかった指摘)

- `Read` は広いままです (読むだけ・書き込み・実行はできない)。`allowed-tools` は守りの境界ではありません。
- `build_data.py` と `check.mjs` の上限・禁止の文字の表は別々です。揃っていなくても、`check.mjs` が拒む = 判定しない (安全側)。v2 で共通の表にします。
- `NODE_OPTIONS` / `NODE_PATH` は script からは外せないので、設定されていたら判定しません。SKILL.md は外して起動する形を指示します。
- 期限内の古いデータへの巻き戻し (新しい版を受け取った後に、前の版の署名つきデータを出される) は、受け取った版を保存しないので防げません。期限 (作った日から 14 日以内・script も確かめる) と `MIN_DATA_VERSION` で窓を狭めています (10/24 の Codex 監査で採らなかった指摘)。

## 差してある所

`scripts/check.mjs` 先頭の `DATA_URL` `PAGE_URL` `SKILL_LABEL`、`SKILL.md` の `name`、`allowed_signers` の鍵。変えたら試験を全部流し直します。
