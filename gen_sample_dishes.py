import os
import random
import sys
from datetime import timedelta

from PIL import Image, ImageDraw

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
from app import get_db, now_cn  # noqa: E402

UPLOAD_DIR = os.path.join(BASE_DIR, 'static', 'uploads')
random.seed(42)


def gradient_bg(size, top, bottom):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c)
    return img


def draw_hongshaorou():
    size = 600
    img = gradient_bg(size, (196, 144, 92), (150, 100, 58)).convert('RGBA')
    d = ImageDraw.Draw(img)
    cx = size // 2
    d.ellipse([cx - 250, cx - 250, cx + 250, cx + 250], fill=(250, 246, 240, 255))
    d.ellipse([cx - 215, cx - 215, cx + 215, cx + 215], fill=(238, 230, 220, 255))
    d.ellipse([cx - 185, cx - 185, cx + 185, cx + 185], fill=(122, 55, 35, 255))
    blocks = [(-150, -120, 90), (-40, -150, 95), (70, -110, 85), (-160, -10, 88),
              (-45, -40, 100), (70, -30, 90), (-120, 90, 86), (-10, 70, 92), (90, 80, 80)]
    for x, y, s in blocks:
        base = random.choice([(150, 75, 45), (139, 69, 39), (165, 88, 50)])
        d.rounded_rectangle([cx + x, cx + y, cx + x + s, cx + y + s], 22, fill=base + (255,))
        d.rounded_rectangle([cx + x + 12, cx + y + 12, cx + x + s - 18, cx + y + s - 18],
                            14, fill=(255, 240, 225, 160))
    for _ in range(14):
        x = random.randint(cx - 190, cx + 180)
        y = random.randint(cx - 190, cx + 180)
        d.ellipse([x, y, x + 10, y + 10], fill=(120, 160, 70, 255))
    return img


def draw_fanqiechaodan():
    size = 600
    img = gradient_bg(size, (255, 236, 200), (255, 214, 170)).convert('RGBA')
    d = ImageDraw.Draw(img)
    cx = size // 2
    d.ellipse([cx - 250, cx - 250, cx + 250, cx + 250], fill=(250, 248, 244, 255))
    d.ellipse([cx - 215, cx - 215, cx + 215, cx + 215], fill=(242, 238, 230, 255))
    eggs = [(-160, -140, 120), (-20, -170, 130), (90, -120, 110), (-150, 0, 125),
            (-10, -30, 135), (80, 10, 115), (-110, 110, 105), (20, 100, 120), (110, 120, 95)]
    for x, y, s in eggs:
        d.rounded_rectangle([cx + x, cx + y, cx + x + s, cx + y + s], 30, fill=(255, 190, 60, 255))
        d.rounded_rectangle([cx + x + 14, cx + y + 14, cx + x + s - 24, cx + y + s - 24],
                            20, fill=(255, 220, 120, 255))
    toms = [(-170, -160, 80), (60, -180, 90), (140, -40, 75), (-190, 60, 85), (40, 150, 80), (150, 150, 70)]
    for x, y, s in toms:
        d.ellipse([cx + x, cx + y, cx + x + s, cx + y + s], fill=(255, 90, 78, 255))
        d.ellipse([cx + x + 12, cx + y + 12, cx + x + s - 20, cx + y + s - 20], fill=(255, 130, 110, 255))
    for _ in range(16):
        x = random.randint(cx - 200, cx + 190)
        y = random.randint(cx - 200, cx + 190)
        d.ellipse([x, y, x + 9, y + 9], fill=(90, 160, 70, 255))
    return img


def main():
    draw_hongshaorou().save(os.path.join(UPLOAD_DIR, 'sample_hongshaorou.png'))
    draw_fanqiechaodan().save(os.path.join(UPLOAD_DIR, 'sample_fanqiechaodan.png'))

    conn = get_db()
    d1 = conn.execute("SELECT id, image FROM dishes WHERE name='红烧肉'").fetchone()
    d2 = conn.execute("SELECT id, image FROM dishes WHERE name='番茄炒蛋'").fetchone()
    if d1 and not d1['image']:
        conn.execute("UPDATE dishes SET image='sample_hongshaorou.png' WHERE id=?", (d1['id'],))
    if d2 and not d2['image']:
        conn.execute("UPDATE dishes SET image='sample_fanqiechaodan.png' WHERE id=?", (d2['id'],))

    yesterday = (now_cn() - timedelta(days=1)).date().isoformat()
    before = (now_cn() - timedelta(days=2)).date().isoformat()
    added = 0
    if d1 and not conn.execute("SELECT 1 FROM records WHERE meal_date=?", (yesterday,)).fetchone():
        conn.execute("INSERT INTO records (dish_id, meal_date, meal) VALUES (?, ?, 'lunch')",
                     (d1['id'], yesterday))
        added += 1
    if d2 and not conn.execute("SELECT 1 FROM records WHERE meal_date=?", (before,)).fetchone():
        conn.execute("INSERT INTO records (dish_id, meal_date, meal) VALUES (?, ?, 'dinner')",
                     (d2['id'], before))
        added += 1
    conn.commit()
    conn.close()
    print(f'示例图已生成，插入往日演示记录 {added} 条')


if __name__ == '__main__':
    main()
