const https = require('https');
const { createJob, getJob } = require('./lib/supabase');

const SITE_URL = process.env.URL || 'https://tkms-mansion.netlify.app';

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return cors(200, '');
  }

  if (event.httpMethod === 'GET') {
    const jobId = (event.queryStringParameters || {}).jobId;
    if (!jobId) return cors(400, JSON.stringify({ error: 'jobId required' }));
    try {
      const job = await getJob(jobId);
      if (!job) return cors(404, JSON.stringify({ error: 'Job not found' }));
      return cors(200, JSON.stringify({
        jobId: job.id,
        status: job.status,
        progress: job.progress || 0,
        message: job.message || '',
        propertyId: job.property_id || (job.result && job.result.propertyId) || null,
        error: job.error || null
      }));
    } catch (err) {
      return cors(500, JSON.stringify({ error: err.message }));
    }
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

  const refUrl = (body.refUrl || '').trim();
  if (!refUrl) return cors(400, JSON.stringify({ error: 'refUrl required' }));

  const input = {
    refUrl: refUrl,
    maisokuUrl: body.maisokuUrl || '',
    madoriUrl: body.madoriUrl || '',
    maisokuMime: body.maisokuMime || 'application/pdf'
  };

  try {
    const job = await createJob(input);
    if (!job || !job.id) throw new Error('ジョブの作成に失敗しました');

    triggerBackground(job.id, input).catch(function(err) {
      console.error('Background trigger failed:', err.message);
    });

    return cors(202, JSON.stringify({ jobId: job.id, status: 'pending' }));
  } catch (err) {
    var msg = err.message || String(err);
    if (/tkms-mansion-jobs/i.test(msg)) {
      msg = 'Supabaseのセットアップが未完了です。Dashboard > SQL Editor で supabase/migrate-v2.sql を実行してください。';
    }
    return cors(500, JSON.stringify({ error: msg }));
  }
};

function triggerBackground(jobId, input) {
  const payload = JSON.stringify({ jobId: jobId, input: input });
  const url = new URL(SITE_URL + '/.netlify/functions/generate-property-background');

  return new Promise(function(resolve, reject) {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    }, function(res) {
      res.on('data', function() {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

function cors(code, body) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: body
  };
}
