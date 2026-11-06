# 今天吃什么 🍽️

一个"今天吃什么"决策应用——专为每天纠结做饭的人设计。左右滑动卡片选菜、一键随机摇菜、拍照建菜库、按早/午/晚饭记录、剩菜提醒，界面采用 iOS 26 液态玻璃（Liquid Glass）风格。

## 功能特性

| 功能 | 说明 |
|---|---|
| 🃏 左右滑动选菜 | 卡片堆平移轮播，左侧露上一道、右侧露下一道，拖拽跟手 |
| 🎲 一键选菜 | 老虎机式轮播减速动画，随机定格弹窗确认 |
| 🕐 餐段自动识别 | 5:00-10:29 早饭 / 10:30-16:29 午饭 / 其余晚饭，可手动切换 |
| 📷 图片菜库 | 上传菜品照片 + 菜名，图片存本地磁盘，元数据存 SQLite |
| 🥡 剩菜管理 | 记录一键标记剩菜，首页横幅提醒"冰箱里有剩菜"，一键"吃掉它" |
| 📅 吃饭记录 | 当日按餐分组竖版列表；往日按日期折叠（缩略图 + 日期徽章），展开懒加载 |
| 🔍 全屏灯箱 | 点击记录缩略图全屏看大图，左右滑动切换同餐菜品，首尾有到头/到底提示 |
| 📱 PWA 支持 | 可安装到手机桌面，全屏运行，Service Worker 静态资源缓存 |

## 技术栈

- **后端**：Python 3.10+ / Flask / SQLite（零外部数据库依赖）
- **前端**：原生 HTML/CSS/JS，无构建工具，单页应用
- **风格**：iOS 26 液态玻璃（backdrop-filter 毛玻璃 + 流动渐变光斑背景 + 大圆角）
- **打包 APK**：PWA 直接安装，或 Capacitor 打包（见 [BUILD_APK.md](BUILD_APK.md)）

## 快速开始

```bash
cd what-to-eat-today
python3 -m pip install -r requirements.txt
python3 app.py              # 默认 http://127.0.0.1:3000
# 自定义端口：PORT=8000 python3 app.py
```

首次启动自动建库并预置 12 道家常菜。可选执行 `python3 gen_sample_dishes.py` 与 `python3 add_demo.py` 生成带图片的演示数据。

部署到自有服务器（VPS）见 [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md)。

## 目录结构

```
what-to-eat-today/
├── app.py                    # Flask 后端：路由 + SQLite + 图片上传
├── requirements.txt
├── gen_icons.py              # 生成 PWA 图标（PIL 绘制）
├── gen_sample_dishes.py      # 生成示例菜品图（红烧肉/番茄炒蛋）
├── add_demo.py               # 插入往日演示记录
├── capacitor.config.json     # Capacitor APK 打包配置
├── BUILD_APK.md              # APK 打包指南（PWA / Capacitor 两条路线）
├── templates/index.html      # 单页应用骨架
├── static/
│   ├── css/style.css         # 液态玻璃风格样式
│   ├── js/app.js             # 全部交互逻辑（轮播/记录/灯箱等）
│   ├── manifest.json         # PWA 清单
│   ├── sw.js                 # Service Worker
│   ├── icons/                # 应用图标（脚本生成）
│   └── uploads/              # 用户上传的菜品图片（运行时数据，不入库）
├── data.db                   # SQLite 数据库（运行时生成，不入库）
└── docs/
    ├── DEVELOPMENT.md        # 二次开发文档（架构/数据模型/API）
    └── DEPLOY_VPS.md         # VPS 生产部署文档
```

## 数据与备份

- 数据库：`data.db`（SQLite 单文件）
- 图片：`static/uploads/`
- 备份 = 复制这两个位置；迁移 = 原样拷到新机器同路径

## License

MIT
