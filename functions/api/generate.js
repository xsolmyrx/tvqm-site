// POST /api/generate
// Body: { question: string, mode: "answer" | "story" }
//
// This is the real Phase 2 pipeline:
//  1. Pull the same chunk data the static site already ships (via ASSETS binding —
//     no duplicate data, no separate database).
//  2. Simple keyword retrieval — same idea as the client-side Search tab, just
//     scored across both docs at once to find the best supporting passages.
//  3. Call Claude with only those passages as context, instructed to answer
//     strictly from them and cite page numbers.
//
// Requires an ANTHROPIC_API_KEY secret set on this Pages project
// (Settings → Variables and Secrets → Add → type: Secret).

const DOC_LABELS = {
  telviva: "Telviva Enswitch 4.2",
  queuemetrics: "QueueMetrics 26.01"
};

const STOPWORDS = new Set(("the a an of to in and or for with on at by from is are be this that as it its "
  + "into your you can which will use used using not have has if then than when where each all any also more "
  + "most such other only over under between within without per via what how why does do did doesn't don't")
  .split(/\s+/));

function tokenize(s) {
  return (s.toLowerCase().match(/[a-z][a-z0-9\-]{2,}/g) || []).filter(w => !STOPWORDS.has(w));
}

function scoreChunk(queryWords, chunk) {
  const text = chunk.text.toLowerCase();
  let score = 0;
  for (const w of queryWords) {
    // crude but effective: count occurrences of each query word in the chunk
    const matches = text.split(w).length - 1;
    score += matches;
  }
  return score;
}

async function retrieveTopChunks(env, request, question, topN = 6) {
  const base = new URL(request.url);
  const [tvRes, qmRes] = await Promise.all([
    env.ASSETS.fetch(new URL('/data/telviva.json', base)),
    env.ASSETS.fetch(new URL('/data/queuemetrics.json', base))
  ]);
  const [tv, qm] = await Promise.all([tvRes.json(), qmRes.json()]);

  const queryWords = tokenize(question);
  const pool = [];
  for (const c of tv) pool.push({ doc: 'telviva', chunk: c });
  for (const c of qm) pool.push({ doc: 'queuemetrics', chunk: c });

  const scored = pool
    .map(p => ({ ...p, score: scoreChunk(queryWords, p.chunk) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored;
}

function buildContextBlock(results) {
  return results.map((r, i) => {
    const label = DOC_LABELS[r.doc];
    const pages = r.chunk.pages[1] !== r.chunk.pages[0] ? `${r.chunk.pages[0]}–${r.chunk.pages[1]}` : `${r.chunk.pages[0]}`;
    return `[Excerpt ${i + 1} — ${label}, p.${pages}]\n${r.chunk.text}`;
  }).join('\n\n');
}

const SYSTEM_PROMPTS = {
  answer: `You answer questions about two technical manuals: Telviva Enswitch 4.2 (a hosted PBX platform) and QueueMetrics 26.01 (call center analytics that sits on top of Asterisk-based queues). You will be given numbered excerpts pulled from both manuals along with their page numbers. Answer ONLY using information in these excerpts. Cite the source of each claim inline like (Telviva, p.34) or (QueueMetrics, p.516). If the excerpts don't contain enough information to answer, say so plainly rather than guessing. Keep the answer concise — a few sentences to a short paragraph. Write in plain, direct prose.`,
  story: `You turn cross-referenced excerpts from two technical manuals (Telviva Enswitch 4.2, a hosted PBX platform, and QueueMetrics 26.01, call center analytics on Asterisk) into a short, coherent narrative that connects them — showing how something described in one system relates to or is measured by the other. Ground every claim in the provided excerpts and cite page numbers inline like (Telviva, p.34) or (QueueMetrics, p.516). Do not invent details not present in the excerpts. Keep it to one tight paragraph, written in plain, engaging prose — this is meant to help someone understand the full picture quickly, not to pad length.`
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({
      error: 'This deployment has no ANTHROPIC_API_KEY secret configured yet. Add one in the Cloudflare dashboard under Settings → Variables and Secrets.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const question = (body.question || '').trim();
  const mode = body.mode === 'story' ? 'story' : 'answer';
  if (!question) {
    return new Response(JSON.stringify({ error: 'Missing question.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (question.length > 500) {
    return new Response(JSON.stringify({ error: 'Question is too long (max 500 characters).' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let results;
  try {
    results = await retrieveTopChunks(env, request, question);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not load document data for retrieval.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (results.length === 0) {
    return new Response(JSON.stringify({
      answer: "I couldn't find any passages in Telviva 4.2 or QueueMetrics 26.01 that relate to this question. Try rephrasing, or use a term you've seen in Search / Patch Bay.",
      sources: []
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const contextBlock = buildContextBlock(results);
  const userMessage = mode === 'story'
    ? `Here are relevant excerpts:\n\n${contextBlock}\n\nWrite the connecting narrative for: ${question}`
    : `Here are relevant excerpts:\n\n${contextBlock}\n\nQuestion: ${question}`;

  let claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPTS[mode],
        messages: [{ role: 'user', content: userMessage }]
      })
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not reach Claude API.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  if (!claudeRes.ok) {
    const errText = await claudeRes.text().catch(() => '');
    return new Response(JSON.stringify({ error: `Claude API error (${claudeRes.status}): ${errText.slice(0, 300)}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  const data = await claudeRes.json();
  const answer = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  const sources = results.map(r => ({
    doc: r.doc,
    label: DOC_LABELS[r.doc],
    pages: r.chunk.pages,
    heading: r.chunk.heading,
    id: r.chunk.id
  }));

  return new Response(JSON.stringify({ answer, sources }), { headers: { 'Content-Type': 'application/json' } });
}
