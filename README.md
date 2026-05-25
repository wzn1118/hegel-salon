# Hegel Salon

[English README](./README.en.md)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wzn1118/hegel-salon)

Hegel Salon 是一个中文优先的黑格尔阅读与推理工作台。它不是把几个黑格尔术语塞进聊天框里的玩具，也不试图冒充“哲学权威”。这个项目更像一个可以运行的研究桌面：前端负责对话、附件和资料入口，Node 后端负责语料检索、引用约束、历史参照、判断修订和用户隔离，外层再配上部署、评测和优化脚本，让一次讨论尽量留下可复查的依据。

项目最初的目标很朴素：当一个中文用户问黑格尔、现实问题、论文段落或一份文档时，系统不要只给一段漂亮但空泛的回答，而要尽量说明自己依据什么文本、哪些地方是解释、哪些地方只是类比，哪里还需要人工判断。它可以在本地跑，也可以以多用户 Web 服务的方式部署；它可以只当一个私人阅读工具，也可以作为一个继续实验“哲学语料 + 现代模型 + 质量反馈”的产品原型。

## 这个项目在做什么

Hegel Salon 把几件通常分散的事情放到同一个应用里：

- 中文优先的黑格尔式对话，不要求用户用英文或德文进入问题。
- 本地语料检索，围绕 `data/corpus/texts/` 中可公开分发的德文、英文材料组织上下文。
- 引文纪律，尽量把可直接引用的原文和模型解释区分开。
- 概念图和历史参照，用来帮助回答从“概念解释”走向“现实判断”。
- 附件理解，支持 PDF、表格、CSV/TSV、文本、JSON、Markdown 和图片等输入。
- 浏览器范围内的 Computer Use，可以导航、点击、输入、滚动，并保留截图和动作记录。
- 多用户模式，包含登录、邮箱验证码、管理员工具、CSRF 防护和用户运行态隔离。
- 评测与优化脚本，用失败样例、质量分数和 playbook 反过来改进后续回答。
- Windows 启动脚本、Docker、Render Blueprint、Cloudflare Tunnel 文档和可选 Android 壳。

这里的“黑格尔式”不是指固定的说话腔调，而是指回答结构要承担更多责任：先把问题放进概念关系里，再区分文本依据、推理跃迁和现实判断，最后承认仍然不确定的部分。项目仍在原型阶段，但它已经不是单页 demo，而是一套可以启动、登录、上传、部署、评测和继续打磨的应用。

## 适合谁

这个仓库适合几类人：

- 想在中文语境里认真读黑格尔，但又希望工具能帮忙整理语料、概念和出处的人。
- 想把哲学问答做成可运行产品，而不是只写 prompt 的开发者。
- 想研究“引用约束、语料检索、模型自审、失败记忆”如何一起影响回答质量的人。
- 想把本地 AI 工具部署成带账号体系的私人或小团队 Web 服务的人。

如果你只是想找一个轻量聊天 demo，这个项目可能偏重；如果你想找一个完美可靠的学术判官，它也还不够。它更适合作为一个认真但仍开放的工作台。

## 当前状态

这是一个可运行的产品原型，不是完成态的学术系统。

目前它可以：

- 在本地启动 Web 应用，默认端口是 `3087`。
- 通过 `/api/chat` 处理对话、附件和语料上下文。
- 在认证模式下为不同用户隔离上传、聊天记录、优化状态和浏览器代理状态。
- 用管理员账号管理用户和运行态数据。
- 调用配置好的模型 API，并支持本地私有配置文件。
- 运行理解评测、形式逻辑压力测试、历史判断压力测试、概念图检查和质量优化脚本。
- 通过 Docker、Render 或 Windows + Cloudflare Tunnel 做公开部署。

仍然要谨慎看待的部分：

- 质量分数、逻辑分数和历史判断分数只是信号，不是正确性证明。
- 引文校验能减少伪引，但不能替代人工校勘。
- 浏览器代理只控制浏览器范围，不是完整桌面控制。
- 公开部署前必须自己配置密钥、邮箱、HTTPS、上传扫描和管理员策略。
- 仓库不应包含私人聊天、运行日志、API key、SMTP 密码、受版权保护的中文译本或本地研究资料。

## 快速开始

需要 Node.js 和 npm。克隆后安装依赖：

```bash
npm install
```

启动：

```bash
npm run start
```

浏览器打开：

```text
http://127.0.0.1:3087/
```

如果你在 Windows 上使用便携包，也可以双击：

```text
launch-hegel-salon.cmd
```

停止本地服务：

```text
stop-hegel-salon.cmd
```

Docker 方式：

```bash
docker compose up -d --build
```

## 模型配置

公开仓库不会携带真实 API key。开发时建议创建：

```text
config/api.local.json
```

示例：

