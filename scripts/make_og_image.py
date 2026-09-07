"""共有カード用の画像（OG画像）を描く。

URLをLINEやXに貼ったときに出るプレビューの絵。1200x630 は各サービス共通の推奨比率
（1.91:1）で、これを外すと勝手に切り取られる。

絵は「背景 + アプリアイコン + 名前 + 一言」だけにしてある。凝る必要がないのと、
**公式サイトの作品写真やつくり方の図は絶対に載せない**ため（共有カードは他人の
タイムラインに出るので、権利者の画像を最も目立つ形で配ることになる）。
アイコンは make_icons.py が作った public/icon-512.png をそのまま貼る。

    python3 scripts/make_og_image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public"

W, H = 1200, 630
PAPER = (255, 246, 229)  # アプリの背景と同じ
INK = (58, 42, 34)
SUB = (122, 100, 86)
BLUE = (31, 127, 208)
RED = (232, 64, 42)
YELLOW = (255, 198, 30)
GREEN = (53, 168, 84)

# アプリ本文は Zen Maru Gothic（丸ゴシック）。手元で一番近い系統を使う
MARU = "/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc"

TITLE = "LaQライブラリ"
LEAD = "つくり方をさがす"
SUBTITLE = "むずかしさと なかま でしぼりこんで、\nおきにいりと つくったきろく をのこせる。"

BAND = 18  # 下端に敷くLaQ4色の帯。飾りはこれだけにして、本文と重ならないようにする


def rounded_icon(path: Path, size: int, radius: int) -> Image.Image:
    """アイコンを指定サイズの角丸にして返す"""
    icon = Image.open(path).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    icon.putalpha(mask)
    return icon


def main() -> None:
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    icon = rounded_icon(OUT / "icon-512.png", 200, 46)
    img.paste(icon, (96, 104), icon)

    title_font = ImageFont.truetype(MARU, 92)
    lead_font = ImageFont.truetype(MARU, 50)
    sub_font = ImageFont.truetype(MARU, 40)

    d.text((330, 116), TITLE, font=title_font, fill=INK)
    d.text((334, 234), LEAD, font=lead_font, fill=BLUE)
    d.multiline_text((100, 396), SUBTITLE, font=sub_font, fill=SUB, spacing=20)

    # 下端の4色帯
    for i, color in enumerate((BLUE, RED, YELLOW, GREEN)):
        d.rectangle((W * i // 4, H - BAND, W * (i + 1) // 4, H), fill=color)

    out = OUT / "og.png"
    img.save(out, optimize=True)

    # サムネイルに縮んでも読めるか、はみ出していないかを数字で見えるようにする
    right = max(d.textbbox((330, 116), TITLE, font=title_font)[2],
                d.multiline_textbbox((100, 396), SUBTITLE, font=sub_font, spacing=20)[2])
    print(f"{out.relative_to(OUT.parent)}  {W}x{H}  {out.stat().st_size // 1024}KB  文字の右端={right}px（余白 {W - right}px）")


if __name__ == "__main__":
    main()
