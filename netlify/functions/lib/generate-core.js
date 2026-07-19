const https = require('https');
const http = require('http');

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const ALLOWED_HOSTS = ['tokyomansions.jp', 'suumo.jp'];

function fetchPageHtml(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return Promise.reject(new Error('Invalid URL'));
  }
  if (!ALLOWED_HOSTS.some(function(d) { return hostname === d || hostname.endsWith('.' + d); })) {
    return Promise.reject(new Error('許可されているのは tokyomansions.jp と suumo.jp のみです'));
  }
  return fetchPage(url);
}

function fetchPage(url) {
  return new Promise(function(resolve, reject) {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9'
      }
    }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() { resolve(Buffer.concat(chunks).toString('utf8')); });
    });
    req.on('error', reject);
    req.setTimeout(15000, function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

function detectPageSource(url) {
  try {
    var h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('suumo.jp')) return 'suumo';
    if (h.includes('tokyomansions.jp')) return 'tokyomansions';
  } catch (e) {}
  return 'generic';
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function fixTextCorruption(s) {
  if (!s) return s;
  return String(s)
    .replace(/\uFFFD/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/グ[\uFFFD�]{1,3}ーン/g, 'グリーン')
    .replace(/��+/g, '');
}

function cleanPropertyName(name, info) {
  name = fixTextCorruption(sanitizeText(name));
  if (!name) return name;
  var floor = name.match(/\s+(\d+)\s*階\s*$/);
  if (floor) {
    name = name.replace(/\s+\d+\s*階\s*$/, '').trim();
    if (info && (!info.kozo || info.kozo === '―')) info.kozo = floor[1] + '階';
  }
  name = name.replace(/\s+\d+(?:\.\d+)?\s*万円.*$/, '').trim();
  name = name.replace(/\s*[（(]\s*[\d.]+\s*万円.*$/, '').trim();
  return name;
}

function cleanCell(s) {
  return decodeHtml(String(s || '').replace(/<[^>]+>/g, ' '))
    .replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').replace(/ヒント/g, '')
    .replace(/\[.*?\]/g, '').replace(/乗り換え案内/g, '').trim();
}

function sanitizeText(s) {
  return fixTextCorruption(decodeHtml(String(s || ''))
    .replace(/&nbsp;/gi, ' ').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\[.*?\]/g, '').replace(/乗り換え案内/g, '')
    .replace(/\s+/g, ' ').trim());
}

function isGarbageText(s) {
  if (!s || s.length < 2) return true;
  if (s.length > 80) return true;
  return /郵便番号|ハイフンなし|例）|例\)|メールアドレス|電話番号|入力|確認メール|ログイン|SUUMO|資料請求|-->|<\/?|javascript:/i.test(s);
}

function isListFragment(s) {
  if (!s || s.length < 3) return true;
  s = s.trim();
  if (/^[・、。．\s\(\)（）\[\]「」\\/]+$/.test(s)) return true;
  if (/^[・]?[月年日][）)]?$/.test(s)) return true;
  if (/^[（(][^（(]{0,6}[）)]$/.test(s) && s.length <= 8) return true;
  if (/^[\d\s・（）()月年日万円㎡m\-−:：,，]+$/.test(s)) return true;
  var core = s.replace(/[・、。．\s\(\)（）\[\]「」\/\\:：\-−\d年月日万円㎡m2]/g, '');
  return core.length < 2;
}

function isValidAddress(s) {
  s = sanitizeText(s);
  if (!s || s.length < 5 || s.length > 60) return false;
  if (isGarbageText(s)) return false;
  return /(?:都|道|府|県).{1,30}(?:区|市|町|村|丁目|番|号)/.test(s) || /^(?:東京都|北海道|京都府|大阪府)/.test(s);
}

function normalizeUnits(s) {
  if (!s) return s;
  return String(s)
    .replace(/m\s*2(?![0-9])/gi, '㎡')
    .replace(/m\^2/gi, '㎡')
    .replace(/(\d+)万円/g, function(_, n) { return parseInt(n, 10).toLocaleString() + '万円'; });
}

function formatPriceDisplay(price) {
  var n = parseInt(String(price || '').replace(/[^0-9]/g, ''), 10);
  if (!n) return price || '―';
  return n.toLocaleString() + '万円';
}

