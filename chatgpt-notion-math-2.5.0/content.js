(() => {
  'use strict';

  const ANSWER_SELECTOR = '[data-message-author-role="assistant"]';
  const MATH_SELECTOR = '[data-math-source], mjx-container, .katex-display, .katex, [data-math-style], math';

  function latexFrom(element) {
    const annotation = element.querySelector?.('annotation[encoding="application/x-tex"]');
    const value = annotation?.textContent || element.getAttribute?.('data-latex') ||
      element.getAttribute?.('data-math-source') || element.getAttribute?.('data-math') ||
      element.getAttribute?.('alttext') || element.getAttribute?.('aria-label') || '';
    return value.trim();
  }

  function normalizeLatex(value) {
    return value
      .replace(/\\_/g, '_')
      .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      .trim();
  }

  function isDisplayMath(element) {
    return element.matches('mjx-container[display="true"], .katex-display, [data-math-style="display"], [data-math-source][style*="display: block"]') ||
      Boolean(element.closest('.katex-display')) || Boolean(element.querySelector?.(':scope > .katex-display'));
  }

  function topLevelMath(root) {
    return [...root.querySelectorAll(MATH_SELECTOR)].filter((element) =>
      !element.parentElement?.closest(MATH_SELECTOR)
    );
  }

  function selectedMath(selection, answer) {
    const range = selection.getRangeAt(0);
    const annotations = [...answer.querySelectorAll('annotation[encoding="application/x-tex"]')].filter((annotation) => {
      const rendered = annotation.closest('math, .katex, mjx-container, [data-math-style]') || annotation;
      try { return range.intersectsNode(rendered); } catch (_) { return false; }
    }).map((annotation) => {
      const rendered = annotation.closest('.katex-display, mjx-container, [data-math-style], .katex, math') || annotation;
      return { latex: normalizeLatex(annotation.textContent || ''), display: isDisplayMath(rendered) };
    }).filter((item) => item.latex);
    if (annotations.length) return annotations;
    return topLevelMath(answer).filter((element) => {
      try { return range.intersectsNode(element); } catch (_) { return false; }
    }).map((element) => ({ latex: normalizeLatex(latexFrom(element)), display: isDisplayMath(element) }))
      .filter((item) => item.latex);
  }

  function restoreSelectedMath(wrapper, formulas) {
    const clonedMath = topLevelMath(wrapper);
    clonedMath.forEach((element, index) => {
      const formula = formulas[index];
      if (!formula) return;
      const marker = document.createElement(formula.display ? 'div' : 'span');
      marker.dataset.c2nMath = formula.display ? 'block' : 'inline';
      marker.textContent = formula.latex;
      element.replaceWith(marker);
    });
  }

  function prepareClone(answer) {
    const clone = answer.cloneNode(true);
    clone.querySelectorAll('button, svg, script, style').forEach((node) => node.remove());
    clone.querySelectorAll('annotation[encoding="application/x-tex"]').forEach((annotation) => {
      const latex = normalizeLatex(annotation.textContent || '');
      const renderRoot = annotation.closest('.katex-display') || annotation.closest('mjx-container') ||
        annotation.closest('[data-math-style]') || annotation.closest('.katex') || annotation.closest('math');
      if (!latex || !renderRoot || renderRoot.closest('[data-c2n-math]')) return;
      const display = isDisplayMath(renderRoot);
      const marker = document.createElement(display ? 'div' : 'span');
      marker.dataset.c2nMath = display ? 'block' : 'inline';
      marker.textContent = latex;
      renderRoot.replaceWith(marker);
    });
    clone.querySelectorAll('[data-math-source], mjx-container, .katex-display, .katex, [data-math-style]').forEach((math) => {
      if (math.closest('[data-c2n-math]')) return;
      const latex = normalizeLatex(latexFrom(math));
      if (!latex) return;
      const marker = document.createElement(isDisplayMath(math) ? 'div' : 'span');
      marker.dataset.c2nMath = isDisplayMath(math) ? 'block' : 'inline';
      marker.textContent = latex;
      math.replaceWith(marker);
    });
    return clone;
  }

  function textRuns(node) {
    const runs = [];
    const walk = (current, marks = {}) => {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.nodeValue) runs.push({ type: 'text', text: current.nodeValue, marks });
        return;
      }
      if (!(current instanceof Element)) return;
      if (current.dataset.c2nMath === 'inline') {
        runs.push({ type: 'equation', expression: current.textContent.trim() });
        return;
      }
      if (current.dataset.c2nMath === 'block') {
        runs.push({ type: 'equation', expression: current.textContent.trim() });
        return;
      }
      const next = { ...marks };
      if (current.matches('strong, b')) next.bold = true;
      if (current.matches('em, i')) next.italic = true;
      if (current.matches('s, del')) next.strikethrough = true;
      if (current.matches('code') && !current.closest('pre')) next.code = true;
      if (current.matches('a[href]')) next.href = current.href;
      current.childNodes.forEach((child) => walk(child, next));
    };
    node.childNodes.forEach((child) => walk(child));
    runs.forEach((run) => {
      if (run.type === 'text') run.text = run.text.replace(/[\t\r\n]+/g, ' ');
    });
    while (runs[0]?.type === 'text') {
      runs[0].text = runs[0].text.replace(/^\s+/, '');
      if (runs[0].text) break;
      runs.shift();
    }
    while (runs.at(-1)?.type === 'text') {
      runs.at(-1).text = runs.at(-1).text.replace(/\s+$/, '');
      if (runs.at(-1).text) break;
      runs.pop();
    }
    return runs;
  }

  function directListItems(list) {
    return [...list.children].filter((child) => child.tagName === 'LI');
  }

  function extract(answer) {
    const root = prepareClone(answer);
    const blocks = [];
    const addText = (type, element) => {
      const runs = textRuns(element);
      if (runs.some((run) => run.type === 'equation' || run.text?.trim())) blocks.push({ type, runs });
    };
    const visit = (element) => {
      if (!(element instanceof Element)) return;
      if (element.dataset.c2nMath === 'block') {
        blocks.push({ type: 'equation', expression: element.textContent.trim() });
      } else if (/^H[1-3]$/.test(element.tagName)) {
        addText(`heading_${element.tagName.slice(1)}`, element);
      } else if (element.tagName === 'P') {
        const displayMath = [...element.querySelectorAll('[data-c2n-math="block"]')];
        if (displayMath.length) {
          const withoutMath = element.cloneNode(true);
          withoutMath.querySelectorAll('[data-c2n-math="block"]').forEach((node) => node.remove());
          if (!withoutMath.textContent.trim()) {
            displayMath.forEach((math) => blocks.push({ type: 'equation', expression: math.textContent.trim() }));
          } else {
            addText('paragraph', element);
          }
        } else {
          addText('paragraph', element);
        }
      } else if (element.tagName === 'PRE') {
        const code = element.querySelector('code');
        blocks.push({ type: 'code', text: (code || element).textContent.replace(/\n$/, ''), language: code?.className.match(/language-([\w+-]+)/)?.[1] || 'plain text' });
      } else if (element.matches('UL, OL')) {
        directListItems(element).forEach((item) => addText(element.tagName === 'UL' ? 'bulleted_list_item' : 'numbered_list_item', item));
      } else if (element.tagName === 'BLOCKQUOTE') {
        addText('quote', element);
      } else if (!element.closest('p, pre, ul, ol, blockquote, h1, h2, h3')) {
        [...element.children].forEach(visit);
      }
    };
    [...root.children].forEach(visit);
    if (!blocks.length) addText('paragraph', root);
    return { title: document.title.replace(/\s*[-|]\s*ChatGPT.*$/i, '').trim() || 'ChatGPT 对话', blocks };
  }

  function encodePayload(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function cloneSelectedBlocks(selection, answer) {
    const wrapper = document.createElement('div');
    for (let index = 0; index < selection.rangeCount; index += 1) {
      wrapper.appendChild(selection.getRangeAt(index).cloneContents());
    }
    return wrapper;
  }

  function copyForNotion(event) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !event.clipboardData) return;
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const answer = anchor?.closest?.(ANSWER_SELECTOR) || anchor?.closest?.('article');
    if (!answer || answer.querySelector('[data-message-author-role="user"]')) return;

    const formulas = selectedMath(selection, answer);
    const wrapper = cloneSelectedBlocks(selection, answer);
    restoreSelectedMath(wrapper, formulas);
    const payload = extract(wrapper);
    if (!payload.blocks.length) return;

    const payloadFormulaCount = payload.blocks.reduce((count, block) =>
      count + (block.type === 'equation' ? 1 : (block.runs || []).filter((run) => run.type === 'equation').length), 0);
    if (formulas.length > payloadFormulaCount) {
      formulas.slice(payloadFormulaCount).forEach((formula) => {
        payload.blocks.push({ type: 'equation', expression: formula.latex });
      });
    }
    payload.formulaCount = Math.max(formulas.length, payloadFormulaCount);
    payload.heading1Count = payload.blocks.filter((block) => block.type === 'heading_1').length;

    // Plain text uses native paste. Equations and level-1 headings use the API
    // so formulas stay native and headings can become collapsible sections.
    if (payload.formulaCount === 0 && payload.heading1Count === 0) return;

    const clean = prepareClone(wrapper);
    const encoded = encodePayload(payload);
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData('text/plain', clean.innerText.trim());
    event.clipboardData.setData('text/html', `<div data-c2n-payload="${encoded}">${clean.innerHTML}</div>`);
  }

  window.addEventListener('copy', copyForNotion, true);
})();

