(function initAskAnchorSettings(global) {
  const SETTINGS_STORAGE_KEY = "askAnchorSettings";
  const LEGACY_SETTINGS_STORAGE_KEY = "ask-anchor:settings";
  const SCHEMA_VERSION = 1;
  const DEFAULT_SETTINGS = Object.freeze({
    showCat: true,
    catDefaultPosition: "editor",
    timelineMode: "auto",
    eyeTracking: true
  });

  const form = document.getElementById("ask-anchor-settings-form");
  const status = document.getElementById("ask-anchor-settings-status");
  const platformList = document.getElementById("ask-anchor-platform-list");
  const openOptionsButton = document.getElementById("ask-anchor-open-options");
  const platforms = global.AskAnchorPlatforms?.platforms || [];
  const core = global.AskAnchorCore;
  let settings = normalizeSettings(null);
  let statusTimer = null;

  function getExtensionApi() {
    return global.browser || global.chrome || null;
  }

  function getDefaultEnabledPlatforms() {
    return global.AskAnchorPlatforms?.getDefaultEnabledPlatforms?.()
      || Object.fromEntries(platforms.map((platform) => [platform.id, true]));
  }

  function normalizeSettings(value) {
    return core.normalizeSettings(value, global.AskAnchorPlatforms);
  }

  function storageGet(keys) {
    const storage = getExtensionApi()?.storage?.local;
    if (!storage?.get) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      try {
        const result = storage.get(keys, (items) => resolve(items || {}));
        if (result?.then) {
          result.then(resolve).catch(() => resolve({}));
        }
      } catch (error) {
        resolve({});
      }
    });
  }

  function storageSet(items) {
    const storage = getExtensionApi()?.storage?.local;
    if (!storage?.set) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const result = storage.set(items, () => {
          const error = getExtensionApi()?.runtime?.lastError;
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
        if (result?.then) {
          result.then(resolve).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async function loadSettings() {
    const items = await storageGet([SETTINGS_STORAGE_KEY, LEGACY_SETTINGS_STORAGE_KEY]);
    settings = normalizeSettings(items[SETTINGS_STORAGE_KEY] || items[LEGACY_SETTINGS_STORAGE_KEY]);
    renderSettings();
  }

  function renderSettings() {
    if (form) {
      form.elements.showCat.checked = settings.showCat;
      form.elements.eyeTracking.checked = settings.eyeTracking;
      setCheckedRadio("catDefaultPosition", settings.catDefaultPosition);
      setCheckedRadio("timelineMode", settings.timelineMode);
    }
    renderPlatforms();
  }

  function setCheckedRadio(name, value) {
    const input = form?.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) {
      input.checked = true;
    }
  }

  function renderPlatforms() {
    if (!platformList) {
      return;
    }

    platformList.innerHTML = "";
    platforms.forEach((platform) => {
      const enabled = settings.enabledPlatforms[platform.id] !== false;
      const row = document.createElement("label");
      row.className = `platform-row${enabled ? "" : " is-disabled"}`;
      row.innerHTML = `
        <span>
          <span class="platform-name">
            <strong></strong>
            <span class="platform-state"></span>
          </span>
          <span class="platform-hosts"></span>
        </span>
        <span class="platform-toggle-control">
          <input type="checkbox">
          <span class="platform-switch" aria-hidden="true"></span>
          <span class="platform-toggle-label"></span>
        </span>
      `;

      row.querySelector(".platform-name strong").textContent = platform.label;
      row.querySelector(".platform-state").textContent = enabled ? "已启用" : "已关闭";
      row.querySelector(".platform-hosts").textContent = platform.hosts.join(", ");
      row.querySelector(".platform-toggle-label").textContent = enabled ? "开启" : "关闭";

      const checkbox = row.querySelector("input");
      checkbox.checked = enabled;
      checkbox.setAttribute("aria-label", `${enabled ? "关闭" : "开启"} ${platform.label}`);
      checkbox.addEventListener("change", () => {
        settings.enabledPlatforms[platform.id] = checkbox.checked;
        renderPlatforms();
        saveSettings();
      });

      platformList.appendChild(row);
    });
  }

  async function saveSettings() {
    setStatus("正在保存...");
    try {
      await storageSet({ [SETTINGS_STORAGE_KEY]: normalizeSettings(settings) });
      setStatus("已保存。已打开的 AI 页面可能需要刷新后完全生效。");
    } catch (error) {
      setStatus("保存失败，请重试。");
    }
  }

  function setStatus(message) {
    if (!status) {
      return;
    }

    window.clearTimeout(statusTimer);
    status.textContent = message;
    if (message === "正在保存...") {
      return;
    }

    statusTimer = window.setTimeout(() => {
      status.textContent = "";
    }, 3200);
  }

  form?.addEventListener("change", (event) => {
    const target = event.target;
    if (!target?.name) {
      return;
    }

    if (target.name === "showCat" || target.name === "eyeTracking") {
      settings[target.name] = target.checked;
    } else if (target.name === "catDefaultPosition" || target.name === "timelineMode") {
      settings[target.name] = target.value;
    }

    saveSettings();
  });

  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.("[data-platform-action]")?.dataset.platformAction;
    if (!action) {
      return;
    }

    platforms.forEach((platform) => {
      settings.enabledPlatforms[platform.id] = action !== "disable-all";
    });
    renderPlatforms();
    saveSettings();
  });

  openOptionsButton?.addEventListener("click", () => {
    const api = getExtensionApi();
    if (api?.runtime?.openOptionsPage) {
      api.runtime.openOptionsPage();
    }
  });

  loadSettings();
})(globalThis);
