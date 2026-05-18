# Hegel Salon

## Public GitHub Release

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

This repository is prepared as a public-source release. It ships with the
German/English public-domain or openly mirrored corpus under `data/corpus/texts`.
It does not ship private user data, API keys, sessions, uploads, browser profiles,
licensed Chinese translations, PDFs, ebooks, or OCR exports.

Quick start:

```bash
npm install
npm run start
```

Docker start:

```bash
docker compose up -d --build
```

For a public HTTPS deployment, set these environment variables before first run:

```text
HEGEL_ENABLE_AUTH=1
HEGEL_PUBLIC_BASE_URL=https://your-domain.example
HEGEL_ALLOWED_ORIGINS=https://your-domain.example
HEGEL_API_CONFIG_MASTER_KEY=<long-random-secret>
HEGEL_ADMIN_ACCOUNT=<admin-login>
HEGEL_ADMIN_EMAIL=<admin-email>
HEGEL_ADMIN_PASSWORD=<admin-password>
HEGEL_SMTP_HOST=<smtp-host>
HEGEL_SMTP_PORT=<smtp-port>
HEGEL_SMTP_SECURE=<true-or-false>
HEGEL_SMTP_USER=<smtp-user>
HEGEL_SMTP_PASS=<smtp-password-or-app-password>
HEGEL_MAIL_FROM=Hegel Salon <no-reply@your-domain.example>
```

Users configure their own model provider, base URL, model, and API key inside
the frontend after login. The public repo intentionally leaves default API
configuration blank.

Licensed or private materials should be added only after cloning, through
`local-resources/` or a private persistent volume. Do not commit those materials
to the public repository.

Hegel Salon 是一个面向中文场景的黑格尔式阅读与论证工作台。

它不是通用聊天机器人外套，而是把黑格尔语料、引文核验、现实判断、附件理解、浏览器代理和一套持续优化链放进同一个本地可运行产品里的实验项目。

当前项目形态以桌面端 Web 应用为主，同时包含一个 Android 原生壳工程。

## 项目定位

这个项目试图解决三个问题：

1. 如何让一个“黑格尔式”回答系统不只是模仿语气，而是真正受语料、概念和论证结构约束。
2. 如何把 PDF、Excel、图片、网页操作这些现实工作流接进同一条回答链。
3. 如何把失败样本、形式逻辑审查、史学审查和持续优化回路做成系统能力，而不是只靠一次性 prompt 调优。

## 当前能力

- 中文优先的 Hegel persona 与原典导向回答链
- 本地项目级 API 配置与多模型/中转兼容
- 附件理解：PDF、Excel、CSV、TXT、JSON、Markdown、图片
- 浏览器版 computer use：网页导航、点击、输入、截图回传
- 现实判断题的历史引用模块
- 形式逻辑、史学与表达质量的多层评分
- 数据驱动优化回路：失败记忆、优化 playbook、批量跑题
- Android 原生 App 壳工程

## 仓库结构

```text
.
├─ public/                  Web 前端
├─ src/                     Node 服务、语料检索、回答链、评测与优化脚本
├─ config/                  项目 API 配置
├─ data/                    日志、语料缓存、上传文件、优化产物
├─ local-resources/         本地黑格尔资料
├─ android-app/             Android 原生壳工程
├─ launch-hegel-salon.cmd   一键启动
├─ start-hegel-salon.cmd    启动本地服务
└─ stop-hegel-salon.cmd     停止本地服务
```

## 技术架构

桌面端主链路由 `src/server.mjs` 驱动。

核心模块包括：

- `src/hegelPrompt.mjs`
  负责 persona、风格、引文纪律与现实判断约束
- `src/hegelCorpus.mjs`
  负责本地语料检索与工作文本切片
- `src/hegelContext.mjs`
  负责把语料、平行引文、中文版本与历史引用模块拼成上下文
- `src/hegelHistorical.mjs`
  负责现实判断题的历史引用补强
