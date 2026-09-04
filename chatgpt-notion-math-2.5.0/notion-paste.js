(() => {
  'use strict';

  function decodePayload(value) {
    return JSON.parse(decodeURIComponent(escape(atob(value))));
  }

  function currentPageId() {
    const matches = location.href.match(/([a-fA-F0-9]{8}(?:-?[a-fA-F0-9]{4}){3}-?[a-fA-F0-9]{12})(?:[?#]|$)/);
    return matches?.[1]?.replaceAll('-', '') || '';
  }

  function payloadFromClipboard(event) {
    const html = event.clipboardData?.getData('text/html') || '';
    if (!html.includes('data-c2n-payload')) return null;
    const documentValue = new DOMParser().parseFromString(html, 'text/html');
    const encoded = documentValue.querySelector('[data-c2n-payload]')?.dataset.c2nPayload;
    return encoded ? decodePayload(encoded) : null;
  }

  function cursorBlockId(event) {
    const target = event.target instanceof Element ? event.target : document.activeElement;
    const block = target?.closest?.('[data-block-id]') || document.activeElement?.closest?.('[data-block-id]');
    const value = block?.getAttribute('data-block-id') || '';
    const matches = value.match(/[a-fA-F0-9]{8}(?:-?[a-fA-F0-9]{4}){3}-?[a-fA-F0-9]{12}/);
    return matches?.[0]?.replaceAll('-', '') || '';
  }

  function toast(message, error = false) {
    const node = document.createElement('div');
    node.textContent = message;
    Object.assign(node.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647',
      padding: '10px 14px', borderRadius: '8px', color: '#fff',
      background: error ? '#c73737' : '#2383e2', font: '13px system-ui',
      boxShadow: '0 4px 18px #0004'
    });
    document.documentElement.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  function readyNotice() {
    const node = document.createElement('div');
    node.textContent = 'C2N 2.5.0 已就绪';
    node.id = 'c2n-ready-notice';
    Object.assign(node.style, {
      position: 'fixed', right: '14px', bottom: '14px', zIndex: '2147483647',
      padding: '6px 9px', borderRadius: '7px', color: '#fff', opacity: '.9',
      background: '#2383e2', font: '12px system-ui', pointerEvents: 'none'
    });
    document.documentElement.appendChild(node);
    setTimeout(() => node.remove(), 5000);
  }

  document.addEventListener('paste', async (event) => {
    let payload;
    try { payload = payloadFromClipboard(event); } catch (error) { toast(`无法解析复制内容：${error.message}`, true); return; }
    if (!payload) return;
    const pageId = currentPageId();
    if (!pageId) { toast('无法识别当前 Notion 页面 ID', true); return; }

    event.preventDefault();
    event.stopImmediatePropagation();
    toast('正在写入原生 Notion 公式…');
    const afterBlockId = cursorBlockId(event);
    const response = await browser.runtime.sendMessage({ type: 'PASTE_TO_NOTION', pageId, afterBlockId, payload });
    const count = Number(payload.formulaCount || 0);
    const suffix = `（公式 ${count} 个）`;
    const success = afterBlockId ? `已插入到当前块之后 ✓ ${suffix}` : `未识别光标块，已追加到底部 ✓ ${suffix}`;
    toast(response?.ok ? success : `写入失败：${response?.error || '未知错误'}`, !response?.ok);
  }, true);

  readyNotice();
})();

