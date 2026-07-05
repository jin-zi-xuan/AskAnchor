(function registerAskAnchorPlatforms(global) {
  const PLATFORM_CATALOG = [
    {
      id: "chatgpt",
      label: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"]
    },
    {
      id: "claude",
      label: "Claude",
      hosts: ["claude.ai"],
      matches: ["https://claude.ai/*"]
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      matches: ["https://chat.deepseek.com/*"]
    },
    {
      id: "gemini",
      label: "Gemini",
      hosts: ["gemini.google.com"],
      matches: ["https://gemini.google.com/*"]
    },
    {
      id: "poe",
      label: "Poe",
      hosts: ["poe.com"],
      matches: ["https://poe.com/*"]
    },
    {
      id: "perplexity",
      label: "Perplexity",
      hosts: ["perplexity.ai", "www.perplexity.ai"],
      matches: ["https://perplexity.ai/*", "https://www.perplexity.ai/*"]
    },
    {
      id: "copilot",
      label: "Microsoft Copilot",
      hosts: ["copilot.microsoft.com"],
      matches: ["https://copilot.microsoft.com/*"]
    },
    {
      id: "kimi",
      label: "Kimi",
      hosts: ["kimi.moonshot.cn"],
      matches: ["https://kimi.moonshot.cn/*"]
    },
    {
      id: "doubao",
      label: "豆包",
      hosts: ["doubao.com", "www.doubao.com"],
      matches: ["https://doubao.com/*", "https://www.doubao.com/*"]
    },
    {
      id: "tongyi",
      label: "通义",
      hosts: ["tongyi.aliyun.com"],
      matches: ["https://tongyi.aliyun.com/*"]
    },
    {
      id: "yiyan",
      label: "文心一言",
      hosts: ["yiyan.baidu.com"],
      matches: ["https://yiyan.baidu.com/*"]
    }
  ];

  function getPlatformById(platformId) {
    return PLATFORM_CATALOG.find((platform) => platform.id === platformId) || null;
  }

  function getPlatformForHost(hostname) {
    return PLATFORM_CATALOG.find((platform) => platform.hosts.includes(hostname)) || null;
  }

  function getDefaultEnabledPlatforms() {
    return Object.fromEntries(PLATFORM_CATALOG.map((platform) => [platform.id, true]));
  }

  global.AskAnchorPlatforms = {
    platforms: PLATFORM_CATALOG,
    getPlatformById,
    getPlatformForHost,
    getDefaultEnabledPlatforms
  };
})(globalThis);
