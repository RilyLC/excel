export function safeWriteToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
  } catch (e) {
    // Fall through to legacy fallback
  }

  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const success = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (success) resolve();
      else reject(new Error('copy-failed'));
    } catch (err) {
      reject(err);
    }
  });
}
