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
  const MAX = 800;
  if (text.length <= MAX) return await doTranslate(text);

  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > MAX) {
      if (cur) parts.push(cur);
      cur = line.length > MAX ? line.slice(0, MAX) : line;
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
  const url = 'https://translate.googleapis.com/translate_a/single';
  const res = await fetch(url + '?client=gtx&sl=en&tl=zh-TW&dt=t&q=' + encodeURIComponent(text));
  if (res.ok) {
    const data = await res.json();
    return data[0].map(c => c[0]).join('');
  }
  // GET 失敗時嘗試 POST
  console.log('[Gmail翻譯 BG] GET 失敗 (' + res.status + ')，改用 POST');
  const res2 = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client=gtx&sl=en&tl=zh-TW&dt=t&q=' + encodeURIComponent(text)
  });
  if (!res2.ok) throw new Error('Google Translate HTTP ' + res2.status);
  const data2 = await res2.json();
  return data2[0].map(c => c[0]).join('');
}
