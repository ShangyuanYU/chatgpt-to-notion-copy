(() => {
  'use strict';
  const token = document.querySelector('#token');
  const status = document.querySelector('#status');

  browser.storage.local.get(['notionToken']).then((settings) => {
    token.value = settings.notionToken || '';
  });

  document.querySelector('#save').addEventListener('click', async () => {
    const notionToken = token.value.trim();
    if (!notionToken) { status.textContent = '请填写 Integration Token。'; return; }
    await browser.storage.local.set({ notionToken });
    status.textContent = '已保存。现在刷新 ChatGPT 页面。';
  });
})();

