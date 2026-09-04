(() => {
  'use strict';

  const API = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2026-03-11';

  function chunks(value, size = 1900) {
    const result = [];
    for (let index = 0; index < value.length; index += size) result.push(value.slice(index, index + size));
    return result.length ? result : [''];
  }

  function annotations(marks = {}) {
    return {
      bold: Boolean(marks.bold), italic: Boolean(marks.italic),
      strikethrough: Boolean(marks.strikethrough), underline: false,
      code: Boolean(marks.code), color: 'default'
    };
  }

  function richText(runs = []) {
    return runs.flatMap((run) => {
      if (run.type === 'equation') {
        return [{ type: 'equation', equation: { expression: run.expression }, annotations: annotations() }];
      }
      return chunks(run.text).map((content) => ({
        type: 'text', text: { content, link: run.marks?.href ? { url: run.marks.href } : null },
        annotations: annotations(run.marks)
      }));
    }).filter((item) => item.type === 'equation' || item.text.content);
  }

  function notionLanguage(language) {
    const aliases = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell', bash: 'shell', yml: 'yaml', md: 'markdown', text: 'plain text', plaintext: 'plain text', html: 'html', css: 'css', json: 'json', java: 'java', cpp: 'c++', csharp: 'c#', cs: 'c#', go: 'go', rust: 'rust', sql: 'sql', xml: 'markup' };
    return aliases[language?.toLowerCase()] || 'plain text';
  }

  function notionBlock(block) {
    if (block.type === 'equation') {
      return { object: 'block', type: 'equation', equation: { expression: block.expression } };
    }
    if (block.type === 'code') {
      return { object: 'block', type: 'code', code: { rich_text: chunks(block.text).map((content) => ({ type: 'text', text: { content } })), language: notionLanguage(block.language), caption: [] } };
    }
    const supported = new Set(['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'quote']);
    const type = supported.has(block.type) ? block.type : 'paragraph';
    const content = { rich_text: richText(block.runs) };
    if (type === 'heading_1') {
      content.is_toggleable = true;
      if (block.children?.length) content.children = block.children.map(notionBlock);
    }
    return { object: 'block', type, [type]: content };
  }

  function groupUnderToggleHeadings(sourceBlocks) {
    const result = [];
    let currentHeading = null;
    sourceBlocks.forEach((block) => {
      if (block.type === 'heading_1') {
        currentHeading = { ...block, children: [] };
        result.push(currentHeading);
      } else if (currentHeading) {
        currentHeading.children.push(block);
      } else {
        result.push(block);
      }
    });
    return result;
  }

  async function notionFetch(path, token, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Notion API ${response.status}`);
    return data;
  }

  async function sendToNotion(payload) {
    const { notionToken, notionPageId } = await browser.storage.local.get(['notionToken', 'notionPageId']);
    if (!notionToken || !notionPageId) throw new Error('请先点击扩展图标，填写 Notion Token 和页面 ID');
    const pageId = notionPageId.replace(/[^a-fA-F0-9]/g, '');
    if (pageId.length !== 32) throw new Error('Notion 页面 ID 格式不正确');
    const page = await notionFetch('/pages', notionToken.trim(), {
      method: 'POST',
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: pageId },
        properties: { title: { title: [{ type: 'text', text: { content: payload.title.slice(0, 200) } }] } }
      })
    });
    await appendBlocks(page.id, payload.blocks, notionToken.trim());
    return { id: page.id, url: page.url };
  }

  async function appendBlocks(parentIdValue, sourceBlocks, token, afterBlockId = '') {
    const parentId = parentIdValue.replace(/[^a-fA-F0-9]/g, '');
    if (parentId.length !== 32) throw new Error('当前 Notion 页面或块 ID 格式不正确');
    const blocks = groupUnderToggleHeadings(sourceBlocks).map(notionBlock);
    let positionId = afterBlockId.replace(/[^a-fA-F0-9]/g, '');
    for (let index = 0; index < blocks.length; index += 100) {
      const body = { children: blocks.slice(index, index + 100) };
      if (positionId.length === 32) body.position = { type: 'after_block', after_block: { id: positionId } };
      const result = await notionFetch(`/blocks/${parentId}/children`, token, {
        method: 'PATCH', body: JSON.stringify(body)
      });
      positionId = result.results?.at(-1)?.id?.replace(/-/g, '') || '';
    }
  }

  async function pasteToNotion(message, token) {
    let parentId = message.pageId;
    let afterBlockId = message.afterBlockId || '';
    if (afterBlockId) {
      try {
        const block = await notionFetch(`/blocks/${afterBlockId}`, token);
        parentId = block.parent?.block_id || block.parent?.page_id || message.pageId;
      } catch (_) {
        afterBlockId = '';
      }
    }
    return appendBlocks(parentId, message.payload.blocks, token, afterBlockId);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'SEND_TO_NOTION') return sendToNotion(message.payload)
      .then((page) => ({ ok: true, page }))
      .catch((error) => ({ ok: false, error: error.message }));
    if (message?.type === 'PASTE_TO_NOTION') {
      return browser.storage.local.get('notionToken')
        .then(({ notionToken }) => {
          if (!notionToken) throw new Error('请先点击扩展图标填写 Notion Token');
          return pasteToNotion(message, notionToken.trim());
        })
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, error: error.message }));
    }
    return undefined;
  });
})();

