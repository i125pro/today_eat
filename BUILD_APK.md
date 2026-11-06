# 今天吃什么 — APK 打包指南

本作品是「网页 + PWA」应用，有两种方式变成手机上的 App：

## 方式一：PWA 直接安装（推荐，零工具）

1. 用手机浏览器（Android 用 Chrome，iOS 用 Safari）打开应用链接
2. 菜单 →「添加到主屏幕」/「安装应用」
3. 桌面出现「今天吃什么」图标，点开即全屏运行，体验与原生 App 一致

## 方式二：Capacitor 打包成真 APK

需要本地环境：Node 18+、JDK 17、Android Studio（含 SDK）。

```bash
# 1. 新建 Capacitor 工程
mkdir what-to-eat-app && cd what-to-eat-app
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. 把本项目的 capacitor.config.json 复制进来
#    将 server.url 改成你部署好的后端地址（如 http://192.168.1.10:5000）
#    或者把网页构建产物放入 www/ 目录用离线模式

# 3. 添加 Android 平台并生成 APK
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug

# 产物位置：
# android/app/build/outputs/apk/debug/app-debug.apk
```

签名发布版：

```bash
keytool -genkey -v -keystore my-release.keystore -alias whattoeat -keyalg RSA -validity 10000
./gradlew assembleRelease
```

## 部署后端（供 APK / PWA 访问）

```bash
pip install -r requirements.txt
python app.py            # 默认 5000 端口，可用 PORT=xxx 指定
```

数据存储：SQLite（data.db）+ 上传图片（static/uploads/），备份这两个位置即可。
