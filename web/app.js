/* 庄子阅读器 —— 渲染 / 分页 / 手势 / 搜索 / 排版设置
 *
 * 两种排版共用一套「分页」模型：
 *   #viewport 是一页的可见区域（版心），#book 在其内部按列排布；
 *   翻页 = translateX(页号 × 页宽)。
 *
 *   翻页方向按排版模式区分（v1.2 修正）：
 *   - 横排：页序左→右，向左拖/→键/点右侧 = 下一页，内容向左移动
 *   - 竖排：页序右→左，向右拖/←键/点左侧 = 下一页，内容向右移动
 *
 *   两种排版内部结构：
 *   - 竖排：一列 = 一行竖排文字（宽 = 行距），一页 = 若干列
 *   - 横排：一列 = 一页（宽 = 版心宽度），篇与篇之间用 break-before:column 强制换页
 */
(function(){
'use strict';
var D = window.__BOOK__, S2T = window.__S2T__, T2S = window.__T2S__;
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var KEY = 'zhuangzi.reader.v3';
var DEF = {theme:'paper', font:'song', fs:19, lh:195, measure:36, gap:10, mode:'h', script:'s', immersive:false};
var S = {}, pos = {ci:1, pi:0};
var immersiveHintShown = false;

try{
  var raw = localStorage.getItem(KEY) || localStorage.getItem('zhuangzi.reader.v2');
  if(raw){ var o = JSON.parse(raw); S = Object.assign({}, DEF, o.s||{}); if(o.p) pos = o.p; }
}catch(e){}
if(!Object.keys(S).length) S = Object.assign({}, DEF);
pos.ci = Math.min(Math.max(1, parseInt(pos.ci,10)||1), D.chapters.length);
pos.pi = Math.max(0, parseInt(pos.pi,10)||0);
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({s:S, p:pos})); }catch(e){} }

var root = document.documentElement, body = document.body;
var reader = $('#reader'), stage = $('#stage'), viewport = $('#viewport'), book = $('#book');
var paraEls = [];       // [{sec,h,arr}]

function isV(){ return S.mode === 'v'; }

/* ------------------------------------------------------------ 设置应用 */
var themeColorMap = {paper:'#faf7ef', sepia:'#f0e6d1', green:'#edf3ea', ink:'#fff', night:'#14171d'};
function apply(){
  var pitchPx = Math.max(8, Math.round(S.fs * S.lh / 100));
  root.style.setProperty('--fs', S.fs+'px');
  root.style.setProperty('--lh', S.lh/100);
  root.style.setProperty('--pitch', pitchPx+'px');
  root.style.setProperty('--measure', S.measure);
  root.style.setProperty('--gap', (S.gap/10)+'em');
  root.dataset.theme = S.theme;
  body.dataset.theme = S.theme;
  body.dataset.font = S.font;
  body.dataset.mode = S.mode;
  body.dataset.script = S.script;
  $('#btn-mode').textContent = S.mode==='v' ? '横排' : '竖排';
  $('#btn-script').textContent = S.script==='s' ? '繁' : '简';
  root.lang = S.script==='s' ? 'zh-Hans' : 'zh-Hant';
  // theme-color 随主题变化
  var tc = $('meta[name="theme-color"]');
  if(tc) tc.content = themeColorMap[S.theme] || '#faf7ef';
  // 沉浸模式
  applyImmersive();
  syncSetUI();
}
function syncSetUI(){
  $$('#seg-font button').forEach(function(b){ b.classList.toggle('on', b.dataset.v===S.font); });
  $$('#seg-mode button').forEach(function(b){ b.classList.toggle('on', b.dataset.v===S.mode); });
  $$('#seg-script button').forEach(function(b){ b.classList.toggle('on', b.dataset.v===S.script); });
  $$('#theme-swatches .sw').forEach(function(b){ b.classList.toggle('on', b.dataset.v===S.theme); });
  $('#set-fs').value = S.fs; $('#v-fs').textContent = S.fs+'px';
  $('#set-lh').value = S.lh; $('#v-lh').textContent = (S.lh/100).toFixed(2);
  $('#set-mw').value = S.measure; $('#v-mw').textContent = S.measure+' 字';
  $('#set-gap').value = S.gap; $('#v-gap').textContent = (S.gap/10).toFixed(1)+'em';
  var immBtn = $('#set-immersive');
  if(immBtn){ immBtn.textContent = S.immersive ? '已开启' : '关闭'; immBtn.classList.toggle('on', S.immersive); }
}