function formatChikuTag(chiku) {
  var c = sanitizeText(chiku);
  if (!c || c === '―') return '―';
  if (/^築/.test(c)) return c;
  if (/\d{4}年/.test(c)) return '築' + c;
  return c;
}

function splitListText(text) {
  if (!text || text === '―') return [];
  var parts = [], seen = {};
  String(text).split(/[\n・\/／、]/).forEach(function(s) {
    s = sanitizeText(s);
    if (s.length < 2 || s.length > 48 || isGarbageText(s) || isListFragment(s) || seen[s]) return;
    seen[s] = 1;
    parts.push(s);
  });
  return parts;
}

function parseAccessLines(koutu) {
  if (!koutu || koutu === '―') return [];
  var s = sanitizeText(koutu);
  var re = /[^、]+?(?:「[^」]+」|[^\s「」]+?駅)[^。]*?徒歩\d+分/g;
  var m = s.match(re);
  if (m && m.length) return m.map(function(x) { return x.trim(); }).slice(0, 5);
  return s.split(/[\n／\/]/).map(function(x) { return x.trim(); })
    .filter(function(x) { return x.length > 4 && x.length < 55 && !isGarbageText(x); }).slice(0, 5);
}

function mapAddress(p) {
  if (isValidAddress(p.address)) return sanitizeText(p.address);
  var n = p.name ? sanitizeText(p.name) : '';
  if (/グリーンパーク|日本橋/.test(n)) return '東京都中央区日本橋浜町';
  return '';
}

function sanitizePropInfo(p) {
  if (!p) return p;
  p = JSON.parse(JSON.stringify(p));
  var strings = ['name', 'address', 'price', 'madori', 'menseki', 'balcony', 'kozo', 'chiku', 'kanrihi', 'shuzenhk', 'parking', 'koutu', 'reno', 'setubi', 'area_desc'];
  strings.forEach(function(k) {
    if (typeof p[k] === 'string') {
      p[k] = normalizeUnits(sanitizeText(p[k]));
      if (p[k] === '-' || p[k] === '') p[k] = '―';
    }
  });
  if (!isValidAddress(p.address)) p.address = mapAddress(p) || '';
  p.price = formatPriceDisplay(p.price);
  if (p.menseki) p.menseki = normalizeUnits(p.menseki);
  if (p.balcony) p.balcony = normalizeUnits(p.balcony);
  p.koutu = sanitizeText(p.koutu);
  var renoParts = splitListText(p.reno);
  var setubiParts = splitListText(p.setubi);
  if (renoParts.length) p.reno = renoParts.join('\n');
  else if (p.reno && p.reno.length > 50) p.reno = '';
  else if (p.reno && isListFragment(p.reno)) p.reno = '―';
  if (setubiParts.length) p.setubi = setubiParts.join('\n');
  if (p.neighbors && p.neighbors.length) {
    p.neighbors = p.neighbors.map(function(n) {
      return { cat: sanitizeText(n.cat), items: (n.items || []).map(sanitizeText).filter(function(it) { return it && !isGarbageText(it); }).slice(0, 6) };
    }).filter(function(n) { return n.cat && n.items.length; });
  }
  if (p.area_desc && p.area_desc.length > 500) p.area_desc = p.area_desc.substring(0, 500);
  if (p.spots && p.spots.length) {
    p.spots = p.spots.map(function(s) { return { name: sanitizeText(s.name), desc: sanitizeText(s.desc) }; })
      .filter(function(s) { return s.name && !isGarbageText(s.desc); });
  }
  if (p.name) p.name = cleanPropertyName(p.name, p);
  return p;
}

function cleanPageText(html, source) {
  var t = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.substring(0, source === 'suumo' ? 12000 : 8000);
}

function suumoPhotoUrl(srcEnc, w, h) {
  return 'https://img01.suumo.com/jj/resizeImage?src=' + srcEnc + '&w=' + (w || 800) + '&h=' + (h || 600);
}

