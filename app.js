(function () {
  var DATA = (window.PASSAGES || []).slice(); // already sorted by rank (easiest -> hardest)

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
  var clipsEl = document.getElementById('clipsonly');
  var themeBtn = document.getElementById('theme-toggle');

  var BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var activeBand = localStorage.getItem('band') || 'all';
  var curId = null;
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

  /* ---- continuous prefs ---- */
  contEl.checked = localStorage.getItem('continuous') === '1';
  clipsEl.checked = localStorage.getItem('clipsonly') === '1';
  contEl.addEventListener('change', function () { localStorage.setItem('continuous', contEl.checked ? '1' : '0'); });
  clipsEl.addEventListener('change', function () { localStorage.setItem('clipsonly', clipsEl.checked ? '1' : '0'); });

  document.getElementById('back').addEventListener('click', function () { document.body.classList.remove('detail'); });
  function isMobile() { return window.matchMedia('(max-width:680px)').matches; }

  function snippet(p, n) {
    var s = (p.transcript[0] && p.transcript[0].fr) || (p.questions[0] && p.questions[0].instruction.fr) || '(no text)';
    n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function audioIcon(p) { return p.audioKind === 'clip' ? '🎧' : '💿'; }

  /* ---- filters ---- */
  function bandCounts() {
    var c = {}; BANDS.forEach(function (b) { c[b] = 0; });
    DATA.forEach(function (p) { c[p.cefr] = (c[p.cefr] || 0) + 1; });
    return c;
  }
  function renderFilters() {
    var c = bandCounts();
    filtersEl.innerHTML = '';
    var defs = [['all', 'All (' + DATA.length + ')']].concat(BANDS.map(function (b) { return [b, b + ' ' + (c[b] || 0)]; }));
    defs.forEach(function (d) {
      var el = document.createElement('span');
      el.className = 'chip' + (activeBand === d[0] ? ' on' : '');
      el.textContent = d[1];
      el.onclick = function () { activeBand = d[0]; localStorage.setItem('band', activeBand); renderFilters(); renderList(currentItems()); };
      filtersEl.appendChild(el);
    });
  }

  function currentItems() {
    var q = (searchEl.value || '').toLowerCase().trim();
    return DATA.filter(function (p) {
      if (activeBand !== 'all' && p.cefr !== activeBand) return false;
      if (!q) return true;
      if (p.exam.toLowerCase().indexOf(q) >= 0) return true;
      for (var i = 0; i < p.transcript.length; i++)
        if (p.transcript[i].fr.toLowerCase().indexOf(q) >= 0 || p.transcript[i].en.toLowerCase().indexOf(q) >= 0) return true;
      for (var j = 0; j < p.questions.length; j++) {
        var qq = p.questions[j];
        if (qq.instruction.fr.toLowerCase().indexOf(q) >= 0 || qq.instruction.en.toLowerCase().indexOf(q) >= 0) return true;
        for (var k = 0; k < qq.options.length; k++)
          if ((qq.options[k].fr + ' ' + qq.options[k].en).toLowerCase().indexOf(q) >= 0) return true;
      }
      return false;
    });
  }

  function renderList(items) {
    listEl.innerHTML = '';
    var lastBand = null;
    items.forEach(function (p) {
      if (p.cefr !== lastBand) {
        var gl = document.createElement('div'); gl.className = 'group-label';
        gl.innerHTML = '<span>' + p.cefr + '</span>';
        listEl.appendChild(gl); lastBand = p.cefr;
      }
      var el = document.createElement('div');
      var isCur = (p.id === curId);
      el.className = 'item' + (isCur ? ' active' : '') + (isCur && !player.paused ? ' playing' : '');
      el.innerHTML = '<div class="rank">#' + p.rank + '</div>' +
        '<div class="meta"><div class="t"></div>' +
        '<div class="d"><span class="badge">' + p.cefr + '</span><span class="ex"></span></div></div>';
      el.querySelector('.t').textContent = snippet(p);
      el.querySelector('.ex').textContent = audioIcon(p) + ' ' + p.exam + ' · ' + p.questions.length + 'q';
      el.onclick = function () {
        loadAndShow(p.id, contEl.checked);
        if (isMobile()) document.body.classList.add('detail');
      };
      listEl.appendChild(el);
    });
    countEl.textContent = items.length + ' passage' + (items.length === 1 ? '' : 's')
      + (activeBand === 'all' ? ' · easiest → hardest' : '');
  }

  function byId(id) { for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return DATA[i]; return null; }

  function renderEntry(p) {
    document.getElementById('entry-title').textContent = '#' + p.rank + ' · ' + snippet(p, 70);
    var meta = document.getElementById('entry-meta');
    meta.innerHTML = '';
    function b(html) { var s = document.createElement('span'); s.className = 'b'; s.innerHTML = html; meta.appendChild(s); }
    b('<span class="cefr-pill">' + p.cefr + '</span>');
    b('difficulty ' + p.score + '/100');
    b('section ' + p.section);
    b(p.words + ' words');
    b(p.questions.length + ' question' + (p.questions.length === 1 ? '' : 's'));
    b(p.exam);
    var note = document.getElementById('entry-note');
    var audioNote = p.audioKind === 'clip'
      ? '🎧 Per-passage audio clip.'
      : '💿 Full-exam recording (this passage is one part of ' + p.exam + ' — seek within the track).';
    note.textContent = audioNote + (p.rationale ? '  ·  ' + p.rationale : '');

    // transcript
    segsEl.innerHTML = '';
    p.transcript.forEach(function (s, si) {
      var row = document.createElement('div'); row.className = 'seg';
      var l = document.createElement('div'); l.className = 'seg-fr'; hlText(l, s.fr, p.id + '#t' + si);
      var r = document.createElement('div'); r.className = 'seg-en'; r.textContent = s.en;
      row.appendChild(l); row.appendChild(r); segsEl.appendChild(row);
    });

    // questions
    questionsEl.innerHTML = '';
    if (p.questions.length) {
      var lab = document.createElement('div'); lab.className = 'q-section-label';
      lab.textContent = 'Comprehension question' + (p.questions.length === 1 ? '' : 's');
      questionsEl.appendChild(lab);
    }
    p.questions.forEach(function (q, qi) {
      var card = document.createElement('div'); card.className = 'qcard';
      var html = '<span class="qref">' + q.qref + '</span>';
      if (q.consigne && q.consigne.fr) {
        html += '<div class="consigne"><span class="lbl">Consigne</span>' +
          '<div class="fr"></div><div class="en"></div></div>';
      }
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
        var img = document.createElement('img'); img.className = 'qimg'; img.loading = 'lazy';
        img.src = 'img/' + im; card.appendChild(img);
      });
      var hasText = q.options.some(function (o) { return o.fr || o.en || o.is_img; });
      if (hasText) {
        var ul = document.createElement('ul'); ul.className = 'opts';
        q.options.forEach(function (o, oi) {
          var li = document.createElement('li'); if (o.correct) li.className = 'correct';
          if (o.is_img && o.img) {
            li.innerHTML = '<div class="fr"></div><div class="en"></div>';
            var im2 = document.createElement('img'); im2.className = 'qimg'; im2.src = 'img/' + o.img; im2.loading = 'lazy';
            li.querySelector('.fr').appendChild(im2);
          } else {
            li.innerHTML = '<div class="fr"></div><div class="en"></div>';
            if (o.fr && o.fr.length > 1) hlText(li.querySelector('.fr'), o.fr, p.id + '#o' + qi + '.' + oi);
            else li.querySelector('.fr').textContent = o.fr;
            li.querySelector('.en').textContent = o.en;
          }
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      questionsEl.appendChild(card);
    });
  }

  function setMedia(p) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '#' + p.rank + ' ' + snippet(p, 50), artist: 'FR Listening — ' + p.cefr, album: p.exam
      });
      navigator.mediaSession.setActionHandler('play', function () { player.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { player.pause(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { step(1); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { step(-1); });
    } catch (e) {}
  }

  function step(dir) {
    var items = currentItems();
    var idx = -1;
    for (var i = 0; i < items.length; i++) if (items[i].id === curId) { idx = i; break; }
    if (idx < 0) return;
    for (var k = 1; k <= items.length; k++) {
      var j = idx + dir * k;
      if (j < 0 || j >= items.length) break;
      var p = items[j];
      if (clipsEl.checked && p.audioKind !== 'clip') continue;       // clips-only mode
      if (dir > 0 && p.audioFile === lastPlayedFile) continue;        // don't replay same exam track
      loadAndShow(p.id, true);
      if (isMobile()) document.body.classList.add('detail');
      return;
    }
  }

  function loadAndShow(id, autoplay) {
    var p = byId(id); if (!p) return;
    curId = id;
    emptyEl.hidden = true; entryEl.hidden = false;
    renderEntry(p);
    reader.scrollTop = 0;
    if (player.getAttribute('data-file') !== p.audio) {
      player.src = p.audio; player.setAttribute('data-file', p.audio);
    }
    npTitle.textContent = '#' + p.rank + ' · ' + snippet(p, 40);
    setMedia(p);
    if (autoplay) {
      lastPlayedFile = p.audioFile;
      var pr = player.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    renderList(currentItems());
  }

  player.addEventListener('play', function () { var p = byId(curId); if (p) lastPlayedFile = p.audioFile; renderList(currentItems()); });
  player.addEventListener('pause', function () { renderList(currentItems()); });
  player.addEventListener('ended', function () { if (contEl.checked) step(1); });
  searchEl.addEventListener('input', function () { renderList(currentItems()); });

  /* ===================== drag-to-highlight (French only) ===================== */
  var HL_KEY = 'fr-listening-highlights-v1';
  var HLS = [];
  try { HLS = JSON.parse(localStorage.getItem(HL_KEY) || '[]'); } catch (e) { HLS = []; }
  var hlCount = document.getElementById('hl-count');
  var hlCsv = document.getElementById('hl-csv');
  var hlTxt = document.getElementById('hl-txt');
  var hlClear = document.getElementById('hl-clear');

  // Render a French text element as plain text + <mark> spans over its saved ranges.
  // textContent stays equal to `text` (marks add no characters), so offsets remain valid.
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

  // key = "<passageId>#<type><idx>"  (t=transcript seg, i=instruction, c=consigne, o=qi.oi option)
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
    var r = document.createRange(); r.setStart(container, 0); r.setEnd(node, nodeOffset);
    return r.toString().length;
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
      if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
      else merged.push({ k: key, s: r.s, e: r.e });
    });
    HLS = HLS.filter(function (h) { return h.k !== key; }).concat(merged);
  }
  function removeHL(key, s, e) {
    HLS = HLS.filter(function (h) { return !(h.k === key && h.s === s && h.e === e); });
  }
  function saveHL() { try { localStorage.setItem(HL_KEY, JSON.stringify(HLS)); } catch (e) {} updateHLCount(); }

  function onSelect(e) {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    if (sel.isCollapsed) {
      var mk = e.target.closest && e.target.closest('mark.hl');
      if (mk) {
        var cont = mk.closest('[data-hlkey]');
        removeHL(mk.dataset.k, +mk.dataset.s, +mk.dataset.e);
        if (cont) renderHL(cont, cont._hltext, cont.dataset.hlkey);
        saveHL();
      }
      return;
    }
    var range = sel.getRangeAt(0);
    var anc = range.commonAncestorContainer; if (anc.nodeType !== 1) anc = anc.parentElement;
    var container = anc && anc.closest ? anc.closest('[data-hlkey]') : null;
    if (!container) return;
    var key = container.dataset.hlkey, text = container._hltext;
    var s = offsetFromStart(container, range.startContainer, range.startOffset);
    var en = offsetFromStart(container, range.endContainer, range.endOffset);
    if (s > en) { var t = s; s = en; en = t; }
    var snap = snapToWords(text, s, en); s = snap[0]; en = snap[1];
    if (s >= en) return;
    addHL(key, s, en);
    renderHL(container, text, key);
    sel.removeAllRanges();
    saveHL();
  }
  document.addEventListener('mouseup', onSelect);
  document.addEventListener('touchend', onSelect);

  function updateHLCount() {
    var n = HLS.length, uniq = {};
    HLS.forEach(function (h) { var p = phraseOf(h); if (p) uniq[p.toLowerCase()] = 1; });
    var u = Object.keys(uniq).length;
    hlCount.textContent = n ? (n + ' highlight' + (n > 1 ? 's' : '') + ' · ' + u + ' unique') : 'No highlights yet';
    [hlCsv, hlTxt, hlClear].forEach(function (b) { b.disabled = !n; });
  }

  // Dedupe by lowercased phrase; keep first context + occurrence count.
  function collectHL() {
    var map = {}, order = [];
    HLS.slice().sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.s - b.s; }).forEach(function (h) {
      var r = resolveKey(h.k); if (!r) return;
      var phrase = r.fr.slice(h.s, h.e).trim(); if (!phrase) return;
      var k = phrase.toLowerCase();
      if (!map[k]) { map[k] = { text: phrase, count: 1, cefr: r.p.cefr, rank: r.p.rank, exam: r.p.exam, fr: r.fr, en: r.en }; order.push(k); }
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
    rows.forEach(function (r) { lines.push([r.text, r.count, r.cefr, r.rank, r.exam, r.fr, r.en].map(esc).join(',')); });
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'fr-highlights.csv');
  };
  hlTxt.onclick = function () {
    var rows = collectHL(); if (!rows.length) return;
    var out = 'Unfamiliar French words & phrases\n=================================\n\n';
    rows.forEach(function (r, i) {
      out += (i + 1) + '. ' + r.text + (r.count > 1 ? '  (×' + r.count + ')' : '') + '   [' + r.cefr + ' · #' + r.rank + ']\n';
      out += '   FR: ' + r.fr + '\n   EN: ' + r.en + '\n\n';
    });
    download(new Blob([out], { type: 'text/plain;charset=utf-8' }), 'fr-highlights.txt');
  };
  hlClear.onclick = function () {
    if (!HLS.length || !confirm('Remove all ' + HLS.length + ' highlights?')) return;
    HLS = [];
    if (curId) renderEntry(byId(curId));
    saveHL();
  };

  renderFilters();
  renderList(currentItems());
  updateHLCount();
})();