/* ------------------------------------------------------------ 正文渲染 */
function buildBook(){
  var frag = document.createDocumentFragment();
  D.chapters.forEach(function(ch){
    var sec = document.createElement('section');
    sec.className = 'chapter';
    sec.id = 'c'+ch.ci;
    sec.dataset.ci = ch.ci;
    var h = document.createElement('h2');
    h.className = 'ch-head';
    h.innerHTML = '<span class="ch-top"></span><span class="ch-name"></span>';
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
    paraEls.push({sec:sec, h:h, arr:arr});
  });
  book.appendChild(frag);
}
function paraText(ch, pi){
  return ch.paras[pi][S.script==='s' ? 0 : 1];
}
function renderText(){
  D.chapters.forEach(function(ch, idx){
    var refs = paraEls[idx];
    refs.h.querySelector('.ch-top').textContent = [ch.juan, ch.numCn].filter(Boolean).join(' · ');
    refs.h.querySelector('.ch-name').textContent = S.script==='s' ? ch.name : ch.nameT;
    refs.h.title = '点击回到本篇开头';
    ch.paras.forEach(function(p, pi){ fillPara(refs.arr[pi], paraText(ch, pi)); });
  });
  collectMarks();
  if(hits.length){ setHitClass(hitIdx, false); }
}
function fillPara(el, text){
  el.textContent = '';
  var hs = HITMAP.get(el.dataset.ci+':'+el.dataset.pi);
  if(!hs || !hs.length){ el.textContent = text; return; }
  var cur = 0;
  hs.forEach(function(h){
    if(h.pos > cur) el.appendChild(document.createTextNode(text.slice(cur, h.pos)));
    var m = document.createElement('mark');
    m.textContent = text.substr(h.pos, h.len);
    m.dataset.i = h.i;
    el.appendChild(m);
    cur = h.pos + h.len;
  });
  if(cur < text.length) el.appendChild(document.createTextNode(text.slice(cur)));
}
function collectMarks(){ marks = $$('mark', book); }

