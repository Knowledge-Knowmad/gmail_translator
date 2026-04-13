// Gmail 一鍵翻譯 v5 — 可拖拉浮動按鈕

(() => {
  console.log('[Gmail翻譯] v5 已載入');

  const fab = document.createElement('div');
  fab.id = 'tw-translate-fab';
  fab.innerHTML = `
    <div id="tw-drag-handle" title="拖拉移動位置">⠿</div>
    <button id="tw-translate-btn">
      <span class="btn-icon">🌐</span>
      <span class="btn-text">翻譯成中文</span>
    </button>
    <button id="tw-restore-btn" style="display:none">
      <span class="btn-icon">🔄</span>
      <span class="btn-text">顯示原文</span>
    </button>
  `;
  document.body.appendChild(fab);

  const translateBtn = document.getElementById('tw-translate-btn');
  const restoreBtn = document.getElementById('tw-restore-btn');
  const dragHandle = document.getElementById('tw-drag-handle');

  let savedOriginal = null;
  let currentEmailBody = null;
  let lastCheckedText = '';

  // === 拖拉邏輯 ===
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;

  function loadPosition() {
    try {
      const saved = localStorage.getItem('tw-translate-fab-pos');
      if (saved) {
        const { x, y } = JSON.parse(saved);
        fab.style.right = 'auto';
        fab.style.left = Math.min(x, window.innerWidth - 60) + 'px';
        fab.style.top = Math.min(y, window.innerHeight - 40) + 'px';
      }
    } catch(e) {}
  }

  function savePosition() {
    try {
      localStorage.setItem('tw-translate-fab-pos', JSON.stringify({
        x: parseInt(fab.style.left),
        y: parseInt(fab.style.top)
      }));
    } catch(e) {}
  }

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  dragHandle.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = fab.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    fab.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = clamp(e.clientX - dragOffsetX, 0, window.innerWidth - fab.offsetWidth);
    const y = clamp(e.clientY - dragOffsetY, 0, window.innerHeight - fab.offsetHeight);
    fab.style.right = 'auto';
    fab.style.left = x + 'px';
    fab.style.top = y + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove('dragging');
    savePosition();
  });

  loadPosition();

  // === 英文偵測 ===
  function isMainlyEnglish(text) {
    const cleaned = text.replace(/[\s\d\n\r]/g, '');
    if (cleaned.length < 30) return false;
    let ascii = 0, cjk = 0;
    for (const ch of cleaned) {
      const c = ch.charCodeAt(0);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) ascii++;
      if (c >= 0x4E00 && c <= 0x9FFF) cjk++;
    }
    if (cjk / cleaned.length > 0.15) return false;
    return ascii / cleaned.length > 0.5;
  }

  function findEmailBody() {
    for (const sel of ['div.a3s.aiL', 'div.a3s', 'div.ii.gt div.a3s', 'div.ii.gt']) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 20) return el;
    }
    return null;
  }

  // === 收集文字節點 ===
  function collectTextSegments(root) {
    const segments = [];
    const SKIP = new Set(['SCRIPT','STYLE','IMG','VIDEO','IFRAME','SVG','CODE','PRE']);
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t.length > 0) segments.push({ node, text: t });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (SKIP.has(node.tagName)) return;
      for (const child of node.childNodes) walk(child);
    }
    walk(root);
    return segments;
  }

  // === 批次翻譯（透過 background service worker）===
  async function batchTranslate(texts) {
    const SEP = '\n§§§\n';
    const MAX = 1600;
    const batches = [];
    let cur = [], len = 0;
    for (const t of texts) {
      if (len + t.length + SEP.length > MAX && cur.length > 0) {
        batches.push(cur); cur = []; len = 0;
      }
      cur.push(t); len += t.length + SEP.length;
    }
    if (cur.length > 0) batches.push(cur);

    const all = [];
    for (const batch of batches) {
      if (!chrome.runtime?.id) {
        throw new Error('擴充功能已更新，請重新整理此頁面 (F5)');
      }
      const res = await chrome.runtime.sendMessage({ action: 'translate', text: batch.join(SEP) });
      if (!res || !res.ok) throw new Error(res?.error || '翻譯失敗');
      const parts = res.text.split(/§§§/);
      for (let i = 0; i < batch.length; i++) all.push(parts[i] ? parts[i].trim() : batch[i]);
      if (batches.length > 1) await new Promise(r => setTimeout(r, 400));
    }
    return all;
  }

  // === 翻譯 ===
  translateBtn.addEventListener('click', async () => {
    const body = findEmailBody();
    if (!body) return alert('找不到郵件內容');
    currentEmailBody = body;
    savedOriginal = body.innerHTML;
    translateBtn.querySelector('.btn-text').textContent = '翻譯中…';
    translateBtn.classList.add('loading');
    translateBtn.disabled = true;
    try {
      const segments = collectTextSegments(body);
      if (segments.length === 0) throw new Error('找不到可翻譯的文字');
      const translated = await batchTranslate(segments.map(s => s.text));
      for (let i = 0; i < segments.length; i++) {
        segments[i].node.textContent = segments[i].node.textContent.replace(segments[i].text, translated[i]);
      }
      const header = document.createElement('div');
      header.id = 'tw-translated-result';
      header.className = 'tw-result-header-bar';
      header.innerHTML = `
        <span class="tw-flag">🇹🇼</span>
        <span class="tw-title">已翻譯為台灣繁體中文</span>
        <span class="tw-badge">Google 翻譯</span>
      `;
      body.insertBefore(header, body.firstChild);
      translateBtn.style.display = 'none';
      restoreBtn.style.display = 'inline-flex';
    } catch (err) {
      console.error('[Gmail翻譯]', err);
      alert('翻譯失敗: ' + err.message);
      if (savedOriginal) body.innerHTML = savedOriginal;
    } finally {
      translateBtn.querySelector('.btn-text').textContent = '翻譯成中文';
      translateBtn.classList.remove('loading');
      translateBtn.disabled = false;
    }
  });

  // === 還原 ===
  restoreBtn.addEventListener('click', () => {
    if (currentEmailBody && savedOriginal) {
      currentEmailBody.innerHTML = savedOriginal;
      savedOriginal = null; currentEmailBody = null;
    }
    restoreBtn.style.display = 'none';
    translateBtn.style.display = 'inline-flex';
    lastCheckedText = '';
  });

  // === 顯示/隱藏 ===
  function updateVisibility() {
    const body = findEmailBody();
    if (!body) { fab.classList.remove('visible'); lastCheckedText = ''; return; }
    const text = body.innerText.trim();
    if (text === lastCheckedText) return;
    lastCheckedText = text;
    restoreBtn.style.display = 'none';
    translateBtn.style.display = 'inline-flex';
    savedOriginal = null;
    fab.classList.toggle('visible', isMainlyEnglish(text));
  }

  setInterval(updateVisibility, 1200);
  setTimeout(updateVisibility, 600);
})();
