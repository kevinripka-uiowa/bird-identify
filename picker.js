/* Shared engine for the tap-a-part decoders.
   Each page calls Picker({...}) with its species, stages, questions and answers.

   Answer format: { label, fits: 'a b ~c', check? }
     fits lists species ids that usually show it; a leading "~" means "sometimes".
     A species missing from every option of a group counts as "not covered", not as a conflict.
     check (optional) explains why the answer isn't confirmed.
   A question is either an array of groups { id, title, help?, check?, options: [...] }
   or a note { note, check? } when that part doesn't help at that stage. */
(function () {
  function parseFits(str) {
    var out = {};
    String(str).split(/\s+/).forEach(function (t) {
      if (!t) return;
      if (t[0] === '~') out[t.slice(1)] = 'some'; else out[t] = 'yes';
    });
    return out;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function checkTag() { return el('span', 'unsure', 'check'); }

  window.Picker = function (cfg) {
    var STAGES = cfg.stages || [{ id: 'all', label: '', name: '' }];
    var hasStages = !!cfg.stages;
    var DATA = cfg.data;
    var qStep = hasStages ? 3 : 2;

    Object.keys(DATA).forEach(function (st) {
      Object.keys(DATA[st]).forEach(function (q) {
        var v = DATA[st][q];
        if (Array.isArray(v)) v.forEach(function (g) {
          g.options.forEach(function (o) { if (typeof o.fits === 'string') o.fits = parseFits(o.fits); });
        });
      });
    });

    var state = { stage: cfg.defaultStage || STAGES[0].id, current: null, picks: {} };
    function stageObj() { return STAGES.filter(function (s) { return s.id === state.stage; })[0]; }
    function groupsFor(q) { var v = (DATA[state.stage] || {})[q]; return Array.isArray(v) ? v : null; }
    function findGroup(id) {
      var d = DATA[state.stage];
      for (var q in d) {
        var gs = Array.isArray(d[q]) ? d[q] : [];
        for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return { q: q, g: gs[i] };
      }
      return null;
    }
    function qAnswered(q) { var gs = groupsFor(q); return !!gs && gs.some(function (g) { return state.picks[g.id] != null; }); }

    // ---------- Diagram ----------
    var svg = document.querySelector(cfg.svgTemplate || '#bird-svg').content.firstElementChild.cloneNode(true);
    document.getElementById('diagram').appendChild(svg);
    function qOfPart(p) { return cfg.partToQ[p]; }

    function openQ(q) {
      if (!q) return;
      state.current = q; render();
      document.getElementById('question').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    svg.querySelectorAll('[data-part]').forEach(function (p) {
      var q = qOfPart(p.dataset.part);
      if (!q) return;
      p.addEventListener('click', function () { openQ(q); });
      p.addEventListener('mouseenter', function () {
        svg.querySelectorAll('[data-part]').forEach(function (o) { o.classList.toggle('hover', qOfPart(o.dataset.part) === q); });
      });
      p.addEventListener('mouseleave', function () { svg.querySelectorAll('.hover').forEach(function (o) { o.classList.remove('hover'); }); });
    });
    svg.querySelectorAll('.label').forEach(function (l) { l.addEventListener('click', function () { openQ(l.dataset.q); }); });

    var chipRow = document.getElementById('partchips');
    cfg.qOrder.forEach(function (q) {
      var b = el('button', 'chipbtn', cfg.qNames[q]);
      b.type = 'button'; b.dataset.q = q;
      b.addEventListener('click', function () { openQ(q); });
      chipRow.appendChild(b);
    });

    // ---------- Stage buttons ----------
    var stageRow = document.getElementById('stages');
    if (hasStages && stageRow) {
      STAGES.forEach(function (s) {
        var b = el('button', null, s.label);
        b.type = 'button'; b.dataset.stage = s.id;
        b.addEventListener('click', function () {
          if (state.stage === s.id) return;
          state.stage = s.id; state.picks = {};
          render();
        });
        stageRow.appendChild(b);
      });
    }

    // ---------- Looks: repaint the diagram to match the picks ----------
    // A stage or an option may carry look: { name: value }. name is a data-part (repainted)
    // or a data-look overlay (shown). value is a fill string, true (show as drawn),
    // or an object of style properties (fill, transform, opacity...).
    function applyLook(look, painted) {
      Object.keys(look).forEach(function (name) {
        var v = look[name];
        var style = typeof v === 'string' ? { fill: v } : (v === true ? {} : v);
        svg.querySelectorAll('[data-part="' + name + '"], [data-look="' + name + '"]').forEach(function (e) {
          if (e.dataset.look) e.classList.add('look-on');
          Object.keys(style).forEach(function (k) { e.style[k] = style[k]; });
          if (e.dataset.part) e.classList.add('painted');
        });
        if (painted && cfg.partToQ[name]) painted[cfg.partToQ[name]] = true;
      });
    }
    function renderLooks() {
      var painted = {};
      svg.querySelectorAll('[data-part], [data-look]').forEach(function (e) {
        if (!('base' in e.dataset)) e.dataset.base = e.getAttribute('style') || '';
        e.setAttribute('style', e.dataset.base); e.classList.remove('look-on', 'painted');
      });
      if (stageObj().look) applyLook(stageObj().look);
      Object.keys(state.picks).forEach(function (id) {
        var f = findGroup(id); if (!f) return;
        var o = f.g.options[state.picks[id]];
        if (o.look) { applyLook(o.look, painted); painted[f.q] = true; }
      });
      return painted;
    }

    // ---------- Rendering ----------
    function renderDiagram() {
      var painted = renderLooks();
      svg.querySelectorAll('[data-part]').forEach(function (p) {
        var q = qOfPart(p.dataset.part);
        p.classList.toggle('answered', !!q && qAnswered(q) && !painted[q]);
        p.classList.toggle('current', !!q && state.current === q);
        p.classList.toggle('na', !!q && !groupsFor(q));
      });
      svg.querySelectorAll('.label').forEach(function (l) {
        l.classList.toggle('answered', qAnswered(l.dataset.q));
        l.classList.toggle('current', state.current === l.dataset.q);
      });
      chipRow.querySelectorAll('.chipbtn').forEach(function (b) {
        b.setAttribute('aria-pressed', state.current === b.dataset.q ? 'true' : 'false');
        b.classList.toggle('answered', qAnswered(b.dataset.q));
        b.classList.toggle('na', !groupsFor(b.dataset.q));
      });
      if (stageRow) stageRow.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.stage === state.stage ? 'true' : 'false');
      });
      var hint = document.getElementById('stage-hint');
      if (hint) hint.textContent = stageObj().hint || '';
    }

    function renderQuestion() {
      var box = document.getElementById('question');
      box.innerHTML = '';
      if (!state.current) {
        box.appendChild(el('h2', null, qStep + ' · Choose what you see'));
        box.appendChild(el('p', 'empty', 'Tap a part of the bird above, or one of the buttons under it.'));
        return;
      }
      var q = state.current, v = DATA[state.stage][q];
      box.appendChild(el('h2', null, qStep + ' · ' + cfg.qNames[q] + (hasStages ? ' · ' + stageObj().name : '')));
      if (!v) { box.appendChild(el('p', 'empty', 'Nothing to pick here.')); return; }
      if (!Array.isArray(v)) {
        var p = el('p', 'empty', v.note);
        if (v.check) { p.appendChild(checkTag()); box.appendChild(p); box.appendChild(el('p', 'checknote', 'Unsure: ' + v.check)); }
        else box.appendChild(p);
        return;
      }
      v.forEach(function (g) {
        var wrap = el('div', 'group');
        var t = el(v.length > 1 ? 'h4' : 'h3', null, g.title);
        if (g.check) t.appendChild(checkTag());
        wrap.appendChild(t);
        if (g.check) wrap.appendChild(el('p', 'checknote', 'Unsure: ' + g.check));
        if (g.help) wrap.appendChild(el('p', 'help', g.help));
        var opts = el('div', 'opts');
        g.options.forEach(function (o, i) {
          var b = el('button', 'opt', o.label);
          b.type = 'button';
          if (o.check) { b.appendChild(checkTag()); b.appendChild(el('span', 'checknote', 'Unsure: ' + o.check)); }
          b.setAttribute('aria-pressed', state.picks[g.id] === i ? 'true' : 'false');
          b.addEventListener('click', function () {
            if (state.picks[g.id] === i) delete state.picks[g.id]; else state.picks[g.id] = i;
            render();
          });
          opts.appendChild(b);
        });
        wrap.appendChild(opts); box.appendChild(wrap);
      });
    }

    function renderPicks() {
      var box = document.getElementById('picks'); box.innerHTML = '';
      var ids = Object.keys(state.picks);
      var lead = hasStages ? stageObj().name : '';
      box.appendChild(el('span', 'count', ids.length ? (lead ? lead + ':' : '') : (lead ? lead + ' · ' : '') + 'nothing picked yet'));
      ids.forEach(function (id) {
        var f = findGroup(id); if (!f) return;
        var b = el('button', 'pick', f.g.title + ': ' + f.g.options[state.picks[id]].label);
        b.type = 'button'; b.title = 'Remove this pick';
        b.addEventListener('click', function () { delete state.picks[id]; render(); });
        box.appendChild(b);
      });
    }

    // Score every species against the picks; nothing is removed, just ranked
    function evaluate() {
      var ids = Object.keys(state.picks);
      return cfg.species.map(function (sp, order) {
        var why = [], yes = 0, some = 0, no = 0;
        var rule = cfg.stageRule && cfg.stageRule(sp, state.stage);
        if (rule) { no++; why.push({ k: 'n', t: rule }); }
        ids.forEach(function (id) {
          var f = findGroup(id); var opt = f.g.options[state.picks[id]]; var fit = opt.fits[sp.id];
          if (fit === 'yes') { yes++; why.push({ k: 'y', t: f.g.title + ': ' + opt.label.toLowerCase() }); }
          else if (fit === 'some') { some++; why.push({ k: 's', t: f.g.title + ': sometimes ' + opt.label.toLowerCase() }); }
          else if (!f.g.options.some(function (o) { return o.fits[sp.id]; })) {
            why.push({ k: 'u', t: f.g.title + ': not covered for this species' });
          }
          else {
            no++;
            var usual = f.g.options.filter(function (o) { return o.fits[sp.id] === 'yes'; }).map(function (o) { return o.label.toLowerCase(); });
            why.push({ k: 'n', t: f.g.title + ': usually ' + (usual.length ? usual.join(' or ') : 'something else') });
          }
        });
        return { sp: sp, order: order, yes: yes, some: some, no: no, why: why };
      }).sort(function (a, b) {
        return (a.no - b.no) || (b.yes * 2 + b.some - (a.yes * 2 + a.some)) || (a.order - b.order);
      });
    }

    function renderResults() {
      var list = document.getElementById('res'); list.innerHTML = '';
      var rows = evaluate(), n = Object.keys(state.picks).length;
      var fitting = rows.filter(function (r) { return r.no === 0; });
      document.getElementById('count').textContent = n ? fitting.length + ' of ' + rows.length + ' fit' : 'Pick something to narrow it down';
      var tab = hasStages && stageObj().tab ? '#' + stageObj().tab : '';
      rows.forEach(function (r) {
        var li = el('li');
        var cls = r.no ? 'out' : (r.some ? 'some' : 'fit');
        if (!n && !r.no) cls = '';
        li.className = cls;
        var verdict = r.no ? (r.no === 1 ? '1 conflict' : r.no + ' conflicts') : (n ? (r.some ? 'Possible' : 'Fits') : '');
        var top = el('div', 'top');
        var name = el('span', 'name', r.sp.name);
        if (r.sp.rare) name.appendChild(el('span', 'rare', r.sp.rare));
        top.appendChild(name);
        if (verdict) top.appendChild(el('span', 'verdict', verdict));
        li.appendChild(top);
        if (r.why.length) {
          var ul = el('ul', 'why');
          r.why.forEach(function (w) { ul.appendChild(el('li', w.k, w.t)); });
          li.appendChild(ul);
        }
        var a = el('a', null, 'Details on the reference page →'); a.href = cfg.ref + tab;
        li.appendChild(a);
        list.appendChild(li);
      });
      var names = fitting.slice(0, 3).map(function (r) { return r.sp.name; }).join(', ');
      document.getElementById('bar-text').textContent = n
        ? (fitting.length ? fitting.length + ' fit: ' + names + (fitting.length > 3 ? '…' : '') : 'Nothing fits every pick; see the closest')
        : 'Tap a part of the bird to start';
    }

    function startOver() {
      state.picks = {}; state.current = null; render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    document.querySelectorAll('.clear').forEach(function (b) {
      b.title = 'Clear all picks';
      b.setAttribute('aria-label', 'Start over: clear all picks');
      b.addEventListener('click', startOver);
    });
    function renderClear() {
      var any = Object.keys(state.picks).length > 0;
      document.querySelectorAll('.clear').forEach(function (b) { b.disabled = !any; });
    }
    function render() { renderDiagram(); renderQuestion(); renderPicks(); renderResults(); renderClear(); }
    render();
  };
})();
