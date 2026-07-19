const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bypticegujbxgvcctkju.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5cHRpY2VndWpieGd2Y2N0a2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NzA3OTUsImV4cCI6MjA5NzA0Njc5NX0.4fzXRVUYKzkDDmOzEiq3PP0Wk8ZujdD7AJAYivnWgbc';

const TABLE_PROPERTIES = 'tkms-mansion-properties';
const TABLE_JOBS = 'tkms-mansion-jobs';

function sbRequest(method, path, body) {
  return new Promise(function(resolve, reject) {
    const url = new URL(SUPABASE_URL + path);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json'
    };
    if (method === 'POST') headers.Prefer = 'return=representation';
    if (method === 'PATCH') headers.Prefer = 'return=minimal';
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    }, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        if (res.statusCode >= 400) {
          reject(new Error(data || ('Supabase ' + res.statusCode)));
          return;
        }
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function createJob(input) {
  return sbRequest('POST', '/rest/v1/' + TABLE_JOBS, {
    status: 'pending',
    job_type: 'generate',
    progress: 0,
    message: '準備中…',
    input: input
  }).then(function(rows) { return Array.isArray(rows) ? rows[0] : rows; });
}

function updateJob(jobId, patch) {
  patch.updated_at = new Date().toISOString();
  return sbRequest('PATCH', '/rest/v1/' + TABLE_JOBS + '?id=eq.' + jobId, patch);
}

function getJob(jobId) {
  return sbRequest('GET', '/rest/v1/' + TABLE_JOBS + '?id=eq.' + jobId + '&select=*')
    .then(function(rows) { return rows && rows[0]; });
}

function saveProperty(record) {
  return sbRequest('POST', '/rest/v1/' + TABLE_PROPERTIES, record)
    .then(function(rows) { return Array.isArray(rows) ? rows[0] : rows; });
}

module.exports = {
  TABLE_JOBS,
  TABLE_PROPERTIES,
  createJob,
  updateJob,
  getJob,
  saveProperty
};
