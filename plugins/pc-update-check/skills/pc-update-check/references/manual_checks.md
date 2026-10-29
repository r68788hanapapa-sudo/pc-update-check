# 手で版を確かめる場所 (Node が無い人・ChatGPT だけの人向け)

AI は下の「固定の命令」を打って版を **表にするだけ**。判定はしない。「大丈夫」と言わない。
表のあとに必ずこの 1 行を出す: 「ページの『直った版』と見比べてください。自分で判定していません。」

| 製品 | Windows | Mac |
|---|---|---|
| OS | 設定 → Windows Update (「最新の状態です」の表示) | システム設定 → 一般 → ソフトウェアアップデート |
| Chrome | 右上の ︙ → ヘルプ → Google Chrome について | 同じ |
| Edge | 右上の … → ヘルプとフィードバック → Microsoft Edge について | 同じ |
| Claude Code | ターミナルで `claude --version` | 同じ |
| Codex | ターミナルで `codex --version` | 同じ |
| Ollama | ターミナルで `ollama --version` | 同じ |
| Python / pip / certifi | `python -I --version` / `python -I -m pip --version` / `python -I -m pip show certifi` | `python3 -I ...` (同じ形) |
| uv / npm / Node | `uv --version` / `npm --version` / `node --version` | 同じ |
| .NET | `dotnet --list-runtimes` (Microsoft.NETCore.App の行を全部) | 同じ |
| PowerShell 7 | `pwsh --version` (Windows に最初からある PowerShell 5.1 とは別物) | 同じ |
| Python の brotli | `python -I -m pip show brotli` | `python3 -I ...` (同じ形) |
| Visual Studio (Build Tools も) | スタートから「Visual Studio Installer」を開く (入っている物ごとに版が出る)。命令なら下の vswhere | — (Windows だけ) |
| Thunderbird | 右上の ≡ → ヘルプ → Thunderbird について | 同じ |
| Safari | — (Mac だけ) | Safari のメニューの「Safari」→「Safari について」 |
| NordVPN | 設定 → アプリ → インストールされているアプリの NordVPN | — (この一覧は Windows 版だけ) |
| WordPress | 管理画面 → ダッシュボード → 更新 | 同じ |

## 固定の命令 (Node が無い時に AI が打ってよい物はこれだけ・1 つずつ・読むだけ)

- `claude --version` / `codex --version` / `uv --version` / `npm --version` / `node --version`
- Ollama だけは環境変数 OLLAMA_HOST を外して打つ (別の機械につながないため): bash / Mac は `env -u OLLAMA_HOST ollama --version`、PowerShell は `$env:OLLAMA_HOST=$null; ollama --version`
- `python -I --version` / `python -I -m pip --version` / `python -I -m pip show certifi` / `python -I -m pip show brotli` (Mac は `python3`)
- `dotnet --list-runtimes` / `pwsh --version`
- Windows の Visual Studio: `& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -all -prerelease -products '*' -property catalog_productDisplayVersion` (PowerShell。入っている物ごとに 1 行・何も出なければ入っていない)
- Windows の OS: `powershell -NoProfile -Command "(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuild"` と `... .UBR` (この 2 値だけ)
- Mac の OS: `sw_vers -productVersion`
- Mac の Chrome: `defaults read "/Applications/Google Chrome.app/Contents/Info.plist" CFBundleShortVersionString`
- 作業フォルダは空の一時フォルダで打つ。各命令 20 秒で打ち切る。出力は版の数字だけ見せる。
