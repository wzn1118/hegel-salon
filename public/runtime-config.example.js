// Optional browser runtime settings.
// Copy this file to runtime-config.js and include it before app.js if you need
// file:// API routing or a curated provider guide in your own deployment.

window.HEGEL_SALON_API_BASE = "";

window.HEGEL_PROVIDER_GUIDES = [
  {
    name: "Example Gateway",
    tag: "OpenAI Compatible",
    copy: "Use an OpenAI-compatible endpoint. Include the /v1 path when your provider requires it.",
    href: "https://provider.example",
    provider: "openai",
    model: "gpt-5.4",
    baseURL: "https://provider.example/v1",
    steps: [
      "Create an account with the provider.",
      "Create an API key in the provider console.",
      "Paste the provider, model, Base URL, and API key into Hegel Salon."
    ]
  }
];
