(function(){
  "use strict";

  const state = {
    docs: {}, // id -> {meta, chunks}
    crossref: [],
    searchDocFilter: "all",
    chunkDoc: "telviva",
    activeTerm: null
  };

  const DOC_META = {
    telviva: {
      title: "Telviva Enswitch 4.2",
      sub: "PBX / Enswitch Admin Guide",
      desc: "The hosted-PBX side: call handling, extensions, IVR, messaging and call control for the Telviva Enswitch platform."
    },
    queuemetrics: {
      title: "QueueMetrics 26.01",
      sub: "Call Center Analytics Manual",
      desc: "The analytics layer that sits on top of Asterisk-based queues: reporting, QA, recordings and wallboards."
    }
  };

  // ---------- Data loading ----------
  async function loadData(){
    const [tv, qm, cr] = await Promise.all([
      fetch('data/telviva.json').then(r => r.json()),
      fetch('data/queuemetrics.json').then(r => r.json()),
      fetch('data/crossref.json').then(r => r.json())
    ]);
    state.docs.telviva = { meta: DOC_META.telviva, chunks: tv };
    state.docs.queuemetrics = { meta: DOC_META.queuemetrics, chunks: qm };
    state.crossref = cr;
  }

  function wordCount(chunks){
    return chunks.reduce((sum, c) => sum + c.text.split(/\s+/).filter(Boolean).length, 0);
  }
  function maxPage(chunks){
    return chunks.reduce((m, c) => Math.max(m, c.pages[1]), 0);
  }

  // ---------- Tabs ----------
  function initTabs(){
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + t.dataset.view).classList.add('active');
      });
    });
  }

  // ---------- Hero ----------
  function renderHeroStats(){
    const tv = state.docs.telviva.chunks, qm = state.docs.queuemetrics.chunks;
    const totalWords = wordCount(tv) + wordCount(qm);
    const totalChunks = tv.length + qm.length;
    const el = document.getElementById('hero-stats');
    el.innerHTML = `
      <div class="hero-stat"><span class="num">2</span><span class="lbl">Documents</span></div>
      <div class="hero-stat"><span class="num">${totalChunks}</span><span class="lbl">Chunks</span></div>
      <div class="hero-stat"><span class="num">${totalWords.toLocaleString()}</span><span class="lbl">Words indexed</span></div>
      <div class="hero-stat"><span class="num">${state.crossref.length}</span><span class="lbl">Cross-refs found</span></div>
    `;
  }

  function renderHeroPatchbay(){
    const svg = document.getElementById('hero-patchbay');
    const leftX = 60, rightX = 400, top = 30, gap = 40;
    const n = 6;
    let jacks = '';
    let cables = '';
    for(let i=0;i<n;i++){
      const y = top + i*gap;
      const ry = top + ((i + 2) % n) * gap;
      jacks += `<circle cx="${leftX}" cy="${y}" r="5" fill="var(--brass)"/>`;
      jacks += `<circle cx="${rightX}" cy="${ry}" r="5" fill="var(--brass)"/>`;
      const midx = (leftX+rightX)/2;
      cables += `<path d="M${leftX},${y} C${midx},${y} ${midx},${ry} ${rightX},${ry}"
                   fill="none" stroke="var(--line)" stroke-width="1.5" class="ambient-cable" style="animation-delay:${i*0.4}s"/>`;
    }
    svg.innerHTML = `
      <rect x="20" y="10" width="80" height="${top+ (n-1)*gap - 10 + 20}" rx="6" fill="var(--panel-2)" stroke="var(--line)"/>
      <rect x="360" y="10" width="80" height="${top+ (n-1)*gap - 10 + 20}" rx="6" fill="var(--panel-2)" stroke="var(--line)"/>
      ${cables}
      ${jacks}
    `;
    // simple ambient pulse via CSS injected inline (kept minimal, respects reduced-motion via global rule)
    const style = document.createElement('style');
    style.textContent = `.ambient-cable{stroke-dasharray:6 10; animation:dash 6s linear infinite;} @keyframes dash{to{stroke-dashoffset:-160;}}`;
    document.head.appendChild(style);
  }

  // ---------- Library ----------
  function renderLibrary(){
    const el = document.getElementById('library-cards');
    el.innerHTML = Object.entries(state.docs).map(([id, d]) => {
      const words = wordCount(d.chunks);
      const pages = maxPage(d.chunks);
      return `
        <div class="doc-card">
          <p class="doc-title">${d.meta.title}</p>
          <p class="doc-sub">${d.meta.sub}</p>
          <div class="doc-stats">
            <div><span class="num">${pages}</span><span class="lbl">Pages</span></div>
            <div><span class="num">${d.chunks.length}</span><span class="lbl">Chunks</span></div>
            <div><span class="num">${words.toLocaleString()}</span><span class="lbl">Words</span></div>
          </div>
          <p class="doc-desc">${d.meta.desc}</p>
        </div>
      `;
    }).join('');
  }

  // ---------- Search ----------
  function initSearch(){
    const input = document.getElementById('search-input');
    const chips = document.querySelectorAll('#search-filters .filter-chip');
    chips.forEach(c => c.addEventListener('click', () => {
      chips.forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      state.searchDocFilter = c.dataset.doc;
      runSearch(input.value);
    }));
    input.addEventListener('input', () => runSearch(input.value));
  }

  function escapeHtml(s){
    return s.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  }

  function runSearch(query){
    const meta = document.getElementById('search-meta');
    const results = document.getElementById('search-results');
    query = (query || '').trim();
    if(!query){
      meta.textContent = 'Type to search across 26,000+ and 116,000+ words of extracted text.';
      results.innerHTML = '';
      return;
    }
    const q = query.toLowerCase();
    let pool = [];
    Object.entries(state.docs).forEach(([id, d]) => {
      if(state.searchDocFilter !== 'all' && state.searchDocFilter !== id) return;
      d.chunks.forEach(c => {
        const idx = c.text.toLowerCase().indexOf(q);
        if(idx !== -1) pool.push({doc: id, chunk: c, idx});
      });
    });
    meta.textContent = `${pool.length} match${pool.length===1?'':'es'} for "${query}"${pool.length ? ' — click a result to read the full passage' : ''}`;
    const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');

    results.innerHTML = pool.slice(0, 40).map(({doc, chunk, idx}, i) => {
      const start = Math.max(0, idx - 80);
      const end = Math.min(chunk.text.length, idx + q.length + 120);
      let snippet = escapeHtml(chunk.text.slice(start, end)).replace(re, '<mark>$1</mark>');
      const label = DOC_META[doc].title;
      return `
        <div class="result-item" data-rid="${i}" data-doc="${doc}" data-cid="${chunk.id}" tabindex="0" role="button" aria-expanded="false">
          <div class="result-meta">
            <span class="badge">${label}</span>
            <span class="pageref">p. ${chunk.pages[0]}${chunk.pages[1]!==chunk.pages[0] ? '–'+chunk.pages[1] : ''}</span>
            <span class="expand-hint">Click to expand ▾</span>
          </div>
          ${chunk.heading ? `<p class="result-heading">${escapeHtml(chunk.heading)}</p>` : ''}
          <p class="result-text">&hellip;${snippet}&hellip;</p>
        </div>
      `;
    }).join('') || '<p class="patch-hint">No matches. Try a shorter or different term.</p>';

    results.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => toggleResultExpand(item, re));
      item.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggleResultExpand(item, re); }
      });
    });
  }

  function toggleResultExpand(item, highlightRe){
    const isOpen = item.classList.contains('expanded');
    if(isOpen){
      item.classList.remove('expanded');
      item.setAttribute('aria-expanded', 'false');
      item.querySelector('.expand-hint').textContent = 'Click to expand ▾';
      return;
    }
    const doc = item.dataset.doc, cid = item.dataset.cid;
    const chunk = state.docs[doc].chunks.find(c => c.id === cid);
    if(!chunk) return;
    let full = escapeHtml(chunk.text).replace(highlightRe, '<mark>$1</mark>');
    let full3 = item.querySelector('.result-full');
    if(!full3){
      full3 = document.createElement('div');
      full3.className = 'result-full';
      item.appendChild(full3);
    }
    full3.innerHTML = `<p class="ch-pages">Full chunk ${chunk.id} &middot; ${chunk.text.split(/\s+/).filter(Boolean).length} words</p><p>${full}</p>`;
    item.classList.add('expanded');
    item.setAttribute('aria-expanded', 'true');
    item.querySelector('.expand-hint').textContent = 'Click to collapse ▴';
  }

  // ---------- Patch bay ----------
  function renderPatchbay(){
    const tvCol = document.getElementById('jacks-telviva');
    const qmCol = document.getElementById('jacks-queuemetrics');
    tvCol.innerHTML = state.crossref.map(c => jackHtml(c.term)).join('');
    qmCol.innerHTML = state.crossref.map(c => jackHtml(c.term)).join('');

    document.querySelectorAll('.jack').forEach(j => {
      j.addEventListener('click', () => selectTerm(j.dataset.term));
      j.addEventListener('mouseenter', () => highlightCable(j.dataset.term, true));
      j.addEventListener('mouseleave', () => highlightCable(j.dataset.term, false));
    });

    drawCables();
    window.addEventListener('resize', debounce(drawCables, 150));
  }

  function jackHtml(term){
    return `<div class="jack" data-term="${term}"><span class="dot"></span><span class="jack-label">${term}</span></div>`;
  }

  function drawCables(){
    const svg = document.getElementById('cable-svg');
    const tvJacks = [...document.getElementById('jacks-telviva').children];
    const qmJacks = [...document.getElementById('jacks-queuemetrics').children];
    const wrap = document.querySelector('.patchbay-wrap');
    if(!wrap || tvJacks.length === 0) return;
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${svgRect.width || 120} ${svgRect.height || 400}`);

    let paths = '';
    state.crossref.forEach((c, i) => {
      const l = tvJacks[i].getBoundingClientRect();
      const r = qmJacks[i].getBoundingClientRect();
      const y1 = l.top + l.height/2 - svgRect.top;
      const y2 = r.top + r.height/2 - svgRect.top;
      const w = svgRect.width || 120;
      const midx = w/2;
      paths += `<path class="cable-path" data-term="${c.term}" d="M0,${y1} C${midx},${y1} ${midx},${y2} ${w},${y2}"/>`;
    });
    svg.innerHTML = paths;
  }

  function highlightCable(term, on){
    const path = document.querySelector(`.cable-path[data-term="${term}"]`);
    if(path) path.classList.toggle('active', on);
  }

  function selectTerm(term){
    state.activeTerm = term;
    document.querySelectorAll('.jack').forEach(j => j.classList.toggle('active', j.dataset.term === term));
    document.querySelectorAll('.cable-path').forEach(p => p.classList.toggle('active', p.dataset.term === term));
    const entry = state.crossref.find(c => c.term === term);
    if(!entry) return;
    const detail = document.getElementById('patch-detail');
    detail.innerHTML = `
      <div class="patch-compare">
        <div class="patch-compare-col" data-doc="telviva" data-cid="${entry.telviva.id}">
          <h4>Telviva 4.2</h4>
          <span class="pageref">p. ${entry.telviva.pages[0]}${entry.telviva.pages[1]!==entry.telviva.pages[0] ? '–'+entry.telviva.pages[1] : ''}${entry.telviva.heading ? ' &middot; ' + escapeHtml(entry.telviva.heading) : ''}</span>
          <p class="patch-excerpt">&hellip;${escapeHtml(entry.telviva.excerpt)}&hellip;</p>
          <button class="btn-expand" type="button">Show full chunk ▾</button>
        </div>
        <div class="patch-compare-col" data-doc="queuemetrics" data-cid="${entry.queuemetrics.id}">
          <h4>QueueMetrics 26.01</h4>
          <span class="pageref">p. ${entry.queuemetrics.pages[0]}${entry.queuemetrics.pages[1]!==entry.queuemetrics.pages[0] ? '–'+entry.queuemetrics.pages[1] : ''}${entry.queuemetrics.heading ? ' &middot; ' + escapeHtml(entry.queuemetrics.heading) : ''}</span>
          <p class="patch-excerpt">&hellip;${escapeHtml(entry.queuemetrics.excerpt)}&hellip;</p>
          <button class="btn-expand" type="button">Show full chunk ▾</button>
        </div>
      </div>
    `;
    detail.querySelectorAll('.btn-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const col = btn.closest('.patch-compare-col');
        const doc = col.dataset.doc, cid = col.dataset.cid;
        const isOpen = col.classList.contains('expanded');
        if(isOpen){
          col.classList.remove('expanded');
          col.querySelector('.patch-full')?.remove();
          btn.textContent = 'Show full chunk ▾';
          return;
        }
        const chunk = state.docs[doc].chunks.find(c => c.id === cid);
        if(!chunk) return;
        const full = document.createElement('div');
        full.className = 'patch-full';
        full.innerHTML = `<p>${escapeHtml(chunk.text)}</p>`;
        col.insertBefore(full, btn);
        col.classList.add('expanded');
        btn.textContent = 'Hide full chunk ▴';
      });
    });
  }

  function debounce(fn, ms){
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------- Chunk explorer ----------
  function initChunkExplorer(){
    document.querySelectorAll('#chunk-doc-select .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#chunk-doc-select .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.chunkDoc = chip.dataset.doc;
        renderChunkStrip();
      });
    });
    renderChunkStrip();
  }

  function renderChunkStrip(){
    const strip = document.getElementById('chunk-strip');
    const chunks = state.docs[state.chunkDoc].chunks;
    strip.innerHTML = chunks.map((c, i) => {
      const size = c.text.split(/\s+/).filter(Boolean).length;
      const grow = Math.max(1, Math.round(size / 20));
      return `<div class="chunk-seg" data-idx="${i}" style="flex-grow:${grow}" title="p.${c.pages[0]}"></div>`;
    }).join('');
    strip.querySelectorAll('.chunk-seg').forEach(seg => {
      seg.addEventListener('mouseenter', () => showChunkDetail(parseInt(seg.dataset.idx)));
      seg.addEventListener('click', () => showChunkDetail(parseInt(seg.dataset.idx)));
    });

    document.getElementById('chunk-count-telviva').textContent = state.docs.telviva.chunks.length;
    document.getElementById('chunk-count-queuemetrics').textContent = state.docs.queuemetrics.chunks.length;

    const words = chunks.map(c => c.text.split(/\s+/).filter(Boolean).length);
    const avg = Math.round(words.reduce((a,b)=>a+b,0) / words.length);
    document.getElementById('chunk-stats').innerHTML = `
      <div><span class="num">${chunks.length}</span><span class="lbl">Total chunks</span></div>
      <div><span class="num">${avg}</span><span class="lbl">Avg words / chunk</span></div>
      <div><span class="num">${Math.max(...words)}</span><span class="lbl">Largest chunk</span></div>
      <div><span class="num">${maxPage(chunks)}</span><span class="lbl">Pages covered</span></div>
    `;
  }

  function showChunkDetail(idx){
    document.querySelectorAll('.chunk-seg').forEach(s => s.classList.toggle('active', parseInt(s.dataset.idx) === idx));
    const chunks = state.docs[state.chunkDoc].chunks;
    const c = chunks[idx];
    const detail = document.getElementById('chunk-detail');
    // Full stored chunk text (no artificial cutoff) — scrolls internally if long, see CSS.
    detail.innerHTML = `
      ${c.heading ? `<p class="ch-heading">${escapeHtml(c.heading)}</p>` : `<p class="ch-heading">Chunk ${c.id}</p>`}
      <span class="ch-pages">p. ${c.pages[0]}${c.pages[1]!==c.pages[0] ? '–'+c.pages[1] : ''} &middot; ${c.text.split(/\s+/).filter(Boolean).length} words &middot; id ${c.id}</span>
      <div class="ch-text-scroll"><p class="ch-text">${escapeHtml(c.text)}</p></div>
    `;
  }

  // ---------- AI Insights (mocked, grounded in real page refs) ----------
  const ASK_ANSWERS = {
    q1: `Demo answer, grounded in the actual page references from this sandbox:

A dropped call would first surface in Telviva's Active Calls / Call History view (Telviva 4.2, p.6–7), which records the extension, timestamp and disposition. Because both systems sit on the same Asterisk layer, the same call would also appear in QueueMetrics' queue-answer records around the "answered" definitions on p.174–175, letting you cross-check whether the queue engine ever offered the call to an agent before it dropped, or whether it was abandoned in queue.

`,
    q2: `Demo answer:

Both manuals define "queue" independently — Telviva 4.2 covers it operationally around p.53 (as a call-routing destination), while QueueMetrics defines it analytically around p.391 (as a reporting unit with SLA and answer-time metrics). They describe the same underlying Asterisk queue object from two angles: one configures it, the other measures it. A live version of this feature would pull both chunks verbatim and ask Claude to reconcile the definitions explicitly, flagging any terminology drift.

`,
    q3: `Demo answer:

Telviva's call-recording setup (p.34–36) controls whether a call is captured at all; QueueMetrics' QA workflow (p.516–518) is where that recording gets reviewed and scored. The shared thread is the recording file itself — Telviva produces it, QueueMetrics consumes it for quality assurance. A live version would show the actual configuration fields side by side and flag where naming conventions need to match for QueueMetrics to find Telviva's recordings automatically.

`
  };

  const STORY_ANSWERS = {
    s1: `Demo narrative, Phase 1 preview:

A call arrives and, per Telviva 4.2, is offered to a queue (p.53). If no agent is free, it waits — and that wait is exactly what QueueMetrics is built to measure (p.391), tracking hold time against SLA thresholds. If an agent answers, Telviva logs it in Call History (p.11–12) while QueueMetrics simultaneously logs it as an "answered" event (p.174–175) for reporting. Two systems, one call, two vantage points — which is the whole premise of cross-referencing this document set instead of reading each manual in isolation.

`,
    s2: `Demo narrative:

It starts in Telviva, where recording is enabled per extension or queue (p.34–36). From there, the file lands wherever QueueMetrics is configured to look for it (server settings, p.520), and once ingested it becomes reviewable in QueueMetrics' QA module (p.516–518) — scored, annotated, and rolled into agent performance reports (p.59–61). The "story" is really a supply chain: Telviva produces the raw material, QueueMetrics refines it into insight.

`
  };

  function initInsights(){
    document.getElementById('ask-run').addEventListener('click', () => {
      const val = document.getElementById('ask-preset').value;
      const out = document.getElementById('ask-output');
      if(!val){ out.textContent = 'Choose a question first.'; return; }
      out.textContent = 'Generating…';
      setTimeout(() => { out.textContent = ASK_ANSWERS[val]; }, 500);
    });
    document.getElementById('story-run').addEventListener('click', () => {
      const val = document.getElementById('story-preset').value;
      const out = document.getElementById('story-output');
      if(!val){ out.textContent = 'Choose a cluster first.'; return; }
      out.textContent = 'Generating…';
      setTimeout(() => { out.textContent = STORY_ANSWERS[val]; }, 500);
    });
  }

  // ---------- Init ----------
  async function init(){
    initTabs();
    await loadData();
    renderHeroStats();
    renderHeroPatchbay();
    renderLibrary();
    initSearch();
    renderPatchbay();
    initChunkExplorer();
    initInsights();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