- `src/hegelQuoteValidation.mjs`
  负责引文真伪与层级核查
- `src/browserComputer*.mjs`
  负责浏览器版 computer use
- `src/runFormalLogicStress.mjs`
  负责形式逻辑压力评测
- `src/runHistoriographyStress.mjs`
  负责史学压力评测
- `src/runQualityOptimizer.mjs`
  负责 90 分导向的批量优化
- `src/optimizerMemory.mjs`
  负责失败记忆与优化 playbook 回灌

## 快速开始

### 1. 安装依赖

项目已经以 Node.js 为运行时。

```bash
npm install
```

### 2. 配置 API

发布仓库默认保留的是安全占位文件。
本地真实配置建议写到：

```text
config/api.local.json
```

若没有 `api.local.json`，系统才会回退到：

```text
config/api.json
```

示例：

```json
{
  "provider": "openai",
  "model": "gpt-5.4",
  "baseURL": "https://your-compatible-endpoint/v1",
  "apiKey": "YOUR_KEY"
}
```

### 3. 启动桌面端

```bash
npm run start
```

或直接双击：

```text
launch-hegel-salon.cmd
```

默认地址：

```text
http://127.0.0.1:3087/
```

## Web 端主要功能

### Hegel 对话

不是简单输出“黑格尔腔”，而是尽量按概念规定、反对意见、答复与结论的结构组织回答。

### 附件理解

支持：

- PDF
- XLS / XLSX
- CSV / TSV
- TXT
- JSON
- Markdown
- PNG / JPG / WEBP / GIF / SVG

### Computer Use

当前实现是浏览器内的 computer use，不是系统级桌面代理。

支持：

- 打开页面
- 点击
- 输入
- 滚动
- 截图回传

### 现实判断题

现实政治与当代问题会触发一层历史引用模块，尝试用世界历史、法哲学与精神哲学材料给现实判断加上历史形式与类比边界。

## 评测与优化

### 形式逻辑压力测试

```bash
npm run eval:formal-stress
```

### 史学压力测试

```bash
npm run eval:historical-stress
```

### 90 分导向优化

```bash
npm run optimize:90
```

相关产物位于：

```text
data/logs/optimizer-progress.json
data/logs/optimizer-playbook.json
data/logs/optimizer-memory.jsonl
```

## Android App

仓库包含 Android 原生壳工程：

```text
android-app/
```

它的作用是把 Hegel Salon 的移动入口做成真正的 Android App，而不是单纯浏览器书签。

当前形态：

- 原生首页
- 原生地址配置
- 原生 WebView 内容页
- 原生文件选择器接入

## 当前状态

这个项目已经可以运行、可以回答、可以处理附件，也可以做浏览器代理与批量优化。

但它仍然是实验性系统，尤其在以下方面还没有到“稳定完成版”：

- 形式逻辑满分并不成立
- 史学判断满分并不成立
- 90 分导向优化链已跑通，但还没有稳定把平均质量推到 90+
- 现实判断题的历史对照还需要更具体的制度案例库

因此，这个仓库更适合被理解为：

一个已经能工作的产品原型，加上一套仍在持续强化的研究型回答引擎。

## 推荐使用方式

- 如果你要本地使用，直接跑桌面端
- 如果你要演示产品能力，优先展示 Web 端
- 如果你要继续研发，优先看 `src/server.mjs`、`src/hegelContext.mjs` 和各类 `run*.mjs`

## 路线图

- 更稳定的 90 分以上优化闭环
- 更细的现实政治历史对照库
- 更强的引用层级显示
- 更可视化的优化进度面板
- Android 正式签名与发布

## 免责声明

这是一个围绕黑格尔文本、现实判断和本地代理能力构建的实验系统。

它会努力提高引文纪律、逻辑纪律和史学纪律，但当前并不能保证所有输出都达到严苛学术标准。对高风险结论，请继续做人工复核。
