/* 庄子阅读器 —— 模块化重构版
 *
 * 架构：
 * - Events: 发布-订阅事件系统
 * - Strategy: 排版策略模式（横排/竖排差异集中定义）
 * - State: 集中状态管理
 * - Renderer: DOM 操作抽象层
 * - Pagination: 分页几何与翻页逻辑
 * - Gesture: 手势识别与处理
 * - Keyboard: 键盘快捷键
 * - Search: 全文搜索
 * - UI: 目录/设置/沉浸模式
 *
 * 翻页方向规则（Strategy 定义）：
 * - 横排 LTR：向右拖/→键/点右侧 = 下一页
 * - 竖排 RTL：向右拖/←键/点左侧 = 下一页
 */
(function(){
'use strict';

/* ============================================================ 工具函数 */
var D = window.__BOOK__, S2T = window.__S2T__, T2S = window.__T2S__;
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var esc = function(s){
  return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
};

/* ============================================================ 事件系统 */
var Events = (function(){
  var listeners = {};
  return {
    on: function(event, fn){
      if(!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    off: function(event, fn){
      if(!listeners[event]) return;
      listeners[event] = listeners[event].filter(function(f){ return f !== fn; });
    },
    emit: function(event, data){
      if(!listeners[event]) return;
      listeners[event].forEach(function(fn){ fn(data); });
    }
  };
})();

/* ============================================================ 排版策略 */
var Strategy = {
  h: {
    name: 'horizontal',
    pageOrder: 'ltr',
    dragNext: -1,
    clickNextSide: 'right',
    keyNext: 'ArrowRight',
    keyPrev: 'ArrowLeft',
    wheelNext: -1,
    shiftSign: -1,
    dragBounds: function(P){
      return {
        min: -(P.pages-1) * P.pageW - P.pageW * 0.35,
        max: P.pageW * 0.35
      };
    },
    startRectSide: 'left',
    calcChapterStart: function(rect, P){
      return (rect.left - P.left) / P.pageW;
    },
    calcPageOfEl: function(r, P){
      return (r.left - P.shift) - P.left;
    }
  },
  v: {
    name: 'vertical',
    pageOrder: 'rtl',
    dragNext: 1,
    clickNextSide: 'left',
    keyNext: 'ArrowLeft',
    keyPrev: 'ArrowRight',
    wheelNext: 1,
    shiftSign: 1,
    dragBounds: function(P){
      return {
        min: -(P.pageW * 0.35),
        max: (P.pages-1) * P.pageW + P.pageW * 0.35
      };
    },
    startRectSide: 'right',
    calcChapterStart: function(rect, P){
      return (P.right - rect.right) / P.pageW;
    },
    calcPageOfEl: function(r, P){
      return (P.right - r.right) + P.shift;
    }
  }
};

function getStrategy(mode){
  return Strategy[mode || 'h'];
}

/* ============================================================ 状态管理 */
var STORAGE_KEY = 'zhuangzi.reader.v4';
var DEFAULTS = {
  theme: 'paper', font: 'song', fs: 19, lh: 195,
  measure: 36, gap: 10, mode: 'h', script: 's', immersive: false
};

var State = {
  settings: {},
  position: { ci: 1, pi: 0 },
  pagination: {
    page: 0, pages: 1,
    pageW: 100, pageH: 100,
    pitch: 20, perPage: 1,
    shift: 0, left: 0, right: 0,
    chapterStart: []
  },
  search: {
    query: '', hits: [], hitIdx: -1, hitmap: new Map(), marks: []
  },
  drag: null,
  immersiveHintShown: false
};

// 加载持久化状态
(function loadState(){
  try {
    var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('zhuangzi.reader.v3');
    if (raw) {
      var o = JSON.parse(raw);
      State.settings = Object.assign({}, DEFAULTS, o.s || {});
      if (o.p) State.position = o.p;
    }
  } catch(e) {}
  if (!Object.keys(State.settings).length) {
    State.settings = Object.assign({}, DEFAULTS);
  }
  State.position.ci = Math.min(Math.max(1, parseInt(State.position.ci, 10) || 1), D.chapters.length);
  State.position.pi = Math.max(0, parseInt(State.position.pi, 10) || 0);
})();

function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      s: State.settings,
      p: State.position
    }));
  } catch(e) {}
}

/* ============================================================ 渲染层 */
var Renderer = {
  root: document.documentElement,
  body: document.body,
  els: {},

  init: function(){
    this.els = {
      reader: $('#reader'),
      stage: $('#stage'),
      viewport: $('#viewport'),
      book: $('#book'),
      topbar: $('#topbar'),
      pagebar: $('#pagebar'),
      pgLabel: $('#pg-label'),
      progressBar: $('#bar i'),
      topic: $('#topic'),
      scrim: $('#scrim'),
      immHint: $('#immersive-hint')
    };
  },

  setTransform: function(el, x, animate){
    el.style.transition = animate ? 'transform .3s cubic-bezier(.22,.61,.36,1)' : 'none';
    el.style.transform = 'translateX(' + x + 'px)';
    if (!animate) void el.offsetWidth;
  },

  updatePageBar: function(page, total){
    this.els.pgLabel.textContent = '第 ' + (page + 1) + ' / ' + total + ' 页';
    this.showPageBar();
  },

  showPageBar: function(){
    var bar = this.els.pagebar;
    bar.classList.add('show');
    clearTimeout(this._pageBarTimer);
    this._pageBarTimer = setTimeout(function(){
      bar.classList.remove('show');
    }, 3000);
  },

  updateProgress: function(page, total){
    var pct = total <= 1 ? 1 : (page + 1) / total;
    this.els.progressBar.style.width = (Math.min(1, Math.max(0, pct)) * 100).toFixed(2) + '%';
  },

  updateTopic: function(ch, script){
    this.els.topic.textContent = (script === 's' ? ch.name : ch.nameT) + (ch.numCn ? '｜' + ch.numCn : '');
  },

  setImmersive: function(on){
    this.body.classList.toggle('immersive', on);
    var btn = $('#btn-immersive');
    if (btn) btn.classList.toggle('on', on);
  },

  showImmersiveHint: function(){
    var hint = this.els.immHint;
    if (hint) {
      hint.classList.add('show');
      setTimeout(function(){ hint.classList.remove('show'); }, 3000);
    }
  },

  flashElement: function(el){
    if (!el) return;
    el.classList.add('flash');
    setTimeout(function(){ el.classList.remove('flash'); }, 900);
  },

  applyThemeColor: function(theme){
    var colorMap = { paper:'#faf7ef', sepia:'#f0e6d1', green:'#edf3ea', ink:'#fff', night:'#14171d' };
    var tc = $('meta[name="theme-color"]');
    if (tc) tc.content = colorMap[theme] || '#faf7ef';
  }
};

