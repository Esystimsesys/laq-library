# へび（ユーザーオリジナル）の3D制作

2026-09-17：添付の組立図写真1枚から作成し、制作室のコメント8件と手動編集を反映して完成承認された。
54パーツ・6まとまり・表示4手順。`review.json` に承認を記録し、未解決事項はすべて判断を追記してresolved。
実物の再組立は `not-performed` のまま `original:hebi` revision 1 としてLaQ Libraryへ取り込んだ。
一覧と詳細の完成図は公開3Dデータを描画したPNGで、元の冊子写真は使用・公開していない。

## 原本と制作室

- 原本：`.local/assembly-work/hebi/guide.json`（写真・根拠・変更履歴は同ディレクトリ）
- 制作室：`npm run assembly:review -- --workspace .local/assembly-work/hebi --port 5185 --external-origin https://mba1223.tail81f690.ts.net:5185`
- 公開記事がないため、公開ガイドの `article` は空文字。制作室のローカルURLは私有の `manifest.json` だけに残す。

## 構成

| まとまり | ラベル | 個数 | 内容 |
|---|---|---|---|
| head | A1 | 20 | 頭の上・左右の顔と牙・あごと舌。分解表示は4ブロック |
| nape | B1 | 6 | 首の付け根（三角＋No.3＋四角） |
| coil | C1 | 12 | とぐろとしっぽ。輪は閉じないC字 |
| body | E1 | 10 | 長い胴体 |
| heel | F1 | 4 | 胴体の曲がり |
| brace | H1 | 2 | 曲がりのつなぎ |

表示は4手順。1 あたま / 2 からだを つくろう（首＋とぐろ）/ 3 からだの つづきを つくろう（胴体・曲がり・先端）/
4 あたまと からだを つけよう（とぐろを首へ→からだをとぐろへ）。54パーツを重複なく1〜3で分け、4で合体する。

## レビューで確定した点

- とぐろ根元のNo.5（緑）の120度の折れを反転し、首が立ち上がる向きにした。
- 首の四角の辺3を、とぐろ根元の黄緑No.5へ接続。頭・首側を内部の形を保ったまま回転・移動して合わせた。
- とぐろの並びを「辺1で受けて辺2へ渡す」に統一し、旧No.1の板をNo.2へ交換。輪を閉じるNo.4は削除してC字の鎖にした。
- 胴体側（J1相当）を裏返して尾端の三角へ接続。とぐろと重なるため板厚3.5mm下へずらし、接続のNo.4を中間に置いて
  接続端に各1.75mmの位置差を許容した。ユーザー指定の柔軟性による表示近似で、実物の許容範囲の確認ではない。
- 尾の先のNo.5（緑）も折れを反転。左右の目（No.7）は空き口が頭の外を向くよう軸の向きを反転した。
  この2つは辺の中心とジョイント中心の距離が0.1038単位で、No.7の想定inset 0.1（未計測の仮定値）と0.0038ずれるため、
  制作室の「次の向き」では切り替えできない。

## 検証した範囲

- `author-assembly validate`（`--for-export` を含む）合格。54パーツ・56接続口・11手順の参照と到達を確認。
- 板24枚300組の理想面交差0。新しく作った接続の口位置・開き角の誤差は1e-14単位以下。
  全体の残差最大は頭のNo.5（roof-bend）の開き角4.05e-2ラジアンで、今回の変更による悪化はない。
- 制作室と公開アプリの両方で、完成形・全4手順・5方向・分解0/100%・390px幅を表示確認。ブラウザエラーなし。
- **実物の嵌合、板厚を含む干渉、挿入経路、組みやすさは未検証。** 写真との一致も構造検証では証明していない。

## 取り込み

```sh
node scripts/author-assembly.mjs validate --workspace .local/assembly-work/hebi --for-export
node scripts/author-assembly.mjs export --workspace .local/assembly-work/hebi
node scripts/import-assembly.mjs --source .local/assembly-work/hebi/export \
  --name hebi --model-id original:hebi --title 'へび' --revision 1 --use-source-reading
node scripts/capture-assembly-image.mjs --id hebi --out public/model-images/original/hebi.png --yaw-steps 3
npm test && npm run build
```

`src/data/sources/original.json` に `original:hebi`（どうぶつ／初級）を追加し、`categoryOrder` に「どうぶつ」を足した。
作品名は当初「コブラ」で取り込んだが、ユーザー指定で「へび」に変更して再取り込みした（形状・接続・手順は同一）。
公開オリジナルが2件になったため、`src/lib/filter.test.ts` の並び順の期待値も更新している。
commit・pushは実施していない。
