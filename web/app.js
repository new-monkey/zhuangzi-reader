(function(){
'use strict';
var D = window.__BOOK__, S2T = window.__S2T__, T2S = window.__T2S__;
var $ = function(s, r){ return (r||document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
var KEY = 'zhuangzi.reader.v2';
var DEF = {theme:'paper', font:'song', fs:19, lh:195, measure:36, gap:10, mode:'h', script:'s'};
var S = {}, pos = {ci:1, pi:0};

try{
  var raw = localStorage.getItem(KEY);
  if(raw){ var o = JSON.parse(raw); S = Object.assign({}, DEF, o.s||{}); if(o.p) pos = o.p; }
}catch(e){}
if(!Object.keys(S).length) S = Object.assign({}, DEF);
pos.ci = Math.min(Math.max(1, parseInt(pos.ci,10)||1), D.chapters.length);
pos.pi = Math.max(0, parseInt(pos.pi,10)||0);
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({s:S, p:pos})); }catch(e){} }

var root = document.documentElement, body = document.body;
var reader = $('#reader'), stage = $('#stage'), viewport = $('#viewport'), book = $('#book');
var paraEls = [];       // [{sec,h,arr}]

/* ------------------------------------------------------------ 排版应用 */
function apply(){
  root.style.setProperty('--fs', S.fs+'px');
  var pitchPx = Math.max(8, Math.round(S.fs * S.lh / 100));
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
}

/* ------------------------------------------------------------ 正文渲染 */
function buildBook(){
  var frag = document.createDocumentFragment();
  D.chapters.forEach(function(ch, ci){
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
    var top = [ch.juan, ch.numCn].filter(Boolean).join(' · ');
    refs.h.querySelector('.ch-top').textContent = top;
    refs.h.querySelector('.ch-name').textContent = S.script==='s' ? ch.name : ch.nameT;
    refs.h.title = '点击回到本篇开头';
    ch.paras.forEach(function(p, pi){
      fillPara(refs.arr[pi], paraText(ch, pi));
    });
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
function collectMarks(){
  marks = $$('mark', book);
}

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
      if(top < sc.scrollTop + 40 || top > sc.scrollTop + h - 60){
        sc.scrollTop = top - h/2;
      }
    }
  });
}

/* ------------------------------------------------------------ 位置与进度 */
var curCI = pos.ci;
function setTopic(ci){
  curCI = ci;
  var ch = D.chapters[ci-1];
  if(!ch) return;
  $('#topic').textContent = (S.script==='s' ? ch.name : ch.nameT) +
    (ch.numCn ? '｜'+ch.numCn : '');
  markTOC(ci);
}
function anchorEl(a){
  var refs = paraEls[(a.ci||1)-1];
  if(!refs) return null;
  var arr = refs.arr;
  return arr[Math.min(Math.max(0, a.pi||0), arr.length-1)] || refs.sec;
}
function progressH(){
  var max = reader.scrollHeight - reader.clientHeight;
  return max > 0 ? reader.scrollTop / max : 0;
}
function updateProgress(){
  var pct = isV() ? (vPages <= 1 ? 1 : (vPage+1)/vPages) : progressH();
  $('#bar i').style.width = (Math.min(1, Math.max(0, pct))*100).toFixed(2)+'%';
}
var posTimer = null;
function schedulePos(){
  // 翻页是带过渡的，等动画落定再量位置，否则量到的是上一页
  clearTimeout(posTimer);
  posTimer = setTimeout(function(){
    if(isV()){ var a = captureAnchorV(); if(a) pos = a; }
    save();
  }, 360);
}

/* ------------------------------------------------------------ 竖排分页 */
var vPage = 0, vPages = 1, vPageW = 100, vPitch = 20, vRight = 0, vShift = 0, vChapterStart = [];
function isV(){ return S.mode === 'v'; }

// 浏览器按 1/64px 存行距，栏距必须落在同一个格子上，否则误差会随栏数累积
function quantizePitch(px){
  return Math.floor(px * 64) / 64;
}

// 竖排下用「一栏一行」的客户矩形实测栏距：比读 line-height 更准，不受取整影响
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