function suumoLabelFromText(lbl) {
  var s = cleanCell(lbl);
  if (!s) return '';
  if (s.indexOf('間取') >= 0) return '間取り';
  if (s.indexOf('外観') >= 0 || s.indexOf('外観写真') >= 0) return '外観';
  if (s.indexOf('リビング') >= 0 || s.indexOf('LDK') >= 0) return 'リビング';
  if (s.indexOf('キッチン') >= 0) return 'キッチン';
  if (s.indexOf('浴室') >= 0) return '浴室';
  if (s.indexOf('洗面') >= 0) return '洗面台';
  if (s.indexOf('トイレ') >= 0) return 'トイレ';
  if (s.indexOf('バルコニー') >= 0) return 'バルコニー';
  if (s.indexOf('眺望') >= 0) return '眺望';
  if (s.indexOf('洋室') >= 0 || s.indexOf('居室') >= 0) return '洋室';
  if (s.indexOf('和室') >= 0) return '和室';
  if (s.indexOf('収納') >= 0) return '収納';
  if (s.indexOf('エントランス') >= 0) return 'エントランス';
  return s.substring(0, 12);
}

function suumoFallbackLabel(fileName) {
  var n = (fileName.match(/_(\d{4})\./) || [])[1];
  var map = { '0001': '間取り', '0002': 'リビング', '0003': '外観', '0004': '眺望', '0005': 'キッチン', '0006': '浴室', '0007': '洋室', '0008': '洗面台', '0009': 'バルコニー', '0010': 'トイレ' };
  return map[n] || 'その他';
}

