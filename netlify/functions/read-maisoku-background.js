const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bypticegujbxgvcctkju.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5cHRpY2VndWpieGd2Y2N0a2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NzA3OTUsImV4cCI6MjA5NzA0Njc5NX0.4fzXRVUYKzkDDmOzEiq3PP0Wk8ZujdD7AJAYivnWgbc';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const TABLE_JOBS = 'tkms-mansion-jobs';

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return cors(200, '');
  }
  if (event.httpMethod !== 'POST') {
    return cors(405, JSON.stringify({ error: 'Method Not Allowed' }));
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return cors(400, JSON.stringify({ error: 'Invalid JSON' }));
  }

  const { jobId, maisokuUrl, mimetype, pageInfo, pageSnip } = body;
  if (!jobId || !maisokuUrl) {
    return cors(400, JSON.stringify({ error: 'jobId and maisokuUrl required' }));
  }

  try {
    await processJob(jobId, maisokuUrl, mimetype, pageInfo || {}, pageSnip || '');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, jobId: jobId })
    };
  } catch (err) {
    await updateJob(jobId, 'error', null, err.message || String(err)).catch(function(){});
    return cors(500, JSON.stringify({ error: err.message }));
  }
};

async function processJob(jobId, maisokuUrl, mimetype, pageInfo, pageSnip) {
  await updateJob(jobId, 'processing');

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
    + schema + '\n\n【参考ページ抽出済み】\n' + JSON.stringify(pageInfo)
    + '\n\n【参考ページ本文】\n' + String(pageSnip).substring(0, 6000);

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
  let result;
  try {
    result = JSON.parse(clean);
  } catch (e) {
    throw new Error('マイソク解析結果のJSON化に失敗しました');
  }

  await updateJob(jobId, 'done', result);
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

function updateJob(jobId, status, result, error) {
  const patch = { status: status, updated_at: new Date().toISOString() };
  if (result !== undefined) patch.result = result;
  if (error !== undefined) patch.error = error;

  const body = JSON.stringify(patch);
  return new Promise(function(resolve, reject) {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + TABLE_JOBS + '?id=eq.' + jobId);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        if (res.statusCode >= 400) reject(new Error('Job update failed: ' + data));
        else resolve();
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function cors(code, body) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: body
  };
}