function vLayout(){
  if(!isV()){
    book.style.transition = 'none';
    book.style.transform = 'none';
    book.style.lineHeight = '';
    book.style.removeProperty('--pitch');
    viewport.style.width = '';
    viewport.style.right = '';
    viewport.style.left = '';
    vShift = 0;
    return;
  }
  book.style.transition = 'none';
  book.style.transform = 'translateX(0px)';
  vShift = 0;
  // 清掉上一次的微调，回到样式表里的行距
  book.style.lineHeight = '';
  book.style.removeProperty('--pitch');
  viewport.style.width = '';
  viewport.style.right = '';
  viewport.style.left = '';
  void book.offsetWidth;

  // 版心可用宽度 = stage 宽度 - 左右留白（留白由 CSS 变量 --pad-x 定义）
  var scs = getComputedStyle(stage);
  var padX = parseFloat(scs.getPropertyValue('--pad-x')) || 22;
  var avail = Math.max(40, stage.clientWidth - padX * 2);
  var cs = getComputedStyle(book);
  var basePitch = parseFloat(cs.lineHeight);
  if(!isFinite(basePitch) || basePitch <= 0) basePitch = S.fs * S.lh / 100;
  var per = Math.max(1, Math.floor(avail / basePitch));

  // 让页宽正好等于「整数栏 × 栏距」：把剩余像素摊进行距（量化到 1/64px），
  // 再实测一次栏距；若仍超出可用宽度就减一栏重试。
  var pitch = basePitch, pageW = per * pitch;
  for(var attempt = 0; attempt < 4; attempt++){
    var target = quantizePitch(avail / per - 0.02);
    book.style.lineHeight = target + 'px';
    book.style.setProperty('--pitch', target + 'px');
    void book.offsetWidth;
    pitch = measurePitch() || target;
    pageW = per * pitch;
    if(pageW <= avail + 0.02 || per <= 1) break;
    per -= 1;
  }
  vPitch = pitch;
  vPageW = pageW;
  // 裁切边界就是页边界：多余的几像素留作留白，页边不会露出相邻页的半栏字
  viewport.style.left = 'auto';
  viewport.style.right = (padX + Math.max(0, avail - pageW) / 2) + 'px';
  viewport.style.width = pageW + 'px';
  vRight = viewport.getBoundingClientRect().right;

  var minLeft = vRight;
  vChapterStart = [];
  // 竖排下 section / h2 作为块级元素会撑满“块轴宽度”，不能用来量内容范围；
  // 改用内联元素（首行标题 span、末段文字）的真实边缘来推算。
  var secs = book.children;
  for(var i=0;i<secs.length;i++){
    var ref = secs[i].querySelector('.ch-top, .ch-name') || secs[i];
    var r = ref.getBoundingClientRect();
    var start = (vRight - r.right) / vPageW;
    vChapterStart.push(Math.max(0, Math.round(start * 1000) / 1000));
  }
  var lastSec = book.lastElementChild;
  var lastPara = lastSec ? lastSec.lastElementChild : null;
  if(lastPara){
    var lr = lastPara.getBoundingClientRect();
    if(lr.width > 0 || lr.height > 0) minLeft = lr.left;
  }
  var contentW = Math.max(0, vRight - minLeft);
  vPages = Math.max(1, Math.ceil(contentW / vPageW - 0.002));
}
function pageOfEl(el){
  if(!el) return 0;
  var r = el.getBoundingClientRect();     // 含当前 translateX，先还原成未位移的坐标
  var x = vRight - (r.right - vShift);
  return Math.min(vPages-1, Math.max(0, Math.floor(x / vPageW + 0.02)));
}
function setPage(p, animate){
  if(!isV()) return;
  vPage = Math.min(Math.max(0, p|0), vPages-1);
  if(animate === false){
    book.style.transition = 'none';
  } else {
    book.style.transition = 'transform .28s var(--ease)';
  }
  vShift = vPage * vPageW;
  book.style.transform = 'translateX(' + vShift + 'px)';
  if(animate === false) void book.offsetWidth;
  updatePageBar();
  updateProgress();
  var ci = chapterAtPage(vPage);
  if(ci !== curCI) setTopic(ci);
  schedulePos();
}
function chapterAtPage(pg){
  var idx = 0;
  for(var i=0;i<vChapterStart.length;i++){
    if(vChapterStart[i] <= pg + 0.001) idx = i; else break;
  }
  return D.chapters[idx] ? D.chapters[idx].ci : 1;
}
function updatePageBar(){
  $('#pg-label').textContent = '第 ' + (vPage+1) + ' / ' + vPages + ' 页';
  $('#pg-prev').disabled = vPage <= 0;
  $('#pg-next').disabled = vPage >= vPages-1;
}
function nextPage(){ if(isV() && vPage < vPages-1) setPage(vPage+1, true); else if(isV()) flashEnd(); }
function prevPage(){ if(isV() && vPage > 0) setPage(vPage-1, true); }
function flashEnd(){}