function extractSuumoPhotos(html) {
  var photos = [], seen = {}, madoriUrl = '';
  var re = /resizeImage\?src=([^&"']+?)&(?:amp;)?w=(\d+)(?:&(?:amp;)?h=\d+)?(?:[,}]([^"'\s<>}]*))?/gi, m;
  while ((m = re.exec(html)) !== null) {
    var srcEnc = m[1], w = parseInt(m[2], 10) || 500, lblRaw = m[3] || '';
    var srcDec = decodeHtml(srcEnc);
    var fileKey = (srcDec.match(/([^/]+\.jpg)/i) || [])[1] || srcDec;
    if (seen[fileKey]) continue;
    seen[fileKey] = 1;
    var label = suumoLabelFromText(lblRaw) || suumoFallbackLabel(fileKey);
    var isMadori = label === '間取り' || /_0001\./i.test(fileKey);
    var url = suumoPhotoUrl(srcEnc, Math.max(w, 800), 600);
    if (isMadori) {
      madoriUrl = url;
      photos.push({ url: url, label: '間取り', isMadori: true });
    } else {
      photos.push({ url: url, label: label, isMadori: false });
    }
  }
  if (!photos.length) {
    var re2 = /https?:\/\/img\d+\.suumo\.com\/jj\/resizeImage\?src=[^"'<>\s]+/gi, m2;
    while ((m2 = re2.exec(html)) !== null) {
      var u = decodeHtml(m2[0]).replace(/&w=\d+.*/, '') + '&w=800&h=600';
      var fk = (u.match(/([^/%]+\.jpg)/i) || [])[1] || u;
      if (seen[fk]) continue;
      seen[fk] = 1;
      var lb = suumoFallbackLabel(fk);
      var im = lb === '間取り' || /_0001\./i.test(fk);
      if (im) madoriUrl = u;
      photos.push({ url: u, label: lb, isMadori: im });
    }
  }
  return { photos: photos, madoriUrl: madoriUrl };
}

function extractTokyoMansionPhotos(html) {
  var urls = [], seen = {};
  var re = /https?:\/\/[^\s"'<>]+?\.(jpg|jpeg|png|webp)/gi, m;
  while ((m = re.exec(html)) !== null) {
    var u = m[0];
    if (seen[u]) continue; seen[u] = 1;
    if (u.includes('neibour') || u.includes('logo') || u.includes('icon') || u.includes('btn') || u.includes('banner') || u.includes('images_satis') || u.includes('ttl') || u.includes('top/') || u.includes('.gif')) continue;
    urls.push(u);
  }
  return urls.map(function(u) { return { url: u, label: '', isMadori: /madori|間取|floor/i.test(u) }; });
}

function parseSuumoNeighbors(html) {
  var neighbors = [], block = html.match(/周辺環境[\s\S]{0,12000}/i);
  if (!block) return neighbors;
  var chunk = block[0].replace(/<script[\s\S]*?<\/script>/gi, '');
  var re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi, m;
  var catMap = {};
  while ((m = re.exec(chunk)) !== null) {
    var cat = cleanCell(m[1]), item = cleanCell(m[2]);
    if (!cat || !item) continue;
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(item);
  }
  if (!Object.keys(catMap).length) {
    var lines = chunk.replace(/<[^>]+>/g, '\n').split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    var cur = '';
    lines.forEach(function(l) {
      if (/^(スーパー|コンビニ|ドラッグストア|中学校|小学校|幼稚園|保育園|郵便局|銀行|警察)/.test(l) && l.length < 20) { cur = l; if (!catMap[cur]) catMap[cur] = []; }
      else if (cur && l.indexOf('：') >= 0) catMap[cur].push(l);
    });
  }
  Object.keys(catMap).forEach(function(cat) {
    if (catMap[cat].length) neighbors.push({ cat: cat, items: catMap[cat].slice(0, 6) });
  });
  return neighbors.slice(0, 8);
}

function parseSuumoInfo(html) {
  var info = {};
  var h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    var t = cleanCell(h1[1]);
    var pm = t.match(/(\d+(?:\.\d+)?)\s*万円/);
    var mm = t.match(/（([^）]+)）/);
    var nm = t.match(/^(.+?)\s+\d+/);
    if (nm) info.name = nm[1].trim();
    if (pm) info.price = pm[1] + '万円';
    if (mm) info.madori = mm[1];
  }
  if (!info.price) {
    var pm2 = html.match(/>(\d+(?:\.\d+)?)\s*万円</);
    if (pm2) info.price = pm2[1] + '万円';
  }
  if (!info.name) {
    var t2 = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t2) {
      var tn = cleanCell(t2[1]).replace(/^【SUUMO】/, '').replace(/中古マンション.*/, '').trim();
      if (tn) info.name = tn;
    }
  }
  var re = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var k = cleanCell(m[1]), v = cleanCell(m[2]);
    if (!k || !v || v === '-' || v === '―') continue;
    if (k.indexOf('物件名') >= 0) info.name = v;
    else if (k.indexOf('価格') >= 0) info.price = (v.match(/\d+(?:\.\d+)?万円/) || [])[0] || v;
    else if (k.indexOf('間取') >= 0) info.madori = v;
    else if (k.indexOf('専有面積') >= 0) info.menseki = v;
    else if (k.indexOf('その他面積') >= 0 || k.indexOf('バルコニー') >= 0) info.balcony = v.replace(/.*：/, '').trim() || v;
    else if (k.indexOf('構造') >= 0 || k.indexOf('所在階') >= 0) info.kozo = v;
    else if (k.indexOf('築') >= 0 || k.indexOf('完成') >= 0) info.chiku = v;
    else if (k.indexOf('管理費') >= 0) info.kanrihi = v;
    else if (k.indexOf('修繕積立') >= 0) info.shuzenhk = v;
    else if (k.indexOf('駐車') >= 0) info.parking = v;
    else if (k.indexOf('住所') >= 0 || k.indexOf('所在地') >= 0) {
      var addr = v.split('[')[0].trim();
      if (isValidAddress(addr)) info.address = addr;
    }
    else if (k.indexOf('交通') >= 0) info.koutu = v;
  }
  var feat = html.match(/特徴ピックアップ[\s\S]{0,1200}/i);
  if (feat) {
    var ftxt = cleanCell(feat[0].replace(/特徴ピックアップ/i, ''));
    if (ftxt) info.setubi = ftxt.split(/\s*\/\s*/).filter(Boolean).join('\n');
  }
  var desc = html.match(/<h3[^>]*>[\s\S]*?<\/h3>\s*<div[^>]*>([\s\S]{0,2500})/i);
  if (desc) {
    var dtxt = cleanCell(desc[1]);
    if (dtxt.length > 40) info._featureText = dtxt.substring(0, 1200);
  }
  info.neighbors = parseSuumoNeighbors(html);
  if (!info.address) {
    var am = html.match(/(東京都[^\s<]{2,40}(?:区|市)[^\s<]{0,30})/);
    if (am && isValidAddress(am[1])) info.address = am[1];
  }
  return info;
}

function parseTokyoMansionInfo(html) {
  var info = {};
  var title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) info.name = cleanCell(title[1]).split('|')[0].split('—')[0].trim();
  var re = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi, m;
  while ((m = re.exec(html)) !== null) {
    var k = cleanCell(m[1]), v = cleanCell(m[2]);
    if (!k || !v) continue;
    if (/物件名|名称/.test(k)) info.name = v;
    else if (/価格|販売/.test(k)) info.price = v;
    else if (/間取/.test(k)) info.madori = v;
    else if (/専有|面積/.test(k)) info.menseki = v;
    else if (/住所|所在地/.test(k)) {
      var addr = v.split('[')[0].trim();
      if (isValidAddress(addr)) info.address = addr;
    }
    else if (/交通|アクセス/.test(k)) info.koutu = v;
    else if (/築/.test(k)) info.chiku = v;
    else if (/管理費/.test(k)) info.kanrihi = v;
    else if (/修繕/.test(k)) info.shuzenhk = v;
    else if (/駐車/.test(k)) info.parking = v;
    else if (/構造/.test(k)) info.kozo = v;
  }
  return info;
}

