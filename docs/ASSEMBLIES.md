# 3D の組み立てガイド

作品一覧とは別に、`src/data/assemblies.json` が作品 ID と組み立てガイドを結び付ける。
現在は `purimatu:metamon` に `metamon` を登録している。取り込んだ候補は
`gap-hands-4-3-core-3` のみで、9 個の塊、53 パーツ。塊を作る 9 手順と合体する 8 手順を
混ぜた、17 手順の一本道として表示する。C1・C2 は各 8 パーツを一度に組む全体図にまとめる。

## 写真から新しい作品を作る

[AIと人による3D制作の手順](AI-3D-WORKFLOW.md) に入力写真、根拠記録、作業用JSON、
初期化・検証・出力CLI、写真と3Dを並べるローカル制作室の操作をまとめた。
`npm run assembly:review -- --workspace .local/assembly-work/<slug>` で写真を見ながら修正できる。
レビュー済み出力の取り込みには `--use-source-reading` を付け、確認した表示文・順序を保持する。
この指定では既存content設定を無視し、塊の手順を再統合しない。通常のプロトタイプ取り込みは従来どおり。

## データの追加・更新

プロトタイプのルートを明示して実行する。作業用プロトタイプは変更しない。

```sh
node scripts/import-assembly.mjs --source /absolute/path/to/laq-3d-prototype --name metamon
npm test -- scripts/import-assembly.test.mjs
```

入力は `<source>/models/<name>/unit-guide.json`。`defaultVariant` に指定された候補だけを
`public/assemblies/<name>/guide.json` へ出力する。選んだ候補の `model`、座標、接続、
接続操作と `assembly` は再生成せず、そのまま保持する。表示用の設定で指定された塊だけ、
複数の `steps` を 1 枚の全体図へまとめる。元の最終図の部品をすべて `newPieces` とし、
各手順の `actions` を重複なく連結する。元のモデルの座標・接続は変更しない。
既定候補の存在、座標の形、部品・塊・手順 ID、所有の重複、参照先、段階ごとの部品追加、
接続口と差し込み位置、接続操作の重複・漏れ、最終形への到達を保存前に検証する。
入力不正や必要ファイル不足では既存のガイドや登録一覧を変更しない。
この検証はデータ構造と参照の検証であり、実物での組み立て可否の検証ではない。

関連付ける作品は `<name>-trial.json` の `article` と作品の `sourceUrl`、または
`purimatu:<name>` から探す。別の関連付けでは既存の作品 ID を明示する。

```sh
node scripts/import-assembly.mjs \
  --source /absolute/path/to/laq-3d-prototype \
  --name another-model \
  --model-id purimatu:another-model \
  --title '作品名' \
  --article https://example.com/model/ \
  --revision 2
```

`--title` の省略時は作品名、`--article` の省略時は試作の `article`、ガイドの `article`、
作品の `sourceUrl` の順に使う。初回の `revision` は 1。再取り込み時は既存値を保ち、
更新番号を変える場合は `--revision` を明示する。同じガイド ID の登録だけを置き換え、
ほかのガイドは保持する。名前は英小文字・数字・ハイフンからなるスラッグにする。

登録の形式:

```json
{
  "id": "metamon",
  "modelId": "purimatu:metamon",
  "title": "メタモン",
  "revision": 2,
  "defaultVariant": "gap-hands-4-3-core-3",
  "unitCount": 9,
  "pieceCount": 53,
  "guidePath": "assemblies/metamon/guide.json"
}
```

`guidePath` は公開ルートからの相対パス。サイトのベースパスは呼び出し側で付ける。
ガイドには `name`、`displayName`、`article` を補う。元記事の写真・試作の HTML・その他の
調査資料はコピーしない。`photos` と写真位置を使う `limits` は空配列にする。

## 表示文と手順の順番

任意の `content/assemblies/<name>.json` がある場合、ガイドの `reading` へ取り込む。
表示文・全体図にまとめる塊・手順の順番を独立して編集できる。書き換えたら再取り込みする。

```json
{
  "unitNames": { "A1": "まえの からだ" },
  "steps": {
    "unit:A1:0": { "title": "ならべよう", "description": "ずと おなじに ならべよう。" },
    "assembly:0": { "title": "からだを つなごう", "description": "まえと うしろを つなごう。" }
  }
}
```

手順番号は 0 始まり。存在する塊・手順だけ指定でき、手順には `title` と `description` が必要。
`combineUnits` に塊 ID の配列を指定すると、その塊の手順を `unit:<ID>:0` へまとめる。
まとめた手順の表示文も `:0` に書き、不要になった `:1` 以降の表示文は削除する。

`sequence` は `unit:<ID>:<手順番号>` と `assembly:<手順番号>` を並べた文字列配列。
塊を作る手順と合体を自由に混ぜられる。すべての手順を一度ずつ含め、同じ塊の手順番号を
順に進める。合体の入力は完成済みで、まだ別の合体で消費されていなければならない。
これらの条件を保存前に検証する。省略時は塊内の全手順、合体の全手順の順に補う。
確定した順序は公開 JSON のトップレベル `sequence` に出力する。

メタモンの設定は `combineUnits: ["C1", "C2"]`。順序は A1 → A2 → からだの合体、
続いて B1・E1・E2・C1・C2・D1・D2 をそれぞれ作って、すぐからだへ付ける流れ。
部品の全体図を見ながら必要な塊を作り、完成しているものを次の合体に使う。

## 共通ビューアー

初回のみ、プロトタイプから次のファイルをコピーする。