/* ------------------------------------------------------------ 定位跳转 */
function scrollToElH(el){
  if(!el) return;
  var top = el.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - 18;
  reader.scrollTop = Math.max(0, top);
}
function goChapter(ci){
  var refs = paraEls[ci-1];
  if(!refs) return;
  flashEl(refs.h);
  if(isV()){
    setPage(pageOfEl(refs.sec), true);
  } else {
    reader.scrollTop = refs.sec.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - 4;
    afterScrollH();
  }
  setTopic(ci);
  pos = {ci: ci, pi: 0};
  schedulePos();
}
function goAdjacentChapter(dir){
  var i = D.chapters.findIndex(function(c){ return c.ci === curCI; });
  var t = Math.min(D.chapters.length-1, Math.max(0, i+dir));
  if(t !== i) goChapter(D.chapters[t].ci);
}
function captureAnchorV(){
  // 竖排翻页后：找「起点落在当前页、且最靠右」的段落，作为恢复位置
  var vr = viewport.getBoundingClientRect();
  var best = null, bestX = -Infinity;
  for(var i=0;i<paraEls.length;i++){
    var arr = paraEls[i].arr;
    for(var j=0;j<arr.length;j++){
      var r = arr[j].getBoundingClientRect();
      if((!r.width && !r.height) || r.right > vr.right + 1 || r.right < vr.left) continue;
      if(r.right > bestX){ bestX = r.right; best = {ci: D.chapters[i].ci, pi: j}; }
    }
  }
  return best;
}
function captureAnchor(){
  if(isV()){
    var a = captureAnchorV();
    if(a) return a;
    return {ci: chapterAtPage(vPage), pi: 0};
  }
  var rt = reader.getBoundingClientRect().top + 14;
  var best = null;
  var refs = paraEls[(curCI||1)-1];
  if(refs){
    for(var i=0;i<refs.arr.length;i++){
      var r = refs.arr[i].getBoundingClientRect();
      if(r.bottom > rt){ best = i; break; }
    }
  }
  return {ci: curCI, pi: best == null ? 0 : best};
}
function afterScrollH(){
  if(isV()) return;
  var rt = reader.getBoundingClientRect().top + 14;
  var ci = 1, pi = 0;
  for(var i=0;i<paraEls.length;i++){
    var r = paraEls[i].sec.getBoundingClientRect();
    if(r.bottom > rt) { ci = D.chapters[i].ci; break; }
  }
  var refs = paraEls[ci-1];
  if(refs){
    for(var j=0;j<refs.arr.length;j++){
      if(refs.arr[j].getBoundingClientRect().bottom > rt){ pi = j; break; }
    }
  }
  if(ci !== curCI) setTopic(ci);
  pos = {ci: ci, pi: pi};
  updateProgress();
  schedulePos();
}
function reflow(anchor, opts){
  anchor = anchor || pos;
  if(isV()){
    vLayout();
    var el = anchorEl(anchor);
    setPage(el ? pageOfEl(el) : 0, false);
    updatePageBar(); updateProgress();
  } else {
    book.style.transition = 'none';
    book.style.transform = 'none';
    book.style.lineHeight = '';
    book.style.removeProperty('--pitch');
    viewport.style.width = '';
    viewport.style.right = '';
    viewport.style.left = '';
    var refs = paraEls[(anchor.ci||1)-1];
    var el = (!anchor.pi && refs) ? refs.sec : anchorEl(anchor);
    scrollToElH(el);
    afterScrollH();
  }
}