/* ------------------------------------------------------------ 目录 */
function buildTOC(){
  var wrap = $('#toc-list');
  wrap.innerHTML = '';
  var div = null, group = null;
  D.chapters.forEach(function(ch){
    if(ch.division !== div){
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
    b.querySelector('.ti-name').textContent = S.script==='s' ? ch.name : ch.nameT;
    b.addEventListener('click', function(){
      goChapter(ch.ci);
      if(window.innerWidth < 900) closePanels();
    });
    group.appendChild(b);
  });
}
function markTOC(ci){
  $$('#toc-list .toc-item').forEach(function(el){
    var on = (+el.dataset.ci) === ci;
    if(on === el.classList.contains('active')) return;
    el.classList.toggle('active', on);
    if(on){
      var sc = $('#toc-list');
      var top = el.offsetTop, h = sc.clientHeight;
      if(top < sc.scrollTop + 40 || top > sc.scrollTop + h - 60) sc.scrollTop = top - h/2;
    }
  });
}

/* ------------------------------------------------------------ 分页几何 */
var P = {
  page: 0, pages: 1,           // 当前页 / 总页数
  pageW: 100, pageH: 100,      // 一页的宽高（px）
  pitch: 20,                   // 行距（px）
  perPage: 1,                  // 竖排：一页多少栏
  shift: 0,                    // 当前位移（px）
  right: 0,                    // 版心右边界（未位移坐标系）
  chapterStart: []             // 每篇起始页（浮点）
};
var breakEls = [];             // 竖排的换页空白块

function clearBreaks(){
  breakEls.forEach(function(el){ if(el.parentNode) el.parentNode.removeChild(el); });
  breakEls = [];
}
function addBreak(beforeSec, widthPx){
  var el = document.createElement('div');
  el.className = 'pgbreak';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = widthPx + 'px';
  beforeSec.parentNode.insertBefore(el, beforeSec);
  breakEls.push(el);
}

// 浏览器按 1/64px 存行距，栏距必须落在同一个格子上，否则误差会随栏数累积
function quantize(px){ return Math.floor(px * 64) / 64; }

// 竖排下用「一栏一行」的客户端矩形实测栏距：比读 line-height 更准
var pitchProbe = null;
function measurePitch(){
  if(!pitchProbe){
    pitchProbe = Array.prototype.find.call(document.querySelectorAll('.para'),
      function(p){ return (p.textContent || '').length > 300; });
  }
  if(!pitchProbe) return 0;
  var range = document.createRange();
  range.selectNodeContents(pitchProbe);
  var rects = Array.prototype.slice.call(range.getClientRects());
  if(rects.length < 3) return 0;
  var xs = [];
  rects.forEach(function(r){
    var x = Math.round(r.left * 64) / 64;
    if(xs.indexOf(x) < 0) xs.push(x);
  });
  xs.sort(function(a, b){ return a - b; });
  var diffs = [];
  for(var i = 1; i < xs.length; i++){
    var d = xs[i] - xs[i-1];
    if(d > 1) diffs.push(d);
  }
  if(!diffs.length) return 0;
  diffs.sort(function(a, b){ return a - b; });
  return diffs[Math.floor(diffs.length / 2)];
}

function startRect(ci){
  var refs = paraEls[ci-1];
  if(!refs) return book.getBoundingClientRect();
  // 竖排：篇题块自带宽度，块右边缘就是篇首栏位（标题文字可能比栏更宽，不能用文字量）
  if(isV()) return refs.h.getBoundingClientRect();
  return refs.sec.getBoundingClientRect();
}

function layout(){
  clearBreaks();
  book.style.transition = 'none';
  book.style.transform = 'translateX(0px)';
  book.style.lineHeight = '';
  book.style.columnWidth = '';
  book.style.removeProperty('--pitch');
  viewport.style.width = '';
  viewport.style.left = '';
  viewport.style.right = '';
  P.shift = 0;
  void book.offsetWidth;

  if(isV()) layoutV(); else layoutH();
  measurePages();
}

/* 竖排：一列 = 一行字，一页 = perPage 列；篇首用空白块推到页边界 */
function layoutV(){
  var scs = getComputedStyle(stage);
  var padX = parseFloat(scs.getPropertyValue('--pad-x')) || 22;
  var avail = Math.max(40, stage.clientWidth - padX * 2);
  var cs = getComputedStyle(book);
  var basePitch = parseFloat(cs.lineHeight);
  if(!isFinite(basePitch) || basePitch <= 0) basePitch = S.fs * S.lh / 100;
  var per = Math.max(1, Math.floor(avail / basePitch));

  // 页宽 = 整数栏 × 栏距：把剩余像素摊进行距（量化到 1/64px），再实测一次栏距
  var pitch = basePitch, pageW = per * pitch;
  for(var attempt = 0; attempt < 4; attempt++){
    var target = quantize(avail / per - 0.02);
    book.style.lineHeight = target + 'px';
    book.style.setProperty('--pitch', target + 'px');
    void book.offsetWidth;
    pitch = measurePitch() || target;
    pageW = per * pitch;
    if(pageW <= avail + 0.02 || per <= 1) break;
    per -= 1;
  }
  P.pitch = pitch;
  P.perPage = per;
  P.pageW = pageW;
  P.pageH = stage.clientHeight;
  viewport.style.left = 'auto';
  viewport.style.right = (padX + Math.max(0, avail - pageW) / 2) + 'px';
  viewport.style.width = pageW + 'px';
  P.right = viewport.getBoundingClientRect().right;

  // 篇首对齐页边界：先量（不含空白块），再插空白块
  var shift = 0, plan = [];
  for(var i = 1; i < D.chapters.length; i++){
    var pos = (P.right - startRect(D.chapters[i].ci).right) / P.pageW + shift;
    var extra = Math.ceil(pos - 0.02) - pos;
    if(extra < 0.001 || extra > 0.999) extra = 0;
    if(extra > 0){
      plan.push({i: i, width: Math.round(extra * P.pageW * 64) / 64});
      shift += extra;
    }
  }
  plan.forEach(function(p){ addBreak(paraEls[p.i].sec, p.width); });
  if(plan.length) void book.offsetWidth;
}

/* 横排：一篇 = 一页（break-before:column），列宽 = 版心宽度 */
function layoutH(){
  var scs = getComputedStyle(stage);
  var padX = parseFloat(scs.getPropertyValue('--pad-x')) || 22;
  var avail = Math.max(40, stage.clientWidth - padX * 2);
  var fs = parseFloat(getComputedStyle(book).fontSize) || S.fs;
  var want = Math.round(S.measure * fs);
  var pageW = Math.max(fs * 8, Math.min(avail, want));
  viewport.style.width = pageW + 'px';
  book.style.columnWidth = pageW + 'px';
  void book.offsetWidth;
  P.pageW = pageW;
  P.pitch = parseFloat(getComputedStyle(book).lineHeight) || (S.fs * S.lh / 100);
  P.perPage = 1;
  P.right = viewport.getBoundingClientRect().right;
  P.pageH = viewport.getBoundingClientRect().height;
}

function measurePages(){
  P.chapterStart = D.chapters.map(function(ch){
    return (P.right - startRect(ch.ci).right) / P.pageW;
  });
  var maxPage = 0;
  for(var i = 0; i < paraEls.length; i++){
    var arr = paraEls[i].arr;
    for(var j = 0; j < arr.length; j++){
      var r = arr[j].getBoundingClientRect();
      if(!r.width && !r.height) continue;
      var p = Math.floor((P.right - r.left) / P.pageW + 0.02);
      if(p > maxPage) maxPage = p;
    }
  }
  P.pages = Math.max(1, maxPage + 1);
}
function pageOfEl(el){
  if(!el) return 0;
  var r = el.getBoundingClientRect();          // 含当前位移，先还原成未位移坐标
  var x = P.right - (r.right - P.shift);
  return Math.min(P.pages-1, Math.max(0, Math.floor(x / P.pageW + 0.02)));
}
function chapterPage(ci){
  var f = P.chapterStart[(ci||1)-1] || 0;
  return Math.min(P.pages-1, Math.max(0, Math.floor(f + 0.02)));
}
function chapterAtPage(pg){
  var idx = 0;
  for(var i = 0; i < P.chapterStart.length; i++){
    if(P.chapterStart[i] <= pg + 0.02) idx = i; else break;
  }
  return D.chapters[idx] ? D.chapters[idx].ci : 1;
}

/* ------------------------------------------------------------ 翻页 */
function applyShift(px){
  P.shift = px;
  book.style.transition = 'none';
  book.style.transform = 'translateX(' + px + 'px)';
}
function setPage(p, animate){
  P.page = Math.min(Math.max(0, p|0), P.pages-1);
  P.shift = P.page * P.pageW;
  if(animate === false){
    book.style.transition = 'none';
  } else {
    book.style.transition = 'transform .3s cubic-bezier(.22,.61,.36,1)';
  }
  book.style.transform = 'translateX(' + P.shift + 'px)';
  if(animate === false) void book.offsetWidth;
  updatePageBar();
  updateProgress();
  var ci = chapterAtPage(P.page);
  if(ci !== curCI) setTopic(ci);
  schedulePos();
}
function nextPage(){ if(P.page < P.pages-1) setPage(P.page+1, true); }
function prevPage(){ if(P.page > 0) setPage(P.page-1, true); }
function updatePageBar(){
  $('#pg-label').textContent = '第 ' + (P.page+1) + ' / ' + P.pages + ' 页';
  showPageBar();
}
var pageBarTimer = null;
function showPageBar(){
  var bar = $('#pagebar');
  bar.classList.add('show');
  clearTimeout(pageBarTimer);
  pageBarTimer = setTimeout(function(){ bar.classList.remove('show'); }, 3000);
}
function updateProgress(){
  var pct = P.pages <= 1 ? 1 : (P.page+1)/P.pages;
  $('#bar i').style.width = (Math.min(1, Math.max(0, pct))*100).toFixed(2)+'%';
}

/* ------------------------------------------------------------ 位置与进度 */
var curCI = pos.ci;
function setTopic(ci){
  curCI = ci;
  var ch = D.chapters[ci-1];
  if(!ch) return;
  $('#topic').textContent = (S.script==='s' ? ch.name : ch.nameT) + (ch.numCn ? '｜'+ch.numCn : '');
  markTOC(ci);
}
function anchorEl(a){
  var refs = paraEls[(a.ci||1)-1];
  if(!refs) return null;
  var arr = refs.arr;
  return arr[Math.min(Math.max(0, a.pi||0), arr.length-1)] || refs.sec;
}
var posTimer = null;
function schedulePos(){
  // 翻页带过渡，等动画落定再量位置，否则量到的是上一页
  clearTimeout(posTimer);
  posTimer = setTimeout(function(){
    var a = captureAnchor();
    if(a) pos = a;
    save();
  }, 360);
}
function captureAnchor(){
  // 当前页里「起点落在本页、且最靠右」的段落 = 阅读位置
  var vr = viewport.getBoundingClientRect();
  var best = null, bestX = -Infinity;
  for(var i = 0; i < paraEls.length; i++){
    var arr = paraEls[i].arr;
    for(var j = 0; j < arr.length; j++){
      var r = arr[j].getBoundingClientRect();
      if((!r.width && !r.height) || r.right > vr.right + 1 || r.right < vr.left) continue;
      if(r.right > bestX){ bestX = r.right; best = {ci: D.chapters[i].ci, pi: j}; }
    }
  }
  return best;
}

function goChapter(ci){
  var refs = paraEls[ci-1];
  if(!refs) return;
  flashEl(refs.h);
  setPage(chapterPage(ci), true);
  setTopic(ci);
  pos = {ci: ci, pi: 0};
  schedulePos();
}
function goAdjacentChapter(dir){
  var i = D.chapters.findIndex(function(c){ return c.ci === curCI; });
  var t = Math.min(D.chapters.length-1, Math.max(0, i+dir));
  if(t !== i) goChapter(D.chapters[t].ci);
}
function reflow(anchor){
  anchor = anchor || pos;
  layout();
  var el = anchorEl(anchor);
  setPage(el ? pageOfEl(el) : 0, false);
  updatePageBar();
  updateProgress();
}

/* ------------------------------------------------------------ 搜索 */
var Q = '', hits = [], hitIdx = -1, marks = [], HITMAP = new Map();
var MAX_HITS = 3000;

function normQuery(q){
  var map = S.script === 's' ? T2S : S2T;
  var out = '';
  for(var i = 0; i < q.length; i++){
    var c = q[i];
    out += (map && map[c]) || c;
  }
  return out;
}
function doSearch(q, jump){
  Q = q;
  hits = []; hitIdx = -1; HITMAP = new Map();
  var nq = normQuery(q).toLowerCase();
  if(nq){
    for(var ci = 0; ci < D.chapters.length; ci++){
      var ch = D.chapters[ci];
      for(var pi = 0; pi < ch.paras.length; pi++){
        var text = paraText(ch, pi).toLowerCase();
        var at = text.indexOf(nq);
        while(at >= 0 && hits.length < MAX_HITS){
          var i = hits.length;
          hits.push({ci: ch.ci, pi: pi, pos: at, len: nq.length});
          var k = ch.ci+':'+pi;
          var arr = HITMAP.get(k);
          if(!arr){ arr = []; HITMAP.set(k, arr); }
          arr.push({pos: at, len: nq.length, i: i});
          at = text.indexOf(nq, at + nq.length);
        }
        if(hits.length >= MAX_HITS) break;
      }
      if(hits.length >= MAX_HITS) break;
    }
  }
  renderText();
  renderResults();
  if(hits.length) setHitClass(-1, false);
  if(hits.length && jump !== false) gotoHit(0);
  updateSearchMeta();
}
function setHitClass(i, scroll){
  marks.forEach(function(m){ m.classList.remove('cur'); });
  hitIdx = i;
  if(i < 0 || i >= hits.length){ updateSearchMeta(); return; }
  var target = null;
  for(var k = 0; k < marks.length; k++){
    if(marks[k].dataset.i === String(i)){ target = marks[k]; break; }
  }
  if(target){
    target.classList.add('cur');
    $$('#q-results .res-item').forEach(function(el, idx){ el.classList.toggle('cur', idx === i); });
    var curRes = $('#q-results .res-item.cur');
    if(curRes && scroll !== false){
      var box = $('#q-results');
      var top = curRes.offsetTop;
      if(top < box.scrollTop + 20 || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = top - 60;
    }
    if(scroll !== false) revealMark(target);
  }
  updateSearchMeta();
}
function revealMark(mark){
  setPage(pageOfEl(mark), true);
  flashEl(mark.parentElement);
}
function gotoHit(i){
  if(!hits.length) return;
  i = Math.min(Math.max(0, i), hits.length-1);
  setHitClass(i, true);
}
function updateSearchMeta(){
  var n = hits.length;
  if(!Q){ $('#q-count').textContent = '输入关键词开始搜索'; }
  else if(!n){ $('#q-count').textContent = '未找到「'+Q+'」'; }
  else {
    var extra = n >= MAX_HITS ? '（已达上限，仅显示前 '+MAX_HITS+' 处）' : '';
    $('#q-count').textContent = '共 '+n+' 处' + (hitIdx>=0 ? ' · 第 '+(hitIdx+1)+' 处' : '') + extra;
  }
  $('#q-prev').disabled = !n || hitIdx <= 0;
  $('#q-next').disabled = !n || hitIdx >= n-1;
}
function renderResults(){
  var box = $('#q-results');
  box.innerHTML = '';
  if(!Q){
    box.innerHTML = '<div class="empty">支持全文检索，可搜索「逍遥」「鲲鹏」「庖丁解牛」…</div>';
    return;
  }
  if(!hits.length){
    box.innerHTML = '<div class="empty">没有找到「'+esc(Q)+'」<br>试试更短的关键词</div>';
    return;
  }
  var LIMIT = 300, frag = document.createDocumentFragment();
  hits.slice(0, LIMIT).forEach(function(h, i){
    var ch = D.chapters[h.ci-1];
    var text = paraText(ch, h.pi);
    var from = Math.max(0, h.pos - 22), to = Math.min(text.length, h.pos + h.len + 26);
    var b = document.createElement('button');
    b.className = 'res-item';
    b.dataset.i = i;
    var chName = S.script==='s' ? ch.name : ch.nameT;
    b.innerHTML = '<span class="res-ch">'+esc(ch.numCn ? ch.numCn+' '+chName : chName)+'</span>' +
      (from > 0 ? '…' : '') + esc(text.slice(from, h.pos)) +
      '<b>'+esc(text.substr(h.pos, h.len))+'</b>' +
      esc(text.slice(h.pos+h.len, to)) + (to < text.length ? '…' : '');
    b.addEventListener('click', function(){ gotoHit(i); });
    frag.appendChild(b);
  });
  box.appendChild(frag);
  if(hits.length > LIMIT){
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '还有 '+(hits.length-LIMIT)+' 处未列出，可用「下一处」继续浏览';
    box.appendChild(d);
  }
}
function esc(s){
  return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}

/* ------------------------------------------------------------ 面板 */
function panelOpen(){
  return body.classList.contains('toc-open') || body.classList.contains('search-open') || body.classList.contains('set-open');
}
function flashEl(el){
  if(!el) return;
  el.classList.add('flash');
  setTimeout(function(){ el.classList.remove('flash'); }, 900);
}
function openPanel(cls){
  closePanels(cls);
  body.classList.add(cls);
  var sc = $('#scrim');
  var useScrim = window.innerWidth < 900;   // 宽屏不压暗正文，边看边搜
  sc.style.display = useScrim ? 'block' : 'none';
  requestAnimationFrame(function(){ sc.style.opacity = useScrim ? '0.28' : '0'; });
}
function closePanels(except){
  ['toc-open','search-open','set-open'].forEach(function(c){
    if(c !== except) body.classList.remove(c);
  });
  if(!body.classList.contains('search-open') && !body.classList.contains('set-open')){
    $('#scrim').style.opacity = '0';
    setTimeout(function(){ if($('#scrim').style.opacity === '0') $('#scrim').style.display = 'none'; }, 300);
  }
}
function openSearch(){
  openPanel('search-open');
  setTimeout(function(){ var q = $('#q'); q.focus(); q.select(); }, 120);
}

/* ------------------------------------------------------------ 手势 */
var drag = null;
function dragTarget(dx){
  // 横排：向左拖 = 下一页（页序左→右，内容向左走）
  // 竖排：向右拖 = 下一页（页序右→左，内容向右走）
  if(isV()) return dx > 0 ? P.page + 1 : P.page - 1;
  return dx < 0 ? P.page + 1 : P.page - 1;
}
function onPointerDown(e){
  if(panelOpen()) return;
  if(e.pointerType === 'mouse' && e.button !== 0) return;
  var sel = window.getSelection();
  if(sel && !sel.isCollapsed) return;
  // 边缘 20px 内不翻页，让位系统手势（iOS 侧滑返回 / Android 手势返回）
  var r = stage.getBoundingClientRect();
  var xFromEdge = Math.min(e.clientX - r.left, r.right - e.clientX);
  if(xFromEdge < 20) return;
  // 顶部 20px 内不拦截，让位系统下拉（通知中心）
  if(e.clientY - r.top < 20) return;
  drag = {x0: e.clientX, y0: e.clientY, base: P.shift, moved: false, id: e.pointerId};
}
function onPointerMove(e){
  if(!drag || e.pointerId !== drag.id) return;
  var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if(!drag.moved){
    if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if(Math.abs(dy) > Math.abs(dx)){ drag = null; return; }   // 纵向手势不算翻页
    drag.moved = true;
    body.classList.add('dragging');
    var sel = window.getSelection();
    if(sel && !sel.isCollapsed) sel.removeAllRanges();
    try{ stage.setPointerCapture(e.pointerId); }catch(err){}
  }
  var min = -(P.pageW * 0.35);
  var max = (P.pages-1) * P.pageW + P.pageW * 0.35;
  var s = Math.max(min, Math.min(max, drag.base + dx));
  applyShift(s);
  e.preventDefault();
}
function onPointerUp(e){
  if(!drag || (e.pointerId !== drag.id && e.type !== 'pointercancel')) return;
  var d = drag;
  drag = null;
  body.classList.remove('dragging');
  try{ stage.releasePointerCapture(e.pointerId); }catch(err){}
  if(!d.moved){
    var r = stage.getBoundingClientRect();
    var x = e.clientX - r.left;
    var y = e.clientY - r.top;
    // 沉浸模式下：轻点顶部 15% 退出
    if(S.immersive && y < r.height * 0.15){
      toggleImmersive(false);
      return;
    }
    // 轻点中部 1/3 = 切换沉浸模式
    var xRatio = x / r.width;
    if(xRatio >= 0.32 && xRatio <= 0.68){
      toggleImmersive();
      return;
    }
    // 左右两侧翻页（方向随排版模式镜像）
    // 横排：点右侧 = 下一页；竖排：点左侧 = 下一页
    var nextOnLeft = isV();
    if(nextOnLeft ? x < r.width * 0.32 : x > r.width * 0.68) nextPage();
    else if(nextOnLeft ? x > r.width * 0.68 : x < r.width * 0.32) prevPage();
    return;
  }
  var dx = e.clientX - d.x0;
  var threshold = Math.min(90, P.pageW * 0.18);
  var target = Math.abs(dx) > threshold ? dragTarget(dx) : P.page;
  setPage(target, true);
}

/* ------------------------------------------------------------ 沉浸模式 */
function applyImmersive(){
  body.classList.toggle('immersive', !!S.immersive);
  var btn = $('#btn-immersive');
  if(btn) btn.classList.toggle('on', !!S.immersive);
}
function toggleImmersive(force){
  var next = force !== undefined ? force : !S.immersive;
  if(next === S.immersive) return;
  S.immersive = next;
  apply();
  save();
  // 尝试进入全屏
  if(next && document.documentElement.requestFullscreen){
    document.documentElement.requestFullscreen().catch(function(){});
  } else if(!next && document.exitFullscreen && document.fullscreenElement){
    document.exitFullscreen().catch(function(){});
  }
  // 首次进入显示提示
  if(next && !immersiveHintShown){
    immersiveHintShown = true;
    var hint = $('#immersive-hint');
    if(hint){
      hint.classList.add('show');
      setTimeout(function(){ hint.classList.remove('show'); }, 3000);
    }
  }
}

/* ------------------------------------------------------------ 绑定 */
function bind(){
  $('#btn-toc').addEventListener('click', function(){
    if(body.classList.contains('toc-open')) closePanels(); else openPanel('toc-open');
  });
  $('#btn-search').addEventListener('click', openSearch);
  $('#btn-settings').addEventListener('click', function(){
    if(body.classList.contains('set-open')) closePanels(); else openPanel('set-open');
  });
  $('#btn-mode').addEventListener('click', function(){ setMode(S.mode==='v'?'h':'v'); });
  $('#btn-script').addEventListener('click', function(){ setScript(S.script==='s'?'t':'s'); });
  $('#q-close').addEventListener('click', function(){ closePanels(); });
  $('#set-close').addEventListener('click', function(){ closePanels(); });
  $('#scrim').addEventListener('click', function(){ closePanels(); });
  // 沉浸模式按钮
  var immBtn = $('#btn-immersive');
  if(immBtn) immBtn.addEventListener('click', function(){ toggleImmersive(); });
  var setImmBtn = $('#set-immersive');
  if(setImmBtn) setImmBtn.addEventListener('click', function(){ toggleImmersive(); });

  $('#q-next').addEventListener('click', function(){ if(hits.length) gotoHit(hitIdx+1 < hits.length ? hitIdx+1 : 0); });
  $('#q-prev').addEventListener('click', function(){ if(hits.length) gotoHit(hitIdx-1 >= 0 ? hitIdx-1 : hits.length-1); });
  var qt = null;
  $('#q').addEventListener('input', function(e){
    var v = e.target.value.trim();
    clearTimeout(qt);
    qt = setTimeout(function(){ doSearch(v); }, 140);
  });
  $('#q').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      if(!hits.length) doSearch(e.target.value.trim());
      else if(e.shiftKey) gotoHit(hitIdx-1 >= 0 ? hitIdx-1 : hits.length-1);
      else gotoHit(hitIdx+1 < hits.length ? hitIdx+1 : 0);
    } else if(e.key === 'Escape'){
      closePanels();
    }
  });

  // 主题
  var themes = [['paper','纸白'],['sepia','米黄'],['green','青瓷'],['ink','纯白'],['night','夜色']];
  var bgMap = {paper:'#faf7ef', sepia:'#f0e6d1', green:'#edf3ea', ink:'#fff', night:'#14171d'};
  var fgMap = {paper:'#2b2823', sepia:'#392f20', green:'#232e26', ink:'#161616', night:'#c9c4ba'};
  var swWrap = $('#theme-swatches');
  themes.forEach(function(t){
    var b = document.createElement('button');
    b.className = 'sw';
    b.dataset.v = t[0];
    b.title = t[1];
    b.style.background = bgMap[t[0]];
    b.style.color = fgMap[t[0]];
    b.innerHTML = '<span>文</span>';
    b.addEventListener('click', function(){ S.theme = t[0]; apply(); save(); });
    swWrap.appendChild(b);
  });
  $$('#seg-font button').forEach(function(b){
    b.addEventListener('click', function(){ S.font = b.dataset.v; apply(); save(); onChangeLayoutSettings(); });
  });
  $('#set-fs').addEventListener('input', function(e){ S.fs = +e.target.value; onChangeLayoutSettings(); });
  $('#set-lh').addEventListener('input', function(e){ S.lh = +e.target.value; onChangeLayoutSettings(); });
  $('#set-mw').addEventListener('input', function(e){ S.measure = +e.target.value; onChangeLayoutSettings(); });
  $('#set-gap').addEventListener('input', function(e){ S.gap = +e.target.value; onChangeLayoutSettings(); });
  $$('#seg-mode button').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.dataset.v); });
  });
  $$('#seg-script button').forEach(function(b){
    b.addEventListener('click', function(){ setScript(b.dataset.v); });
  });
  $('#set-reset').addEventListener('click', function(){
    S = Object.assign({}, DEF); apply(); save(); reflow(pos);
  });

  // 拖拽 / 轻点翻页
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  // 滚轮：向下 = 下一页（两种排版一致）
  // 触控板横滑：横排向左滑 = 下一页；竖排向右滑 = 下一页
  var wheelLock = false;
  reader.addEventListener('wheel', function(e){
    if(panelOpen()) return;
    e.preventDefault();
    var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if(Math.abs(d) < 3 || wheelLock) return;
    wheelLock = true;
    setTimeout(function(){ wheelLock = false; }, 180);
    // 纵向滚动：向下 = 下一页
    if(Math.abs(e.deltaY) >= Math.abs(e.deltaX)){
      if(e.deltaY > 0) nextPage(); else prevPage();
    } else {
      // 横向滚动：横排左=下页，竖排右=下页
      if(isV()){ if(e.deltaX > 0) nextPage(); else prevPage(); }
      else { if(e.deltaX < 0) nextPage(); else prevPage(); }
    }
  }, {passive:false});

  // 点篇名回到本篇开头
  book.addEventListener('click', function(e){
    var h = e.target.closest && e.target.closest('.ch-head');
    if(h) goChapter(+h.parentElement.dataset.ci);
  });

  document.addEventListener('keydown', function(e){
    var tag = (e.target.tagName||'').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if((e.ctrlKey||e.metaKey) && (e.key === 'f' || e.key === 'F')){
      e.preventDefault(); openSearch(); return;
    }
    if(typing) return;
    var k = e.key;
    if(k === '/'){ e.preventDefault(); openSearch(); return; }
    if(k === 'Escape'){
      if(S.immersive){ toggleImmersive(false); }
      else { closePanels(); }
      return;
    }
    if(k === 'f' || k === 'F'){ toggleImmersive(); return; }
    if(k === 'm' || k === 'M'){
      if(body.classList.contains('toc-open')) closePanels(); else openPanel('toc-open');
      return;
    }
    if(k === 'v' || k === 'V'){ setMode(S.mode==='v'?'h':'v'); return; }
    if(k === 't' || k === 'T'){ setScript(S.script==='s'?'t':'s'); return; }
    if(k === 'j'){ goAdjacentChapter(1); return; }
    if(k === 'k'){ goAdjacentChapter(-1); return; }
    // 方向键按排版模式区分：横排 →=下页 ←=上页；竖排 ←=下页 →=上页
    if(k === 'ArrowDown' || k === 'PageDown' || k === ' '){ e.preventDefault(); nextPage(); }
    else if(k === 'ArrowUp' || k === 'PageUp'){ e.preventDefault(); prevPage(); }
    else if(k === 'ArrowLeft'){ e.preventDefault(); isV() ? nextPage() : prevPage(); }
    else if(k === 'ArrowRight'){ e.preventDefault(); isV() ? prevPage() : nextPage(); }
    else if(k === 'Home'){ e.preventDefault(); setPage(0, true); }
    else if(k === 'End'){ e.preventDefault(); setPage(P.pages-1, true); }
  });

  var rt = null;
  var fullscreenChanging = false;
  // 全屏切换时标记状态，避免 resize 捕获错误位置
  document.addEventListener('fullscreenchange', function(){
    fullscreenChanging = true;
    clearTimeout(rt);
    // 全屏切换完成后重新布局，使用当前 pos
    rt = setTimeout(function(){
      fullscreenChanging = false;
      reflow(pos);
    }, 100);
  });
  window.addEventListener('resize', function(){
    // 全屏切换过程中跳过，等 fullscreenchange 处理
    if(fullscreenChanging) return;
    clearTimeout(rt);
    rt = setTimeout(function(){ reflow(captureAnchor() || pos); }, 180);
  });
  window.addEventListener('orientationchange', function(){
    setTimeout(function(){ reflow(captureAnchor() || pos); }, 300);
  });
}

