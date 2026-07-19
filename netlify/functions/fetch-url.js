const https = require('https');
const http = require('http');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const url = body.url;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'URL required' }) };

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  const ALLOWED = ['tokyomansions.jp', 'suumo.jp'];
  if (!ALLOWED.some(function(d){ return hostname === d || hostname.endsWith('.' + d); })) {
    return { statusCode: 403, body: JSON.stringify({ error: '許可されているのは tokyomansions.jp と suumo.jp のみです' }) };
  }

  try {
    const html = await fetchPage(url);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ html })
    };
  } catch(err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
};

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9'
      }
    }, (res) => {
      // リダイレクト対応
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}
