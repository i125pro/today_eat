import os
import sys
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
from app import get_db, now_cn  # noqa: E402

DEMO = [
    (1, '红烧肉', 'lunch'),
    (1, '白米饭', 'lunch'),
    (1, '紫菜蛋花汤', 'lunch'),
    (1, '酸辣土豆丝', 'dinner'),
    (1, '蛋炒饭', 'dinner'),
    (2, '可乐鸡翅', 'lunch'),
    (2, '白米饭', 'lunch'),
    (2, '番茄炒蛋', 'dinner'),
    (2, '清炒时蔬', 'dinner'),
    (2, '蒜蓉西兰花', 'dinner'),
]


def main():
    conn = get_db()
    added = 0
    for days_ago, name, meal in DEMO:
        d = conn.execute('SELECT id FROM dishes WHERE name = ?', (name,)).fetchone()
        if not d:
            continue
        date = (now_cn() - timedelta(days=days_ago)).date().isoformat()
        exists = conn.execute(
            'SELECT 1 FROM records WHERE dish_id = ? AND meal_date = ? AND meal = ?',
            (d['id'], date, meal)).fetchone()
        if not exists:
            conn.execute(
                'INSERT INTO records (dish_id, meal_date, meal) VALUES (?, ?, ?)',
                (d['id'], date, meal))
            added += 1
    conn.commit()
    conn.close()
    print(f'补充演示记录 {added} 条')


if __name__ == '__main__':
    main()
