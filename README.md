# Hegel Salon

> 黑格尔阅读，需要一个可检索、可核验、可区分、可追踪的工作流。

Hegel Salon 聚焦黑格尔阅读里真正耗时的部分：语料检索、概念辨析、引文核验、附件整理、网页取材，以及最终回答的组织。

整个项目以 Node 服务和 Web 前端为主，仓库里已经保留了概念图谱、自检逻辑、评测脚本和浏览器内 computer use。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

## 快速认识

如果你想寻找一套能够串联文本、概念和判断的中文工作台，这个仓库已经搭出了比较完整的骨架。

- 原典问题进入回答之前，会先经过语料检索、概念区分和引文核验。
- PDF、表格、文本、图片都能并入同一轮问答流程，省去来回切换工具。
- 浏览器内 computer use 已经接通，能够完成页面访问、内容输入、滚动截取和截图回传。
- 评测脚本、失败记忆和优化 playbook 都已经保留在仓库里，后续迭代有据可查。

## 当前已经成形的部分

- 回答黑格尔问题时，会优先组织概念、反对意见、文本证据和结论，不靠语气撑住表面风格。
- 自由、任意、现实性、市民社会、国家、扬弃、主奴关系这些高频概念，已经有专门的区分约束。
- 直接引文会经过核验；检索不到支撑句子时，系统会转为解释性表述。
- 附件处理已经覆盖 PDF、表格、文本和图片。
- 浏览器内 computer use 可以完成基础网页操作。
- 评测和优化链路已经接通，改动之后可以立即回头核对。

当前这套东西已经能够启动并投入使用，不过细节仍在持续修整。严肃学术结论、正式写作和现实政治判断这些场景，最好继续人工复核。

## 最近重点

最近一轮更新把概念图谱的约束收得更紧。回答里遇到某些关键词时，系统会连同容易混淆的概念一起检查，尽量把差别交代清楚。当前 smoke 覆盖了这些组合：

- 自由和任意
- 现实性和单纯存在、现状辩护
- 市民社会和国家
- 扬弃和单纯取消
- 主奴辩证法和阶级斗争

对应的 smoke 测试文件位于 `src/runConceptGraphSmoke.mjs`，仓库内可直接执行：

```bash
npm run smoke:concept-graph
```

## 30 秒启动

先安装 Node.js，然后在仓库根目录执行：

```bash
npm install
npm run start
```

默认访问地址：

```text
http://127.0.0.1:3087/
```

如果希望通过 Docker 启动：

```bash
docker compose up -d --build
```

## 模型配置

公开仓库没有内置任何 API key。服务启动之后，可以在前端登录并填写模型提供商、base URL、模型名和 API key。

本地开发也可以准备一个私有配置文件：

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

`config/api.local.json` 已经在 `.gitignore` 里。真实密钥留在本地即可，不要提交到公开仓库。

## 仓库内容

已经纳入仓库的部分：

- Node 服务端和静态 Web 前端
- 黑格尔语料检索、上下文组装、引文核验和概念图谱相关代码
- 公开可发布的德文、英文语料和元数据
- 评测、smoke、优化相关脚本
- Android 原生壳工程
- Render、Docker 和本地启动配置

当前没有纳入仓库的部分：

- API key、邮箱密码、隧道凭据等私密配置
- 用户数据、会话、上传文件和浏览器 profile
- 本地运行日志、缓存、临时文件和 sqlite 数据库
- 授权受限的中文译本、PDF、电子书和 OCR 导出

自己的资料建议存放于 `local-resources/`，或者挂到私有持久化卷里。公开仓库只保留可以公开发布的内容。

## 目录结构

```text
.
├─ public/                  Web 前端
├─ src/                     Node 服务、问答流程、语料检索、评测和优化脚本
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
- `src/hegelSelfAudit.mjs`：负责回答自检，包括概念覆盖、误读风险和区分义务。
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

其中 `smoke:concept-graph` 和 `validate:hegel-graph` 属于轻量检查，适合每次调整概念图谱、辩证计划或自检逻辑之后先执行一遍。

## 公开部署

公开 HTTPS 部署时，最好启用登录和独立的管理密钥：

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

如果只是本地研究或演示，可以先执行 `npm run start`，再在前端填写自己的模型配置。

## Android

仓库包含一个 Android 原生壳工程：

```text
android-app/
```

Android 侧主要承担移动端入口、地址配置和 WebView 承载。当前仍是辅助交付层，主要能力仍在 Node 服务和 Web 前端。

## 使用边界

Hegel Salon 重点放在引文纪律、概念纪律和论证纪律上。高风险结论、正式写作、出版引用和现实政治判断，仍然要人工复核。
