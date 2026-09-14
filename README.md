# THE INVADER ATTACK — ランキング機能

LaragonのPHPとMySQLで、1プレイごとの撃破数と出撃時に選んだ2つの武器を保存します。

## このPCですぐ起動する

1. LaragonでMySQLを起動します。
2. このプロジェクトでPowerShellを開き、次を実行します。

```powershell
.\scripts\start-local.ps1
```

3. `http://127.0.0.1:8080/` を開きます。紹介ページは `http://127.0.0.1:8080/game_portal.html` です。

スクリプトはPATH、次に `C:\laragon\bin\php` からPHPを探し、DB・テーブルを作成して開発サーバーを起動します。既存の記録は保持されます。終了はCtrl+Cです。

ポートが使用中の場合は `-Port 8081`、PHPが別の場所にある場合は `-PhpPath 'D:\laragon\bin\php\バージョン\php.exe'` を指定してください。

## LaragonのApacheから利用する場合

プロジェクト一式をLaragonの公開フォルダー（標準: `C:\laragon\www\Web_Kadai`）に配置します。Laragon Terminalでプロジェクトに移動し、`php scripts/setup-db.php` を実行してください。ApacheとMySQLを起動し、`http://localhost/Web_Kadai/` から開けます。

HTMLファイルの直接起動やGitHub PagesだけではPHPのAPIは動作しません。ゲームとAPIを同じサーバーから配信してください。

## DB接続設定

初期値は `127.0.0.1:3306`、DB名 `invader_attack`、ユーザー `root`、パスワード空欄（Laragonのローカル初期設定）です。

異なる場合は `api/config.local.example.php` を `api/config.local.php` にコピーして変更します。この個別設定はGit管理対象外です。環境変数 `INVADER_DB_HOST`、`INVADER_DB_PORT`、`INVADER_DB_NAME`、`INVADER_DB_USER`、`INVADER_DB_PASSWORD` でも指定できます。個別設定ファイルの値が優先されます。

## 操作・記録ルール

- タイトル・結果画面の「ランキング」または **L** で上位10件を表示します。
- ランキングの **R** は更新、**Enter / Esc** は元の画面へ戻ります。
- クリア・敗北時に自動保存します。結果画面に撃破数、武器2つ、保存状態を表示します。
- 保存失敗時は結果画面の「保存を再試行」または **R** で再送します。同じプレイは重複保存されません。
- ポーズからタイトルへ戻る途中終了は保存しません。
- 撃破数は既存仕様を維持し、自爆した通常敵を含み、ボスは含みません。
- 同じ撃破数は同順位（1位、1位、3位）です。同点内は登録順で、最大10件を表示します。
- 緑色の行は今回の保存済み記録です。プレイヤー名・アカウントは保存しません。
- 通信中にタイトルへ戻っても保存処理は継続します。未保存のままページを閉じる・再読み込みする・次の出撃を始めると、再試行用の結果は引き継がれません。

## ファイル構成

- `index.html`: ゲーム、終了処理、結果・ランキングのCanvas描画
- `ranking.js`: 出撃時の装備記録、API通信、再試行・表示状態の管理
- `api/save_result.php`: JSONによる保存。型・武器IDを検証しPDOで登録
- `api/rankings.php`: 撃破数順の上位10件をJSONで返却
- `api/weapons.json`: 固定武器IDと日本語表示名の対応
- `database/schema.sql`: 保存用テーブル定義
- `scripts/setup-db.php`: CLI専用のDB初期化。既存データを削除しない

武器の並べ替えでもIDは変更しないでください。武器を追加・改名した場合は、ゲーム側の設定と `api/weapons.json` の両方を更新します。

## 確認コマンド

Node.jsとPHPがPATHにあるLaragon Terminalで、プロジェクトを開いて実行します。

```powershell
node --test tests/ranking-client.test.cjs
node tests/api.test.cjs php
```

APIテストは専用の一時MySQLデータベースを作成し、テスト終了時にそのDBだけを削除します。DB作成・削除権限が必要です。`config.local.php`でdatabaseを固定している場合は、実データ保護のためテストは停止します。

この実装はローカルでの利用を想定しています。ブラウザが申告した撃破数の型・範囲は検証しますが、実際にその数を倒したかの検証は行いません。公開の競技ランキングにする場合は、別途サーバー側のプレイ検証が必要です。
