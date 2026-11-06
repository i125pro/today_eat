import os
import sqlite3
import random
from datetime import datetime, timezone, timedelta

from flask import Flask, request, jsonify, render_template, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, 'static', 'uploads')
DB_PATH = os.path.join(BASE_DIR, 'data.db')
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
CST = timezone(timedelta(hours=8))
MEALS = ('breakfast', 'lunch', 'dinner')

DEFAULT_DISHES = [
    ('红烧肉', '🍖'), ('番茄炒蛋', '🍅'), ('可乐鸡翅', '🍗'),
    ('清炒时蔬', '🥬'), ('麻婆豆腐', '🌶️'), ('酸辣土豆丝', '🥔'),
    ('紫菜蛋花汤', '🥣'), ('白米饭', '🍚'), ('糖醋排骨', '🍖'),
    ('蒜蓉西兰花', '🥦'), ('红烧狮子头', '🧆'), ('蛋炒饭', '🍚'),
]


def now_cn():
    return datetime.now(CST)


def today_cn():
    return now_cn().date().isoformat()


def meal_now():
    m = now_cn().hour * 60 + now_cn().minute
    if 300 <= m < 630:
        return 'breakfast'
    if 630 <= m < 990:
        return 'lunch'
    return 'dinner'


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS dishes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '🍽️',
            image TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
        );
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dish_id INTEGER NOT NULL,
            meal_date TEXT NOT NULL,
            meal TEXT NOT NULL DEFAULT 'dinner',
            leftover INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
        );
    ''')
    cols = [r[1] for r in conn.execute('PRAGMA table_info(records)')]
    if 'meal' not in cols:
        conn.execute("ALTER TABLE records ADD COLUMN meal TEXT NOT NULL DEFAULT 'dinner'")
    if 'leftover' not in cols:
        conn.execute("ALTER TABLE records ADD COLUMN leftover INTEGER NOT NULL DEFAULT 0")
    if conn.execute('SELECT COUNT(*) FROM dishes').fetchone()[0] == 0:
        conn.executemany(
            'INSERT INTO dishes (name, emoji) VALUES (?, ?)', DEFAULT_DISHES)
    conn.commit()
    conn.close()


def dish_to_dict(row):
    return {
        'id': row['id'],
        'name': row['name'],
        'emoji': row['emoji'],
        'image': f'/static/uploads/{row["image"]}' if row['image'] else None,
        'created_at': row['created_at'],
    }


def record_to_dict(r):
    return {
        'id': r['id'],
        'dish_id': r['dish_id'],
        'meal_date': r['meal_date'],
        'meal': r['meal'] or 'dinner',
        'leftover': bool(r['leftover']),
        'created_at': r['created_at'],
        'name': r['name'] or '已删除的菜',
        'emoji': r['emoji'] or '🍽️',
        'image': f'/static/uploads/{r["image"]}' if r['image'] else None,
    }


RECORD_SELECT = '''
    SELECT r.id, r.dish_id, r.meal_date, r.meal, r.leftover, r.created_at,
           d.name, d.emoji, d.image
    FROM records r LEFT JOIN dishes d ON d.id = r.dish_id
