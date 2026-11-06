# VPS 生产部署指南（香港 5GB VPS）

目标：Flask + SQLite + 图片上传 跑在自己的 VPS 上，国内可直接访问（香港无需备案，延迟一般 30-80ms）。

架构：`Caddy(80/443, 自动HTTPS) → Gunicorn(127.0.0.1:8000) → Flask`，systemd 守护，SQLite + uploads 定时备份。

> 也可用 Nginx + certbot 替代 Caddy，但 Caddy 一个二进制自带证书签发续期，更省事。

## 1. 前置条件

- VPS：Debian 11/12 或 Ubuntu 22.04，2C5G 足够（本项目内存占用 < 150MB）
- 一个域名（可选，强烈建议）：解析 A 记录到 VPS IP。无域名也可先用 `http://IP:端口` 裸跑，但 PWA 安装、上传图片等特性要求安全上下文（HTTPS 或 localhost），**建议上域名**

## 2. 服务器初始化

```bash
# 以 root 执行；以下命令以 Debian/Ubuntu 为准
apt update && apt upgrade -y
apt install -y python3 python3-venv python3-pip git caddy

# 建运行用户（不用 root 跑业务）
adduser --disabled-password --gecos "" whattoeat
```

## 3. 部署代码

方式 A——从 GitHub 拉取（推荐）：

```bash
su - whattoeat
git clone https://github.com/<你的用户名>/<仓库名>.git ~/what-to-eat-today
```

方式 B——本地打包上传（首次）：

```bash
# 本地
scp what-to-eat-today.tar.gz root@<VPS_IP>:/tmp/
# VPS
mkdir -p /home/whattoeat/what-to-eat-today
tar -xzf /tmp/what-to-eat-today.tar.gz -C /home/whattoeat/what-to-eat-today --strip-components=1
chown -R whattoeat:whattoeat /home/whattoeat/what-to-eat-today
```

## 4. 安装依赖（含生产 WSGI）

```bash
su - whattoeat
cd ~/what-to-eat-today
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt gunicorn pillow
```

`requirements.txt` 生产补充一行 `gunicorn>=21.0`（或如上直接装）。

首次建库 + 演示数据（可选）：

```bash
.venv/bin/python3 -c "from app import init_db; init_db()"
.venv/bin/python3 gen_icons.py
.venv/bin/python3 gen_sample_dishes.py   # 可选演示数据
```

## 5. systemd 服务

`/etc/systemd/system/whattoeat.service`：

```ini
[Unit]
Description=What-to-eat-today Flask app
After=network.target

[Service]
User=whattoeat
Group=whattoeat
WorkingDirectory=/home/whattoeat/what-to-eat-today
Environment=PORT=8000
ExecStart=/home/whattoeat/what-to-eat-today/.venv/bin/gunicorn \
  --workers 2 --threads 4 \
  --bind 127.0.0.1:8000 \
  --access-logfile - --error-logfile - app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

> 注意 `app.py` 里 `init_db()` 只在 `__main__` 里执行；gunicorn 导入 `app:app` 不触发。解决办法（二选一）：
> 1. 保持上面"首次建库"手动执行过一次；
> 2. 或把 `init_db()` 移到模块级（`app = Flask(...)` 之后直接调用一次），生产更省心。

```bash
systemctl daemon-reload
systemctl enable --now whattoeat
systemctl status whattoeat
curl -s http://127.0.0.1:8000/api/dishes | head -c 200   # 自检
```

## 6. Caddy 反向代理（自动 HTTPS）

`/etc/caddy/Caddyfile`：

```
eat.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8000
    # 上传图片体积上限
    request_body {
        max_size 12MB
    }
}
```

```bash
systemctl reload caddy
```

域名 DNS 解析生效后，Caddy 自动签发 Let's Encrypt 证书并续期。之后 `https://eat.example.com` 即可访问，手机浏览器"添加到主屏幕"即安装 PWA。

## 7. 数据备份（cron）

SQLite 在写入中直接 cp 有极小概率拿到半写文件，用 `.backup` 更稳。`/home/whattoeat/backup.sh`：

```bash
#!/bin/bash
set -e
DIR=/home/whattoeat/what-to-eat-today
STAMP=$(date +%Y%m%d_%H%M)
sqlite3 "$DIR/data.db" ".backup '/tmp/wte_$STAMP.db'"
mkdir -p ~/backups
tar -czf ~/backups/wte_$STAMP.tar.gz -C /tmp wte_$STAMP.db -C "$DIR/static" uploads
rm /tmp/wte_$STAMP.db
# 保留最近 14 份
ls -1t ~/backups/wte_*.tar.gz | tail -n +15 | xargs -r rm
```

```bash
apt install -y sqlite3
chmod +x /home/whattoeat/backup.sh
crontab -e -u whattoeat   # 每天凌晨 3 点备份
# 0 3 * * * /home/whattoeat/backup.sh
```

恢复：解包后把 `data.db` 覆盖回项目根目录、`uploads/` 覆盖回 `static/uploads/`，重启服务。

## 8. 5GB 内存下的注意点

- gunicorn 2 workers × Flask 约占 150MB，余量大；workers 不必加多（SQLite 写是串行的）
- 图片会持续累积：可在 Caddy 加 `browse` 关闭；建议定期清理孤儿图片（菜删了图还在的极端情况由后端处理，正常删除菜品会同时删图）
- 磁盘若只有 10-20GB，留意 `~/backups` 与 uploads 增长

## 9. 更新版本

```bash
su - whattoeat
cd ~/what-to-eat-today
git pull
.venv/bin/pip install -r requirements.txt
sudo systemctl restart whattoeat
```

## 10. 常见问题

| 现象 | 处理 |
|---|---|
| 访问 502 | `systemctl status whattoeat` 看 gunicorn 是否起；`journalctl -u whattoeat -n 50` |
| 上传 413 | Caddy `max_size` 与 Flask `MAX_CONTENT_LENGTH` 都要够（当前 12MB/10MB） |
| 时间不对导致餐段错 | `timedatectl set-timezone Asia/Shanghai`（后端固定 UTC+8，一般不受影响，仅 created_at 展示受影响） |
| 手机无法安装 PWA | 必须 HTTPS + 域名；确认 `manifest.json` 图标 192/512 存在 |
