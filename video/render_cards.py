"""Render demo title cards + S2 caption overlays as PNGs (this ffmpeg has no
drawtext/freetype). Uses Pillow + STHeiti for CJK. Output → video/png/."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "png"
OUT.mkdir(exist_ok=True)
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_L = "/System/Library/Fonts/STHeiti Light.ttc"
W, H = 1920, 1080
BG = (13, 17, 23)
WHITE = (255, 255, 255)
BLUE = (127, 176, 255)
GREEN = (110, 231, 183)
GRAY = (139, 151, 166)
LIGHT = (216, 222, 233)


def font(sz, light=False):
    return ImageFont.truetype(FONT_L if light else FONT, sz)


def center(d, text, y, fnt, fill):
    w = d.textlength(text, font=fnt)
    d.text(((W - w) / 2, y), text, font=fnt, fill=fill)


def card(lines):
    """lines: list of (text, y, size, fill, light?, mode) ; mode 'c'=center 'l'=left@x."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for spec in lines:
        text, y, size, fill = spec[0], spec[1], spec[2], spec[3]
        light = spec[4] if len(spec) > 4 else False
        x = spec[5] if len(spec) > 5 else None
        fnt = font(size, light)
        if x is None:
            center(d, text, y, fnt, fill)
        else:
            d.text((x, y), text, font=fnt, fill=fill)
    return img


# S1 intro
card(
    [
        ("ICD-10 Finder", 360, 110, WHITE),
        ("反白病名,立即取得 ICD-10-CM 代碼", 560, 46, BLUE),
        ("Dr. Shih-Feng Huang · KSVGH · github.com/odafeng", 950, 30, GRAY, True),
    ]
).save(OUT / "s1.png")

# S3 install step 1 (with a terminal-style box)
img = card([("安裝 ①  在專案資料夾執行,產生 dist/", 300, 54, WHITE)])
d = ImageDraw.Draw(img)
d.rounded_rectangle([460, 470, 1460, 650], radius=14, fill=(22, 27, 34))
d.text((512, 510), "$ npm run build", font=font(46), fill=GREEN)
d.text((512, 580), "built extension to dist/", font=font(38), fill=GRAY)
img.save(OUT / "s3.png")

# S4 install step 2
card(
    [
        ("安裝 ②  載入未封裝", 300, 64, BLUE),
        ("chrome://extensions  →  開啟「開發者模式」", 500, 46, WHITE),
        ("按「載入未封裝」 →  選擇 dist 資料夾", 590, 46, WHITE),
    ]
).save(OUT / "s4.png")

# S5 options
card(
    [
        ("設定(皆為選用)", 290, 64, BLUE),
        ("· 懸浮視窗開關(關掉改用右鍵)", 470, 46, WHITE, False, 600),
        ("· 線上增強 NLM(預設關)", 560, 46, WHITE, False, 600),
        ("· LLM 智慧擴展(預設關)", 650, 46, WHITE, False, 600),
    ]
).save(OUT / "s5.png")

# S6 offline / privacy
card(
    [
        ("完全離線 · 病人資料不外流", 340, 72, GREEN),
        ("資料庫與 BioLORD 臨床模型內建於擴充", 540, 44, LIGHT),
        ("反白文字不離開瀏覽器,適合醫院病歷系統", 620, 44, LIGHT),
    ]
).save(OUT / "s6.png")

# S7 outro
card(
    [
        ("開源 · 完全離線", 430, 72, WHITE),
        ("github.com/odafeng/icd10-finder", 560, 44, BLUE),
    ]
).save(OUT / "s7.png")


# S2 caption overlays (transparent, bottom band)
def caption(text, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fnt = font(40)
    tw = d.textlength(text, font=fnt)
    x = (W - tw) / 2
    y = H - 116
    d.rounded_rectangle([x - 26, y - 14, x + tw + 26, y + 60], radius=12, fill=(13, 17, 23, 205))
    d.text((x, y), text, font=fnt, fill=WHITE)
    img.save(path)


caption("在任何網頁反白病名,自動跳出推薦 ICD-10 代碼", OUT / "cap1.png")
caption("語意比對:看得懂俗名,對應正式診斷詞(colon cancer → C18.x)", OUT / "cap2.png")

print(f"rendered {len(list(OUT.glob('*.png')))} PNGs → {OUT}")