/* ============================================================ 分页模块 */
var Pagination = {
  paraEls: [],
  breakEls: [],
  pitchProbe: null,
  P: State.pagination,

  init: function(){
    this.buildBook();
  },

  buildBook: function(){
    var frag = document.createDocumentFragment();
    var book = Renderer.els.book;

    D.chapters.forEach(function(ch){
      var sec = document.createElement('section');
      sec.className = 'chapter';
      sec.id = 'c' + ch.ci;
      sec.dataset.ci = ch.ci;

      var h = document.createElement('h2');
      h.className = 'ch-head';
      h.innerHTML = '<span class="ch-top"></span><span class="ch-name"></span>';
      h.title = '点击回到本篇开头';
      sec.appendChild(h);

      var arr = [];
      ch.paras.forEach(function(p, pi){
        var el = document.createElement('p');
        el.className = 'para';
        el.dataset.ci = ch.ci;
        el.dataset.pi = pi;
        arr.push(el);
        sec.appendChild(el);
      });

      frag.appendChild(sec);
      this.paraEls.push({ sec: sec, h: h, arr: arr });
    }, this);

    book.appendChild(frag);
  },

  renderText: function(){
    var script = State.settings.script;
    D.chapters.forEach(function(ch, idx){
      var refs = this.paraEls[idx];
      refs.h.querySelector('.ch-top').textContent = [ch.juan, ch.numCn].filter(Boolean).join(' · ');
      refs.h.querySelector('.ch-name').textContent = script === 's' ? ch.name : ch.nameT;
      ch.paras.forEach(function(p, pi){
        this.fillPara(refs.arr[pi], this.paraText(ch, pi));
      }, this);
    }, this);

    this.collectMarks();
    if (State.search.hits.length) {
      Search.setHitClass(State.search.hitIdx, false);
    }
  },

  paraText: function(ch, pi){
    return ch.paras[pi][State.settings.script === 's' ? 0 : 1];
  },

  fillPara: function(el, text){
    el.textContent = '';
    var hs = State.search.hitmap.get(el.dataset.ci + ':' + el.dataset.pi);
    if (!hs || !hs.length) { el.textContent = text; return; }
    var cur = 0;
    hs.forEach(function(h){
      if (h.pos > cur) el.appendChild(document.createTextNode(text.slice(cur, h.pos)));
      var m = document.createElement('mark');
      m.textContent = text.substr(h.pos, h.len);
      m.dataset.i = h.i;
      el.appendChild(m);
      cur = h.pos + h.len;
    });
    if (cur < text.length) el.appendChild(document.createTextNode(text.slice(cur)));
  },

  collectMarks: function(){
    State.search.marks = $$('mark', Renderer.els.book);
  },

  clearBreaks: function(){
    this.breakEls.forEach(function(el){
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    this.breakEls = [];
  },

  addBreak: function(beforeSec, widthPx){
    var el = document.createElement('div');
    el.className = 'pgbreak';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = widthPx + 'px';
    beforeSec.parentNode.insertBefore(el, beforeSec);
    this.breakEls.push(el);
  },

  quantize: function(px){
    return Math.floor(px * 64) / 64;
  },

  measurePitch: function(){
    if (!this.pitchProbe) {
      this.pitchProbe = Array.prototype.find.call(
        document.querySelectorAll('.para'),
        function(p){ return (p.textContent || '').length > 300; }
      );
    }
    if (!this.pitchProbe) return 0;

    var range = document.createRange();
    range.selectNodeContents(this.pitchProbe);
    var rects = Array.prototype.slice.call(range.getClientRects());
    if (rects.length < 3) return 0;

    var xs = [];
    rects.forEach(function(r){
      var x = Math.round(r.left * 64) / 64;
      if (xs.indexOf(x) < 0) xs.push(x);
    });
    xs.sort(function(a, b){ return a - b; });

    var diffs = [];
    for (var i = 1; i < xs.length; i++){
      var d = xs[i] - xs[i-1];
      if (d > 1) diffs.push(d);
    }
    if (!diffs.length) return 0;

    diffs.sort(function(a, b){ return a - b; });
    return diffs[Math.floor(diffs.length / 2)];
  },

  startRect: function(ci){
    var refs = this.paraEls[ci-1];
    if (!refs) return Renderer.els.book.getBoundingClientRect();
    var strat = getStrategy(State.settings.mode);
    if (strat.startRectSide === 'right') return refs.h.getBoundingClientRect();
    return refs.sec.getBoundingClientRect();
  },

  layout: function(){
    this.clearBreaks();
    var book = Renderer.els.book, viewport = Renderer.els.viewport;
    book.style.transition = 'none';
    book.style.transform = 'translateX(0px)';
    book.style.lineHeight = '';
    book.style.columnWidth = '';
    book.style.removeProperty('--pitch');
    viewport.style.width = '';
    viewport.style.left = '';
    viewport.style.right = '';
    this.P.shift = 0;
    void book.offsetWidth;

    if (State.settings.mode === 'v') this.layoutV(); else this.layoutH();
    this.measurePages();
  },

  layoutV: function(){
    var stage = Renderer.els.stage;
    var scs = getComputedStyle(stage);
    var padX = parseFloat(scs.getPropertyValue('--pad-x')) || 22;
    var avail = Math.max(40, stage.clientWidth - padX * 2);
    var cs = getComputedStyle(Renderer.els.book);
    var basePitch = parseFloat(cs.lineHeight);
    if (!isFinite(basePitch) || basePitch <= 0) basePitch = State.settings.fs * State.settings.lh / 100;
    var per = Math.max(1, Math.floor(avail / basePitch));

    var pitch = basePitch, pageW = per * pitch;
    for (var attempt = 0; attempt < 4; attempt++){
      var target = this.quantize(avail / per - 0.02);
      Renderer.els.book.style.lineHeight = target + 'px';
      Renderer.els.book.style.setProperty('--pitch', target + 'px');
      void Renderer.els.book.offsetWidth;
      pitch = this.measurePitch() || target;
      pageW = per * pitch;
      if (pageW <= avail + 0.02 || per <= 1) break;
      per -= 1;
    }
    this.P.pitch = pitch;
    this.P.perPage = per;
    this.P.pageW = pageW;
    this.P.pageH = stage.clientHeight;

    var viewport = Renderer.els.viewport;
    viewport.style.left = 'auto';
    viewport.style.right = (padX + Math.max(0, avail - pageW) / 2) + 'px';
    viewport.style.width = pageW + 'px';
    this.P.right = viewport.getBoundingClientRect().right;

    var shift = 0, plan = [];
    for (var i = 1; i < D.chapters.length; i++){
      var pos = (this.P.right - this.startRect(D.chapters[i].ci).right) / this.P.pageW + shift;
      var extra = Math.ceil(pos - 0.02) - pos;
      if (extra < 0.001 || extra > 0.999) extra = 0;
      if (extra > 0){
        plan.push({ i: i, width: Math.round(extra * this.P.pageW * 64) / 64 });
        shift += extra;
      }
    }
    plan.forEach(function(p){ this.addBreak(this.paraEls[p.i].sec, p.width); }, this);
    if (plan.length) void Renderer.els.book.offsetWidth;
  },

  layoutH: function(){
    var stage = Renderer.els.stage;
    var scs = getComputedStyle(stage);
    var padX = parseFloat(scs.getPropertyValue('--pad-x')) || 22;
    var avail = Math.max(40, stage.clientWidth - padX * 2);
    var fs = parseFloat(getComputedStyle(Renderer.els.book).fontSize) || State.settings.fs;
    var want = Math.round(State.settings.measure * fs);
    var pageW = Math.max(fs * 8, Math.min(avail, want));

    var viewport = Renderer.els.viewport;
    viewport.style.width = pageW + 'px';
    Renderer.els.book.style.columnWidth = pageW + 'px';
    void Renderer.els.book.offsetWidth;

    this.P.pageW = pageW;
    this.P.pitch = parseFloat(getComputedStyle(Renderer.els.book).lineHeight) || (State.settings.fs * State.settings.lh / 100);
    this.P.perPage = 1;
    this.P.left = viewport.getBoundingClientRect().left;
    this.P.right = viewport.getBoundingClientRect().right;
    this.P.pageH = viewport.getBoundingClientRect().height;
  },

  measurePages: function(){
    var strat = getStrategy(State.settings.mode);
    this.P.chapterStart = D.chapters.map(function(ch){
      return strat.calcChapterStart(this.startRect(ch.ci), this.P);
    }, this);

    var maxPage = 0;
    for (var i = 0; i < this.paraEls.length; i++){
      var arr = this.paraEls[i].arr;
      for (var j = 0; j < arr.length; j++){
        var r = arr[j].getBoundingClientRect();
        if (!r.width && !r.height) continue;
        var p = Math.floor(strat.calcPageOfEl(r, this.P) / this.P.pageW + 0.02);
        if (p > maxPage) maxPage = p;
      }
    }
    this.P.pages = Math.max(1, maxPage + 1);
  },

  pageOfEl: function(el){
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    var strat = getStrategy(State.settings.mode);
    var x = strat.calcPageOfEl(r, this.P);
    return Math.min(this.P.pages-1, Math.max(0, Math.floor(x / this.P.pageW + 0.02)));
  },

  chapterPage: function(ci){
    var f = this.P.chapterStart[(ci||1)-1] || 0;
    return Math.min(this.P.pages-1, Math.max(0, Math.floor(f + 0.02)));
  },

  chapterAtPage: function(pg){
    var idx = 0;
    for (var i = 0; i < this.P.chapterStart.length; i++){
      if (this.P.chapterStart[i] <= pg + 0.02) idx = i; else break;
    }
    return D.chapters[idx] ? D.chapters[idx].ci : 1;
  },

  applyShift: function(px){
    this.P.shift = px;
    Renderer.setTransform(Renderer.els.book, px, false);
  },

  setPage: function(p, animate){
    this.P.page = Math.min(Math.max(0, p|0), this.P.pages-1);
    var strat = getStrategy(State.settings.mode);
    this.P.shift = strat.shiftSign * this.P.page * this.P.pageW;
    Renderer.setTransform(Renderer.els.book, this.P.shift, animate !== false);

    Renderer.updatePageBar(this.P.page, this.P.pages);
    Renderer.updateProgress(this.P.page, this.P.pages);

    var ci = this.chapterAtPage(this.P.page);
    if (ci !== UI.curCI) UI.setTopic(ci);
    this.schedulePos();

    Events.emit('page:changed', { page: this.P.page, pages: this.P.pages });
  },

  nextPage: function(){
    if (this.P.page < this.P.pages-1) this.setPage(this.P.page+1, true);
  },

  prevPage: function(){
    if (this.P.page > 0) this.setPage(this.P.page-1, true);
  },

  anchorEl: function(a){
    var refs = this.paraEls[(a.ci||1)-1];
    if (!refs) return null;
    var arr = refs.arr;
    return arr[Math.min(Math.max(0, a.pi||0), arr.length-1)] || refs.sec;
  },

  schedulePos: function(){
    clearTimeout(this._posTimer);
    this._posTimer = setTimeout(function(){
      var a = this.captureAnchor();
      if (a) State.position = a;
      saveState();
    }.bind(this), 360);
  },

  captureAnchor: function(){
    var vr = Renderer.els.viewport.getBoundingClientRect();
    var best = null, bestX = -Infinity;

    for (var i = 0; i < this.paraEls.length; i++){
      var arr = this.paraEls[i].arr;
      for (var j = 0; j < arr.length; j++){
        var r = arr[j].getBoundingClientRect();
        if ((!r.width && !r.height) || r.right > vr.right + 1 || r.right < vr.left) continue;
        if (r.right > bestX){
          bestX = r.right;
          best = { ci: D.chapters[i].ci, pi: j };
        }
      }
    }
    return best;
  },

  goChapter: function(ci){
    var refs = this.paraEls[ci-1];
    if (!refs) return;
    Renderer.flashElement(refs.h);
    this.setPage(this.chapterPage(ci), true);
    UI.setTopic(ci);
    State.position = { ci: ci, pi: 0 };
    this.schedulePos();
  },

  goAdjacentChapter: function(dir){
    var i = D.chapters.findIndex(function(c){ return c.ci === UI.curCI; });
    var t = Math.min(D.chapters.length-1, Math.max(0, i+dir));
    if (t !== i) this.goChapter(D.chapters[t].ci);
  },

  reflow: function(anchor){
    anchor = anchor || State.position;
    this.layout();
    var el = this.anchorEl(anchor);
    this.setPage(el ? this.pageOfEl(el) : 0, false);
    Renderer.updatePageBar(this.P.page, this.P.pages);
    Renderer.updateProgress(this.P.page, this.P.pages);
  }
};

/* ============================================================ 手势模块 */
var Gesture = {
  drag: null,

  target: function(dx){
    var strat = getStrategy(State.settings.mode);
    return dx * strat.dragNext > 0 ? Pagination.P.page + 1 : Pagination.P.page - 1;
  },

  onPointerDown: function(e){
    if (UI.panelOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    var r = Renderer.els.stage.getBoundingClientRect();
    var xFromEdge = Math.min(e.clientX - r.left, r.right - e.clientX);
    if (xFromEdge < 20) return;
    if (e.clientY - r.top < 20) return;

    this.drag = { x0: e.clientX, y0: e.clientY, base: State.pagination.shift, moved: false, id: e.pointerId };
  },

  onPointerMove: function(e){
    if (!this.drag || e.pointerId !== this.drag.id) return;
    var dx = e.clientX - this.drag.x0, dy = e.clientY - this.drag.y0;

    if (!this.drag.moved){
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)){ this.drag = null; return; }
      this.drag.moved = true;
      Renderer.body.classList.add('dragging');
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
      try{ Renderer.els.stage.setPointerCapture(e.pointerId); }catch(err){}
    }

    var strat = getStrategy(State.settings.mode);
    var bounds = strat.dragBounds(Pagination.P);
    var s = Math.max(bounds.min, Math.min(bounds.max, this.drag.base + dx));
    Pagination.applyShift(s);
    e.preventDefault();
  },

  onPointerUp: function(e){
    if (!this.drag || (e.pointerId !== this.drag.id && e.type !== 'pointercancel')) return;
    var d = this.drag;
    this.drag = null;
    Renderer.body.classList.remove('dragging');
    try{ Renderer.els.stage.releasePointerCapture(e.pointerId); }catch(err){}

    if (!d.moved){
      var r = Renderer.els.stage.getBoundingClientRect();
      var x = e.clientX - r.left;
      var y = e.clientY - r.top;

      if (State.settings.immersive && y < r.height * 0.15){
        UI.toggleImmersive(false);
        return;
      }

      var xRatio = x / r.width;
      if (xRatio >= 0.32 && xRatio <= 0.68){
        UI.toggleImmersive();
        return;
      }

      var strat = getStrategy(State.settings.mode);
      var nextOnRight = strat.clickNextSide === 'right';
      if (nextOnRight ? x > r.width * 0.68 : x < r.width * 0.32) Pagination.nextPage();
      else if (nextOnRight ? x < r.width * 0.32 : x > r.width * 0.68) Pagination.prevPage();
      return;
    }

    var dx = e.clientX - d.x0;
    var threshold = Math.min(90, Pagination.P.pageW * 0.18);
    var target = Math.abs(dx) > threshold ? this.target(dx) : Pagination.P.page;
    Pagination.setPage(target, true);
  }
};

/* ============================================================ 键盘模块 */
var Keyboard = {
  bind: function(){
    document.addEventListener('keydown', function(e){
      var tag = (e.target.tagName||'').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

      if ((e.ctrlKey||e.metaKey) && (e.key === 'f' || e.key === 'F')){
        e.preventDefault();
        UI.openSearch();
        return;
      }
      if (typing) return;

      var k = e.key;
      if (k === '/'){ e.preventDefault(); UI.openSearch(); return; }
      if (k === 'Escape'){
        if (State.settings.immersive) UI.toggleImmersive(false);
        else UI.closePanels();
        return;
      }
      if (k === 'f' || k === 'F'){ UI.toggleImmersive(); return; }
      if (k === 'm' || k === 'M'){
        if (Renderer.body.classList.contains('toc-open')) UI.closePanels();
        else UI.openPanel('toc-open');
        return;
      }
      if (k === 'v' || k === 'V'){ UI.setMode(State.settings.mode === 'v' ? 'h' : 'v'); return; }
      if (k === 't' || k === 'T'){ UI.setScript(State.settings.script === 's' ? 't' : 's'); return; }
      if (k === 'j'){ Pagination.goAdjacentChapter(1); return; }
      if (k === 'k'){ Pagination.goAdjacentChapter(-1); return; }

      if (k === 'ArrowDown' || k === 'PageDown' || k === ' '){
        e.preventDefault();
        Pagination.nextPage();
      } else if (k === 'ArrowUp' || k === 'PageUp'){
        e.preventDefault();
        Pagination.prevPage();
      } else {
        var strat = getStrategy(State.settings.mode);
        if (k === strat.keyNext){
          e.preventDefault();
          Pagination.nextPage();
        } else if (k === strat.keyPrev){
          e.preventDefault();
          Pagination.prevPage();
        } else if (k === 'Home'){
          e.preventDefault();
          Pagination.setPage(0, true);
        } else if (k === 'End'){
          e.preventDefault();
          Pagination.setPage(Pagination.P.pages-1, true);
        }
      }
    });
  }
};

/* ============================================================ 搜索模块 */
var Search = {
  MAX_HITS: 3000,

  normQuery: function(q){
    var map = State.settings.script === 's' ? T2S : S2T;
    var out = '';
    for (var i = 0; i < q.length; i++){
      var c = q[i];
      out += (map && map[c]) || c;
    }
    return out;
  },

  doSearch: function(q, jump){
    State.search.query = q;
    State.search.hits = [];
    State.search.hitIdx = -1;
    State.search.hitmap = new Map();

    var nq = this.normQuery(q).toLowerCase();
    if (nq){
      for (var ci = 0; ci < D.chapters.length; ci++){
        var ch = D.chapters[ci];
        for (var pi = 0; pi < ch.paras.length; pi++){
          var text = Pagination.paraText(ch, pi).toLowerCase();
          var at = text.indexOf(nq);
          while (at >= 0 && State.search.hits.length < this.MAX_HITS){
            var i = State.search.hits.length;
            State.search.hits.push({ ci: ch.ci, pi: pi, pos: at, len: nq.length });
            var k = ch.ci + ':' + pi;
            var arr = State.search.hitmap.get(k);
            if (!arr){ arr = []; State.search.hitmap.set(k, arr); }
            arr.push({ pos: at, len: nq.length, i: i });
            at = text.indexOf(nq, at + nq.length);
          }
          if (State.search.hits.length >= this.MAX_HITS) break;
        }
        if (State.search.hits.length >= this.MAX_HITS) break;
      }
    }

    Pagination.renderText();
    this.renderResults();
    if (State.search.hits.length) this.setHitClass(-1, false);
    if (State.search.hits.length && jump !== false) this.gotoHit(0);
    this.updateMeta();
  },

  setHitClass: function(i, scroll){
    State.search.marks.forEach(function(m){ m.classList.remove('cur'); });
    State.search.hitIdx = i;
    if (i < 0 || i >= State.search.hits.length){ this.updateMeta(); return; }

    var target = null;
    for (var k = 0; k < State.search.marks.length; k++){
      if (State.search.marks[k].dataset.i === String(i)){ target = State.search.marks[k]; break; }
    }
    if (target){
      target.classList.add('cur');
      $$('#q-results .res-item').forEach(function(el, idx){ el.classList.toggle('cur', idx === i); });
var curRes = $('#q-results .res-item.cur');
      if (curRes && scroll !== false){
        var box = $('#q-results');
        var top = curRes.offsetTop;
        if (top < box.scrollTop + 20 || top > box.scrollTop + box.clientHeight - 40)
          box.scrollTop = top - 60;
      }
      if (scroll !== false) this.revealMark(target);
    }
    this.updateMeta();
  },

  revealMark: function(mark){
    Pagination.setPage(Pagination.pageOfEl(mark), true);
    Renderer.flashElement(mark.parentElement);
  },

  gotoHit: function(i){
    if (!State.search.hits.length) return;
    var i = Math.min(Math.max(0, i), State.search.hits.length-1);
    this.setHitClass(i, true);
  },

  updateMeta: function(){
    var n = State.search.hits.length;
    if (!State.search.query){
      $('#q-count').textContent = '输入关键词开始搜索';
    } else if (!n){
      $('#q-count').textContent = '未找到「' + State.search.query + '」';
    } else {
      var extra = n >= this.MAX_HITS ? '（已达上限，仅显示前 ' + this.MAX_HITS + ' 处）' : '';
      $('#q-count').textContent = '共 ' + n + ' 处' +
        (State.search.hitIdx >= 0 ? ' · 第 ' + (State.search.hitIdx+1) + ' 处' : '') + extra;
    }
    $('#q-prev').disabled = !n || State.search.hitIdx <= 0;
    $('#q-next').disabled = !n || State.search.hitIdx >= n-1;
  },

  renderResults: function(){
    var box = $('#q-results');
    box.innerHTML = '';

    if (!State.search.query){
      box.innerHTML = '<div class="empty">支持全文检索，可搜索「逍遥」「鲲鹏」「庖丁解牛」…</div>';
      return;
    }
    if (!State.search.hits.length){
      box.innerHTML = '<div class="empty">没有找到「' + esc(State.search.query) + '」<br>试试更短的关键词</div>';
      return;
    }

    var LIMIT = 300, frag = document.createDocumentFragment();
    State.search.hits.slice(0, LIMIT).forEach(function(h, i){
      var ch = D.chapters[h.ci-1];
      var text = Pagination.paraText(ch, h.pi);
      var from = Math.max(0, h.pos - 22), to = Math.min(text.length, h.pos + h.len + 26);
      var b = document.createElement('button');
      b.className = 'res-item';
      b.dataset.i = i;
      var chName = State.settings.script === 's' ? ch.name : ch.nameT;
      b.innerHTML = '<span class="res-ch">' + esc(ch.numCn ? ch.numCn + ' ' + chName : chName) + '</span>' +
        (from > 0 ? '…' : '') + esc(text.slice(from, h.pos)) +
        '<b>' + esc(text.substr(h.pos, h.len)) + '</b>' +
        esc(text.slice(h.pos + h.len, to)) + (to < text.length ? '…' : '');
      b.addEventListener('click', function(){ this.gotoHit(i); }.bind(this));
      frag.appendChild(b);
    }, this);

    box.appendChild(frag);
    if (State.search.hits.length > LIMIT){
      var d = document.createElement('div');
      d.className = 'empty';
      d.textContent = '还有 ' + (State.search.hits.length - LIMIT) + ' 处未列出，可用「下一处」继续浏览';
      box.appendChild(d);
    }
  }
};

/* ============================================================ UI 模块 */
var UI = {
  curCI: State.position.ci,

  panelOpen: function(){
    return Renderer.body.classList.contains('toc-open') ||
           Renderer.body.classList.contains('search-open') ||
           Renderer.body.classList.contains('set-open');
  },

  openPanel: function(cls){
    this.closePanels(cls);
    Renderer.body.classList.add(cls);
    var sc = Renderer.els.scrim;
    var useScrim = window.innerWidth < 900;
    sc.style.display = useScrim ? 'block' : 'none';
    requestAnimationFrame(function(){ sc.style.opacity = useScrim ? '0.28' : '0'; });
  },

  closePanels: function(except){
    ['toc-open', 'search-open', 'set-open'].forEach(function(c){
      if (c !== except) Renderer.body.classList.remove(c);
    });
    if (!Renderer.body.classList.contains('search-open') && !Renderer.body.classList.contains('set-open')){
      Renderer.els.scrim.style.opacity = '0';
      setTimeout(function(){
        if (Renderer.els.scrim.style.opacity === '0')
          Renderer.els.scrim.style.display = 'none';
      }, 300);
    }
  },

  openSearch: function(){
    this.openPanel('search-open');
    setTimeout(function(){
      var q = $('#q');
      q.focus();
      q.select();
    }, 120);
  },

  setTopic: function(ci){
    this.curCI = ci;
    var ch = D.chapters[ci-1];
    if (!ch) return;
    Renderer.updateTopic(ch, State.settings.script);
    this.markTOC(ci);
  },

  buildTOC: function(){
    var wrap = $('#toc-list');
    wrap.innerHTML = '';
    var div = null, group = null;

    D.chapters.forEach(function(ch){
      if (ch.division !== div){
        div = ch.division;
        var t = document.createElement('div');
        t.className = 'toc-div';
        t.textContent = div;
        wrap.appendChild(t);
        group = document.createElement('div');
        wrap.appendChild(group);
      }
      var b = document.createElement('button');
      b.className = 'toc-item';
      b.dataset.ci = ch.ci;
      b.title = [ch.juan, ch.numCn].filter(Boolean).join(' ');
      b.innerHTML = '<span class="ti-num"></span><span class="ti-name"></span>';
      b.querySelector('.ti-num').textContent = ch.numCn || '';
      b.querySelector('.ti-name').textContent = State.settings.script === 's' ? ch.name : ch.nameT;
      b.addEventListener('click', function(){
        Pagination.goChapter(ch.ci);
        if (window.innerWidth < 900) this.closePanels();
      }.bind(this));
      group.appendChild(b);
    }, this);
  },

  markTOC: function(ci){
    $$('#toc-list .toc-item').forEach(function(el){
      var on = (+el.dataset.ci) === ci;
      if (on === el.classList.contains('active')) return;
      el.classList.toggle('active', on);
      if (on){
        var sc = $('#toc-list');
        var top = el.offsetTop, h = sc.clientHeight;
        if (top < sc.scrollTop + 40 || top > sc.scrollTop + h - 60)
          sc.scrollTop = top - h/2;
      }
    });
  },

  apply: function(){
    var S = State.settings;
    var pitchPx = Math.max(8, Math.round(S.fs * S.lh / 100));
    Renderer.root.style.setProperty('--fs', S.fs + 'px');
    Renderer.root.style.setProperty('--lh', S.lh / 100);
    Renderer.root.style.setProperty('--pitch', pitchPx + 'px');
    Renderer.root.style.setProperty('--measure', S.measure);
    Renderer.root.style.setProperty('--gap', (S.gap / 10) + 'em');
    Renderer.root.dataset.theme = S.theme;
    Renderer.body.dataset.theme = S.theme;
    Renderer.body.dataset.font = S.font;
    Renderer.body.dataset.mode = S.mode;
    Renderer.body.dataset.script = S.script;

    $('#btn-mode').textContent = S.mode === 'v' ? '横排' : '竖排';
    $('#btn-script').textContent = S.script === 's' ? '繁' : '简';
    Renderer.root.lang = S.script === 's' ? 'zh-Hans' : 'zh-Hant';

    Renderer.applyThemeColor(S.theme);
    this.applyImmersive();
    this.syncSetUI();
  },

  syncSetUI: function(){
    var S = State.settings;
    $$('#seg-font button').forEach(function(b){
      b.classList.toggle('on', b.dataset.v === S.font);
    });
    $$('#seg-mode button').forEach(function(b){
      b.classList.toggle('on', b.dataset.v === S.mode);
    });
    $$('#seg-script button').forEach(function(b){
      b.classList.toggle('on', b.dataset.v === S.script);
    });
    $$('#theme-swatches .sw').forEach(function(b){
      b.classList.toggle('on', b.dataset.v === S.theme);
    });
    $('#set-fs').value = S.fs;
    $('#v-fs').textContent = S.fs + 'px';
    $('#set-lh').value = S.lh;
    $('#v-lh').textContent = (S.lh / 100).toFixed(2);
    $('#set-mw').value = S.measure;
    $('#v-mw').textContent = S.measure + ' 字';
    $('#set-gap').value = S.gap;
    $('#v-gap').textContent = (S.gap / 10).toFixed(1) + 'em';

    var immBtn = $('#set-immersive');
    if (immBtn){
      immBtn.textContent = S.immersive ? '已开启' : '关闭';
      immBtn.classList.toggle('on', S.immersive);
    }
  },

  applyImmersive: function(){
    Renderer.setImmersive(!!State.settings.immersive);
  },

  toggleImmersive: function(force){
    var next = force !== undefined ? force : !State.settings.immersive;
    if (next === State.settings.immersive) return;
    State.settings.immersive = next;
    this.apply();
    saveState();

    if (next && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen().catch(function(){});
    } else if (!next && document.exitFullscreen && document.fullscreenElement){
      document.exitFullscreen().catch(function(){});
    }

    if (next && !State.immersiveHintShown){
      State.immersiveHintShown = true;
      Renderer.showImmersiveHint();
    }
  },

  setMode: function(m){
    if (m === State.settings.mode) return;
    var a = Pagination.captureAnchor() || State.position;
    State.settings.mode = m;
    this.apply();
    saveState();
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        Pagination.reflow(a);
      });
    });
  },

  setScript: function(sc){
    if (sc === State.settings.script) return;
    var a = Pagination.captureAnchor() || State.position;
    State.settings.script = sc;
    this.apply();
    saveState();
    this.buildTOC();
    if (State.search.query) Search.doSearch(State.search.query, true);
    else Pagination.renderText();
    requestAnimationFrame(function(){
      Pagination.reflow(a);
      this.setTopic(this.curCI);
    }.bind(this));
  },

  onChangeLayoutSettings: function(){
    this.apply();
    saveState();
    Pagination.reflow(Pagination.captureAnchor() || State.position);
    Search.renderResults();
  },

  bindThemeSwatches: function(){
    var themes = [['paper','纸白'],['sepia','米黄'],['green','青瓷'],['ink','纯白'],['night','夜色']];
    var bgMap = { paper:'#faf7ef', sepia:'#f0e6d1', green:'#edf3ea', ink:'#fff', night:'#14171d' };
    var fgMap = { paper:'#2b2823', sepia:'#392f20', green:'#232e26', ink:'#161616', night:'#c9c4ba' };
    var swWrap = $('#theme-swatches');

    themes.forEach(function(t){
      var b = document.createElement('button');
      b.className = 'sw';
      b.dataset.v = t[0];
      b.title = t[1];
      b.style.background = bgMap[t[0]];
      b.style.color = fgMap[t[0]];
      b.innerHTML = '<span>文</span>';
      b.addEventListener('click', function(){
        State.settings.theme = t[0];
        this.apply();
        saveState();
      }.bind(this));
      swWrap.appendChild(b);
    }, this);
  },

  bind: function(){
    $('#btn-toc').addEventListener('click', function(){
      if (Renderer.body.classList.contains('toc-open')) this.closePanels();
      else this.openPanel('toc-open');
    }.bind(this));

    $('#btn-search').addEventListener('click', this.openSearch.bind(this));

    $('#btn-settings').addEventListener('click', function(){
      if (Renderer.body.classList.contains('set-open')) this.closePanels();
      else this.openPanel('set-open');
    }.bind(this));

    $('#btn-mode').addEventListener('click', function(){
      this.setMode(State.settings.mode === 'v' ? 'h' : 'v');
    }.bind(this));

    $('#btn-script').addEventListener('click', function(){
      this.setScript(State.settings.script === 's' ? 't' : 's');
    }.bind(this));

    $('#q-close').addEventListener('click', this.closePanels.bind(this));
    $('#set-close').addEventListener('click', this.closePanels.bind(this));
    $('#scrim').addEventListener('click', this.closePanels.bind(this));

    var immBtn = $('#btn-immersive');
    if (immBtn) immBtn.addEventListener('click', this.toggleImmersive.bind(this));

    var setImmBtn = $('#set-immersive');
    if (setImmBtn) setImmBtn.addEventListener('click', this.toggleImmersive.bind(this));

    $('#q-next').addEventListener('click', function(){
      if (State.search.hits.length)
        Search.gotoHit(State.search.hitIdx+1 < State.search.hits.length ? State.search.hitIdx+1 : 0);
    });

    $('#q-prev').addEventListener('click', function(){
      if (State.search.hits.length)
        Search.gotoHit(State.search.hitIdx-1 >= 0 ? State.search.hitIdx-1 : State.search.hits.length-1);
    });

    var qt = null;
    $('#q').addEventListener('input', function(e){
      var v = e.target.value.trim();
      clearTimeout(qt);
      qt = setTimeout(function(){ Search.doSearch(v); }, 140);
    });

    $('#q').addEventListener('keydown', function(e){
      if (e.key === 'Enter'){
        e.preventDefault();
        if (!State.search.hits.length) Search.doSearch(e.target.value.trim());
        else if (e.shiftKey)
          Search.gotoHit(State.search.hitIdx-1 >= 0 ? State.search.hitIdx-1 : State.search.hits.length-1);
        else
          Search.gotoHit(State.search.hitIdx+1 < State.search.hits.length ? State.search.hitIdx+1 : 0);
      } else if (e.key === 'Escape'){
        this.closePanels();
      }
    }.bind(this));

    this.bindThemeSwatches();

    $$('#seg-font button').forEach(function(b){
      b.addEventListener('click', function(){
        State.settings.font = b.dataset.v;
        this.onChangeLayoutSettings();
      }.bind(this));
    }, this);

    $('#set-fs').addEventListener('input', function(e){
      State.settings.fs = +e.target.value;
      this.onChangeLayoutSettings();
    }.bind(this));

    $('#set-lh').addEventListener('input', function(e){
      State.settings.lh = +e.target.value;
      this.onChangeLayoutSettings();
    }.bind(this));

    $('#set-mw').addEventListener('input', function(e){
      State.settings.measure = +e.target.value;
      this.onChangeLayoutSettings();
    }.bind(this));

    $('#set-gap').addEventListener('input', function(e){
      State.settings.gap = +e.target.value;
      this.onChangeLayoutSettings();
    }.bind(this));

    $$('#seg-mode button').forEach(function(b){
      b.addEventListener('click', function(){
        this.setMode(b.dataset.v);
      }.bind(this));
    }, this);

    $$('#seg-script button').forEach(function(b){
      b.addEventListener('click', function(){
        this.setScript(b.dataset.v);
      }.bind(this));
    }, this);

    $('#set-reset').addEventListener('click', function(){
      State.settings = Object.assign({}, DEFAULTS);
      this.apply();
      saveState();
      Pagination.reflow(State.position);
    }.bind(this));

    Renderer.els.stage.addEventListener('pointerdown', Gesture.onPointerDown.bind(Gesture));
    Renderer.els.stage.addEventListener('pointermove', Gesture.onPointerMove.bind(Gesture));
    Renderer.els.stage.addEventListener('pointerup', Gesture.onPointerUp.bind(Gesture));
    Renderer.els.stage.addEventListener('pointercancel', Gesture.onPointerUp.bind(Gesture));

    var wheelLock = false;
    Renderer.els.reader.addEventListener('wheel', function(e){
      if (this.panelOpen()) return;
      e.preventDefault();
      var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(d) < 3 || wheelLock) return;
      wheelLock = true;
      setTimeout(function(){ wheelLock = false; }, 180);

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)){
        if (e.deltaY > 0) Pagination.nextPage(); else Pagination.prevPage();
      } else {
        var strat = getStrategy(State.settings.mode);
        if (e.deltaX * strat.wheelNext > 0) Pagination.nextPage();
        else Pagination.prevPage();
      }
    }.bind(this), { passive: false });

    Renderer.els.book.addEventListener('click', function(e){
      var h = e.target.closest && e.target.closest('.ch-head');
      if (h) Pagination.goChapter(+h.parentElement.dataset.ci);
    });

    var rt = null;
    var fullscreenChanging = false;

    document.addEventListener('fullscreenchange', function(){
      fullscreenChanging = true;
      clearTimeout(rt);
      rt = setTimeout(function(){
        fullscreenChanging = false;
        Pagination.reflow(State.position);
      }, 100);
    });

    window.addEventListener('resize', function(){
      if (fullscreenChanging) return;
      clearTimeout(rt);
      rt = setTimeout(function(){
        Pagination.reflow(Pagination.captureAnchor() || State.position);
      }, 180);
    });

    window.addEventListener('orientationchange', function(){
      setTimeout(function(){
        Pagination.reflow(Pagination.captureAnchor() || State.position);
      }, 300);
    });
  }
};