function parseReferencePage(html, url) {
  var source = detectPageSource(url);
  var result = { source: source, photos: [], madoriUrl: '', pageInfo: {} };
  if (source === 'suumo') {
    var sp = extractSuumoPhotos(html);
    result.photos = sp.photos;
    result.madoriUrl = sp.madoriUrl;
    result.pageInfo = parseSuumoInfo(html);
  } else {
    result.photos = extractTokyoMansionPhotos(html);
    result.madoriUrl = (result.photos.find(function(p) { return p.isMadori; }) || {}).url || '';
    result.pageInfo = parseTokyoMansionInfo(html);
    if (!result.photos.length) {
      var urls = extractPhotoUrlsLegacy(html);
      result.photos = urls.map(function(u) { return { url: u, label: '', isMadori: false }; });
    }
  }
  return result;
}

function extractPhotoUrlsLegacy(html) {
  var urls = [], seen = {};
  var re = /https?:\/\/[^\s"'<>]+?\.(jpg|jpeg|png|webp)/gi, m;
  while ((m = re.exec(html)) !== null) {
    var u = m[0];
    if (seen[u]) continue; seen[u] = 1;
    if (u.includes('logo') || u.includes('icon') || u.includes('btn') || u.includes('banner') || u.includes('.gif')) continue;
    urls.push(u);
  }
  return urls;
}

function mergePageInfo(ai, page) {
  if (!page) return ai;
  ['name', 'address', 'price', 'madori', 'menseki', 'balcony', 'kozo', 'chiku', 'kanrihi', 'shuzenhk', 'parking', 'koutu', 'setubi'].forEach(function(k) {
    if (page[k] && page[k] !== '-' && page[k] !== '―') ai[k] = page[k];
  });
  if (page.neighbors && page.neighbors.length) ai.neighbors = page.neighbors;
  if (page._featureText) {
    if (!ai.area_desc || ai.area_desc === '―') ai.area_desc = page._featureText.substring(0, 400);
    if (!ai.reno || ai.reno === '―') {
      var lines = splitListText(page._featureText).filter(function(s) { return s.length > 4 && s.length < 40; });
      if (lines.length) ai.reno = lines.slice(0, 8).join('\n');
    }
  }
  if (page.setubi && (!ai.setubi || ai.setubi === '―')) ai.setubi = page.setubi;
  return ai;
}

function defaultPropInfo(pageInfo) {
  return mergePageInfo({
    name: '物件資料', address: '', price: '―', madori: '―', menseki: '―', balcony: '―', kozo: '―', chiku: '―',
    kanrihi: '―', shuzenhk: '―', parking: '―', koutu: '―', reno: '―', setubi: '―', area_desc: '', spots: [], neighbors: []
  }, pageInfo || {});
}

function enrichPropInfo(p) {
  if ((!p.area_desc || p.area_desc === '―') && p.address) {
    p.area_desc = p.address + '周辺は、日常の買い物から交通アクセスまで利便性の高い立地です。\n' + p.address + 'ならではの落ち着きと都心の利便性を両立した住環境が魅力です。';
  }
  if ((!p.spots || !p.spots.length) && p.neighbors && p.neighbors.length) {
    p.spots = p.neighbors.slice(0, 3).map(function(n) {
      return { name: n.cat || '周辺施設', desc: (n.items && n.items[0]) || '' };
    });
  }
  if ((!p.reno || p.reno === '―') && p.setubi && p.setubi !== '―') {
    var sp = splitListText(p.setubi);
    if (sp.length) p.reno = sp.slice(0, 6).join('\n');
  }
  return sanitizePropInfo(p);
}

function mergeMaisokuFirst(ai, page) {
  var base = defaultPropInfo(page || {});
  if (!ai) return base;
  Object.keys(ai).forEach(function(k) {
    var v = ai[k];
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && (!v.trim() || v === '―' || v === '-')) return;
    if (Array.isArray(v) && !v.length) return;
    base[k] = v;
  });
  if (page && page.neighbors && page.neighbors.length && (!base.neighbors || !base.neighbors.length)) base.neighbors = page.neighbors;
  if (page && page._featureText) {
    if (!base.area_desc || base.area_desc === '―') base.area_desc = page._featureText.substring(0, 400);
  }
  return sanitizePropInfo(base);
}

