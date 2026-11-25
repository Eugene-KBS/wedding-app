#!/usr/bin/env python3
"""產生 iPhone 主畫面啟動畫面（apple-touch-startup-image），沿用圖示的「薄暮濕地」：
暮色天空、落日、三層水波與倒影。用法：python3 tools/make-splash.py
輸出 icons/splash/*.png，並印出要貼進 index.html 的 <link> 標籤。
iOS 只在「加入主畫面」當下讀取啟動畫面，已加入的圖示要刪掉重加才會看到。"""
import math, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons', 'splash')

# (CSS 寬, CSS 高, 像素比, 機型) — 直式
DEVICES = [
    (440, 956, 3, 'iPhone 16 Pro Max / 17 Pro Max'),
    (420, 912, 3, 'iPhone Air'),
    (402, 874, 3, 'iPhone 16 Pro / 17 / 17 Pro'),
    (430, 932, 3, 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus'),
    (393, 852, 3, 'iPhone 14 Pro / 15 / 15 Pro / 16'),
    (428, 926, 3, 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus'),
    (390, 844, 3, 'iPhone 12 / 13 / 14 / 16e'),
    (375, 812, 3, 'iPhone X / XS / 11 Pro / 12 mini / 13 mini'),
    (414, 896, 3, 'iPhone XS Max / 11 Pro Max'),
    (414, 896, 2, 'iPhone XR / 11'),
    (414, 736, 3, 'iPhone 8 Plus'),
    (375, 667, 2, 'iPhone SE (2nd/3rd) / 8'),
]

SKY_TOP, SKY_BOTTOM = (22, 54, 58), (40, 68, 68)
SUN = (232, 118, 90)
WAVES = [(122, 154, 134), (96, 132, 112), (70, 106, 90)]
GLINT = (246, 196, 170)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def wave_poly(w, h, y0, amp, phase, periods):
    pts = [(0, h)]
    steps = 120
    for i in range(steps + 1):
        x = w * i / steps
        pts.append((x, y0 + amp * math.sin(2 * math.pi * periods * i / steps + phase)))
    pts.append((w, h))
    return pts


def draw(cw, ch, ratio):
    ss = 2                                   # 超取樣，邊緣才會平滑
    W, H = cw * ratio * ss, ch * ratio * ss
    im = Image.new('RGB', (W, H), SKY_TOP)
    d = ImageDraw.Draw(im)
    horizon = int(H * 0.60)
    for y in range(H):                       # 天空漸層（延伸到水面下，避免波谷露出縫）
        d.line([(0, y), (W, y)], fill=lerp(SKY_TOP, SKY_BOTTOM, min(1, y / horizon)))
    r = int(W * 0.19)                        # 落日：一半沉入水面
    cx, cy = W // 2, horizon - int(r * 0.15)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SUN)
    band = (H - horizon) / 3.2               # 三層水波
    for i, col in enumerate(WAVES):
        y0 = horizon + band * i * 0.92
        d.polygon(wave_poly(W, H, y0, W * 0.012, i * 1.7, 1.0 + i * 0.35), fill=col)
    lw = max(4, int(W * 0.011))              # 落日倒影
    for i, frac in enumerate((0.62, 0.44, 0.26)):
        y = horizon + int(band * (0.28 + i * 0.22))
        half = int(r * frac)
        d.rounded_rectangle([cx - half, y - lw // 2, cx + half, y + lw // 2], radius=lw // 2, fill=GLINT if i == 0 else SUN)
    return im.resize((cw * ratio, ch * ratio), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    tags = []
    for cw, ch, ratio, name in DEVICES:
        fn = 'splash-%dx%d.png' % (cw * ratio, ch * ratio)
        draw(cw, ch, ratio).quantize(colors=96, method=Image.Quantize.MEDIANCUT).save(os.path.join(OUT, fn), optimize=True)
        tags.append('<link rel="apple-touch-startup-image" media="(device-width: %dpx) and (device-height: %dpx) and (-webkit-device-pixel-ratio: %d) and (orientation: portrait)" href="icons/splash/%s"><!-- %s -->'
                    % (cw, ch, ratio, fn, name))
    print('\n'.join(tags))


if __name__ == '__main__':
    main()
