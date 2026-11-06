# 二次开发指南

面向想改功能 / 加模块的开发者。读完本文即可独立扩展本项目。

## 1. 架构总览

```
浏览器                          Flask (app.py)                存储
┌────────────────┐   fetch    ┌──────────────────┐          ┌─────────┐
│ index.html     │ ────────►  │ /api/* 路由       │ ──────►  │ SQLite  │
│ style.css      │  JSON/表单 │ (10 个 REST 接口) │          │ data.db │
│ app.js         │ ◄────────  │ 静态资源托管      │ ──────►  │ uploads/│
│ sw.js (PWA)    │            └──────────────────┘          │ (图片)  │
└────────────────┘
```

- 前后端仅通过 `/api/*` JSON 接口通信，页面刷新数据即最新（无前端状态同步问题）
- 前端无框架无构建，改完刷新即生效；改 `sw.js` 需把 `CACHE` 版本号 +1 让客户端更新缓存

## 2. 数据模型（SQLite）

```sql
dishes (菜库)
  id          INTEGER 主键
  name        TEXT    菜名（唯一性由业务保证，未加唯一索引）
  emoji       TEXT    无图时的占位表情，默认 '🍽️'
  image       TEXT    图片文件名（存 static/uploads/ 下，NULL 表示无图）
  created_at  TEXT    创建时间（本地 UTC+8）

records (吃饭记录)
  id          INTEGER 主键
  dish_id     INTEGER → dishes.id（删除菜品时级联删除记录）
  meal_date   TEXT    'YYYY-MM-DD'（统一 UTC+8 日期）
  meal        TEXT    'breakfast' | 'lunch' | 'dinner'
  leftover    INTEGER 0/1 是否剩菜
  created_at  TEXT    记录时间（含 HH:MM，用于列表展示）
```

要点：
- **日期统一**：后端 `today_cn()` 固定 UTC+8；前端 `localDate()` 用浏览器本地日期。若部署在海外 VPS 且用户在国内，两端结果仍一致（后端不依赖服务器时区）。改时区只需动 `CST` 常量
- **餐段判定**：`meal_now()`（5:00-10:29 早 / 10:30-16:29 午 / 其余晚），前端 `mealNow()` 有一份相同逻辑，**两处需同步改**
- 加字段时仿照 `init_db()` 里的 `PRAGMA table_info` + `ALTER TABLE` 迁移写法，老库升级不会丢数据

## 3. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/dishes` | 菜库列表（id 倒序） |
| POST | `/api/dishes` | 新增菜（multipart：name、emoji、image 可选） |
| DELETE | `/api/dishes/<id>` | 删菜 + 级联删记录 + 删图片文件 |
| GET | `/api/random` | 随机一道菜 |
| GET | `/api/records?date=YYYY-MM-DD` | 某日记录（含菜名/emoji/图片联查） |
| POST | `/api/records` | 记一笔 `{dish_id, meal?}`，meal 缺省取当前时段 |
| PATCH | `/api/records/<id>` | 改餐段 `{meal}` / 剩菜 `{leftover}` |
| DELETE | `/api/records/<id>` | 删记录 |
| GET | `/api/records/days` | 往日聚合：`[{date, count, thumbs[4]}]`（排除今天） |
| GET | `/api/leftovers` | 剩菜清单（JOIN dishes，含来源日期/餐段） |
| POST | `/api/leftovers/eat` | 吃剩菜 `{record_id, meal?}`：新记一笔 + 取消剩菜标记 |

响应约定：成功返回 JSON；失败返回 `{"error": "中文提示"}` + 4xx。前端 `api()` 统一抛错走 toast。

## 4. 前端模块划分（static/js/app.js）

| 模块 | 关键函数/对象 | 说明 |
|---|---|---|
| 全局状态 | `state` | dishes/idx/mealOverride/leftovers/openDays 等 |
| 卡片轮播 | `cardEls` / `syncStage(dir)` / `windowOf()` | **持久 DOM 平移轮播**：卡片元素与菜品 pos 绑定复用，翻页时同一 rAF 统一更新 transform；退出卡滑向深位淡出后 remove。勿改回"销毁重建"（会闪烁/方向错乱） |
| 拖拽 | `onCardDown` + window pointer 事件 | 仅 `data-slot=c0` 主卡可拖；松手超阈值翻页 |
| 一键选菜 | `spinBtn` handler / `spinStep()` | 递增延迟轮播；spinStep 用 no-trans 直达（跳过过渡） |
| 餐段 | `mealNow()` / `currentMeal()` / `renderMealPill()` | 自动 + 手动覆盖 |
| 灯箱 | `lb` / `openLightbox(list, idx)` / `lbNav(step)` | 同餐列表内滑动，首尾 toast 提示 |
| 记录列表 | `recordItem(r, mealList, idx)` / `renderGrouped()` | 竖版列表；删除走 `removeWithAnim()`（先 API 成功再播左滑渐隐+高度收起动画） |
| 往日折叠 | `renderAccordion()` / `state.openDays` / `state.dayCache` | 展开懒加载；删除后折叠状态保持 |
| 剩菜横幅 | `loadLeftovers()` / `renderLeftoverBanner()` | 记录/选菜两页共享 |

样式全部在 `static/css/style.css`，按 `/* ---------- 分区 ---------- */` 注释分段，组件类名前缀：`.lb-*`（剩菜）、`.mc-*`（餐卡）、`.day-*`（折叠）、`.record-*`（列表）。

## 5. 常见扩展示例

### 5.1 给菜品加"标签"字段（如荤/素）

1. `app.py`：`init_db()` 加迁移 `ALTER TABLE dishes ADD COLUMN tag TEXT DEFAULT ''`；`dish_to_dict()` 输出 `tag`；POST/接口接收
2. `index.html`：菜库上传卡加 `<select>`
3. `app.js`：`addDishBtn` 的 FormData 追加 `tag`；`buildCard`/`renderGrid` 展示

### 5.2 加"周报统计"页

1. `app.py` 新增 `GET /api/stats/week`（按 meal_date 聚合 COUNT）
2. `index.html` 加 `<section id="view-stats" class="view">` + tabbar 加一个 `.tab`
3. `app.js`：tab 事件已按 `data-view` 泛化，新增 `viewTitles` 条目 + 渲染函数即可

### 5.3 换端口 / 多实例

`PORT=8000 python3 app.py`。同一 data.db 不要多实例并发写（SQLite 锁）。

## 6. 动画实现备忘

- 轮播槽位常量：`SLOT_T`/`SLOT_O`（五槽 l2/l1/c0/r1/r2）+ `DEEP_T`（进出深位）。调卡片间距改这里，别改 .card 的 CSS transition
- 删除动画时序：左滑 0.28s → 高度/边距收起 0.26s（delay 0.08s）→ 380ms 后 remove + 重新拉数据
- 弹窗关闭：`.closing` 类一次性接管 transform/opacity（左滑 -130% + 旋转）

## 7. 测试与调试

```bash
python3 -m py_compile app.py        # 语法检查
node --check static/js/app.js       # JS 语法检查
python3 -c "from app import init_db; init_db()"   # 手动建库
curl -s localhost:3000/api/dishes | python3 -m json.tool
```

改完自测路径：上传带图菜品 → 滑动选菜 → 就吃这个 → 记录页出现 → 标剩菜 → 首页横幅出现 → 吃掉它 → 往日折叠展开删除 → 折叠状态保持。
