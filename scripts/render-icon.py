"""Render the extension icon: a blue rounded square with a white magnifier whose
lens holds a blue medical cross (search + medical). Output → public/icons/."""

import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
S = 1024
BLUE = (11, 95, 255, 255)
WHITE = (255, 255, 255, 255)


def vgradient(top, bot, size):
    g = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel(
            (0, y),
            tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,),
        )
    return g.resize((size, size))


img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded-square background (vertical blue gradient via rounded mask)
grad = vgradient((47, 122, 255), (8, 74, 224), S)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
img.paste(grad, (0, 0), mask)

cx, cy, r = int(S * 0.43), int(S * 0.41), int(S * 0.265)
hw = int(S * 0.115)  # handle thickness

# Magnifier handle (white, rounded) from lens edge outward to bottom-right
a = math.radians(45)
p1 = (cx + int(r * math.cos(a)), cy + int(r * math.sin(a)))
p2 = (int(S * 0.80), int(S * 0.80))
draw.line([p1, p2], fill=WHITE, width=hw)
for p in (p1, p2):
    draw.ellipse([p[0] - hw // 2, p[1] - hw // 2, p[0] + hw // 2, p[1] + hw // 2], fill=WHITE)

# Lens: solid white disc (high contrast at small sizes)
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

# Blue medical cross inside the lens
arm, th = int(r * 0.62), int(r * 0.30)
draw.rounded_rectangle(
    [cx - th // 2, cy - arm // 2, cx + th // 2, cy + arm // 2], radius=th // 4, fill=BLUE
)
draw.rounded_rectangle(
    [cx - arm // 2, cy - th // 2, cx + arm // 2, cy + th // 2], radius=th // 4, fill=BLUE
)

for n in (16, 32, 48, 128, 256):
    img.resize((n, n), Image.LANCZOS).save(OUT / f"icon-{n}.png")
print(f"icons → {OUT}")
