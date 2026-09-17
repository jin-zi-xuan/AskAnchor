import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// 使用独立浏览器上下文和本地页面，不读取登录状态，也不访问聊天服务。
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome' });
const failures = [];
const cases = [
  ['刷新后分别恢复嵌套滚动区和聊天容器的位置', async (page) => {
    const result = await page.evaluate(() => {
      const target = document.querySelector('#target');
      target.innerHTML = '<div style="height:600px"></div><span>嵌套原文</span><div style="height:1200px"></div>';
      target.style.cssText = 'height:200px;overflow-y:auto';
      target.removeAttribute('id'); // 也覆盖没有稳定 ID 的代码框。
      const range = document.createRange();
      range.selectNodeContents(target.querySelector('span'));
      chat.scrollTop = 650;
      target.scrollTop = 300;
      const saved = JSON.parse(JSON.stringify({ ...anchorsApi.captureAnchorScrollPosition(range), container: null }));
      chat.scrollTop = 0;
      target.scrollTop = 0;
      const ok = anchorsApi.scrollToAnchorSavedPosition({ scrollPosition: saved });
      return { ok, chat: chat.scrollTop, inner: target.scrollTop };
    });
    assert.deepEqual(result, { ok: true, chat: 650, inner: 300 });
  }],
  ['整段选中时正确保存元素边界的文字偏移', async (page) => {
    const result = await page.evaluate(() => anchorsApi.serializeRange(selectionRange, document.querySelector('article')));
    assert.ok(result, '整段选中的 selector 不能为 null');
    assert.equal(result.exact, '这是需要准确回到的原文位置。');
    assert.equal(result.end - result.start, result.exact.length);
  }],
  ['完整入口：保存、重载模块、点击锚点后原文可见且高亮正确', async (page) => {
    await installFullApp(page);
    await page.evaluate(() => {
      const ctx = window.appContext;
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#target'));
      const message = document.querySelector('article');
      const selector = ctx.serializeRange(range, message);
      ctx.addAnchor({ text: range.toString(), selector,
        messageLocator: ctx.createMessageLocator(message, selector),
        ...ctx.createAnchorV2Snapshot(range, message, selector),
        range, element: message, scrollPosition: ctx.captureAnchorScrollPosition(range) });
    });
    // 重建全部页面节点和模块，保留同一 origin 的 sessionStorage。
    await installFullApp(page);
    await page.waitForFunction(() => window.appContext.anchors.length === 1);
    await page.evaluate(() => {
      document.querySelector('#chat').scrollTop = 2400;
      appContext.toggleAnchorList();
    });
    await page.locator('.ask-anchor-anchor-main:visible').first().click();
    await page.waitForFunction(() => window.getSelection().toString() === '这是需要准确回到的原文位置。');
    const result = await page.evaluate(() => ({
      top: window.getSelection().getRangeAt(0).getClientRects()[0].top,
      quote: Boolean(document.querySelector('#ask-anchor-quote-card'))
    }));
    assert.ok(result.top >= 80 && result.top < 630, JSON.stringify(result));
    assert.equal(result.quote, false);
  }],
  ['前后文也完全重复时拒绝猜测原文位置', async (page) => {
    const result = await page.evaluate(() => {
      const target = document.querySelector('#target');
      const text = '前'.repeat(110) + '重复原文' + '后'.repeat(110);
      target.textContent = text;
      const range = document.createRange();
      range.setStart(target.firstChild, 110);
      range.setEnd(target.firstChild, 114);
      const root = document.querySelector('article');
      const selector = anchorsApi.serializeRange(range, root);
      const snapshot = anchorsApi.createAnchorV2Snapshot(range, root, selector);
      target.textContent = text + text;
      return anchorsApi.resolveAnchorRange({ ...snapshot, selector, messageLocator: {} }) !== null;
    });
    assert.equal(result, false);
  }],
  ['同段新增重复文字后，仍通过前后文恢复原来的那一处', async (page) => {
    const result = await page.evaluate(() => {
      const target = document.querySelector('#target');
      target.textContent = '独有前文。这里是重复原文。独有后文。';
      const range = document.createRange();
      range.setStart(target.firstChild, 5);
      range.setEnd(target.firstChild, 12);
      const root = document.querySelector('article');
      const selector = anchorsApi.serializeRange(range, root);
      const snapshot = anchorsApi.createAnchorV2Snapshot(range, root, selector);
      const anchor = { ...snapshot, selector, messageLocator: {} };
      target.textContent += '新追加的段落。这里是重复原文。不同的后文。';
      const restored = anchorsApi.resolveAnchorRange(anchor);
      return restored ? { text: restored.toString(), offset: restored.startOffset } : null;
    });
    assert.deepEqual(result, { text: '这里是重复原文', offset: 5 });
  }],
  ['嵌套滚动区里的选区在内外两层都可见', async (page) => {
    const result = await page.evaluate(async () => {
      const target = document.querySelector('#target');
      target.innerHTML = '<div style="height:1200px"></div><span>嵌套区域里的原文</span><div style="height:1200px"></div>';
      target.style.cssText = 'height:200px;overflow-y:auto';
      const range = document.createRange();
      range.selectNodeContents(target.querySelector('span'));
      chat.scrollTop = 2400;
      const ok = await anchorsApi.scrollToSavedRange(range);
      const rect = range.getClientRects()[0];
      const inner = target.getBoundingClientRect();
      return { ok, top: rect.top, innerTop: inner.top, innerBottom: inner.bottom };
    });
    assert.equal(result.ok, true);
    assert.ok(result.top >= Math.max(80, result.innerTop) && result.top < Math.min(630, result.innerBottom), JSON.stringify(result));
  }],
  ['window 本身滚动的页面也能恢复', async (page) => {
    const result = await page.evaluate(async () => {
      chat.style.cssText = 'position:static;height:auto;overflow:visible;margin-top:80px';
      window.scrollTo({ top: 2400, behavior: 'instant' });
      const ok = await anchorsApi.scrollToSavedRange(selectionRange);
      return { ok, top: selectionRange.getClientRects()[0].top, scroll: scrollY };
    });
    assert.equal(result.ok, true);
    assert.ok(result.top > 80 && result.top < 630, JSON.stringify(result));
    assert.ok(result.scroll > 0);
  }],
  ['屏幕上方的原文滚动聊天容器，不滚 window', async (page) => {
    const result = await page.evaluate(async () => {
      chat.scrollTop = 2400;
      const before = selectionRange.getBoundingClientRect().top;
      const ok = await anchorsApi.scrollToSavedRange(selectionRange);
      return { ok, before, top: selectionRange.getClientRects()[0].top, scroll: chat.scrollTop, windowTop: scrollY };
    });
    assert.equal(result.ok, true);
    assert.ok(result.before < 0);
    assert.ok(result.top > 80 && result.top < 600, JSON.stringify(result));
    assert.equal(result.windowTop, 0);
  }],
  ['刷新后重新识别聊天容器并恢复保存位置', async (page) => {
    const saved = await page.evaluate(() => {
      chat.scrollTop = 420;
      const position = anchorsApi.captureAnchorScrollPosition(selectionRange);
      return { windowTop: position.windowTop, containerTop: position.containerTop };
    });
    await setup(page);
    const ok = await page.evaluate((position) => anchorsApi.scrollToAnchorSavedPosition({
      scrollPosition: { ...position, container: null }, scrollY: 0
    }), saved);
    assert.equal(ok, true);
    await page.waitForFunction(() => Math.abs(chat.scrollTop - 420) <= 2);
  }],
  ['长选区定位首行，首行不能被滚出视口', async (page) => {
    const result = await page.evaluate(async () => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('article'));
      const ok = await anchorsApi.scrollToSavedRange(range);
      return { ok, top: range.getClientRects()[0].top };
    });
    assert.equal(result.ok, true);
    assert.ok(result.top >= 80 && result.top < 600, JSON.stringify(result));
  }],
  ['滚动过程中布局变化后仍能落到原文', async (page) => {
    const result = await page.evaluate(async () => {
      chat.scrollTop = 2500;
      setTimeout(() => { document.querySelector('#before').style.height = '1350px'; }, 250);
      const ok = await anchorsApi.scrollToSavedRange(selectionRange);
      return { ok, top: selectionRange.getClientRects()[0].top };
    });
    assert.equal(result.ok, true);
    assert.ok(result.top >= 80 && result.top < 600, JSON.stringify(result));
  }],
  ['用户滚轮操作会取消自动纠偏', async (page) => {
    const result = await page.evaluate(async () => {
      chat.scrollTop = 2500;
      setTimeout(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })), 50);
      return anchorsApi.scrollToSavedRange(selectionRange);
    });
    assert.equal(result, false);
  }],
  ['目标被移除后不能报告定位成功', async (page) => {
    const result = await page.evaluate(async () => {
      chat.scrollTop = 2500;
      setTimeout(() => document.querySelector('#target').remove(), 50);
      return anchorsApi.scrollToSavedRange(selectionRange);
    });
    assert.equal(result, false);
  }],
  ['连续跳转以后一次为准', async (page) => {
    const result = await page.evaluate(async () => {
      chat.scrollTop = 2500;
      const first = anchorsApi.scrollToSavedRange(selectionRange);
      const secondRange = document.createRange();
      secondRange.selectNodeContents(document.querySelector('#second'));
      const second = anchorsApi.scrollToSavedRange(secondRange);
      return { first: await first, second: await second, top: secondRange.getClientRects()[0].top };
    });
    assert.equal(result.first, false);
    assert.equal(result.second, true);
    assert.ok(result.top >= 80 && result.top < 600, JSON.stringify(result));
  }]
];