```json
{
  "provider": "openai",
  "model": "gpt-5.4",
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "YOUR_KEY"
}
```

本地使用时，也可以通过页面里的 API 配置面板填写。开启认证模式后，项目级配置会被锁住，用户配置和运行态会按账号隔离；公开部署时更建议把模型密钥留在服务端，而不是交给浏览器端用户覆盖。

## 公开部署

Render 部署可以使用页面顶部的按钮，或直接连接本仓库里的 `render.yaml`。

最少要准备这些环境变量：

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

公开环境建议同时开启：

```text
HEGEL_HIDE_DEV_CODES=1
HEGEL_TRUST_PROXY=1
HEGEL_FORCE_SECURE_COOKIES=1
```

更多部署说明见：

- [DEPLOY-V4.md](./DEPLOY-V4.md)
- [docs/PUBLIC_WEB_DEPLOYMENT.md](./docs/PUBLIC_WEB_DEPLOYMENT.md)
- [docs/SECURITY_DEPLOYMENT.md](./docs/SECURITY_DEPLOYMENT.md)

## 常用脚本

```bash
npm run start
npm run eval:understanding:smoke
npm run eval:understanding:full
npm run eval:formal-stress
npm run eval:historical-stress
npm run smoke:concept-graph
npm run validate:hegel-graph
npm run optimize:90
```

`npm run optimize:90` 不是模型微调。它会走当前问答管线，收集较弱回答，生成失败模式和 playbook，再把这些经验写回优化记忆，供后续回答参考。

## 目录结构

```text
.
|-- public/                  Web UI、样式、浏览器代理面板、管理入口
|-- src/                     Node 服务、回答管线、语料、认证、工具、评测和优化
|-- config/                  公开安全的配置模板，以及本地私有配置入口
|-- data/corpus/texts/       可公开分发的德文和英文黑格尔语料
|-- docs/                    公开部署、安全部署和发布说明
|-- deploy/                  Cloudflare Tunnel、Nginx 等部署辅助文件
|-- android-app/             可选 Capacitor Android 壳
|-- training/                训练和评测相关材料
|-- launch-hegel-salon.cmd   Windows 一键启动入口
|-- start-hegel-salon.cmd    Windows 启动辅助脚本
`-- stop-hegel-salon.cmd     Windows 停止辅助脚本
```

几个核心文件：

- `src/server.mjs`：HTTP 路由、聊天、附件、认证、训练、管理和运行态协调的主入口。
- `src/hegelPrompt.mjs`：回答人格、论证形式、引文纪律和现实判断边界。
- `src/hegelCorpus.mjs`、`src/hegelContext.mjs`、`src/hegelParallel.mjs`：语料检索和上下文构造。
- `src/hegelQuoteValidation.mjs`：区分可引用原文和解释性表述。
- `src/browserComputer.mjs`、`src/browserComputerWorker.mjs`：浏览器范围内的 Computer Use。
- `src/auth.mjs`、`src/userDatabase.mjs`：账号、会话、管理员和用户数据隔离。
- `src/runQualityOptimizer.mjs`、`src/optimizerMemory.mjs`：质量优化和失败记忆。

## 数据和隐私边界

这个仓库应当只包含可以公开分发的代码、文档、前端资源、部署模板、示例材料和允许公开的语料。下面这些不应该提交到 GitHub：

- API key、SMTP 密码或其他密钥。
- SQLite 运行库、用户会话、认证记录、上传文件和私人聊天记录。
- 浏览器 profile、Computer Use 运行态和截图缓存。
- 受版权保护的中文译本、私人 PDF、电子书、OCR 结果和本地研究包。

如果你有自己的资料，建议放在 `local-resources/`、私有 `data/` 挂载卷或部署平台的私密存储里，不要直接提交。

## Android 壳

`android-app/` 是 Capacitor 做的可选移动入口。它主要负责在 Android 上配置服务端地址并打开 Web 产品，不是独立后端。

## 路线图

接下来比较值得继续做的事：

- 让优化进度、失败样例和 playbook 更容易观察和回滚。
- 扩充现实判断所需的历史案例库。
- 提升形式逻辑和历史判断评分的稳定性。
- 在界面上更清楚地显示引用置信度和证据边界。
- 加固公开部署默认值，尤其是上传、管理员操作和邮件验证码。
- 整理 Android 客户端的发布流程。

## 推荐 GitHub 简介

```text
中文优先的黑格尔阅读与推理工作台，结合原典语料、引用约束、附件理解、浏览器代理、多用户部署和质量优化记忆。
```

## 许可和声明

代码许可见 [LICENSE](./LICENSE)。

Hegel Salon 会尽量提高来源纪律、论证纪律和历史判断质量，但它不能保证学术正确。重要结论、直接引文和论文用途请继续人工复核。
