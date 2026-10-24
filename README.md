# パソコンのソフト更新チェック

PC の Chrome・Windows など 17 のソフトについて、「今すぐ更新する物」が分かります。はなパパが個人で無料で配ります。

最初に 1 回だけ、準備の 2 行を貼れば、チェックできます。

## Claude Code の人

1. Claude Code に次の 1 行を貼って Enter

   ```
   /plugin marketplace add r68788hanapapa-sudo/pc-update-check#v1.0.5
   ```

2. 続けて次の 1 行を貼って Enter (出た画面は、自分用に入れる「user」と書いてある一番上を選んで Enter)

   ```
   /plugin install pc-update-check@hanapapa-sec-kit
   ```

3. 「ソフト更新チェックして」と言う。「Use skill …?」と聞かれたら 1 (Yes)

## Codex の人

黒い画面 (端末) に貼ります。

1. 次の 1 行を貼って Enter

   ```
   codex plugin marketplace add r68788hanapapa-sudo/pc-update-check --ref 7de59f738ac652a04d214ea59f23d9f45da36953
   ```

2. 続けて次の 1 行を貼って Enter

   ```
   codex plugin add pc-update-check@hanapapa-sec-kit
   ```

3. チェックは、Windows (PowerShell) の人は次の 1 行を貼って Enter

   ```
   $env:NODE_OPTIONS=$null; $env:NODE_PATH=$null; $d=(Get-ChildItem -ErrorAction SilentlyContinue "$HOME\.codex\plugins\cache\hanapapa-sec-kit\pc-update-check" | Sort-Object { [version]$_.Name } | Select-Object -Last 1).FullName; if ($d) { node "$d\skills\pc-update-check\scripts\check.mjs" } else { Write-Output "Codex に入れた物が見つかりません (Codex に入れる最初の 2 行を先に貼ってください)" }
   ```

## どちらも使っていない人

ページの「AI の道具が無い人」の 3 つ。何も入れずに、今日できます。

https://hanapapa-pc-update-check.pages.dev/

## 注意

一覧は出典を確かめながら作りましたが、当てはまるかは人によって違います。更新だけでなく、使うのをやめる・より安全な方法に替えることも含めて、最後はご自身で判断してください。

---

**ここから下は、くわしい人向けです。使うだけなら、読まなくて大丈夫です。**

## 入れ方のしくみ

- Claude Code・Codex が公式に持っている「プラグイン」の入れ方を使います。この置き場が marketplace (`hanapapa-sec-kit`) で、中のプラグインが `pc-update-check` です。入れる時は人が貼るだけで、AI は何も打ちません。
- 版の固定: Claude Code はタグ (`#v1.0.5`)、Codex は commit (40 字) で固定して入れます。この置き場の main と `v*` のタグは、消したり書き換えたりできない設定です。
- 更新: Claude Code は、第三者の置き場の自動更新が初めからオフです (公式の説明)。新しい版は、はなパパの投稿でお知らせします。

## チェックの時に動く物

- 本体は `plugins/pc-update-check/skills/pc-update-check/scripts/check.mjs` を Node (18 以上) で動かす、決まった 1 つの命令です。
  - bash: `env -u NODE_OPTIONS -u NODE_PATH node "<入った場所>/scripts/check.mjs"`
  - PowerShell: `$env:NODE_OPTIONS=$null; $env:NODE_PATH=$null; node "<入った場所>/scripts/check.mjs"`
- Claude Code: スキルの許可 (`allowed-tools`) に上の形だけを `*` 無しで書いてあるので、聞かれずに動きます。ほかの命令は、ふつうどおり聞かれます。聞かれるのは「Use skill …?」の 1 回だけのはずです。それ以外の命令を聞かれたら「いいえ」にしてください。
- Codex: 作り手が試した設定では、守りのために通信が止まりました。そのため、チェックは自分の端末で動かします (上の「Codex の人」の 3)。
- check.mjs がすること: ページから署名つきの一覧 (`data/advisories.json` と `.sig`) を GET で取り、同梱の `allowed_signers` で署名を確かめ (`ssh-keygen -Y verify`・固定の絶対パス)、有効期限の内なら、この PC の対象のソフトの版を読んで比べ、報告を出します。署名が合わない・期限が切れている時は判定しません。
- 署名の鍵の指紋: `SHA256:CoKntGMgDGUUH34SYFRq+u/U85XtD9sgBpuzhkG9HL0` (一覧の版と有効期限は、ページの「この一覧の版と、署名の鍵」に出ます)

## 手で入れる (zip)

プラグインの入れ方がうまくいかない人向けに、ページで zip も配っています (`pc-update-check-1.0.5.zip`・sha256 `494087b32edcc2adeebc5d4f91284b0051e2200ffd2233703d100fd8cd6f13f9`)。入れる前に、署名を確かめてください。

- Mac: `/usr/bin/ssh-keygen -Y verify -f allowed_signers -I sec-kit@hanapapa -n sec-kit -s pc-update-check-1.0.5.zip.sig < pc-update-check-1.0.5.zip`
- Windows (PowerShell): `C:\Windows\System32\cmd.exe /d /c "C:\Windows\System32\OpenSSH\ssh-keygen.exe -Y verify -f allowed_signers -I sec-kit@hanapapa -n sec-kit -s pc-update-check-1.0.5.zip.sig < pc-update-check-1.0.5.zip"`

「Good "sec-kit" signature」と出なければ、入れないでください。展開してできた `pc-update-check` のフォルダを `~/.claude/skills/` (Claude Code) か `~/.agents/skills/` (Codex) に置きます。

## 免責

本ツールは、個人が作成したセキュリティチェックを配布するものです。各利用者の環境について、安全を保証するものではありません。
