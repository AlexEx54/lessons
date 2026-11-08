(function (root) {
  'use strict';

  async function copyText(text, documentRef = document) {
    try {
      await root.navigator.clipboard.writeText(text);
      return;
    } catch (_error) {
      // The Clipboard API is missing outside a secure context and denied in some in-app browsers;
      // a hidden textarea still copies there.
    }
    const input = documentRef.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    documentRef.body.append(input);
    input.select();
    const copied = documentRef.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Браузер не разрешил скопировать ссылку.');
  }

  root.CopyText = { copyText };
})(window);