'''


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/dishes', methods=['GET'])
def list_dishes():
    conn = get_db()
    rows = conn.execute('SELECT * FROM dishes ORDER BY id DESC').fetchall()
    conn.close()
    return jsonify([dish_to_dict(r) for r in rows])


@app.route('/api/dishes', methods=['POST'])
def add_dish():
    name = (request.form.get('name') or '').strip()
    if not name:
        return jsonify({'error': '请填写菜名'}), 400
    emoji = (request.form.get('emoji') or '🍽️').strip() or '🍽️'
    image_name = None
    file = request.files.get('image')
    if file and file.filename:
        ext = file.filename.rsplit('.', 1)[-1].lower()
        if ext not in ALLOWED_EXT:
            return jsonify({'error': '仅支持 png/jpg/jpeg/gif/webp 图片'}), 400
        image_name = f'{today_cn().replace("-", "")}_{random.randint(10000, 99999)}.{ext}'
        file.save(os.path.join(UPLOAD_DIR, image_name))
    conn = get_db()
    cur = conn.execute(
        'INSERT INTO dishes (name, emoji, image) VALUES (?, ?, ?)',
        (name, emoji, image_name))
    row = conn.execute('SELECT * FROM dishes WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.commit()
    conn.close()
    return jsonify(dish_to_dict(row)), 201


@app.route('/api/dishes/<int:dish_id>', methods=['DELETE'])
def delete_dish(dish_id):
    conn = get_db()
    row = conn.execute('SELECT image FROM dishes WHERE id = ?', (dish_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '菜品不存在'}), 404
    if row['image']:
        try:
            os.remove(os.path.join(UPLOAD_DIR, row['image']))
        except OSError:
            pass
    conn.execute('DELETE FROM dishes WHERE id = ?', (dish_id,))
    conn.execute('DELETE FROM records WHERE dish_id = ?', (dish_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/random', methods=['GET'])
def random_dish():
    conn = get_db()
    row = conn.execute('SELECT * FROM dishes ORDER BY RANDOM() LIMIT 1').fetchone()
    conn.close()
    if not row:
        return jsonify({'error': '菜库是空的，先去添加菜品吧'}), 404
    return jsonify(dish_to_dict(row))


@app.route('/api/records', methods=['GET'])
def list_records():
    day = request.args.get('date') or today_cn()
    conn = get_db()
    rows = conn.execute(
        RECORD_SELECT + ' WHERE r.meal_date = ? ORDER BY r.id DESC', (day,)).fetchall()
    conn.close()
    return jsonify([record_to_dict(r) for r in rows])


@app.route('/api/records/days', methods=['GET'])
def list_record_days():
    conn = get_db()
    rows = conn.execute(
        RECORD_SELECT + ' ORDER BY r.meal_date DESC, r.id DESC').fetchall()
    conn.close()
    today = today_cn()
    days = {}
    for r in rows:
        if r['meal_date'] == today:
            continue
        days.setdefault(r['meal_date'], []).append(record_to_dict(r))
    result = []
    for day, items in days.items():
        result.append({
            'date': day,
            'count': len(items),
            'thumbs': [{'image': i['image'], 'emoji': i['emoji']} for i in items[:4]],
        })
    result.sort(key=lambda x: x['date'], reverse=True)
    return jsonify(result)


@app.route('/api/records', methods=['POST'])
def add_record():
    data = request.get_json(silent=True) or {}
    dish_id = data.get('dish_id')
    if not dish_id:
        return jsonify({'error': '缺少菜品'}), 400
    meal = data.get('meal')
    if meal not in MEALS:
        meal = meal_now()
    conn = get_db()
    if not conn.execute('SELECT 1 FROM dishes WHERE id = ?', (dish_id,)).fetchone():
        conn.close()
        return jsonify({'error': '菜品不存在'}), 404
    conn.execute('INSERT INTO records (dish_id, meal_date, meal) VALUES (?, ?, ?)',
                 (dish_id, today_cn(), meal))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'meal': meal}), 201


@app.route('/api/records/<int:record_id>', methods=['PATCH'])
def update_record(record_id):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    if not conn.execute('SELECT 1 FROM records WHERE id = ?', (record_id,)).fetchone():
        conn.close()
        return jsonify({'error': '记录不存在'}), 404
    if 'meal' in data:
        if data['meal'] not in MEALS:
            conn.close()
            return jsonify({'error': '无效餐段'}), 400
        conn.execute('UPDATE records SET meal = ? WHERE id = ?', (data['meal'], record_id))
    if 'leftover' in data:
        conn.execute('UPDATE records SET leftover = ? WHERE id = ?',
                     (1 if data['leftover'] else 0, record_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/records/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    conn = get_db()
    conn.execute('DELETE FROM records WHERE id = ?', (record_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/leftovers', methods=['GET'])
def list_leftovers():
    conn = get_db()
    rows = conn.execute('''
        SELECT r.id, r.dish_id, r.meal_date, r.meal, r.leftover, r.created_at,
               d.name, d.emoji, d.image
        FROM records r JOIN dishes d ON d.id = r.dish_id
        WHERE r.leftover = 1
        ORDER BY r.meal_date DESC, r.id DESC
    ''').fetchall()
    conn.close()
    return jsonify([record_to_dict(r) for r in rows])


@app.route('/api/leftovers/eat', methods=['POST'])
def eat_leftover():
    data = request.get_json(silent=True) or {}
    rid = data.get('record_id')
    if not rid:
        return jsonify({'error': '缺少记录'}), 400
    meal = data.get('meal')
    if meal not in MEALS:
        meal = meal_now()
    conn = get_db()
    row = conn.execute(
        'SELECT dish_id FROM records WHERE id = ? AND leftover = 1', (rid,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '剩菜记录不存在'}), 404
    conn.execute('INSERT INTO records (dish_id, meal_date, meal) VALUES (?, ?, ?)',
                 (row['dish_id'], today_cn(), meal))
    conn.execute('UPDATE records SET leftover = 0 WHERE id = ?', (rid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'meal': meal}), 201


@app.route('/static/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 3000)), debug=False)
