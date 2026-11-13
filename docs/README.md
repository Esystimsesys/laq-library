# 開発資料

現在の機能・起動・検証・配信は [プロジェクトREADME](../README.md) を参照する。

## 現行の仕様と制作手順

- [3Dガイドの仕様・取り込み](ASSEMBLIES.md)：登録データ、表示用設定、共通ビューアー、進捗保存。
- [写真から3Dガイドを作る手順](AI-3D-WORKFLOW.md)：制作室での修正・確認・出力。
- [ミニシャフト・ミニホイール](MINI-PARTS.md)：制作室での使い方、形状、完成確認と検証範囲。
- [No.5の形状と接続位置](NO5-GEOMETRY.md)：部品形状と配置。

作品ごとの完成原本は `.local/assembly-work/<slug>/guide.json`、承認の記録は同じ場所の `review.json`。
完成原本を初回候補の生成器で上書きしない。

## ローカルファイルの用途

| 場所 | 用途 |
|---|---|
| `src/data/sources/` | 取り込みスクリプトが生成する作品索引。手編集しない。 |
| `public/assemblies/` | 配信用ガイド、共通描画コード、Three.jsとライセンス。 |
| `content/assemblies/` | 従来のプロトタイプ取り込み用の表示設定。 |
| `.local/assembly-work/` | 写真、完成原本、レビュー履歴。容量だけで削除しない。 |
| `.cache/` | 取り込み元のキャッシュ。保持することで再取得を減らす。 |
| `dist/`、`test-results/`、`playwright-report/` | ビルド・検証の生成物。Git管理対象外。 |
