(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PropertyNameFix = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var CANONICAL_NAME_PATTERNS = [
    { re: /グリ?ー?ン?パーク\s*日本橋\s*浜町/i, canonical: 'グリーンパーク日本橋浜町' },
    { re: /グーンパーク\s*日本橋\s*浜町/i, canonical: 'グリーンパーク日本橋浜町' }
  ];

  var KNOWN_BUILDING_NAMES = [
    'グリーンパーク日本橋浜町'
  ];

  function fixTextCorruption(s) {
    if (!s) return s;
    return String(s)
      .replace(/\uFFFD/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/グ[\uFFFD�]{1,3}ーン/g, 'グリーン')
      .replace(/グーン/g, 'グリーン')
      .replace(/グリ-ン/g, 'グリーン')
      .replace(/グリイーン/g, 'グリーン')
      .replace(/��+/g, '');
  }

  function canonicalizePropertyName(name) {
    var s = fixTextCorruption(String(name || '').trim());
    if (!s) return s;
    var i;
    for (i = 0; i < CANONICAL_NAME_PATTERNS.length; i++) {
      if (CANONICAL_NAME_PATTERNS[i].re.test(s)) return CANONICAL_NAME_PATTERNS[i].canonical;
    }
    for (i = 0; i < KNOWN_BUILDING_NAMES.length; i++) {
      if (s === KNOWN_BUILDING_NAMES[i]) return KNOWN_BUILDING_NAMES[i];
    }
    return s;
  }

  function looksLikeGreenParkTypo(name) {
    return /グーン/.test(name) || /グリ?ン?パーク/.test(name) && !/グリーン/.test(name);
  }

  function reconcilePropertyName(mergedName, pageName, override) {
    if (override && String(override).trim()) {
      return canonicalizePropertyName(String(override).trim());
    }
    var merged = canonicalizePropertyName(mergedName);
    var page = canonicalizePropertyName(pageName);
    if (!merged || merged === '物件資料') return page || merged;
    if (!page) return merged;
    if (/グリーン/.test(page) && looksLikeGreenParkTypo(mergedName)) return page;
    if (page.length > merged.length && looksLikeGreenParkTypo(mergedName) && /パーク|マンション|レジデンス|タワー/.test(page)) {
      return page;
    }
    return merged;
  }

  return {
    fixTextCorruption: fixTextCorruption,
    canonicalizePropertyName: canonicalizePropertyName,
    reconcilePropertyName: reconcilePropertyName,
    KNOWN_BUILDING_NAMES: KNOWN_BUILDING_NAMES
  };
});
