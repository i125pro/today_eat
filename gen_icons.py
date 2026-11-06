from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'icons')
os.makedirs(OUT, exist_ok=True)


def gradient(size, top, bottom):
    img = Image.new('RGB', (size, size))
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b))
    return img


def make_icon(size):
    top, bottom = (255, 168, 120), (255, 90, 150)
    img = gradient(size, top, bottom).convert('RGBA')
    d = ImageDraw.Draw(img)
    cx = size // 2
    plate_r = int(size * 0.30)
    d.ellipse([cx - plate_r, cx - plate_r, cx + plate_r, cx + plate_r],
              fill=(255, 255, 255, 235))
    inner_r = int(plate_r * 0.72)
    d.ellipse([cx - inner_r, cx - inner_r, cx + inner_r, cx + inner_r],
              fill=(255, 236, 210, 255))
    food_r = int(plate_r * 0.5)
    d.ellipse([cx - food_r, cx - food_r + int(size * 0.02),
               cx + food_r, cx + food_r + int(size * 0.02)],
              fill=(255, 107, 107, 255))
    hl = int(plate_r * 0.28)
    d.ellipse([cx - plate_r + int(size * 0.06), cx - plate_r + int(size * 0.05),
               cx - plate_r + int(size * 0.06) + hl, cx - plate_r + int(size * 0.05) + hl],
              fill=(255, 255, 255, 160))
    stick_w = max(3, size // 90)
    stick_h = int(size * 0.34)
    x1 = int(cx + size * 0.30)
    x2 = int(cx + size * 0.38)
    d.rounded_rectangle([x1, cx - stick_h // 2, x1 + stick_w, cx + stick_h // 2],
                        stick_w // 2, fill=(255, 255, 255, 230))
    d.rounded_rectangle([x2, cx - stick_h // 2, x2 + stick_w, cx + stick_h // 2],
                        stick_w // 2, fill=(255, 255, 255, 230))
    return img


icon = make_icon(512)
icon.save(os.path.join(OUT, 'icon-512.png'))
icon.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'icon-192.png'))
print('icons done:', os.listdir(OUT))
