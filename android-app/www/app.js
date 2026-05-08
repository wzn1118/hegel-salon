const STORAGE_KEY = "hegel-salon-android-server-url";
const DEFAULT_EMULATOR_URL = "http://10.0.2.2:3087";
const DEFAULT_LOCALHOST_URL = "http://127.0.0.1:3087";

const gatewayForm = document.getElementById("gatewayForm");
const serverUrlInput = document.getElementById("serverUrl");
const statusText = document.getElementById("statusText");
const fillEmulatorUrlButton = document.getElementById("fillEmulatorUrl");
const fillLocalhostUrlButton = document.getElementById("fillLocalhostUrl");
const testConnectionButton = document.getElementById("testConnection");

function normalizeServerUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function setStatus(message, tone = "") {
  statusText.textContent = message;
  statusText.classList.remove("is-success", "is-error");
  if (tone) {
    statusText.classList.add(tone);
  }
}

function saveServerUrl(url) {
  localStorage.setItem(STORAGE_KEY, url);
}

function getSavedServerUrl() {
  return normalizeServerUrl(localStorage.getItem(STORAGE_KEY) || DEFAULT_EMULATOR_URL);
}

function pingImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.src = "";
      reject(new Error("连接超时"));
    }, 5000);

    image.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };

    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("图片资源未能加载"));
    };

    image.src = `${url}/assets/hegel-cutout-web.png?ts=${Date.now()}`;
  });
}

async function testConnection(url) {
  const normalized = normalizeServerUrl(url);
  if (!normalized) {
    throw new Error("请输入有效的 Hegel Salon 地址");
  }

  await pingImage(normalized);
  return normalized;
}

function openSalon(url) {
  const normalized = normalizeServerUrl(url);
  if (!normalized) {
    throw new Error("请输入有效的 Hegel Salon 地址");
  }

  saveServerUrl(normalized);
  window.location.assign(`${normalized}/`);
}

function fillUrl(value) {
  serverUrlInput.value = value;
  serverUrlInput.focus();
  serverUrlInput.select();
}

serverUrlInput.value = getSavedServerUrl();

fillEmulatorUrlButton.addEventListener("click", () => {
  fillUrl(DEFAULT_EMULATOR_URL);
  setStatus("已填入 Android 模拟器默认地址。");
});

fillLocalhostUrlButton.addEventListener("click", () => {
  fillUrl(DEFAULT_LOCALHOST_URL);
  setStatus("已填入本机调试地址。若在模拟器中，请改回 10.0.2.2。");
});

testConnectionButton.addEventListener("click", async () => {
  try {
    setStatus("正在测试连接…");
    const normalized = await testConnection(serverUrlInput.value);
    saveServerUrl(normalized);
    setStatus("连接成功。你可以直接进入沙龙。", "is-success");
  } catch (error) {
    setStatus(error.message || "连接失败", "is-error");
  }
});

gatewayForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setStatus("正在进入 Hegel Salon…");
    const normalized = await testConnection(serverUrlInput.value);
    openSalon(normalized);
  } catch (error) {
    setStatus(error.message || "无法打开该地址", "is-error");
  }
});
