// Background service worker — handles translation

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'translate') {
    console.log('[Gmail翻譯 BG] 收到翻譯請求，長度:', msg.text.length);
    translateText(msg.text)
      .then(result => {
        console.log('[Gmail翻譯 BG] 翻譯完成，結果長度:', result.length);
        sendResponse({ ok: true, text: result });
      })
      .catch(err => {
        console.error('[Gmail翻譯 BG] 翻譯錯誤:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});

async function translateText(text) {
  const MAX = 1800;
  if (text.length <= MAX) return await doTranslate(text);

  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > MAX) {
      if (cur) parts.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + '\n' + line : line;
    }
  }
  if (cur) parts.push(cur);

  const results = [];
  for (const p of parts) {
    results.push(await doTranslate(p));
    await new Promise(r => setTimeout(r, 400));
  }
  return results.join('\n');
}

async function doTranslate(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=' + encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Google Translate HTTP ' + res.status);
  const data = await res.json();
  return data[0].map(c => c[0]).join('');
}