/* ============================================================ 启动 */
function boot(){
  Renderer.init();
  Pagination.init();
  Pagination.renderText();
  UI.buildTOC();
  UI.apply();
  UI.bind();
  Keyboard.bind();

  var params = new URLSearchParams(location.search);
  if (params.get('mode') === 'v' || params.get('mode') === 'h')
    State.settings.mode = params.get('mode');
  if (params.get('script') === 't' || params.get('script') === 's')
    State.settings.script = params.get('script');
  if (params.get('theme'))
    State.settings.theme = params.get('theme');
  if (params.get('fs'))
    State.settings.fs = Math.min(36, Math.max(14, +params.get('fs') || State.settings.fs));
  if (params.get('ci'))
    State.position = { ci: +params.get('ci') || 1, pi: 0 };

  UI.apply();
  if (State.settings.script === 't'){
    UI.buildTOC();
    Pagination.renderText();
  }

  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      Pagination.reflow(State.position);
      if (params.get('page'))
        Pagination.setPage(Math.max(0, (+params.get('page') || 1) - 1), false);
      UI.setTopic(State.position.ci);
      Renderer.updateProgress(Pagination.P.page, Pagination.P.pages);

      if (params.get('q')){
        UI.openSearch();
        $('#q').value = params.get('q');
        Search.doSearch(params.get('q'));
      }

      if (document.fonts && document.fonts.ready){
        document.fonts.ready.then(function(){
          Pagination.reflow(Pagination.captureAnchor() || State.position);
          if (params.get('page'))
            Pagination.setPage(Math.max(0, (+params.get('page') || 1) - 1), false);
        });
      }
    });
  });
}

boot();
})();
