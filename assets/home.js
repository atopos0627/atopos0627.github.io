// 分页（tab）路由 + 每日推荐。
// 路由：#home（默认）、#write、#build、#think（可带日期 #think/2026-11-05）、#about。
// 推荐：从页面里已有的内容（文章、项目、带链接的著作）和辩论日报的辩题里挑选；
//   同一天对同一个人结果固定（按日期做随机种子），“换一批”换种子；
//   按本浏览器里的点击偏好加权（只存在 localStorage，不上传）。
(function () {
  var VIEWS = ['home', 'write', 'build', 'think', 'about'];
  var TITLES = { home: '', write: 'What I Write', build: 'What I Build', think: 'What You Think', about: 'About' };
  var BASE_TITLE = document.title;

  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }

  // ---------- 路由 ----------
  function currentView() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var v = h.split('/')[0];
    return VIEWS.indexOf(v) >= 0 ? v : 'home';
  }

  var lastView = null;
  function route() {
    var v = currentView();
    VIEWS.forEach(function (name) {
      var sec = document.getElementById(name);
      if (sec) sec.classList.toggle('active', name === v);
    });
    document.body.setAttribute('data-view', v);
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false');
    });
    document.title = TITLES[v] ? TITLES[v] + ' · ' + BASE_TITLE : BASE_TITLE;
    if (v !== lastView) {
      window.scrollTo(0, 0);
      if (lastView !== null && v !== 'home') bump(v, 1);
      lastView = v;
    }
  }
  window.addEventListener('hashchange', route);

  // ---------- 偏好（仅本地） ----------
  var PREF_KEY = 'ontic.prefs';
  function prefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function bump(cat, n) {
    try {
      var p = prefs();
      p[cat] = Math.min((p[cat] || 0) + n, 50);
      localStorage.setItem(PREF_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  // ---------- 随机（按日期做种子） ----------
  function today() {
    var d = new Date(Date.now() + 8 * 3600 * 1000);  // 北京时间
    return d.toISOString().slice(0, 10);
  }
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {  // mulberry32
      h += 0x6D2B79F5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 候选内容 ----------
  function txt(root, sel) {
    var zh = root.querySelector(sel + '.t-zh') || root.querySelector(sel);
    var en = root.querySelector(sel + '.t-en') || zh;
    return { zh: zh ? zh.textContent.trim() : '', en: en ? en.textContent.trim() : '' };
  }
  function strip(s) { return s.replace(/^[【\[][^】\]]*[】\]]\s*/, ''); }

  function poolFromPage() {
    var items = [];
    document.querySelectorAll('#write a.card.post').forEach(function (a) {
      var d = txt(a, 'p');
      items.push({ cat: 'write', href: a.getAttribute('href'), ext: a.target === '_blank',
        title: txt(a, 'h3'), desc: { zh: strip(d.zh), en: strip(d.en) } });
    });
    document.querySelectorAll('#build a.card.post').forEach(function (a) {
      items.push({ cat: 'build', href: a.getAttribute('href'), ext: true,
        title: txt(a, 'h3'), desc: txt(a, 'p:not(.domain)') });
    });
    document.querySelectorAll('#about .pub-item a[href]').forEach(function (a) {
      var li = a.closest('.pub-item');
      var meta = li.querySelector('.pub-meta');
      var t = a.textContent.trim();
      var rest = li.textContent.replace(li.querySelector('.pub-num').textContent, '').replace(t, '')
        .replace(meta ? meta.textContent : '', '').replace(/^[，,\s]+/, '').trim();
      items.push({ cat: 'about', href: a.getAttribute('href'), ext: true,
        title: { zh: t, en: t }, desc: { zh: rest, en: rest }, date: meta ? meta.textContent.trim() : '' });
    });
    return items;
  }

  var topics = null;  // 来自 debate.js
  document.addEventListener('debate:topics', function (e) { topics = e.detail || []; render(); });
  if (window.__debateTopics) topics = window.__debateTopics;

  var T = {
    zh: { cats: { write: '文章', build: '项目', think: '往期辩题', about: '著作' },
      hero: '今日辩题', go: '去发表观点 →', pro: '正方', con: '反方', more: '换一批',
      note: '推荐会参考你在本浏览器里的点击偏好（只保存在你的浏览器里）。',
      noTopic: '今天的辩题还没发布，先看看别的推荐。', open: '打开 →', read: '去看看 →', join: '去辩论 →' },
    en: { cats: { write: 'Writing', build: 'Project', think: 'Past motion', about: 'Publication' },
      hero: "Today's motion", go: 'Share your view →', pro: 'For', con: 'Against', more: 'Shuffle',
      note: 'Picks lean on what you click in this browser (stored only in your browser).',
      noTopic: "Today's motion isn't up yet — here are some other picks.", open: 'Open →', read: 'Read →', join: 'Join →' }
  };

  var batch = 0;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function cut(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function pickWeighted(pool, k, rnd) {
    var p = prefs(), out = [], left = pool.slice();
    while (out.length < k && left.length) {
      var w = left.map(function (it) { return 1 + (p[it.cat] || 0); });
      var sum = w.reduce(function (a, b) { return a + b; }, 0), r = rnd() * sum, i = 0;
      for (; i < left.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }

  function render() {
    var root = document.getElementById('picks');
    if (!root) return;
    var L = lang(), t = T[L], day = today();
    var dateEl = document.getElementById('today-date');
    if (dateEl) dateEl.textContent = day;

    var pool = poolFromPage();
    var todayTopic = null;
    (topics || []).forEach(function (tp) {
      if (tp.date === day && !todayTopic) todayTopic = tp;
      else pool.push({ cat: 'think', href: '#think/' + tp.date, ext: false,
        title: { zh: tp.title, en: tp.title }, desc: { zh: tp.background || '', en: tp.background || '' }, date: tp.date });
    });
    // 今天的辩题还没发布时，用最新一期当头条
    if (!todayTopic && topics && topics.length) {
      todayTopic = topics[0];
      pool = pool.filter(function (it) { return it.href !== '#think/' + todayTopic.date; });
    }

    var picks = pickWeighted(pool, 3, seeded(day + '#' + batch));
    root.textContent = '';

    if (todayTopic) {
      var tp = todayTopic;
      root.appendChild(el('a', { 'class': 'card post pick-hero', href: '#think/' + tp.date,
        onclick: function () { bump('think', 2); } }, [
        el('p', { 'class': 'kicker' }, [el('span', { 'class': 'tag', text: t.hero }), tp.date]),
        el('h3', { text: tp.title }),
        tp.background ? el('p', { text: tp.background }) : null,
        el('p', { 'class': 'sides-mini' }, [
          el('span', { 'class': 'pro', text: t.pro + (tp.pro_label ? '：' + tp.pro_label : '') }),
          el('span', { 'class': 'con', text: t.con + (tp.con_label ? '：' + tp.con_label : '') })
        ]),
        el('p', { 'class': 'domain', text: t.go })
      ]));
    } else if (topics) {
      root.appendChild(el('p', { 'class': 'sec-note', text: t.noTopic }));
    }

    if (picks.length) {
      root.appendChild(el('div', { 'class': 'picks-grid' }, picks.map(function (it) {
        var a = el('a', { 'class': 'card post', href: it.href,
          target: it.ext ? '_blank' : null, rel: it.ext ? 'noopener' : null,
          onclick: function () { bump(it.cat, 1); } }, [
          el('p', { 'class': 'kicker' }, [el('span', { 'class': 'tag', text: t.cats[it.cat] }), it.date || '']),
          el('h3', { text: cut(it.title[L] || it.title.zh, 40) }),
          el('p', { 'class': 'desc', text: cut(it.desc[L] || it.desc.zh, 80) }),
          el('p', { 'class': 'domain', text: it.cat === 'think' ? t.join : (it.cat === 'write' ? t.read : t.open) })
        ]);
        return a;
      })));
    }

    root.appendChild(el('div', { 'class': 'picks-foot' }, [
      el('span', { text: t.note }),
      pool.length > 3 ? el('button', { type: 'button', text: t.more, onclick: function () { batch++; render(); } }) : null
    ]));
  }

  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
  route();
  render();
  // 辩题接口很慢或连不上时，先用页面内容出推荐，辩题到了再补上
  setTimeout(function () { if (topics === null) { topics = []; render(); } }, 9000);
})();
