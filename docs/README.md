# 開発資料

現在の機能・起動・検証・配信は [プロジェクトREADME](../README.md) を参照する。

## 現行の仕様と制作手順

- [3Dガイドの仕様・取り込み](ASSEMBLIES.md)：登録データ、表示用設定、共通ビューアー、進捗保存。
- [写真から3Dガイドを作る手順](AI-3D-WORKFLOW.md)：制作室での修正・確認・出力。
- [No.5の形状と接続位置](NO5-GEOMETRY.md)：部品形状と配置の判断根拠。

## 作品ごとの制作記録

| 作品 | 制作記録 | 振り返り |
|---|---|---|
| ジャローダ | [制作記録](JARODA-3D.md) | [振り返り](JARODA-RETROSPECTIVE.md) |
| デスカーン | [制作と修正の記録](DESUKAN-RETROSPECTIVE.md) | 同左 |
| イワパレス | [制作記録と振り返り](IWAPARESU-3D.md) | 同左 |
| ネギガナイト | [制作記録](NEGIGANAITO-3D.md) | [振り返り](NEGIGANAITO-RETROSPECTIVE.md) |

メタモンの取り込み設定は [3Dガイドの仕様](ASSEMBLIES.md) に記載する。
作品ごとの原本・承認履歴は制作記録からたどる。完成原本を初回候補の生成器で上書きしない。

## 過去の作業・引き継ぎ

以下は判断の経緯を残す履歴。記載された未完了タスクや公開状態を、現在の状態として扱わない。

- [初期開発とレビューの作業ログ](00-worklog.md)
- [初期開発時のCodex引き継ぎ](01-codex-handoff.md)
- [2026-09-13までの3D制作引き継ぎ](laq-3d-handoff.md)

## ローカルファイルの用途

| 場所 | 用途 |
|---|---|
| `src/data/sources/` | 取り込みスクリプトが生成する作品索引。手編集しない。 |
| `public/assemblies/` | 配信用ガイド、共通描画コード、Three.jsとライセンス。 |
| `content/assemblies/` | 従来のプロトタイプ取り込み用の表示設定。 |
| `.local/assembly-work/` | 写真、完成原本、レビュー履歴。容量だけで削除しない。 |
| `.cache/` | 取り込み元のキャッシュ。保持することで再取得を減らす。 |
| `dist/`、`test-results/`、`playwright-report/` | ビルド・検証の生成物。Git管理対象外。 |