| 入力 | 出力 (`public/assemblies/` 以下) |
|---|---|
| `three.min.js` | `vendor/three.min.js` |
| `models/metamon/realistic-parts.js` | `viewer/realistic-parts.js` |
| `models/unit-instructions.js` | `viewer/unit-instructions.js` |
| `models/unit-instructions.css` | `viewer/unit-instructions.css` |

ビューアーはライブラリ側で改修を保守する。通常の再取り込みは既存の共通ファイルを
上書きしない。`--update-runtime` はこれら 4 ファイルを原本から上書きするため、
ライブラリ側の変更を確認してから明示的に使用する。ビューアーの HTML は取り込み対象外。

Three.js のローカルファイル先頭には `Copyright 2010-2023 Three.js Authors` と
`SPDX-License-Identifier: MIT` があることを確認済み。ヘッダーを保持し、標準 MIT 本文を
`vendor/three.LICENSE.txt` として同梱する。別の版や著作権表記を取り込む場合は、
ライセンス確認と同梱本文の更新を行ってからインポーターの照合条件を更新する。

## 画面と状態

- `src/assemblies/` が作品共通のReact画面・一本道の手順・途中保存を持つ。
- `public/assemblies/viewer/index.html` は同一オリジンの描画専用iframe。
  `boot.js` が図データを読み、`unit-instructions.js` の `LaQLibraryViewer` APIを呼ぶ。
  `library.css` で描画操作以外の試作用UIを隠す。
- メッセージは親・子両側でoriginとsourceを照合。ロード失敗は再試行できる。
- 接続はメイン図に全箇所を同時に矢印表示し、回転・分解に追従する。下部の接続拡大欄と「つなぐへん」ラベルは表示しない。塊の完成図は組み上がった状態では矢印を省き、分解したときに表示する。
- 「つくりかたのコツ」欄は設けず、写真からの復元・実物未確認の注意は全手順共通のフッターにまとめる。
- 一覧の戻り先をカード→詳細→3D→詳細へルートstateで引き継ぐ。詳細の戻る操作は直前の3D履歴をたどらず、元の一覧へ戻る。直接アクセス時は検索一覧。
- 塊内の分解表示は中心からの変位を距離に比例して広げ、同じ方向のパーツも離す。スライダー0では元の配置を保持する。
- No.3/4の表裏は一続きの形状で生成し、内部の左右の継ぎ目を輪郭線にしない。外周・溝の線は維持する。
- 追加作品の入口・パーツ一覧・手順一覧は登録リストとガイドから作る。
  パーツの色別・種類別の使用数は「これを つくろう！」の参考情報。準備を完了する画面は設けず、開始すると最初の組み立て手順へ進む。
  手順一覧では塊作りと合体を `sequence` の順に同列に並べる。
- 部品の写真比較、構造候補の切替、試作ディレクトリへのリンクは利用者に表示しない。
- スマホでも操作できる大きさのボタン、キーボードでの回転、読み込み状態の通知を持つ。
- 途中保存はガイドのrevisionごと。写真などを含む従来のバックアップには含めない。
  完成時の「つくった！」は既存の作品IDで従来ストアへ保存し、二重押下で取り消さない。

新しい手順リンクは `?step=unit:C1:0` や `?step=assembly:6` の安定したキーを使う。
従来の `?at=<数値>` は公開 JSON の `legacyAtKeys` で元の手順へ対応付ける。
この配列は統合前の「準備・部品・塊の全手順・全合体・完成」の並びを保持し、C1・C2 の
旧 2 手順はいずれも新しい `:0` を指す。たとえば `?at=19` は引き続き左手の合体を表示する。
メタモンは順序変更に合わせて revision 2 に更新し、revision 1 の途中位置は引き継がない。
現在は途中位置も安定した手順キーで保存する。revision 2 の旧数値保存は、廃止したパーツ画面の分を補正して同じ手順へ移行する。旧パーツ画面のURLは「これを つくろう！」を表示する。

`npm run test:e2e` はGitHub Pagesと同じサブパスの本番ビルドで検証する。
3DガイドJSONもPWAの事前キャッシュに含め、描画HTMLをSPAの代替ページへ変換しない。

## 導入時の確認

メタモンを390pxと1240pxで準備から完成記録まで操作し、部品数・画面内表示・
立体の閉じ方と全合体の矢印を照合。再開・見返し・色別部品選択・失敗時の再試行、
WebKitでの表示/操作、Service Worker経由のオフライン再読込も確認した。
既存の検索・お気に入り・冊子登録・バックアップのブラウザ検証と、
データ整合性の単体テストも通過している。

ライブラリへのコード/データ取り込みまでが今回の範囲。本番公開と、実物の差し込み確認は別途。

## 塊の表示名

内部ID・URL・再開位置と、画面の名前は分離する。取り込み時に `sequence` の初出順で
作成した塊と合体結果の両方へ A1、B1、C1…を共通採番し、Z1の次はAA1とする。
左右など対応する塊は `content/assemblies/<id>.json` の `labelFamilies` に内部IDの配列で指定する。
例: `[ ["E1", "E2"], ["C1", "C2"], ["D1", "D2"] ]`。
同じ組は初出時の文字を共有し、配列順に1・2…とする。異なる組での重複指定・未知IDはエラー。
生成した `displayLabels` を見出し、手順一覧、合体式、図のラベルで共通利用する。
説明中の参照は `{{A2}}` のように内部IDを二重の波括弧で囲む。取り込み時に参照を検証し、
表示時に名前へ変換する。説明に表示名を直接埋め込まない。
