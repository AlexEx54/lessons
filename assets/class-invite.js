(function (root) {
  'use strict';
  const letters = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
    ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  function slug(name) {
    return String(name).trim().toLowerCase().split('').map(letter => letters[letter] ?? letter).join('')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '') || 'new-class';
  }
  if (typeof module === 'object' && module.exports) module.exports = { slug };
  else root.ClassInvite = { slug };
})(typeof window === 'object' ? window : undefined);
