# VPS 版本升级指南

适用场景：VPS 上已按 [DEPLOY_VPS.md](DEPLOY_VPS.md) 部署过旧版本，现在要升级到新代码。

## 升级总流程

```bash
su - whattoeat
cd ~/what-to-eat-today

# 1. 备份（升级失败可回滚）
~/backup.sh 2>/dev/null || { DIR=$PWD; STAMP=$(date +%Y%m%d_%H%M);
  sqlite3 data.db ".backup '/tmp/wte_$STAMP.db'";
  tar -czf ~/backups/wte_$STAMP.tar.gz -C /tmp wte_$STAMP.db -C "$DIR/static" uploads; }

# 2. 拉取新代码
git pull origin main

# 3. 数据库迁移（关键！见下方"为什么必须执行"）
.venv/bin/python3 -c "from app import init_db; init_db()"

# 4. 更新依赖（requirements.txt 有变化时）
.venv/bin/pip install -r requirements.txt

# 5. 重启服务
sudo systemctl restart whattoeat

# 6. 验证
curl -s http://127.0.0.1:8000/api/dishes | head -c 200
```

## 各版本升级要点

### v2（2026-11-06）：修复删除闪烁 + 上传防重复

**数据库变更**：dishes 表新增 `image_md5` 列（老库自动迁移）。

**为什么必须手动跑迁移**：生产用 gunicorn 导入 `app:app`，不触发 `app.py` 的 `__main__` 块，`init_db()` 不会自动执行。跳过第 3 步会导致 `/api/dishes` POST 接口报 `no such column: image_md5` 错误。

**变更内容**：
- 删除记录动画结束后改为局部 DOM 清理，不再整列表重建（消除闪烁）
- 上传按钮提交期间禁用并显示"上传中…"
- 后端幂等：10 分钟内同名同图（md5 相同）或同名无图的重复提交返回已有记录，不再重复入库

**验证方法**：上传一张图连点两次"添加到菜库"，菜库只多一道菜；删除任一记录无闪烁。

**前端缓存注意**：Service Worker 缓存版本升至 v7，用户首次打开旧页面时需强制刷新一次（或等 SW 后台更新完成后二次打开自动生效）。

### 后续版本

按上方总流程执行即可；若新版本含数据库变更，升级要点中会像本节一样显式标注。

## 回滚

```bash
su - whattoeat
cd ~/what-to-eat-today
git checkout <旧版本commit>          # 代码回滚
# 数据回滚（仅数据库结构不兼容时才需要）：
tar -xzf ~/backups/wte_<STAMP>.tar.gz -C /tmp
cp /tmp/data.db ~/what-to-eat-today/data.db
tar -xzf ~/backups/wte_<STAMP>.tar.gz -C /tmp   # uploads 在包内
cp -r /tmp/uploads ~/what-to-eat-today/static/uploads
sudo systemctl restart whattoeat
```

## 常见升级问题

| 现象 | 处理 |
|---|---|
| git pull 冲突（改过服务器上的文件） | `git stash && git pull && git stash pop`，或确认改动无价值后 `git checkout -- .` |
| 迁移命令报错 no such table | 说明从未成功建库，直接跑 `.venv/bin/python3 -c "from app import init_db; init_db()"` 建库（老数据不受影响） |
| 重启后 502 | `journalctl -u whattoeat -n 50` 查日志，多为 venv 路径或依赖问题 |
| 页面仍是旧版 | 浏览器 SW 缓存，强制刷新；或确认 `static/js/app.js` 里 CACHE 版本号已更新 |