/* ------------------------------------------------------------ 搜索 */
var Q = '', hits = [], hitIdx = -1, marks = [], HITMAP = new Map();
var MAX_HITS = 3000;

function normQuery(q){
  var map = S.script === 's' ? T2S : S2T;
  var out = '';
  for(var i=0;i<q.length;i++){
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
    for(var ci=0; ci<D.chapters.length; ci++){
      var ch = D.chapters[ci];
      for(var pi=0; pi<ch.paras.length; pi++){
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
  if(hits.length && jump !== false) gotoHit(0, true);
  updateSearchMeta();
}
function setHitClass(i, scroll){
  marks.forEach(function(m){ m.classList.remove('cur'); });
  hitIdx = i;
  if(i < 0 || i >= hits.length){ updateSearchMeta(); return; }
  var target = null;
  for(var k=0;k<marks.length;k++){
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
  var el = mark.parentElement;
  if(isV()){
    setPage(pageOfEl(mark), true);
    flashEl(el);
  } else {
    var rt = reader.getBoundingClientRect().top;
    var r = mark.getBoundingClientRect();
    var want = r.top - rt;
    if(want < 60 || want > reader.clientHeight - 120){
      reader.scrollTop += want - reader.clientHeight * 0.38;
    }
    flashEl(el);
  }
}
function gotoHit(i, noScroll){
  if(!hits.length) return;
  i = Math.min(Math.max(0, i), hits.length-1);
  var h = hits[i];
  if(h.ci !== curCI) setTopic(h.ci);
  setHitClass(i, true);
  if(noScroll){ /* still scroll */ }
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

/* ------------------------------------------------------------ 面板控制 */
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

/* ------------------------------------------------------------ 设置绑定 */
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

  // 主题色块
  var themes = [['paper','纸白'],['sepia','米黄'],['green','青瓷'],['ink','纯白'],['night','夜色']];
  var swWrap = $('#theme-swatches');
  themes.forEach(function(t){
    var b = document.createElement('button');
    b.className = 'sw';
    b.dataset.v = t[0];
    b.title = t[1];
    var bgMap = {paper:'#faf7ef', sepia:'#f0e6d1', green:'#edf3ea', ink:'#fff', night:'#14171d'};
    var fgMap = {paper:'#2b2823', sepia:'#392f20', green:'#232e26', ink:'#161616', night:'#c9c4ba'};
    b.style.background = bgMap[t[0]];
    b.style.color = fgMap[t[0]];
    b.innerHTML = '<span>文</span>';
    b.addEventListener('click', function(){
      S.theme = t[0]; apply(); save();
    });
    swWrap.appendChild(b);
  });
  $$('#seg-font button').forEach(function(b){
    b.addEventListener('click', function(){ S.font = b.dataset.v; apply(); save(); });
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
    S = Object.assign({}, DEF); apply(); save();
    reflow(pos);
  });

  // 翻页
  $('#pg-prev').addEventListener('click', prevPage);
  $('#pg-next').addEventListener('click', nextPage);

  // 竖排翻页：点击左右 / 滚轮 / 触屏
  stage.addEventListener('click', function(e){
    if(!isV() || panelOpen()) return;
    var sel = window.getSelection();
    if(sel && !sel.isCollapsed) return;
    var r = stage.getBoundingClientRect();
    var x = e.clientX - r.left;
    if(x > r.width * 0.7) prevPage();
    else if(x < r.width * 0.3) nextPage();
  });
  var wheelLock = false;
  reader.addEventListener('wheel', function(e){
    if(!isV() || panelOpen()) return;
    e.preventDefault();
    var d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : -e.deltaX;
    if(Math.abs(d) < 3 || wheelLock) return;
    wheelLock = true;
    setTimeout(function(){ wheelLock = false; }, 200);
    if(d > 0) nextPage(); else prevPage();
  }, {passive:false});
  var tx = 0, ty = 0;
  stage.addEventListener('touchstart', function(e){
    if(!isV() || panelOpen() || e.touches.length !== 1) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, {passive:true});
  stage.addEventListener('touchend', function(e){
    if(!isV() || panelOpen()) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - tx, dy = t.clientY - ty;
    if(Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)){ if(dx > 0) prevPage(); else nextPage(); }
  }, {passive:true});

  // 章节标题点击回本篇
  book.addEventListener('click', function(e){
    var h = e.target.closest && e.target.closest('.ch-head');
    if(h) goChapter(+h.parentElement.dataset.ci);
  });

  // 滚动（横排）
  var raf = false;
  reader.addEventListener('scroll', function(){
    if(isV() || raf) return;
    raf = true;
    requestAnimationFrame(function(){ raf = false; afterScrollH(); });
  }, {passive:true});

  // 键盘
  document.addEventListener('keydown', function(e){
    var tag = (e.target.tagName||'').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if((e.ctrlKey||e.metaKey) && (e.key === 'f' || e.key === 'F')){
      e.preventDefault(); openSearch(); return;
    }
    if(typing) return;
    var k = e.key;
    if(k === '/'){ e.preventDefault(); openSearch(); return; }
    if(k === 'Escape'){ closePanels(); return; }
    if(k === 'm' || k === 'M'){
      if(body.classList.contains('toc-open')) closePanels(); else openPanel('toc-open');
      return;
    }
    if(k === 'v' || k === 'V'){ setMode(S.mode==='v'?'h':'v'); return; }
    if(k === 't' || k === 'T'){ setScript(S.script==='s'?'t':'s'); return; }
    if(isV()){
      if(k === 'ArrowLeft' || k === 'ArrowDown' || k === 'PageDown' || k === ' '){ e.preventDefault(); nextPage(); }
      else if(k === 'ArrowRight' || k === 'ArrowUp' || k === 'PageUp'){ e.preventDefault(); prevPage(); }
      else if(k === 'Home'){ e.preventDefault(); setPage(0, true); }
      else if(k === 'End'){ e.preventDefault(); setPage(vPages-1, true); }
      else if(k === 'j'){ goAdjacentChapter(1); }
      else if(k === 'k'){ goAdjacentChapter(-1); }
    } else {
      if(k === 'ArrowLeft' || k === 'k'){ e.preventDefault(); goAdjacentChapter(-1); }
      else if(k === 'ArrowRight' || k === 'j'){ e.preventDefault(); goAdjacentChapter(1); }
      else if(k === 'Home'){ reader.scrollTop = 0; }
      else if(k === 'End'){ reader.scrollTop = reader.scrollHeight; }
    }
  });

  // 窗口尺寸变化
  var rt = null;
  window.addEventListener('resize', function(){
    clearTimeout(rt);
    rt = setTimeout(function(){
      var a = captureAnchor();
      reflow(a);
    }, 180);
  });
  window.addEventListener('orientationchange', function(){
    setTimeout(function(){ reflow(captureAnchor()); }, 300);
  });
}

function onChangeLayoutSettings(){
  apply();
  save();
  var a = captureAnchor();
  reflow(a);
  renderResults();
}
function setMode(m){
  if(m === S.mode) return;
  var a = captureAnchor();
  S.mode = m;
  apply();
  save();
  // 等一帧让 CSS 生效，再测量
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      reflow(a);
      updateProgress();
    });
  });
}
function setScript(sc){
  if(sc === S.script) return;
  var a = captureAnchor();
  S.script = sc;
  apply();
  save();
  buildTOC();
  if(Q) doSearch(Q, true); else renderText();
  requestAnimationFrame(function(){
    reflow(a);
    setTopic(curCI);
    updateProgress();
  });
}

/* ------------------------------------------------------------ 启动 */
function boot(){
  buildBook();
  buildTOC();
  apply();
  renderText();
  bind();

  // 支持 URL 参数调试/直达：?ci=17&mode=v&script=t&q=鲲
  var params = new URLSearchParams(location.search);
  if(params.get('mode') === 'v') S.mode = 'v';
  if(params.get('mode') === 'h') S.mode = 'h';
  if(params.get('script') === 't') S.script = 't';
  if(params.get('script') === 's') S.script = 's';
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
          var a = captureAnchor();
          reflow(a);
          if(params.get('page')) setPage(Math.max(0, (+params.get('page')||1) - 1), false);
        });
      }
    });
  });
}
boot();
})();