async function setup(page) {
  await page.goto('about:blank');
  await page.setContent(`<!doctype html><style>
    body { margin: 0; } header { position: fixed; height: 80px; inset: 0 0 auto; background: #eee; z-index: 10; }
    #chat { position: absolute; top: 80px; left: 160px; width: 700px; height: 550px; overflow-y: auto; overflow-anchor: none; }
    #before { height: 900px; } p { margin: 0; line-height: 24px; }
    #after { height: 1800px; } footer { position: fixed; top: 630px; height: 170px; background: white; width: 100%; }
  </style><header>固定顶部栏</header><main id="chat"><div id="before"></div>
    <article data-message-author-role="assistant"><p id="target">这是需要准确回到的原文位置。</p>
    ${'<p>后续段落，用于检查长选区首行位置。</p>'.repeat(45)}</article>
    <p id="second">第二个锚点位置</p><div id="after"></div></main><footer>固定输入框</footer>`);
  await page.addScriptTag({ path: fileURLToPath(new URL('../../src/content/anchors.js', import.meta.url)) });
  await page.addScriptTag({ path: fileURLToPath(new URL('../../src/core.js', import.meta.url)) });
  await page.evaluate(() => {
    window.chat = document.querySelector('#chat');
    window.selectionRange = document.createRange();
    selectionRange.selectNodeContents(document.querySelector('#target'));
    window.anchorsApi = AskAnchorModules.anchors({
      core: AskAnchorCore,
      uniqueElements: (elements) => [...new Set(elements)],
      isInsideUserMessage: () => false,
      resolveMessageElements: () => [document.querySelector('article')],
      SELECTION_CONTEXT_LENGTH: 100,
      getRangeRect: (range) => range.getBoundingClientRect(),
      findConversationRoot: () => chat,
      findAssistantMessageElement: (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest('article'),
      DOCK_ID: 'ask-anchor-anchor-dock', PANEL_ID: 'ask-anchor-anchor-panel',
      BUTTON_ID: 'ask-anchor-explain-button', TOAST_ID: 'ask-anchor-toast'
    });
  });
}

async function installFullApp(page) {
  const markup = await page.evaluate(() => {
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll('script, [id^="ask-anchor-"]').forEach((node) => node.remove());
    return '<!doctype html>' + copy.outerHTML;
  });
  await page.route('https://chatgpt.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
  await page.goto('https://chatgpt.com/c/askanchor-local-regression');
  // 去掉 setup 的内联测试脚本；生产入口重新构建自己的上下文。
  await page.evaluate(() => {
    delete window.AskAnchorModules;
    document.querySelectorAll('script').forEach((node) => node.remove());
    document.querySelectorAll('[id^="ask-anchor-"]').forEach((node) => node.remove());
  });
  const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));
  for (const path of manifest.content_scripts[0].js) {
    if (path === 'contentScript.js') {
      await page.evaluate(() => {
        const create = AskAnchorModules.anchors;
        AskAnchorModules.anchors = (ctx) => { window.appContext = ctx; return create(ctx); };
      });
    }
    await page.addScriptTag({ path: fileURLToPath(new URL(`../../${path}`, import.meta.url)) });
  }
  await page.addStyleTag({ path: fileURLToPath(new URL('../../styles.css', import.meta.url)) });
}

try {
  console.log(`Browser: ${browser.version()}`);
  for (const [name, run] of cases) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await setup(page);
      await run(page);
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}: ${error.message}`);
      console.error(await page.evaluate(() => ({
        anchorCount: window.appContext?.anchors?.length,
        selected: window.getSelection()?.toString(),
        quote: document.querySelector('#ask-anchor-quote-card')?.textContent,
        chatScrollTop: document.querySelector('#chat')?.scrollTop,
        targetTop: document.querySelector('#target')?.getBoundingClientRect().top
      })), errors);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, [], `浏览器回归失败：${failures.join('、')}`);
