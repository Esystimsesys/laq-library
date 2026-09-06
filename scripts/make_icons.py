"""アプリアイコン（PNG）を描く。

LaQ は四角と三角の小さなパーツを組む玩具なので、その 4 枚を並べた絵にする。
maskable 用は端が丸く切られても欠けないよう、絵を内側 60% に収める。
"""
from PIL import Image, ImageDraw

PAPER = (255, 246, 229)
INK = (58, 42, 34)
BLUE = (31, 127, 208)
RED = (232, 64, 42)
YELLOW = (255, 198, 30)
GREEN = (53, 168, 84)

SS = 4  # アンチエイリアス用に大きく描いて縮める


def draw_parts(size: int, scale: float, background: tuple[int, int, int] | None):
    canvas = size * SS
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if background:
        d.rounded_rectangle(
            [0, 0, canvas - 1, canvas - 1], radius=int(canvas * 0.22), fill=background
        )

    # 64x64 の座標系で組んだ絵を、指定の倍率で中央に置く
    unit = canvas / 64 * scale
    off = (canvas - 64 * unit) / 2

    def p(x, y):
        return (off + x * unit, off + y * unit)

    def poly(points, fill):
        d.polygon([p(*q) for q in points], fill=fill, outline=INK, width=int(2.0 * unit))

    def square(x, y, w, fill):
        d.rectangle([p(x, y), p(x + w, y + w)], fill=fill, outline=INK, width=int(2.0 * unit))

    square(8, 8, 22, BLUE)
    square(34, 34, 22, RED)
    poly([(45, 8), (56, 29), (34, 29)], YELLOW)
    poly([(19, 56), (8, 35), (30, 35)], GREEN)

    return img.resize((size, size), Image.LANCZOS)


def save(name: str, size: int, scale: float, background):
    img = draw_parts(size, scale, background)
    if background:
        flat = Image.new("RGB", img.size, background)
        flat.paste(img, mask=img.split()[3])
        flat.save(f"public/{name}")
    else:
        img.save(f"public/{name}")
    print("wrote", name)


save("icon-192.png", 192, 1.0, PAPER)
save("icon-512.png", 512, 1.0, PAPER)
# maskable は上下左右が削られても欠けないように、絵を小さめに置く
save("icon-maskable-512.png", 512, 0.62, PAPER)
save("apple-touch-icon.png", 180, 1.0, PAPER)
