(function () {
  var ALL = (window.PASSAGES || []).slice();
  var MODE = (window.MODE === 'exams') ? 'exams' : 'ranked';
  // ranked page = 2026 course (per-passage clips, CEFR-ranked); exams page = CO mock exams (one track/exam)
  var DATA = ALL.filter(function (p) { return MODE === 'exams' ? p.course === 'co1' : p.course === 'co2'; });
  var DUPES = window.DUPES || {};   // co1 qref -> { dim, tscore, oscore, to:{exam,rank,id,qref} }

  var listEl = document.getElementById('list');
  var searchEl = document.getElementById('search');
  var filtersEl = document.getElementById('filters');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var entryEl = document.getElementById('entry');
  var segsEl = document.getElementById('segs');
  var questionsEl = document.getElementById('questions');
  var reader = document.getElementById('reader');
  var player = document.getElementById('player');
  var npTitle = document.getElementById('np-title');
  var contEl = document.getElementById('continuous');
  var themeBtn = document.getElementById('theme-toggle');

  var BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var activeBand = localStorage.getItem('band') || 'all';
  var curId = null;     // ranked: active passage id
  var curExam = null;   // exams: active exam slug
  var lastPlayedFile = null;

  /* ---- theme ---- */
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function effTheme() { return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light'); }
  function paintThemeIcon() { themeBtn.textContent = effTheme() === 'dark' ? '☀︎' : '☾'; }
  themeBtn.addEventListener('click', function () {
    var next = effTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next); localStorage.setItem('theme', next); paintThemeIcon();
  });
  mq.addEventListener('change', function () { if (!localStorage.getItem('theme')) paintThemeIcon(); });
  paintThemeIcon();

  /* ---- continuous ---- */
  contEl.checked = localStorage.getItem('continuous-' + MODE) === '1';
  contEl.addEventListener('change', function () { localStorage.setItem('continuous-' + MODE, contEl.checked ? '1' : '0'); });

  /* ---- drill mode (hide transcript/translations/answer; reveal after answering) ---- */
  var drillBtn = document.getElementById('drill-toggle');
  var DRILL = localStorage.getItem('drill-' + MODE) === '1';
  function paintDrill() {
    document.body.classList.toggle('drill', DRILL);
    if (drillBtn) { drillBtn.classList.toggle('on', DRILL); drillBtn.textContent = DRILL ? '🎯 Drill: ON' : '🎯 Drill'; }
  }
  if (drillBtn) drillBtn.addEventListener('click', function () {
    DRILL = !DRILL; localStorage.setItem('drill-' + MODE, DRILL ? '1' : '0'); paintDrill(); rerenderReader(); renderList();
  });
  paintDrill();

  document.getElementById('back').addEventListener('click', function () { document.body.classList.remove('detail'); });
  function isMobile() { return window.matchMedia('(max-width:680px)').matches; }

  function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
  function snippet(p, n) {
    var s = (p.transcript[0] && p.transcript[0].fr) || (p.questions[0] && p.questions[0].instruction.fr) || '(no text)';
    n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function qnums(p) { return p.questions.map(function (q) { return q.qref.split('#')[1]; }); }
  function qmin(p) { return Math.min.apply(null, qnums(p).map(Number)); }
  function examNum(slug) { var m = slug.match(/(\d+)/); return m ? +m[1] : 0; }
  function examLabel(slug) { return slug.replace('co-mock-exam-', 'CO mock exam '); }

  /* ---- exams grouping ---- */
  var EXAMS = [];
  if (MODE === 'exams') {
    var byExam = {};
    DATA.forEach(function (p) { (byExam[p.exam] = byExam[p.exam] || []).push(p); });
    Object.keys(byExam).forEach(function (slug) {
      var ps = byExam[slug].slice().sort(function (a, b) { return qmin(a) - qmin(b); });
      EXAMS.push({ slug: slug, num: examNum(slug), passages: ps,
        nQ: ps.reduce(function (s, p) { return s + p.questions.length; }, 0) });
    });
    EXAMS.sort(function (a, b) { return a.num - b.num; });
  }
  function findExam(slug) { for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].slug === slug) return EXAMS[i]; return null; }

  /* ====================== reader building (shared) ====================== */
  function appendTranscript(host, p) {
    p.transcript.forEach(function (s, si) {
      var row = document.createElement('div'); row.className = 'seg';
      var l = document.createElement('div'); l.className = 'seg-fr'; hlText(l, s.fr, p.id + '#t' + si);
      var r = document.createElement('div'); r.className = 'seg-en'; r.textContent = s.en;
      row.appendChild(l); row.appendChild(r); host.appendChild(row);
    });
  }
  function appendQuestions(host, p) {
    p.questions.forEach(function (q, qi) {
      var card = document.createElement('div'); card.className = 'qcard';
      var html = '<span class="qref">' + q.qref + '</span>';
      if (q.consigne && q.consigne.fr)
        html += '<div class="consigne"><span class="lbl">Consigne</span><div class="fr"></div><div class="en"></div></div>';
      html += '<div class="q-instr"><div class="fr"></div><div class="en"></div></div>';
      card.innerHTML = html;
      var dup = DUPES[q.qref];
      if (dup && dup.to) {
        var part = (dup.to.exam || '').replace('co-2026-part-', 'part ');
        var db = document.createElement('a');
        db.className = 'dupe-badge';
        db.href = 'index.html#go=' + encodeURIComponent(dup.to.id);
        db.textContent = '↻ also in 2026 · ' + part;
        db.title = 'This question repeats a 2026 item (' + part + ', #' + dup.to.rank + ') — matched on '
          + dup.dim + '. Click to open the 2026 version.';
        card.insertBefore(db, card.firstChild);
      }
      if (q.consigne && q.consigne.fr) {
        var cons = card.querySelector('.consigne');
        hlText(cons.querySelector('.fr'), q.consigne.fr, p.id + '#c' + qi);
        cons.querySelector('.en').textContent = q.consigne.en;
      }
      var instr = card.querySelector('.q-instr');
      hlText(instr.querySelector('.fr'), q.instruction.fr, p.id + '#i' + qi);
      instr.querySelector('.en').textContent = q.instruction.en;
      (q.images || []).forEach(function (im) {
        var img = document.createElement('img'); img.className = 'qimg'; img.loading = 'lazy'; img.src = 'img/' + im; card.appendChild(img);
      });
      if (q.options.some(function (o) { return o.fr || o.en || o.is_img; })) {
        var ul = document.createElement('ul'); ul.className = 'opts';
        q.options.forEach(function (o, oi) {
          var li = document.createElement('li'); if (o.correct) li.className = 'correct';
          li.innerHTML = '<div class="fr"></div><div class="en"></div>';
          if (o.is_img && o.img) {
            var im2 = document.createElement('img'); im2.className = 'qimg'; im2.src = 'img/' + o.img; im2.loading = 'lazy';
            li.querySelector('.fr').appendChild(im2);
          } else if (o.fr && o.fr.length > 1) {
            hlText(li.querySelector('.fr'), o.fr, p.id + '#o' + qi + '.' + oi);
            li.querySelector('.en').textContent = o.en;
          } else {
            li.querySelector('.fr').textContent = o.fr; li.querySelector('.en').textContent = o.en;
          }
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      host.appendChild(card);
    });
  }
  function appendPassage(host, p, withSub) {
    var wrap = document.createElement('div'); wrap.className = 'passage';
    wrap.dataset.pid = p.id; wrap.dataset.nq = p.questions.length;
    if (withSub) {
      var h = document.createElement('div'); h.className = 'pass-sub';
      h.innerHTML = '<span class="pass-q">Q' + qnums(p).join(', Q') + '</span>' +
        '<span class="pass-cefr">' + p.cefr + '</span>' +
        '<span class="pass-snip"></span>';
      h.querySelector('.pass-snip').textContent = snippet(p, 70);
      wrap.appendChild(h);
    }
    // drill-only control (hidden by CSS otherwise): reveal this passage's answer + transcript
    var db = document.createElement('div'); db.className = 'drill-bar';
    db.innerHTML = '<button type="button" class="drill-reveal">👁 Reveal answer' +
      (p.questions.length > 1 ? 's' : '') + ' &amp; transcript</button>';
    wrap.appendChild(db);
    appendTranscript(wrap, p);
    appendQuestions(wrap, p);
    host.appendChild(wrap);
  }

  function metaPill(host) { return function (html) { var s = document.createElement('span'); s.className = 'b'; s.innerHTML = html; host.appendChild(s); }; }

  function renderRanked(p) {
    var drilling = document.body.classList.contains('drill');
    document.getElementById('entry-title').textContent = drilling
      ? ('#' + p.rank + ' · 🎯 Drill — listen & answer')
      : ('#' + p.rank + ' · ' + snippet(p, 70));
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('<span class="cefr-pill">' + p.cefr + '</span>');
    b('difficulty ' + p.score + '/100'); b('section ' + p.section);
    b(p.words + ' words'); b(p.questions.length + ' question' + (p.questions.length === 1 ? '' : 's'));
    document.getElementById('entry-note').textContent = drilling
      ? '🎯 Drill — play the audio, choose your answer, then the transcript & translation reveal.'
      : ('🎧 Per-passage audio clip.' + (p.rationale ? '  ·  ' + p.rationale : ''));
    segsEl.innerHTML = ''; questionsEl.innerHTML = '';
    appendPassage(segsEl, p, false);
  }
  function renderExam(ex) {
    document.getElementById('entry-title').textContent = examLabel(ex.slug);
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('💿 full exam recording'); b(ex.passages.length + ' passages'); b(ex.nQ + ' questions');
    document.getElementById('entry-note').textContent = document.body.classList.contains('drill')
      ? '🎯 Drill — for each passage, answer from the audio; the transcript & translation reveal once all its questions are answered.'
      : 'One continuous recording — the transcript below is in the order you hear it. Read along as it plays; the questions are inline after each passage.';
    segsEl.innerHTML = ''; questionsEl.innerHTML = '';
    ex.passages.forEach(function (p) { appendPassage(segsEl, p, true); });
  }
  function rerenderReader() {
    if (MODE === 'exams') { if (curExam) renderExam(findExam(curExam)); }
    else if (curId) renderRanked(byId(curId));
  }

  /* ====================== load / show ====================== */
  function showReader() { emptyEl.hidden = true; entryEl.hidden = false; reader.scrollTop = 0; }
  function setMedia(title, sub, album) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: sub, album: album });
      navigator.mediaSession.setActionHandler('play', function () { player.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { player.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { advance(1); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { advance(-1); });
    } catch (e) {}
  }

  function loadRanked(id, autoplay) {
    var p = byId(id); if (!p) return;
    curId = id; showReader(); renderRanked(p);
    if (player.getAttribute('data-file') !== p.audio) { player.src = p.audio; player.setAttribute('data-file', p.audio); }
    var drilling = document.body.classList.contains('drill');
    npTitle.textContent = drilling ? ('#' + p.rank + ' · 🎯 Drill') : ('#' + p.rank + ' · ' + snippet(p, 40));
    setMedia(drilling ? ('#' + p.rank + ' · Drill') : ('#' + p.rank + ' ' + snippet(p, 50)), 'FR Listening — ' + p.cefr, p.exam);
    if (autoplay) { lastPlayedFile = p.audioFile; var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); }
    renderList();
  }
  function loadExam(slug, autoplay) {
    var ex = findExam(slug); if (!ex) return;
    curExam = slug; showReader(); renderExam(ex);
    var src = ex.passages[0].audio;
    if (player.getAttribute('data-file') !== src) { player.src = src; player.setAttribute('data-file', src); }
    npTitle.textContent = examLabel(slug);
    setMedia(examLabel(slug), 'FR Listening — CO mock exams', 'CO exams');
    if (autoplay) { var pr = player.play(); if (pr && pr.catch) pr.catch(function () {}); }
    renderList();
  }

  /* ====================== lists ====================== */
  function currentRanked() {
    var q = (searchEl.value || '').toLowerCase().trim();
    return DATA.filter(function (p) {
      if (activeBand !== 'all' && p.cefr !== activeBand) return false;
      if (!q) return true;
      return matchText(p, q);
    });
  }
  function matchText(p, q) {
    for (var i = 0; i < p.transcript.length; i++)
      if (p.transcript[i].fr.toLowerCase().indexOf(q) >= 0 || p.transcript[i].en.toLowerCase().indexOf(q) >= 0) return true;
    for (var j = 0; j < p.questions.length; j++) {
      var qq = p.questions[j];
      if (qq.instruction.fr.toLowerCase().indexOf(q) >= 0 || qq.instruction.en.toLowerCase().indexOf(q) >= 0) return true;
      for (var k = 0; k < qq.options.length; k++)
        if ((qq.options[k].fr + ' ' + qq.options[k].en).toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }
  function renderRankedList() {
    var items = currentRanked();
    listEl.innerHTML = ''; var lastBand = null;
    items.forEach(function (p) {
      if (p.cefr !== lastBand) {
        var gl = document.createElement('div'); gl.className = 'group-label';
        gl.innerHTML = '<span>' + p.cefr + '</span>'; listEl.appendChild(gl); lastBand = p.cefr;
      }
      var el = document.createElement('div');
      var isCur = (p.id === curId);
      el.className = 'item' + (isCur ? ' active' : '') + (isCur && !player.paused ? ' playing' : '');
      el.innerHTML = '<div class="rank">#' + p.rank + '</div><div class="meta"><div class="t"></div>' +
        '<div class="d"><span class="badge">' + p.cefr + '</span><span class="ex"></span></div></div>';
      el.querySelector('.t').textContent = document.body.classList.contains('drill') ? '🎯 Drill — listen & answer' : snippet(p);
      el.querySelector('.ex').textContent = '🎧 ' + p.questions.length + 'q';
      el.onclick = function () { loadRanked(p.id, contEl.checked); if (isMobile()) document.body.classList.add('detail'); };
      listEl.appendChild(el);
    });
    countEl.textContent = items.length + ' passage' + (items.length === 1 ? '' : 's') + (activeBand === 'all' ? ' · easiest → hardest' : '');
  }
  function renderExamList() {
    var q = (searchEl.value || '').toLowerCase().trim();
    var items = EXAMS.filter(function (ex) {
      if (!q) return true;
      if (examLabel(ex.slug).toLowerCase().indexOf(q) >= 0) return true;
      return ex.passages.some(function (p) { return matchText(p, q); });
    });
    listEl.innerHTML = '';
    items.forEach(function (ex) {
      var el = document.createElement('div');
      var isCur = (ex.slug === curExam);
      el.className = 'item' + (isCur ? ' active' : '') + (isCur && !player.paused ? ' playing' : '');
      el.innerHTML = '<div class="rank">' + ex.num + '</div><div class="meta"><div class="t"></div><div class="d"></div></div>';
      el.querySelector('.t').textContent = examLabel(ex.slug);
      el.querySelector('.d').textContent = '💿 ' + ex.passages.length + ' passages · ' + ex.nQ + ' questions';
      el.onclick = function () { loadExam(ex.slug, contEl.checked); if (isMobile()) document.body.classList.add('detail'); };
      listEl.appendChild(el);
    });
    countEl.textContent = items.length + ' exam' + (items.length === 1 ? '' : 's') + ' · in recording order';
  }
  function renderList() { if (MODE === 'exams') renderExamList(); else renderRankedList(); }

  /* ---- CEFR filter chips (ranked only) ---- */
  function renderFilters() {
    var c = {}; BANDS.forEach(function (x) { c[x] = 0; });
    DATA.forEach(function (p) { c[p.cefr] = (c[p.cefr] || 0) + 1; });
    filtersEl.innerHTML = '';
    [['all', 'All (' + DATA.length + ')']].concat(BANDS.map(function (x) { return [x, x + ' ' + (c[x] || 0)]; })).forEach(function (d) {
      var el = document.createElement('span');
      el.className = 'chip' + (activeBand === d[0] ? ' on' : ''); el.textContent = d[1];
      el.onclick = function () { activeBand = d[0]; localStorage.setItem('band', activeBand); renderFilters(); renderRankedList(); };
      filtersEl.appendChild(el);
    });
  }

  /* ====================== continuous ====================== */
  function advance(dir) {
    if (MODE === 'exams') {
      var i = -1; for (var k = 0; k < EXAMS.length; k++) if (EXAMS[k].slug === curExam) { i = k; break; }
      var j = i + dir; if (j >= 0 && j < EXAMS.length) loadExam(EXAMS[j].slug, true);
    } else {
      var items = currentRanked(); var idx = -1;
      for (var m = 0; m < items.length; m++) if (items[m].id === curId) { idx = m; break; }
      var n = idx + dir; if (n >= 0 && n < items.length) loadRanked(items[n].id, true);
    }
  }
  player.addEventListener('ended', function () { if (contEl.checked) advance(1); });
  player.addEventListener('play', function () { var p = byId(curId); if (p) lastPlayedFile = p.audioFile; renderList(); });
  player.addEventListener('pause', function () { renderList(); });
  searchEl.addEventListener('input', renderList);

  /* ====================== drag-to-highlight (French only) ====================== */
  var HL_KEY = 'fr-listening-highlights-v1';
  var HLS = []; try { HLS = JSON.parse(localStorage.getItem(HL_KEY) || '[]'); } catch (e) { HLS = []; }
  var hlCount = document.getElementById('hl-count');
  var hlCsv = document.getElementById('hl-csv');
  var hlTxt = document.getElementById('hl-txt');
  var hlClear = document.getElementById('hl-clear');
  var hlBackup = document.getElementById('hl-backup');
  var hlRestore = document.getElementById('hl-restore');
  var hlFile = document.getElementById('hl-file');

  function renderHL(el, text, key) {
    el.textContent = '';
    var ranges = HLS.filter(function (h) { return h.k === key; }).sort(function (a, b) { return a.s - b.s; });
    var pos = 0;
    ranges.forEach(function (r) {
      if (r.s > pos) el.appendChild(document.createTextNode(text.slice(pos, r.s)));
      var m = document.createElement('mark'); m.className = 'hl';
      m.textContent = text.slice(r.s, r.e);
      m.dataset.k = key; m.dataset.s = r.s; m.dataset.e = r.e; m.title = 'Click to remove';
      el.appendChild(m); pos = r.e;
    });
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
  }
  function hlText(el, text, key) { el.dataset.hlkey = key; el._hltext = text; renderHL(el, text, key); }

  function resolveKey(key) {
    var h = key.indexOf('#'); if (h < 0) return null;
    var p = byId(key.slice(0, h)); if (!p) return null;
    var tail = key.slice(h + 1), type = tail[0], rest = tail.slice(1), q, o;
    if (type === 't') { var s = p.transcript[+rest]; return s && { fr: s.fr, en: s.en, p: p }; }
    if (type === 'i') { q = p.questions[+rest]; return q && { fr: q.instruction.fr, en: q.instruction.en, p: p }; }
    if (type === 'c') { q = p.questions[+rest]; return q && q.consigne && { fr: q.consigne.fr, en: q.consigne.en, p: p }; }
    if (type === 'o') { var pr = rest.split('.'); q = p.questions[+pr[0]]; o = q && q.options[+pr[1]]; return o && { fr: o.fr, en: o.en, p: p }; }
    return null;
  }
  function phraseOf(h) { var r = resolveKey(h.k); return r ? r.fr.slice(h.s, h.e).trim() : ''; }
  function offsetFromStart(container, node, nodeOffset) {
    var r = document.createRange(); r.setStart(container, 0); r.setEnd(node, nodeOffset); return r.toString().length;
  }
  var WORDCH = /[0-9A-Za-zÀ-ÖØ-öø-ÿŒœÆæ'’\-]/;
  function snapToWords(text, s, e) {
    while (s > 0 && WORDCH.test(text[s - 1])) s--;
    while (e < text.length && WORDCH.test(text[e])) e++;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return [s, e];
  }
  function keyText(key) { var r = resolveKey(key); return r ? r.fr : ''; }
  function trimWS(text, s, e) {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return s < e ? [s, e] : null;
  }
  function addHL(key, s, e) {
    var text = keyText(key);
    var list = HLS.filter(function (h) { return h.k === key; }).concat([{ k: key, s: s, e: e }]).sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    list.forEach(function (r) {
      var last = merged[merged.length - 1];
      // merge on overlap/touch OR when only whitespace separates the two (so tapping
      // consecutive words yields one continuous highlight, not gapped fragments)
      if (last && (r.s <= last.e || (text && !text.slice(last.e, r.s).trim()))) last.e = Math.max(last.e, r.e);
      else merged.push({ k: key, s: r.s, e: r.e });
    });
    HLS = HLS.filter(function (h) { return h.k !== key; }).concat(merged);
  }
  function removeHL(key, s, e) { HLS = HLS.filter(function (h) { return !(h.k === key && h.s === s && h.e === e); }); }
  function saveHL() { try { localStorage.setItem(HL_KEY, JSON.stringify(HLS)); } catch (e) {} updateHLCount(); }

  // Compute a highlight candidate from the live selection (snapped to words).
  function candidate() {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    var range = sel.getRangeAt(0);
    var anc = range.commonAncestorContainer; if (anc.nodeType !== 1) anc = anc.parentElement;
    var container = anc && anc.closest ? anc.closest('[data-hlkey]') : null;
    if (!container) return null;
    var text = container._hltext;
    var s = offsetFromStart(container, range.startContainer, range.startOffset);
    var e = offsetFromStart(container, range.endContainer, range.endOffset);
    if (s > e) { var t = s; s = e; e = t; }
    var snap = snapToWords(text, s, e); s = snap[0]; e = snap[1];
    if (s >= e) return null;
    return { container: container, key: container.dataset.hlkey, text: text, s: s, e: e,
      rect: range.getBoundingClientRect() };
  }
  function applyCandidate(c) {
    if (!c) return false;
    addHL(c.key, c.s, c.e); renderHL(c.container, c.text, c.key);
    var sel = window.getSelection(); if (sel) sel.removeAllRanges();
    saveHL(); return true;
  }

  // The word at a screen point (via caret hit-testing), expanded to whole-word bounds.
  function wordAtPoint(x, y) {
    var node, offset, r;
    if (document.caretRangeFromPoint) { r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset; } }
    else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(x, y); if (cp) { node = cp.offsetNode; offset = cp.offset; } }
    if (!node) return null;
    var el = (node.nodeType === 1 ? node : node.parentElement);
    var container = el && el.closest ? el.closest('[data-hlkey]') : null;
    if (!container || container._hltext == null) return null;
    var pos = offsetFromStart(container, node, offset);
    var text = container._hltext, s = pos, e = pos;
    while (s > 0 && WORDCH.test(text[s - 1])) s--;
    while (e < text.length && WORDCH.test(text[e])) e++;
    if (s >= e) return null;
    return { container: container, key: container.dataset.hlkey, text: text, s: s, e: e };
  }
  function wordCovered(key, s, e) { return HLS.some(function (h) { return h.k === key && h.s <= s && h.e >= e; }); }
  function subtractHL(key, s, e) {
    var text = keyText(key), out = [];
    HLS.forEach(function (h) {
      if (h.k !== key || h.e <= s || h.s >= e) { out.push(h); return; }   // keep: other key / no overlap
      var L = h.s < s ? trimWS(text, h.s, s) : null;                       // left remainder, whitespace-trimmed
      var R = h.e > e ? trimWS(text, e, h.e) : null;                       // right remainder
      if (L) out.push({ k: key, s: L[0], e: L[1] });
      if (R) out.push({ k: key, s: R[0], e: R[1] });
    });
    HLS = out;
  }
  function toggleWordAt(x, y) {
    var w = wordAtPoint(x, y); if (!w) return false;
    if (wordCovered(w.key, w.s, w.e)) subtractHL(w.key, w.s, w.e); else addHL(w.key, w.s, w.e);
    renderHL(w.container, w.text, w.key); saveHL(); return true;
  }
  var lastApply = 0;
  function nowt() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  // Tap / click a word = toggle its highlight (primary, works on phone — no text selection).
  // Desktop drag-select still highlights a whole phrase.
  document.addEventListener('mouseup', function () { if (document.body.classList.contains('drill')) return; if (applyCandidate(candidate())) lastApply = nowt(); });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('drill')) return;   // in drill mode, taps answer questions
    if (nowt() - lastApply < 400) return;          // swallow the click that trails a drag-select
    toggleWordAt(e.clientX, e.clientY);
  });

  function updateHLCount() {
    var n = HLS.length, uniq = {};
    HLS.forEach(function (h) { var p = phraseOf(h); if (p) uniq[p.toLowerCase()] = 1; });
    var u = Object.keys(uniq).length;
    hlCount.textContent = n ? (n + ' highlight' + (n > 1 ? 's' : '') + ' · ' + u + ' unique') : 'No highlights yet';
    [hlCsv, hlTxt, hlBackup, hlClear].forEach(function (b) { b.disabled = !n; });
  }
  function collectHL() {
    var map = {}, order = [];
    HLS.slice().sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.s - b.s; }).forEach(function (h) {
      var r = resolveKey(h.k); if (!r) return;
      var phrase = r.fr.slice(h.s, h.e).trim(); if (!phrase) return;
      var k = phrase.toLowerCase();
      if (!map[k]) { map[k] = { text: phrase, count: 1, cefr: r.p.cefr, rank: r.p.rank || '', src: r.p.exam, fr: r.fr, en: r.en }; order.push(k); }
      else map[k].count++;
    });
    return order.map(function (k) { return map[k]; });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  hlCsv.onclick = function () {
    var rows = collectHL(); if (!rows.length) return;
    var esc = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var lines = [['Highlight', 'Occurrences', 'CEFR', 'Rank', 'Source', 'French segment', 'English'].map(esc).join(',')];
    rows.forEach(function (r) { lines.push([r.text, r.count, r.cefr, r.rank, r.src, r.fr, r.en].map(esc).join(',')); });
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'fr-highlights.csv');
  };
  hlTxt.onclick = function () {
    var rows = collectHL(); if (!rows.length) return;
    var out = 'Unfamiliar French words & phrases\n=================================\n\n';
    rows.forEach(function (r, i) {
      out += (i + 1) + '. ' + r.text + (r.count > 1 ? '  (×' + r.count + ')' : '') + '   [' + r.cefr + (r.rank ? ' · #' + r.rank : '') + ']\n';
      out += '   FR: ' + r.fr + '\n   EN: ' + r.en + '\n\n';
    });
    download(new Blob([out], { type: 'text/plain;charset=utf-8' }), 'fr-highlights.txt');
  };
  hlClear.onclick = function () {
    if (!HLS.length || !confirm('Remove all ' + HLS.length + ' highlights?')) return;
    HLS = []; rerenderReader(); saveHL();
  };

  /* ---- lossless backup / restore (JSON canonical; CSV best-effort fallback) ---- */
  hlBackup.onclick = function () {
    if (!HLS.length) return;
    download(new Blob([JSON.stringify(HLS)], { type: 'application/json' }), 'fr-highlights-backup.json');
  };
  hlRestore.onclick = function () { hlFile.value = ''; hlFile.click(); };

  // passage lookup by rank, over ALL passages (the highlight store spans both courses)
  var RANKX = {}; ALL.forEach(function (p) { RANKX[p.rank] = p; });

  // every highlightable slot of a passage, mirroring exactly how the reader renders them
  function passageSlots(p) {
    var out = [];
    p.transcript.forEach(function (s, si) { out.push({ k: p.id + '#t' + si, fr: s.fr }); });
    p.questions.forEach(function (q, qi) {
      out.push({ k: p.id + '#i' + qi, fr: q.instruction.fr });
      if (q.consigne && q.consigne.fr) out.push({ k: p.id + '#c' + qi, fr: q.consigne.fr });
      var opts = q.options || [];
      if (opts.some(function (o) { return o.fr || o.en || o.is_img; }))
        opts.forEach(function (o, oi) {
          if (o.is_img && o.img) return;
          if (o.fr && o.fr.length > 1) out.push({ k: p.id + '#o' + qi + '.' + oi, fr: o.fr });
        });
    });
    return out;
  }
  function normCmp(s) { return (s || '').normalize('NFC').replace(/[’ʼ‘]/g, "'").replace(/\s+/g, ' ').trim(); }
  function allOffsets(hay, needle, ci) {
    var H = ci ? hay.toLowerCase() : hay, N = ci ? needle.toLowerCase() : needle, out = [], i = H.indexOf(N);
    while (i >= 0) { out.push(i); i = H.indexOf(N, i + 1); }
    return out;
  }
  // minimal RFC4180 CSV parser (handles quoted commas/quotes/colons)
  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false, i, c;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  // reconstruct {k,s,e} from the (lossy) CSV study export — best effort, same-passage only
  function reconstructFromCSV(text) {
    var rows = parseCSV(text); if (!rows.length) return [];
    var start = (rows[0][0] || '').toLowerCase().indexOf('highlight') === 0 ? 1 : 0, out = [], r;
    for (r = start; r < rows.length; r++) {
      var row = rows[r]; if (row.length < 6) continue;
      var phrase = row[0], occ = parseInt(row[1], 10) || 1, rank = parseInt(row[3], 10), seg = row[5];
      var p = RANKX[rank]; if (!p) continue;
      var slots = passageSlots(p);
      var keys = slots.filter(function (s) { return s.fr === seg; });
      if (!keys.length) keys = slots.filter(function (s) { return normCmp(s.fr) === normCmp(seg); });
      if (!keys.length) continue;
      var prim = keys[0], offs = allOffsets(prim.fr, phrase, false);
      if (!offs.length) offs = allOffsets(prim.fr, phrase, true);
      if (!offs.length) continue;
      out.push({ k: prim.k, s: offs[0], e: offs[0] + phrase.length });
      var need = occ - 1, oi, si, j;
      for (oi = 1; oi < offs.length && need > 0; oi++) { out.push({ k: prim.k, s: offs[oi], e: offs[oi] + phrase.length }); need--; }
      for (si = 0; si < slots.length && need > 0; si++) {
        if (slots[si].k === prim.k) continue;
        var o2 = allOffsets(slots[si].fr, phrase, true);
        for (j = 0; j < o2.length && need > 0; j++) { out.push({ k: slots[si].k, s: o2[j], e: o2[j] + phrase.length }); need--; }
      }
    }
    return out;
  }
  function mergeHighlights(list) {
    var valid = 0, bad = 0, added = 0;
    list.forEach(function (h) {
      if (!h || typeof h.k !== 'string' || h.k.indexOf('#') < 0) { bad++; return; }
      var t = keyText(h.k), s = +h.s, e = +h.e;
      if (!t || !(s >= 0) || !(e > s) || e > t.length || !t.slice(s, e).trim()) { bad++; return; }
      if (!wordCovered(h.k, s, e)) added++;   // genuinely-new coverage (addHL merges adjacent ranges, so length deltas mislead)
      addHL(h.k, s, e); valid++;
    });
    return { valid: valid, bad: bad, added: added };
  }
  hlFile.onchange = function () {
    var f = hlFile.files && hlFile.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var text = String(rd.result || ''), list, kind;
      try {
        if (/\.json$/i.test(f.name) || text.trim().charAt(0) === '[') { list = JSON.parse(text); kind = 'JSON backup'; }
        else { list = reconstructFromCSV(text); kind = 'CSV export'; }
      } catch (e) { alert('Could not read that file: ' + e.message); return; }
      if (!Array.isArray(list) || !list.length) { alert('No highlights found in that file.'); return; }
      var res = mergeHighlights(list);
      saveHL(); rerenderReader();
      var already = res.valid - res.added;
      alert('Restored from ' + kind + ':\n' + res.valid + ' valid entr' + (res.valid === 1 ? 'y' : 'ies') + ' read'
        + (res.bad ? ', ' + res.bad + ' skipped (stale/invalid)' : '') + '.\n'
        + res.added + ' newly added' + (already > 0 ? ' (' + already + ' already present)' : '') + '.');
    };
    rd.readAsText(f);
  };

  /* ---- drill interactions: click an option to answer; reveal on completion ---- */
  function revealPassage(w, force) {
    if (!w) return;
    w.classList.add('revealed');
    if (force) { var cs = w.querySelectorAll('.qcard:not(.answered)'); for (var i = 0; i < cs.length; i++) cs[i].classList.add('answered'); }
  }
  // capture phase so this wins over the document-level highlight handlers
  segsEl.addEventListener('click', function (e) {
    if (!document.body.classList.contains('drill')) return;
    var t = e.target;
    var rev = t.closest ? t.closest('.drill-reveal') : null;
    if (rev) { e.stopPropagation(); e.preventDefault(); revealPassage(rev.closest('.passage'), true); return; }
    var li = t.closest ? t.closest('ul.opts > li') : null;
    if (!li) return;
    var card = li.closest('.qcard'); if (!card || card.classList.contains('answered')) return;
    e.stopPropagation(); e.preventDefault();
    card.classList.add('answered');
    li.classList.add('chosen'); if (!li.classList.contains('correct')) li.classList.add('wrong');
    var w = card.closest('.passage'); if (!w) return;
    var total = +w.dataset.nq || w.querySelectorAll('.qcard').length;
    if (w.querySelectorAll('.qcard.answered').length >= total) revealPassage(w, false);
  }, true);

  /* ====================== boot ====================== */
  if (MODE === 'exams') { if (filtersEl) filtersEl.style.display = 'none'; renderExamList(); }
  else { renderFilters(); renderRankedList(); }
  updateHLCount();

  // deep-link from the exams "also in 2026" badge: index.html#go=<passageId>
  if (MODE !== 'exams') {
    var openHash = function () {
      var m = (location.hash || '').match(/^#go=(.+)$/);
      if (!m) return;
      var id; try { id = decodeURIComponent(m[1]); } catch (e) { return; }
      if (byId(id)) { loadRanked(id, false); if (isMobile()) document.body.classList.add('detail'); }
    };
    openHash();
    window.addEventListener('hashchange', openHash);
  }
})();
