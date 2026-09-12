# LaQ 3D：再開用の短い引き継ぎ

更新日：2026-09-12。過去の経緯ではなく、ここを入口に現行コードと対象の文書だけ確認する。

## 現在地

- 本体：`/Users/wataru/Documents/Development/laq-library`。`main` の `7fe4478` までpush・GitHub Pages公開済み。
- 公開先：<https://esystimsesys.github.io/laq-library/>。
- メタモンは53パーツ、9つの基本の塊、作成と合体を混ぜた17手順。
- ジャローダ（2026-09-12・未コミット）: 写真21枚と製作室の50件のコメントを反映。ユーザーが完成確認した219パーツ・6塊・17手順をrevision 2として本体のローカルデータへ取り込み。
  旧v1〜v3は不採用、記録は `.local/assembly-work/jaroda/rejected/`。現行の入口は [制作記録](JARODA-3D.md)。
  製作室はreviewed、実物はnot-performed。完成原本は `.local/assembly-work/jaroda/guide.json`、取り込み記録は `checks/final-import/`。
  手動の位置・色変更とNo.5校正を含むため生成器で上書きしない。反復した指摘と予防策は [振り返り](JARODA-RETROSPECTIVE.md)、次回の手順は [AI-3D-WORKFLOW.md](AI-3D-WORKFLOW.md)。
- タイレーツは `/Users/wataru/Documents/laq-3d-prototype/models/tairetu/` の試作。未導入で、形状の未確定点も残る。
- デスカーン（2026-09-11〜12）: 記事写真13枚から候補1を作成。人のレビューコメントを反映し181パーツ（からだの奥行き1、背中は黄の正方形2段＋三角の段＋青の正方形2枚、顔の外周・あごのジョイント修正、色）。ジョイントは2枚の板を初めてつなぐ段で付ける（新しく付ける板の側）。塊は記事の4種に合わせた6つ（あたまA1・からだB1・うで(うえ)C1/C2・うで(した)D1/D2）、記事の順で18手順。ジョイントIDはつなぐ板の名前から作り、作り直しても変わらない。構造検証・試験用worktreeでの出力→取り込み→test/buildは通過。
  人の確認前のため本体へは未取り込み。作業場所 `.local/assembly-work/desukan/`（写真・根拠・astraの回答・生成器 `generator/build_desukan.py`）。
  制作室で確認→「確認済みにして保存」→ `.local/assembly-work/desukan/finish.sh` で出力・取り込み・test・build。
  床・殻の並び・頭の付き方・顔の左右・腕の枚数は写真で決まらない推測（review.json の unresolved に必要な写真を記載）。
  2026-09-12再確認：背中中央の指定部品をNo.4へ変更（コメント参照のためID `j3-shell-centre--shell-centre-low` は保持）。周辺との閉じた接続環があり、規定の接続位置に各口約1.2mmのずれを残すため `no4-shell-spacing` を未確認点へ追加。番号変更のコメントにはreply済み、statusは人の確認待ちでopen。
  No.5は新寸法へ校正し、左上腕の先10部品とジョイントだけを平行移動。からだ手順2〜7のactionsを新規板側→既存側に修正。人の確認済み16コメントは保持。最新版guideが原本であり、生成器を再実行して上書きしない。
  検証・修正記録は `checks/recheck-20260912/`、退避は製作室のhistory。製作室は `http://127.0.0.1:5182/`。draft・181パーツ・18手順、本体へ未取り込み。
- ビューアーの `blue` を公式の青（#1d6eb7・表示名「青」）に修正。従来は水色と同じ値だった。
- 制作室に「レビューコメント」欄を追加（2026-09-12・未コミット）。人のコメントは review.json の `comments`（手順・写真を添付、AIは `reply` に対応を書く）。
  未対応のコメントがあると出力できない。AIの読み取り根拠は右列の折りたたみに記入者付きで表示。仕様は `docs/AI-3D-WORKFLOW.md`。
- 現行ビューアーは本体の `public/assemblies/viewer/`。古いプロトタイプのruntimeで上書きしない。
- 最終公開CI `34601167359` 成功。単体162件・ブラウザ47件、build/lint通過。公開runtime3本の一致を確認した。

## 維持する仕様

- No.1/2は共通辺長17mm、全厚3.5mm。ジョイントの四角い軸部分も3.5mm。ユーザーの採用値であり公式寸法とは称さない。
- 単純な平面・斜めの一連はまとめて一枚で示す。塊作成と塊の合体を同じ階層の手順に置く。
- 表示IDは基本の塊・合体結果ともA1、B1、C1…の初出順。左右などの対は同じ英字の1・2。内部IDとURLは別で維持する。
- 用語は「パーツ」。使用数は開始画面の参考情報。事前に全部集める工程は設けない。
- 接続箇所は主図に矢印を同時表示し、IDを図の外側へ置く。不要な説明欄を復活させない。
- 矢印のサイズは製作室の小さい表示へ双方を統一（倍率0.5、線幅1.5、マーカー幅4）。表示名も共通ID＋日本語のまとまり名にそろえる。
- 「マイライブラリ」は★付きと完成記録のある作品の和集合。完成数は繰り返し回数ではなく作品数。3D対応は登録manifestから判定する。
- 分解ドラッグは既存メッシュの位置更新とrequestAnimationFrame。入力のたびに形状を再生成しない。
- 「はなして見る」で作成済みの塊はばらさない。合体は土台固定、塊の2段目以降は前段までを固定し、新しい部分をつながりごとにまとめて離す。
- No.3/4/6/7の内部の継ぎ目を消し、外周・溝は保持。比較画面は本体の `tools/assembly-review/parts.html`。
- No.5の短辺はユーザー実測4mm。現行形状・接続距離と既存配置の校正は [NO5-GEOMETRY.md](NO5-GEOMETRY.md) に従う。

## 次の作業に必要な入口

| 作業 | 原本（本体からの相対パス） |
|---|---|
| ガイド形式・手順・取り込み | `docs/ASSEMBLIES.md` |
| 写真からの制作・AIへの依頼・人の修正 | `docs/AI-3D-WORKFLOW.md` |
| ジャローダで繰り返した指摘と予防策 | `docs/JARODA-RETROSPECTIVE.md` |
| 登録／メタモンのガイド／表示設定 | `src/data/assemblies.json`／`public/assemblies/metamon/guide.json`／`content/assemblies/metamon.json` |
| 人が写真と3Dを照合する作業場所 | `.local/assembly-work/metamon/`（写真入り、Git対象外） |

制作室：本体で `npm run assembly:review -- --workspace .local/assembly-work/metamon`。
レビュー済み出力の取り込みは文書に従い `--use-source-reading` を使い、確認済みの手順を保持する。

## 未確定事項

写真から完全自動で正しい3Dを復元する機能は未実装。AIの候補作成と人の確認を支援するCLI・制作室までできている。
実物での差し込み・組みやすさは未確認。No.7の細部は写真未校正で、溝の深さや接続間隔にも推定が残る。
次の精度改善ではNo.7の端面・斜め、基本板を接続した真横の写真が有効。17mm・3.5mmを再度質問する必要はない。

モデルと進め方の振り返りは [2026-09-11の評価](../.local/reports/laq-2026-09-11-retrospective.md)。新しい作業では、対象・確定条件・完了条件を短く渡し、履歴全文を引き継がない。