function buildPropertyData(info, galleryPhotos, madoriUrl) {
  return {
    version: 2,
    info: enrichPropInfo(info),
    assets: {
      photoUrls: galleryPhotos.filter(function(p) { return !p.isMadori; }).map(function(p) { return p.url; }).slice(0, 12),
      galleryPhotos: galleryPhotos.filter(function(p) { return !p.isMadori; }).slice(0, 12),
      madoriUrl: madoriUrl
    }
  };
}

function fetchBinary(url) {
  return new Promise(function(resolve, reject) {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 PropertyBot/1.0' }
    }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBinary(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('ファイル取得失敗 HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

function callClaude(apiKey, payload) {
  const body = JSON.stringify(payload);
  return new Promise(function(resolve, reject) {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 600000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || parsed.error || ('Claude API ' + res.statusCode)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Claude API response parse error'));
        }
      });
    });
    req.on('timeout', function() { req.destroy(new Error('Claude API timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function parseMaisokuWithClaude(maisokuUrl, mimetype, pageInfo, pageSnip) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY が設定されていません');

  const fileBuf = await fetchBinary(maisokuUrl);
  if (!fileBuf || !fileBuf.length) throw new Error('マイソクファイルの取得に失敗しました');

  const base64 = fileBuf.toString('base64');
  const isPdf = (mimetype || '').includes('pdf') || /\.pdf(\?|$)/i.test(maisokuUrl);
  const mediaType = isPdf ? 'application/pdf' : (mimetype || 'image/jpeg');

  const content = [];
  if (isPdf) {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
  } else {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
  }

  const schema = '{"name":"物件名","address":"住所","price":"販売価格","madori":"間取り","menseki":"専有面積","balcony":"バルコニー","kozo":"構造・階数","chiku":"築年月","kanrihi":"管理費","shuzenhk":"修繕積立金","parking":"駐車場","koutu":"交通","reno":"リノベ施工（改行区切り）","setubi":"設備（改行区切り）","area_desc":"エリア解説","spots":[{"name":"","desc":""}],"neighbors":[{"cat":"","items":[""]}]}';
  const txt = 'マイソクを正確に読み取りJSONのみ出力。帯（手数料・免責・宅建番号）は無視。参考ページ情報と矛盾する場合はマイソク優先。記号禁止。\n'
    + schema + '\n\n【参考ページ抽出済み】\n' + JSON.stringify(pageInfo || {})
    + '\n\n【参考ページ本文】\n' + String(pageSnip || '').substring(0, 6000);

  content.push({ type: 'text', text: txt });

  const claudeRes = await callClaude(CLAUDE_API_KEY, {
    model: CLAUDE_MODEL,
    max_tokens: 3500,
    system: 'JSONのみ出力。説明不要。記号禁止。',
    messages: [{ role: 'user', content: content }]
  });

  const text = (claudeRes.content || [])
    .filter(function(b) { return b.type === 'text'; })
    .map(function(b) { return b.text; })
    .join('');

  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error('マイソク解析結果のJSON化に失敗しました');
  }
}

module.exports = {
  fetchPageHtml,
  detectPageSource,
  parseReferencePage,
  cleanPageText,
  buildPropertyData,
  enrichPropInfo,
  sanitizePropInfo,
  defaultPropInfo,
  mergeMaisokuFirst,
  parseMaisokuWithClaude
};
