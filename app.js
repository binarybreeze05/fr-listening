(function () {
  var ALL = (window.PASSAGES || []).slice();
  var MODE = (window.MODE === 'exams') ? 'exams' : 'ranked';
  // ranked page = 2026 course (per-passage clips, CEFR-ranked); exams page = CO mock exams (one track/exam)
  var DATA = ALL.filter(function (p) { return MODE === 'exams' ? p.course === 'co1' : p.course === 'co2'; });

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
    if (withSub) {
      var h = document.createElement('div'); h.className = 'pass-sub';
      h.innerHTML = '<span class="pass-q">Q' + qnums(p).join(', Q') + '</span>' +
        '<span class="pass-cefr">' + p.cefr + '</span>' +
        '<span class="pass-snip"></span>';
      h.querySelector('.pass-snip').textContent = snippet(p, 70);
      host.appendChild(h);
    }
    appendTranscript(host, p);
    appendQuestions(host, p);
  }

  function metaPill(host) { return function (html) { var s = document.createElement('span'); s.className = 'b'; s.innerHTML = html; host.appendChild(s); }; }

  function renderRanked(p) {
    document.getElementById('entry-title').textContent = '#' + p.rank + ' · ' + snippet(p, 70);
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('<span class="cefr-pill">' + p.cefr + '</span>');
    b('difficulty ' + p.score + '/100'); b('section ' + p.section);
    b(p.words + ' words'); b(p.questions.length + ' question' + (p.questions.length === 1 ? '' : 's'));
    document.getElementById('entry-note').textContent =
      '🎧 Per-passage audio clip.' + (p.rationale ? '  ·  ' + p.rationale : '');
    segsEl.innerHTML = ''; questionsEl.innerHTML = '';
    appendPassage(segsEl, p, false);
  }
  function renderExam(ex) {
    document.getElementById('entry-title').textContent = examLabel(ex.slug);
    var meta = document.getElementById('entry-meta'); meta.innerHTML = ''; var b = metaPill(meta);
    b('💿 full exam recording'); b(ex.passages.length + ' passages'); b(ex.nQ + ' questions');
    document.getElementById('entry-note').textContent =
      'One continuous recording — the transcript below is in the order you hear it. Read along as it plays; the questions are inline after each passage.';
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
    npTitle.textContent = '#' + p.rank + ' · ' + snippet(p, 40);
    setMedia('#' + p.rank + ' ' + snippet(p, 50), 'FR Listening — ' + p.cefr, p.exam);
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
      el.querySelector('.t').textContent = snippet(p);
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
  var IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  var hlCount = document.getElementById('hl-count');
  var hlCsv = document.getElementById('hl-csv');
  var hlTxt = document.getElementById('hl-txt');
  var hlClear = document.getElementById('hl-clear');

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
  function addHL(key, s, e) {
    var list = HLS.filter(function (h) { return h.k === key; }).concat([{ k: key, s: s, e: e }]).sort(function (a, b) { return a.s - b.s; });
    var merged = [];
    list.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r.s <= last.e) last.e = Math.max(last.e, r.e); else merged.push({ k: key, s: r.s, e: r.e });
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

  // Removal: a click/tap on a highlight (works on desktop + mobile).
  document.addEventListener('click', function (e) {
    var mk = e.target.closest && e.target.closest('mark.hl'); if (!mk) return;
    var cont = mk.closest('[data-hlkey]');
    removeHL(mk.dataset.k, +mk.dataset.s, +mk.dataset.e);
    if (cont) renderHL(cont, cont._hltext, cont.dataset.hlkey);
    saveHL();
  });

  // Add: desktop = instant on mouseup; touch = floating "Highlight" button.
  var addBtn = null, pending = null;
  if (IS_TOUCH) {
    addBtn = document.createElement('button');
    addBtn.id = 'hl-add'; addBtn.className = 'hl-add'; addBtn.textContent = '✎ Highlight'; addBtn.hidden = true;
    document.body.appendChild(addBtn);
    var hideBtn = function () { addBtn.hidden = true; };
    // Fire on touchstart/mousedown (with preventDefault) so the action runs BEFORE the
    // tap can collapse the text selection; apply the candidate captured on selectionchange.
    var onAddTap = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (applyCandidate(pending)) { pending = null; hideBtn(); } };
    addBtn.addEventListener('touchstart', onAddTap, { passive: false });
    addBtn.addEventListener('mousedown', onAddTap);
    var schedule = false;
    document.addEventListener('selectionchange', function () {
      if (schedule) return; schedule = true;
      requestAnimationFrame(function () {
        schedule = false; pending = candidate();
        if (!pending) { hideBtn(); return; }
        var r = pending.rect, top = r.top - 42; if (top < 6) top = r.bottom + 8;
        var left = Math.min(Math.max(8, r.left + r.width / 2 - 52), window.innerWidth - 112);
        addBtn.style.top = top + 'px'; addBtn.style.left = left + 'px'; addBtn.hidden = false;
      });
    });
    // hide the button when the user scrolls or taps elsewhere
    reader.addEventListener('scroll', function () { if (!addBtn.hidden) hideBtn(); });
  } else {
    document.addEventListener('mouseup', function () { applyCandidate(candidate()); });
  }

  function updateHLCount() {
    var n = HLS.length, uniq = {};
    HLS.forEach(function (h) { var p = phraseOf(h); if (p) uniq[p.toLowerCase()] = 1; });
    var u = Object.keys(uniq).length;
    hlCount.textContent = n ? (n + ' highlight' + (n > 1 ? 's' : '') + ' · ' + u + ' unique') : 'No highlights yet';
    [hlCsv, hlTxt, hlClear].forEach(function (b) { b.disabled = !n; });
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

  /* ====================== boot ====================== */
  if (MODE === 'exams') { if (filtersEl) filtersEl.style.display = 'none'; renderExamList(); }
  else { renderFilters(); renderRankedList(); }
  updateHLCount();
})();
