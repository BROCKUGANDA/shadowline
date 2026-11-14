"""Pillow assets for the SHADOWLINE demo film.
Brand: ground #060b09, panel #0e1712, emerald #34d399, off-white #f4f1e8,
muted #8aa596, alert #f87171, line #1e352a. Deterministic seed."""
import math, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
GROUND = (6, 11, 9)
PANEL = (14, 23, 18)
LINE = (30, 53, 42)
EMER = (52, 211, 153)
OFFW = (244, 241, 232)
MUTED = (138, 165, 150)
RED = (248, 113, 113)
AMBER = (251, 191, 36)
FONT_UI = "C:/Windows/Fonts/segoeui.ttf"
FONT_UIB = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SB = "C:/Windows/Fonts/seguisb.ttf"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"
FONT_MONOB = "C:/Windows/Fonts/consolab.ttf"

def font(p, s): return ImageFont.truetype(p, s)

def new_canvas(fill=GROUND):
    return Image.new("RGB", (W, H), fill), None

def save(im, name):
    im.save(f"assets/{name}", "PNG")
    print("wrote", name)

# ---------- 1) 10 Hz tracking trail (transparent overlay) ----------
def trail():
    im = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    random.seed(7)
    pts = []
    x = 120.0
    y = 620.0
    heading = -0.35
    t = 0
    while x < 1800:
        turn = 0.0
        if 1050 < x < 1450:  # the direction change zone
            turn = 0.075 * math.sin((x - 1050) / 400 * math.pi)
        heading += turn * 0.55 + math.sin(t * 0.9) * 0.012
        x += math.cos(heading) * 13.5
        y += math.sin(heading) * 13.5
        pts.append((x, y))
        t += 1
    # soft glow pass then core line
    for width, alpha in [(16, 26), (9, 60), (4, 255)]:
        layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.line(pts, fill=EMER + (alpha,), width=width, joint="curve")
        layer = layer.filter(ImageFilter.GaussianBlur(6 if width > 9 else 2))
        im.alpha_composite(layer)
    # 10 Hz sample dots
    for i, (px, py) in enumerate(pts):
        r = 7 if i % 10 == 0 else 3.2
        a = 255 if i % 10 == 0 else 170
        d.ellipse([px - r, py - r, px + r, py + r], fill=EMER + (a,))
    # decision point marker
    px, py = pts[len(pts) // 2]
    d.ellipse([px - 13, py - 13, px + 13, py + 13], outline=AMBER + (255,), width=4)
    save(im, "trail_overlay.png")

# ---------- 2) OOS model comparison bars ----------
def oos_bars():
    im, _ = new_canvas()
    d = ImageDraw.Draw(im)
    # subtle ground texture: horizontal scanlines
    for yy in range(0, H, 6):
        d.line([(0, yy), (W, yy)], fill=(10, 18, 14))
    d.text((120, 90), "OUT-OF-SAMPLE  •  GROUPKFOLD BY PLAYER  •  5 FOLDS", font=font(FONT_MONO, 26), fill=MUTED)
    d.text((120, 150), "Traditional combine measurements still win the race.", font=font(FONT_UIB, 54), fill=OFFW)
    # zero axis
    d.line([(1150, 260), (1150, 780)], fill=LINE, width=2)
    data = [("Model A  — stopwatch only", 0.194, OFFW), ("Model B  — stopwatch + MRI", -0.126, EMER), ("Δ (B − A)", -0.320, RED)]
    y = 330
    for label, v, col in data:
        d.text((240, y - 44), label, font=font(FONT_MONO, 25), fill=OFFW)
        scale = 900
        x0 = 1150
        w = abs(v) / 0.35 * 480
        if v >= 0:
            d.rectangle([x0, y, x0 + w, y + 52], fill=col)
        else:
            d.rectangle([x0 - w, y, x0, y + 52], fill=col)
        sign = "+" if v >= 0 else "−"
        val = f"{sign}{abs(v):.3f}"
        d.text((x0 + (w + 18 if v >= 0 else -(w + 150)), y + 8), val, font=font(FONT_MONOB, 34), fill=col)
        y += 130
    d.text((120, 905), "Spearman ρ — grouped out-of-sample.   95% bootstrap CI for Δ: [−0.400, +0.769]",
           font=font(FONT_MONO, 24), fill=MUTED)
    save(im, "oos_bars.png")

# ---------- 3) exposure funnel ----------
def funnel():
    im, _ = new_canvas()
    d = ImageDraw.Draw(im)
    for yy in range(0, H, 6):
        d.line([(0, yy), (W, yy)], fill=(10, 18, 14))
    d.text((120, 90), "THE FUNNEL EVERYONE SKIPS", font=font(FONT_MONO, 26), fill=MUTED)
    d.text((120, 150), "Every rookie enters. Almost nobody qualifies.", font=font(FONT_UIB, 52), fill=OFFW)
    bars = [("510 drafted rookies (2023–2024)", 510, 1480, OFFW),
            ("6,310 combine drill attempts · 10 Hz", 6310, 1130, (190, 226, 205)),
            ("327,019 player-play rows analyzed", 327019, 800, EMER),
            ("n = 23 — \u2265 20 REG coverage plays", 23, 90, AMBER)]
    y = 330
    maxv = 1480.0
    for label, v, width, col in bars:
        x0 = 120
        bw = width
        d.rectangle([x0, y, x0 + bw, y + 96], fill=PANEL, outline=LINE, width=2)
        d.rectangle([x0, y, x0 + 14, y + 96], fill=col)
        d.text((x0 + 36, y + 14), label, font=font(FONT_MONO, 30), fill=OFFW)
        d.text((x0 + 36, y + 56), f"{v:,}", font=font(FONT_UIB, 40), fill=col)
        y += 140
    d.text((120, 985), "13 of 510 never played a snap. Exposure is not ability.", font=font(FONT_UI, 26), fill=MUTED)
    save(im, "funnel.png")

# ---------- 4) grain overlay ----------
def grain():
    random.seed(42)
    im = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    px = im.load()
    for _ in range(26000):
        x = random.randrange(W); y = random.randrange(H)
        px[x, y] = (255, 255, 255, random.randrange(6, 26))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    save(im, "grain.png")

# ---------- 5) end card background art: field with yard lines ----------
def fieldbg():
    im = Image.new("RGB", (W, H), GROUND)
    d = ImageDraw.Draw(im)
    horizon = 420
    # sky glow
    for i in range(horizon):
        t = i / horizon
        r = int(GROUND[0] + (14 - GROUND[0]) * (1 - t))
        g = int(GROUND[1] + (26 - GROUND[1]) * (1 - t))
        b = int(GROUND[2] + (20 - GROUND[2]) * (1 - t))
        d.line([(0, i), (W, i)], fill=(r, g, b))
    # turf perspective lines
    for n in range(-6, 7):
        x_top = W // 2 + n * 90
        x_bot = W // 2 + n * 330
        d.line([(x_top, horizon), (x_bot, H + 80)], fill=(24, 46, 37), width=3)
    for i, frac in enumerate([0.06, 0.16, 0.30, 0.48, 0.70, 1.0]):
        y = int(horizon + (H - horizon) * frac)
        d.line([(0, y), (W, y)], fill=(26, 49, 39), width=2)
    d.rectangle([0, horizon - 2, W, horizon + 2], fill=(34, 62, 50))
    # vignette
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-500, -300, W + 500, H + 300], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(260))
    black = Image.new("RGB", (W, H), (2, 4, 3))
    im = Image.composite(im, black, vig)
    save(im, "field_bg.png")

trail(); oos_bars(); funnel(); grain(); fieldbg()
