import { describe, expect, it } from 'vitest'
import { categorize, CATEGORIES, normalize } from './tag-rules.mjs'

describe('categorize', () => {
  it('作品名から素直に分類する', () => {
    expect(categorize('ティラノサウルス')).toEqual(['きょうりゅう'])
    expect(categorize('ダンプカー')).toEqual(['のりもの'])
    expect(categorize('フクロウ')).toEqual(['とり'])
  })

  it('ひとつの作品に複数のカテゴリが付く', () => {
    expect(categorize('サンタ帽')).toEqual(['ぎょうじ・きせつ', 'こもの・アクセサリー'])
    expect(categorize('ハロウィン平面セット')).toEqual(['ぎょうじ・きせつ', 'へいめん'])
  })

  it('カテゴリは辞書の並び順で返る', () => {
    const result = categorize('カニとヒヨコ')
    expect(result).toEqual(['とり', 'うみのいきもの'])
    expect(CATEGORIES.indexOf(result[0])).toBeLessThan(CATEGORIES.indexOf(result[1]))
  })

  // ここから下は、実データで実際に踏んだ誤分類の再発防止
  it('「トラック」を動物（とら）にしない', () => {
    expect(categorize('トラック')).toEqual(['のりもの'])
  })

  it('「トライク」を動物（とら）にしない', () => {
    expect(categorize('トライク')).toEqual(['のりもの'])
  })

  it('「クリスマス」「ポリス」を動物（りす）にしない', () => {
    expect(categorize('クリスマスツリー')).toEqual(['ぎょうじ・きせつ'])
    expect(categorize('ポリスヘリコプター')).toEqual(['のりもの'])
  })

  it('「サッカー」を乗りもの（カー）にしない', () => {
    expect(categorize('サッカーボール')).toEqual(['あそび・ゲーム'])
  })

  it('「カーネーション」を乗りもの（カー）にしない', () => {
    expect(categorize('カーネーション')).toEqual(['はな・しょくぶつ'])
  })

  it('「カワセミ」を虫（せみ）にしない', () => {
    expect(categorize('ハシビロコウとカワセミ')).toEqual(['とり'])
  })

  it('「ハナメガネ」を花にしない', () => {
    expect(categorize('ハナメガネ')).toEqual(['こもの・アクセサリー'])
  })

  it('「よろいかぶと」を海のいきもの（いか）にしない', () => {
    expect(categorize('鎧兜（よろいかぶと）')).toEqual(['ぎょうじ・きせつ'])
  })

  it('「ガソリンスタンド」を小もの（スタンド）にしない', () => {
    expect(categorize('ガソリンスタンド')).toEqual(['たてもの・けしき'])
  })

  it('「イエロー」を建もの（いえ）にしない', () => {
    expect(categorize('ミニレーサー イエロー')).toEqual(['のりもの'])
  })

  it('「さくらもち」を花にしない', () => {
    expect(categorize('さくらもち')).toEqual(['たべもの'])
  })

  it('作品名で当たらないときだけ説明文を見る', () => {
    expect(categorize('なぞの さくひん', 'かわいい ねこ です')).toEqual(['どうぶつ'])
    // 作品名で当たったら、説明文の語には引きずられない
    expect(categorize('パトカー', 'ねこ が のっています')).toEqual(['のりもの'])
  })

  it('どこにも当てはまらなければ その他', () => {
    expect(categorize('ｘｙｚ')).toEqual(['その他'])
  })
})

describe('normalize', () => {
  it('カタカナ・全角・区切り記号のゆれを吸収する', () => {
    expect(normalize('ソフト・クリーム')).toBe('そふとくりーむ')
    expect(normalize('ＬａＱジェット')).toBe('laqじぇっと')
  })
})

// 辞書に語を足すと、正規表現や部分一致の性質上、関係ない作品の分類まで
// 変わってしまうことがある。取り込み済みの 245 件と突き合わせて、
// 「意図せず変わった」ことに気づけるようにしておく。
// ここが落ちたら、辞書を直すか npm run fetch:gallery で JSON を作り直す。
describe('取り込み済みデータとの整合', () => {
  it('全 245 件のカテゴリが、いまの辞書の結果と一致する', async () => {
    const { default: source } = await import(
      '../src/data/sources/laq-official.json',
      { with: { type: 'json' } }
    )
    const changed = source.models
      .map((m) => ({
        title: m.title,
        saved: m.categories.join('/'),
        now: categorize(m.title, m.description).join('/'),
      }))
      .filter((x) => x.saved !== x.now)

    expect(changed).toEqual([])
  })
})
