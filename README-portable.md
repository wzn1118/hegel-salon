# Hegel Salon Portable

这是可直接分发的完整包说明。

重要

如果你是在 zip 预览窗口里直接双击 `launch-hegel-salon.cmd`，脚本现在会先自动解压，再启动。

但其他脚本仍然建议在解压后的普通文件夹里运行。

一键启动

1. 双击 `launch-hegel-salon.cmd`
2. 脚本会自动：
   - 检查 `config/api.json`
   - 启动本地服务
   - 自动打开浏览器到 `http://127.0.0.1:3087`

如果当前是在 zip 预览窗口里双击：

1. `launch-hegel-salon.cmd` 会先把整个 zip 解压到 zip 所在目录
2. 再自动启动解压后的正式目录里的程序

普通启动

1. 双击 `start-hegel-salon.cmd`
2. 浏览器手动打开 `http://127.0.0.1:3087`

一键停止

1. 双击 `stop-hegel-salon.cmd`
2. 脚本会关闭当前正在运行的 Hegel Salon 本地服务

配置 API 的两种方式

方式一：前端填写

1. 打开页面
2. 点击右上角 `API 配置`
3. 填写：
   - `Provider`
   - `Model`
   - `中转站 / Base URL`
   - `API Key`
4. 点击 `保存配置`
5. 下一次提问立即生效，不需要重启

方式二：本地文件填写

1. 双击 `configure-api.cmd`
2. 编辑 `config/api.json`
3. 保存后重新发问

默认配置文件

- `config/api.json`
- `config/api.example.json`

默认值

- `provider`: `openai`
- `model`: `gpt-5.4`
- `baseURL`: `https://api.openai.com/v1`

配置优先级

1. 项目目录里的 `config/api.json`
2. 项目目录里的 `.env.local`
3. 本机环境变量
4. 本机 Codex 配置

包内主要内容

- `src/`
- `public/`
- `data/`
- `local-resources/`
- `node_modules/`
- `config/`
- `configure-api.cmd`
- `start-hegel-salon.cmd`
- `launch-hegel-salon.cmd`
- `launch-hegel-salon.ps1`
- `stop-hegel-salon.cmd`
- `stop-hegel-salon.ps1`

本地训练资料

`local-resources/` 已经包含原来在项目目录外的本地资料：

- 黑格尔 14 册合集的 `txt / pdf / epub / mobi / azw3`
- 《精神现象学》贺麟上卷 PDF
- 《精神现象学》贺麟下卷 PDF
- 《精神现象学》先刚 OCR PDF

说明

- 包里保留了 ASCII 别名文件名，便于跨机器使用
- 原始中文文件名也一并保留，作为资料归档
- 发给别人之前，不要把你自己的真实 API key 留在 `config/api.json` 里
