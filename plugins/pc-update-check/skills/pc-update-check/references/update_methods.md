# 更新の手段の表 (この表にある物だけを提案する・表に無い物は実行しない)

「実行」列が「OK の後に実行」の行だけ、その人の OK をもらってから **1 つずつ** 実行する。それ以外は **開く / 示すだけ**。
提案の言い方: 「<製品> を更新する手段は <手段> です。実行してよいですか?」 → 返事が OK の時だけ 1 つ実行 → 結果を見せる → 次の製品の OK を聞く。
複数をまとめて実行しない。`sudo` / 管理者権限を求める手段は出さない。

| 製品 (id) | 公式の手段 | 実行 |
|---|---|---|
| claude-code | `claude update` (native 版)。npm で入れた人は `npm i -g @anthropic-ai/claude-code` | OK の後に実行 |
| codex | npm で入れた人: `npm i -g @openai/codex@latest`。それ以外は公式の配布先 https://github.com/openai/codex を開く | npm の時だけ OK の後に実行 |
| pip | `python -I -m pip install --upgrade pip` (Mac は python3・ホームのフォルダで打つ) | OK の後に実行 |
| certifi | `python -I -m pip install --upgrade certifi` (Mac は python3・ホームのフォルダで打つ) | OK の後に実行 |
| uv | `uv self update` | OK の後に実行 |
| npm | `npm i -g npm@latest` | OK の後に実行 |
| chrome | Chrome の右上の ︙ → ヘルプ → Google Chrome について → 「再起動」 | 示すだけ (その人が手で) |
| edge | Edge の右上の … → ヘルプとフィードバック → Microsoft Edge について → 「再起動」 | 示すだけ |
| windows | `ms-settings:windowsupdate` (設定の Windows Update) | 示すだけ |
| macos | システム設定 → 一般 → ソフトウェアアップデート | 示すだけ |
| firefox | Firefox の右上の ≡ → ヘルプ → Firefox について → 更新を待って「再起動」 | 示すだけ |
| tailscale | Tailscale のアイコン (Windows は画面右下・Mac は上のバー) を押して、更新の知らせが出ていればそこから入れる。出ない時は https://tailscale.com/download の新しい版を入れ直す (管理者の許可が要ることがある) | 示すだけ (その人が手で) |
| zoom | Zoom を開いて、右上の自分の絵 → 「アップデートを確認」 | 示すだけ |
| claude-desktop | Claude のアプリを閉じて開き直す (自動で更新されます)。更新されない時は https://claude.ai/download の新しい版を入れ直す | 示すだけ |
| vscode | メニューの「ヘルプ」→「更新の確認」(Mac は「Code」→「更新の確認」)。出た更新を入れて再起動 | 示すだけ |
| bun | `bun upgrade` | OK の後に実行 |
| java | 入れた会社 (配布元) の 2026-10-21 以降の更新を入れる。配布元ごとに手順が違うので、配布元の案内を開く | 示すだけ (聞くだけの項目・版は調べない) |
| node | https://nodejs.org/ の配布ページを開く (該当の系統の最新版) | 示すだけ (インストーラはその人が手で) |
| python | https://www.python.org/downloads/ を開く | 示すだけ |
| ollama | https://ollama.com/download を開く | 示すだけ |
| wordpress | 管理画面の「ダッシュボード → 更新」 | 示すだけ |
| mcp-sdk | 自分のプログラムの依存の版を、ページの項目と見比べる | 示すだけ |
| dotnet | https://dotnet.microsoft.com/download を開く (同じ系統 = 先頭の数字が同じ物の新しい版。.NET 6・7 はサポートが終わっていて直った版が出ないので、10 などサポート中の系統へ。古い版を使うアプリは作った会社に確かめる) | 示すだけ (インストーラはその人が手で・管理者の許可が要ることがある) |
| powershell | https://aka.ms/Get-PowerShell の案内を開く (同じ系統 7.4・7.5・7.6 の新しい版。Microsoft Store から入れた人はストアで更新。7.3 以前はサポートが終わっていて直った版が出ない) | 示すだけ (その人が手で) |
| brotli | `python -I -m pip install --upgrade brotli` (Mac は python3・ホームのフォルダで打つ) | OK の後に実行 |

- 出典 (公式): Claude Code https://code.claude.com/docs/en/setup / Codex https://github.com/openai/codex / pip https://pip.pypa.io/ / uv https://docs.astral.sh/uv/ / npm https://docs.npmjs.com/ / Bun https://bun.sh/docs/installation / Tailscale https://tailscale.com/download — 手段の文面は作った日 (2026-10-23) の記憶と上記の公式ページに基づく (Tailscale・Firefox・Zoom・Claude のアプリの手順は画面の操作の記憶で、Mac は試していません)。変わっていたら公式を優先する。
- .NET・PowerShell 7・brotli (2026-10-28 に足した): PowerShell 7 の手段は勧告 (https://github.com/PowerShell/Announcements の CVE-2026-111497) の「Follow the instructions at Installing PowerShell 7 (https://aka.ms/Get-PowerShell)」に基づく。.NET の配布ページは dotnet.microsoft.com (勧告 https://github.com/dotnet/announcements/issues/494 の版の表と同じ系統)。サポートの終わりは .NET の releases-index.json (6.0 は 2024-11-12・7.0 は 2024-05-14) と PowerShell の support lifecycle (7.3 は 2024-05-08)。brotli は certifi と同じ pip の形。
- 表に無い物 (別のパッケージ・ブラウザ拡張・知らない配布元) は提案も実行もしない。
