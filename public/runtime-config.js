window.HEGEL_SALON_API_BASE = window.HEGEL_SALON_API_BASE || "";
window.HEGEL_PROVIDER_GUIDES = window.HEGEL_PROVIDER_GUIDES || [
  {
    name: "Geek",
    tag: "OpenAI Compatible",
    copy: "适合已经有账号、想快速接入的用户。Base URL 建议填写带 /v1 的地址。",
    href: "https://geek.tm2.xin",
    provider: "OpenAI",
    model: "gpt-5.4",
    baseURL: "https://geek.tm2.xin/v1",
    steps: [
      "打开官网并登录账号。",
      "充值或确认余额可用。",
      "在站内创建 API Key。",
      "回到本页填写 Provider、Model、Base URL 和 API Key 后保存。"
    ]
  },
  {
    name: "TokenX24",
    tag: "OpenAI Compatible",
    copy: "适合作为另一组 OpenAI-compatible 中转选择。Base URL 同样建议填写带 /v1 的地址。",
    href: "https://tokenx24.com",
    provider: "OpenAI",
    model: "gpt-5.4",
    baseURL: "https://tokenx24.com/v1",
    steps: [
      "注册并完成邮箱验证。",
      "登录后在站内获取或创建 API Key。",
      "如需购买额度，先在站内确认充值或余额入口。",
      "回到本页填写 Provider、Model、Base URL 和 API Key 后保存。"
    ]
  }
];
