# Hegel Salon Android App

这个目录是一套 Android 壳工程，用来把现有的 Hegel Salon 服务装进手机端 WebView。

## 结构

- `www/`: Android App 启动页。负责保存服务地址、测试连接并跳转进入真正的 Hegel Salon。
- `android/`: Capacitor 生成的原生 Android Studio 工程。

## 默认使用方式

1. 先确保 Hegel Salon 服务在电脑上运行。
2. Android 模拟器里填 `http://10.0.2.2:3087`。
3. 真机调试时，改成电脑在同一局域网中的 IP，例如 `http://192.168.1.23:3087`。
4. 点击“测试连接”后，再点“进入沙龙”。

## 常用命令

- `npm install`
- `npm run sync`
- `npm run open:android`

## 说明

这不是把 Node 后端直接搬进 Android 本地执行，而是让 Android App 作为 Hegel Salon 的移动入口。
这样可以保留现有附件解析、图片理解和 computer use 等后端能力，同时先把手机端壳稳定落下来。
