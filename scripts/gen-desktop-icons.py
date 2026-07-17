"""Generate desktop ICO (PC badge) + refresh PWA brand PNGs from master mark."""
from __future__ import annotations

import io
import os
import struct

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "restrosuite-mark-512.png")


def make_square(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def badge_desktop(im: Image.Image) -> Image.Image:
    """Brand mark + small orange PC badge so Start menu differs from PWA."""
    out = im.copy()
    w, h = out.size
    draw = ImageDraw.Draw(out)
    bw, bh = max(18, int(w * 0.40)), max(12, int(h * 0.18))
    x0 = w - bw - max(4, int(w * 0.05))
    y0 = h - bh - max(4, int(h * 0.05))
    draw.rounded_rectangle(
        [x0, y0, x0 + bw, y0 + bh],
        radius=max(3, bh // 3),
        fill=(255, 79, 0, 255),
    )
    text = "PC"
    font_size = max(9, bh // 2)
    font = None
    for path in (
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ):
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, font_size)
                break
            except OSError:
                pass
    if font is None:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (x0 + (bw - tw) // 2, y0 + (bh - th) // 2 - 1),
        text,
        fill=(255, 255, 255, 255),
        font=font,
    )
    return out


def write_ico(path: str, images: list[Image.Image]) -> None:
    pngs: list[bytes] = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        pngs.append(buf.getvalue())
    count = len(pngs)
    offset = 6 + 16 * count
    header = struct.pack("<HHH", 0, 1, count)
    entries = b""
    data = b""
    for im, png in zip(images, pngs):
        w, h = im.size
        wb = 0 if w >= 256 else w
        hb = 0 if h >= 256 else h
        entries += struct.pack("<BBBBHHII", wb, hb, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        data += png
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(header + entries + data)


def main() -> None:
    base = Image.open(SRC).convert("RGBA")
    desk_dir = os.path.join(ROOT, "desktop", "build")
    assets = os.path.join(ROOT, "assets")
    images_dir = os.path.join(ROOT, "images")
    os.makedirs(desk_dir, exist_ok=True)

    # Desktop: badged mark
    desk512 = badge_desktop(make_square(base, 512))
    desk512.save(os.path.join(desk_dir, "icon.png"), "PNG")
    make_square(base, 192).save(os.path.join(desk_dir, "splash-mark.png"), "PNG")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    write_ico(os.path.join(desk_dir, "icon.ico"), [badge_desktop(make_square(base, s)) for s in sizes])
    print("desktop/build/icon.ico", os.path.getsize(os.path.join(desk_dir, "icon.ico")))

    # Web / PWA: plain brand (no PC badge)
    make_square(base, 192).save(os.path.join(assets, "restrosuite-mark.png"), "PNG")
    make_square(base, 512).save(os.path.join(assets, "restrosuite-mark-512.png"), "PNG")
    make_square(base, 512).save(os.path.join(assets, "restrosuite_logo.png"), "PNG")
    m = Image.new("RGBA", (512, 512), (243, 239, 232, 255))
    inner = make_square(base, 410)
    m.paste(inner, ((512 - 410) // 2, (512 - 410) // 2), inner)
    m.save(os.path.join(assets, "restrosuite-maskable-512.png"), "PNG")
    for name in ("restrosuite-mark.png", "restrosuite_logo.png"):
        src = os.path.join(assets, name)
        if os.path.exists(images_dir):
            Image.open(src).save(os.path.join(images_dir, name), "PNG")
    print("web/pwa icons refreshed")


if __name__ == "__main__":
    main()