function onChangeLayoutSettings(){
  apply();
  save();
  reflow(captureAnchor() || pos);
  renderResults();
}
function setMode(m){
  if(m === S.mode) return;
  var a = captureAnchor() || pos;
  S.mode = m;
  apply();
  save();
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ reflow(a); });
  });
}
function setScript(sc){
  if(sc === S.script) return;
  var a = captureAnchor() || pos;
  S.script = sc;
  apply();
  save();
  buildTOC();
  if(Q) doSearch(Q, true); else renderText();
  requestAnimationFrame(function(){
    reflow(a);
    setTopic(curCI);
  });
}

/* ------------------------------------------------------------ 启动 */
function boot(){
  buildBook();
  buildTOC();
  apply();
  renderText();
  bind();

  // 深链参数：?ci=17&mode=v&script=t&q=鲲&page=12&theme=night&fs=22
  var params = new URLSearchParams(location.search);
  if(params.get('mode') === 'v' || params.get('mode') === 'h') S.mode = params.get('mode');
  if(params.get('script') === 't' || params.get('script') === 's') S.script = params.get('script');
  if(params.get('theme')) S.theme = params.get('theme');
  if(params.get('fs')) S.fs = Math.min(36, Math.max(14, +params.get('fs') || S.fs));
  if(params.get('ci')) pos = {ci: +params.get('ci') || 1, pi: 0};
  apply();
  if(S.script === 't'){ buildTOC(); renderText(); }

  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      reflow(pos);
      if(params.get('page')) setPage(Math.max(0, (+params.get('page')||1) - 1), false);
      setTopic(pos.ci);
      updateProgress();
      if(params.get('q')){
        openSearch();
        $('#q').value = params.get('q');
        doSearch(params.get('q'));
      }
      if(document.fonts && document.fonts.ready){
        document.fonts.ready.then(function(){
          reflow(captureAnchor() || pos);
          if(params.get('page')) setPage(Math.max(0, (+params.get('page')||1) - 1), false);
        });
      }
    });
  });
}
boot();
})();
