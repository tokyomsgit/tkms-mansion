const { createJob, updateJob, saveProperty } = require('./lib/supabase');
const core = require('./lib/generate-core');

async function runPipeline(jobId, input) {
  const refUrl = input.refUrl;
  const maisokuUrl = input.maisokuUrl || '';
  const madoriUrlInput = input.madoriUrl || '';
  const maisokuMime = input.maisokuMime || 'application/pdf';

  async function progress(pct, message) {
    await updateJob(jobId, { progress: pct, message: message, status: 'processing' });
  }

  try {
    await progress(5, '参考ページを取得中…');
    const pageHtml = await core.fetchPageHtml(refUrl);

    await progress(18, '写真・物件情報を抽出中…');
    const parsed = core.parseReferencePage(pageHtml, refUrl);
    if (!parsed.photos.length) throw new Error('参考ページから写真を取得できませんでした');

    const galleryPhotos = parsed.photos.filter(function(p) { return !p.isMadori; });
    let madoriUrl = madoriUrlInput || parsed.madoriUrl || '';
    if (!madoriUrl) {
      throw new Error('間取り図が見つかりません。参考ページに間取りがない場合はアップロードしてください');
    }

    await progress(25, '物件情報を整理中…');
    let info = core.defaultPropInfo(parsed.pageInfo);

    if (maisokuUrl) {
      await progress(35, 'Sonnetがマイソクを読み取り中…（最大3分）');
      const pageSnip = core.cleanPageText(pageHtml, parsed.source).substring(0, 6000);
      const aiResult = await core.parseMaisokuWithClaude(maisokuUrl, maisokuMime, parsed.pageInfo, pageSnip);
      info = core.mergeMaisokuFirst(aiResult, parsed.pageInfo, { nameOverride: input.nameOverride || '' });
      await progress(75, 'マイソク解析が完了しました');
    } else {
      info = core.defaultPropInfo(parsed.pageInfo);
      if (input.nameOverride) info.name = input.nameOverride;
      info = core.enrichPropInfo(info);
    }

    await progress(78, 'Sonnetがターゲット向け文案を作成中…');
    const copy = await core.generateMarketingCopyWithClaude(info);

    await progress(85, '物件データを組み立て中…');
    const propertyData = core.buildPropertyData(info, galleryPhotos, madoriUrl, copy);

    await progress(96, 'Supabaseに保存中…');
    const saved = await saveProperty({
      name: propertyData.info.name || '物件資料',
      address: propertyData.info.address || '',
      property_data: propertyData,
      html_content: ''
    });
    if (!saved || !saved.id) throw new Error('Supabase保存失敗');

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      message: '生成完了！',
      property_id: saved.id,
      result: { propertyId: saved.id, name: saved.name }
    });
  } catch (err) {
    await updateJob(jobId, {
      status: 'error',
      error: err.message || String(err),
      message: 'エラーが発生しました'
    }).catch(function() {});
    throw err;
  }
}

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

  const jobId = body.jobId;
  const input = body.input;
  if (!jobId || !input || !input.refUrl) {
    return cors(400, JSON.stringify({ error: 'jobId and input.refUrl required' }));
  }

  try {
    await runPipeline(jobId, input);
    return cors(200, JSON.stringify({ ok: true, jobId: jobId }));
  } catch (err) {
    return cors(500, JSON.stringify({ error: err.message || String(err) }));
  }
};

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

module.exports.runPipeline = runPipeline;
