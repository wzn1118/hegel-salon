# Hegel Salon

Hegel Salon 是一个中文优先的黑格尔阅读与论证工作台。它把语料检索、概念图谱、引文核验、附件理解和浏览器操作放在同一个本地 Web 应用里，目标不是模仿“哲学腔”，而是让回答尽量有出处、有区分、有论证路径。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

## 这个项目在做什么

很多哲学类聊天工具的问题不是“说得不像”，而是太容易把概念说混，把引文说虚，把现实判断说成一句态度。Hegel Salon 主要在解决这几个具体问题：

- 回答黑格尔问题时，优先走概念、反对意见、文本证据和结论，而不是只套一层风格。
- 对自由、任意、现实性、市民社会、国家、扬弃、主奴关系等概念做区分，避免把关键词混成一团。
- 对直接引文做核验，找不到可支持的原文时就不硬编引号。
- 支持把 PDF、表格、文本、图片等附件接入同一条回答链。
- 提供浏览器内的 computer use，用来打开网页、点击、输入、滚动和回传截图。
- 用评测脚本和失败记忆持续改进，而不是只靠一次 prompt 调整。

这个仓库更适合被理解为一个已经能跑起来的研究型产品原型。它可以实际使用，也还在继续打磨，尤其是严肃学术结论和现实政治判断，仍然建议人工复核。

## 最近重点

当前版本新增了概念关系与“区分义务”层面的检查。系统不只看有没有命中某个概念，还会检查回答是否把关键概念对说清楚，例如：

- 自由和任意
- 现实性和单纯存在、现状辩护
- 市民社会和国家
- 扬弃和单纯取消
- 主奴辩证法和阶级斗争

对应的 smoke 测试已经放在 `src/runConceptGraphSmoke.mjs`，可以直接运行：

```bash
npm run smoke:concept-graph
```

## 快速开始

需要先安装 Node.js。然后在仓库根目录运行：

```bash
npm install
npm run start
```

默认访问地址：

```text
http://127.0.0.1:3087/
```

如果想用 Docker：

```bash
docker compose up -d --build
```

## 配置模型

公开仓库不会内置任何 API key。启动后可以在前端登录并配置模型提供商、base URL、模型名和 API key。

本地开发也可以放一个私有配置文件：

```text
config/api.local.json
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

`config/api.local.json` 已被 `.gitignore` 排除，不要把真实密钥提交到公开仓库。

## 公开仓库包含什么

这个 public release 包含：

- Node 服务端和静态 Web 前端
- 黑格尔语料检索、上下文组装、引文核验和概念图谱相关代码
- 公开可发布的德文、英文语料和元数据
- 评测、smoke、优化相关脚本
- Android 原生壳工程
- Render、Docker 和本地启动配置

这个 public release 不包含：

- API key、邮箱密码、隧道凭据等私密配置
- 用户数据、会话、上传文件和浏览器 profile
- 本地运行日志、缓存、临时文件和 sqlite 数据库
- 授权受限的中文译本、PDF、电子书和 OCR 导出

如果你有自己的资料，建议放在 `local-resources/` 或私有持久化卷里，不要提交到公开仓库。

## 目录结构

```text
.
├─ public/                  Web 前端
├─ src/                     Node 服务、回答链、语料检索、评测和优化脚本
├─ config/                  API 配置占位文件
├─ data/                    公开语料、概念图谱和运行数据目录
├─ docs/                    部署和产品说明
├─ eval/                    评测样本
├─ android-app/             Android 原生壳工程
├─ local-resources/         本地私有资料入口
├─ launch-hegel-salon.cmd   Windows 一键启动
├─ docker-compose.yml       Docker 启动配置
└─ render.yaml              Render 部署配置
```

## 核心模块

- `src/server.mjs`：HTTP 服务和主编排入口。
- `src/hegelContext.mjs`：把语料、概念图谱、中文材料和历史参照组织成回答上下文。
- `src/hegelDialectic.mjs`：生成论证计划、概念区分、禁用误读和引文锚点要求。
- `src/hegelSelfAudit.mjs`：对回答做自检，包括概念覆盖、误读风险和区分义务。
- `src/hegelQuoteValidation.mjs`：核验直接引文是否能被检索证据支持。
- `src/browserComputer*.mjs`：浏览器范围内的 computer use。
- `src/runConceptGraphSmoke.mjs`：概念图谱和关键误读的 smoke 测试。
- `src/runQualityOptimizer.mjs`：基于失败样本和 playbook 的质量优化脚本。

## 常用验证

```bash
npm run smoke:concept-graph
npm run validate:hegel-graph
npm run eval:understanding:smoke
npm run eval:formal-stress
npm run eval:historical-stress
```

其中 `smoke:concept-graph` 和 `validate:hegel-graph` 是轻量检查，适合每次改动概念图谱、辩证计划或自检逻辑后先跑一遍。

## 公开部署

公开 HTTPS 部署时，建议启用登录和独立的管理密钥：

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

如果只是本地研究或演示，可以先用 `npm run start` 跑起来，再在前端填自己的模型配置。

## Android

仓库包含一个 Android 原生壳工程：

```text
android-app/
```

它的作用是提供移动端入口、地址配置和 WebView 承载。当前 Android 侧仍是辅助交付层，主要能力仍在 Node 服务和 Web 前端。

## 项目边界

Hegel Salon 会努力提高引文纪律、概念纪律和论证纪律，但它不是学术判断的自动裁判。遇到高风险结论、正式写作、出版引用或现实政治判断，请继续做人工复核。
