// 辩论日报（What You Think）前端。后端是独立的 PocketBase，代码在 debate-backend/。
// 用户内容一律用 textContent 渲染，不拼 HTML。
(function () {
  var API = 'https://hub.ontic.top';
  // 只在本机预览时允许用 ?debate_api= 指向本地后端；线上不接受，避免被人诱导把验证码发到别处
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    var q = new URLSearchParams(location.search).get('debate_api');
    if (q) API = q.replace(/\/$/, '');
  }

  var root = document.getElementById('debate');
  if (!root) return;

  var T = {
    zh: {
      loading: '加载中…',
      offline: '暂时连不上辩论日报的服务器（网络线路不稳定），请稍后再试。', retry: '重试',
      noTopic: '今天的辩题还没发布，晚点再来看看。',
      daily: '辩论日报',
      pro: '正方', con: '反方',
      none: '还没有人发言，来做第一个吧。',
      evidence: '依据：',
      del: '删除', delConfirm: '确定删除这条观点？',
      loginTitle: '登录后发表你的观点',
      email: '邮箱', sendCode: '发送验证码', resend: '重新发送',
      code: '验证码（6 位数字，10 分钟内有效）', login: '登录', changeEmail: '换个邮箱',
      sent: '验证码已发送，请查收邮件（也看看垃圾箱）。',
      postTitle: '发表观点',
      side: '你站哪一方', claim: '观点（一句话说清楚）', evidenceLabel: '依据（事实、数据、经历或推理）',
      submit: '发表', posted: '已发表。',
      signedAs: '已登录：', logout: '退出', deleteMe: '删除我的账号',
      deleteMeConfirm: '删除账号会同时删除你发表过的所有观点，确定吗？',
      fine: '邮箱只用于登录，不会公开显示；页面上显示的是邮箱前两位加 ***。发表的观点会公开展示，你可以随时删除自己的观点或整个账号。不当内容会被下架。',
      err: {
        invalid_email: '邮箱格式不对。', too_frequent: '操作太频繁，请稍后再试。', daily_limit: '今天的验证码次数用完了，明天再试。',
        send_failed: '验证码发送失败，请稍后再试。', bad_code: '验证码不对。', code_expired: '验证码已过期，请重新发送。',
        too_many_attempts: '错误次数太多，请重新发送验证码。', limit_reached: '同一辩题每方最多发表 3 条。',
        need_text: '观点和依据都要填写。', auth: '登录已过期，请重新登录。', generic: '出错了，请稍后再试。'
      }
    },
    en: {
      loading: 'Loading…',
      offline: "Can't reach the debate server right now (unstable network route). Please try again shortly.", retry: 'Retry',
      noTopic: "Today's motion hasn't been posted yet — check back later.",
      daily: 'Daily debate',
      pro: 'For', con: 'Against',
      none: 'No one has spoken yet. Be the first.',
      evidence: 'Grounds: ',
      del: 'Delete', delConfirm: 'Delete this argument?',
      loginTitle: 'Sign in to share your view',
      email: 'Email', sendCode: 'Send code', resend: 'Resend',
      code: 'Code (6 digits, valid for 10 minutes)', login: 'Sign in', changeEmail: 'Use another email',
      sent: 'Code sent — check your inbox (and spam folder).',
      postTitle: 'Share your view',
      side: 'Your side', claim: 'Your point (one sentence)', evidenceLabel: 'Grounds (facts, data, experience or reasoning)',
      submit: 'Post', posted: 'Posted.',
      signedAs: 'Signed in: ', logout: 'Sign out', deleteMe: 'Delete my account',
      deleteMeConfirm: 'Deleting your account also deletes every argument you posted. Continue?',
      fine: 'Your email is used only for sign-in and never shown; the page shows its first two letters plus ***. Arguments are public; you can delete them, or your whole account, at any time. Inappropriate content will be removed.',
      err: {
        invalid_email: "That email doesn't look right.", too_frequent: 'Too many requests — try again shortly.', daily_limit: 'Daily code limit reached. Try again tomorrow.',
        send_failed: "Couldn't send the code. Try again later.", bad_code: 'Wrong code.', code_expired: 'Code expired — request a new one.',
        too_many_attempts: 'Too many attempts — request a new code.', limit_reached: 'Up to 3 arguments per side per motion.',
        need_text: 'Please fill in both your point and its grounds.', auth: 'Session expired — please sign in again.', generic: 'Something went wrong. Try again later.'
      }
    }
  };

  var state = {
    status: 'loading', topics: [], topic: null, args: [],
    auth: null, step: 'email', email: '', msg: '', msgErr: false, busy: false,
    draft: { side: 'pro', claim: '', evidence: '' }
  };
  try { state.auth = JSON.parse(localStorage.getItem('debateAuth') || 'null'); } catch (e) {}

  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }
  function t(k) { return T[lang()][k]; }
  function errText(code) { var m = T[lang()].err; return m[code] || m.generic; }

  function saveAuth(a) {
    state.auth = a;
    try { a ? localStorage.setItem('debateAuth', JSON.stringify(a)) : localStorage.removeItem('debateAuth'); } catch (e) {}
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.auth && state.auth) headers.Authorization = state.auth.token;
    return fetch(API + path, {
      method: opts.method || 'GET', headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!res.ok) {
          var code = (data && data.code) || '';
          var m = String((data && data.message) || '').toLowerCase();
          if (!code && m.indexOf('limit_reached') >= 0) code = 'limit_reached';
          if (!code && res.status === 429) code = 'too_frequent';
          if (!code && (res.status === 401 || res.status === 403) && opts.auth) code = 'auth';
          var err = new Error(code || 'generic'); err.code = code || 'generic'; err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function fmtTime(s) {
    var d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d)) return '';
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function loadTopics(attempt) {
    attempt = attempt || 1;
    return api('/api/collections/topics/records?sort=-date&perPage=7&fields=id,date,title,background,pro_label,con_label')
      .then(function (d) {
        state.topics = d.items || [];
        state.topic = state.topics[0] || null;
        state.status = state.topic ? 'ready' : 'empty';
        return loadArgs();
      })
      .catch(function () {
        // 线路时通时断：间隔 2、4 秒再试两次
        if (attempt < 3) return wait(attempt * 2000).then(function () { return loadTopics(attempt + 1); });
        state.status = 'offline';
      });
  }

  function loadArgs() {
    if (!state.topic) { state.args = []; return Promise.resolve(); }
    var f = encodeURIComponent('topic="' + state.topic.id + '"');
    return api('/api/collections/arguments/records?perPage=200&sort=-created&filter=' + f +
      '&fields=id,side,claim,evidence,author,author_name,created')
      .then(function (d) { state.args = d.items || []; })
      .catch(function () { state.args = []; });
  }

  function refreshAuth() {
    if (!state.auth) return Promise.resolve();
    return api('/api/collections/users/auth-refresh', { method: 'POST', auth: true })
      .then(function (d) { saveAuth({ token: d.token, id: d.record.id, name: d.record.name, email: d.record.email }); })
      .catch(function (e) { if (e.status === 401 || e.status === 403 || e.status === 404) saveAuth(null); });
  }

  function setMsg(text, isErr) { state.msg = text; state.msgErr = !!isErr; }

  function sideLabel(side) {
    var tp = state.topic || {};
    var custom = side === 'pro' ? tp.pro_label : tp.con_label;
    return t(side) + (custom ? '：' + custom : '');
  }

  function renderArg(a) {
    var mine = state.auth && a.author === state.auth.id;
    return el('div', { 'class': 'arg' }, [
      el('p', { 'class': 'claim', text: a.claim }),
      el('p', { 'class': 'evidence' }, [el('b', { text: t('evidence') }), a.evidence]),
      el('p', { 'class': 'meta' }, [
        el('span', { text: a.author_name || '***' }),
        el('span', { text: fmtTime(a.created) }),
        mine ? el('button', { type: 'button', text: t('del'), onclick: function () { delArg(a.id); } }) : null
      ])
    ]);
  }

  function renderSide(side) {
    var list = state.args.filter(function (a) { return a.side === side; });
    return el('div', { 'class': 'side ' + side }, [
      el('p', { 'class': 'side-head' }, [el('span', { text: sideLabel(side) }), el('span', { 'class': 'n', text: String(list.length) })]),
      list.length ? el('div', null, list.map(renderArg)) : el('p', { 'class': 'none', text: t('none') })
    ]);
  }

  function renderLogin() {
    var kids = [el('h4', { text: t('loginTitle') })];
    if (state.step === 'email') {
      var input = el('input', { type: 'email', id: 'dbt-email', autocomplete: 'email', value: state.email, placeholder: 'you@example.com' });
      kids.push(el('label', { 'for': 'dbt-email', text: t('email') }), input,
        el('div', { 'class': 'row' }, [el('button', { 'class': 'btn', type: 'button', disabled: state.busy, text: t('sendCode'),
          onclick: function () { state.email = input.value.trim(); sendCode(); } })]));
    } else {
      var code = el('input', { type: 'text', id: 'dbt-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '123456' });
      kids.push(el('p', { 'class': 'who', text: state.email }),
        el('label', { 'for': 'dbt-code', text: t('code') }), code,
        el('div', { 'class': 'row' }, [
          el('button', { 'class': 'btn', type: 'button', disabled: state.busy, text: t('login'), onclick: function () { verify(code.value.trim()); } }),
          el('button', { 'class': 'btn', type: 'button', disabled: state.busy, text: t('resend'), onclick: sendCode }),
          el('button', { 'class': 'btn', type: 'button', text: t('changeEmail'), onclick: function () { state.step = 'email'; setMsg(''); render(); } })
        ]));
    }
    return kids;
  }

  function renderPost() {
    var d = state.draft;
    function counter(id, max) { return el('div', { 'class': 'count', id: id + '-n', text: '0/' + max }); }
    function radio(side) {
      return el('label', null, [el('input', { type: 'radio', name: 'dbt-side', value: side, checked: d.side === side,
        onchange: function () { d.side = side; } }), sideLabel(side)]);
    }
    var claim = el('textarea', { id: 'dbt-claim', maxlength: '300', rows: '2', oninput: function () { d.claim = claim.value; upd(); } });
    var ev = el('textarea', { id: 'dbt-ev', maxlength: '2000', rows: '4', oninput: function () { d.evidence = ev.value; upd(); } });
    claim.value = d.claim; ev.value = d.evidence;
    var c1 = counter('dbt-claim', 300), c2 = counter('dbt-ev', 2000);
    function upd() { c1.textContent = claim.value.length + '/300'; c2.textContent = ev.value.length + '/2000'; }
    upd();
    return [
      el('p', { 'class': 'who' }, [t('signedAs') + (state.auth.email || state.auth.name),
        el('button', { type: 'button', text: t('logout'), onclick: function () { saveAuth(null); setMsg(''); render(); } }),
        el('button', { type: 'button', text: t('deleteMe'), onclick: deleteMe })]),
      el('h4', { text: t('postTitle') }),
      el('label', { text: t('side') }), el('div', { 'class': 'radio' }, [radio('pro'), radio('con')]),
      el('label', { 'for': 'dbt-claim', text: t('claim') }), claim, c1,
      el('label', { 'for': 'dbt-ev', text: t('evidenceLabel') }), ev, c2,
      el('div', { 'class': 'row' }, [el('button', { 'class': 'btn', type: 'button', disabled: state.busy, text: t('submit'), onclick: submit })])
    ];
  }

  function render() {
    root.textContent = '';
    if (state.status === 'loading') { root.appendChild(el('div', { 'class': 'card empty' }, [el('p', { text: t('loading') })])); return; }
    if (state.status === 'offline') {
      root.appendChild(el('div', { 'class': 'card empty' }, [
        el('p', { text: t('offline') }),
        el('div', { 'class': 'row', style: 'margin-top:14px' }, [el('button', { 'class': 'btn', type: 'button', text: t('retry'),
          onclick: function () { state.status = 'loading'; render(); loadTopics().then(render); } })])
      ]));
      return;
    }
    if (state.status === 'empty') { root.appendChild(el('div', { 'class': 'card empty' }, [el('p', { text: t('noTopic') })])); return; }

    if (state.topics.length > 1) {
      root.appendChild(el('div', { 'class': 'days' }, state.topics.map(function (tp) {
        return el('button', { type: 'button', 'aria-pressed': tp.id === state.topic.id ? 'true' : 'false', text: tp.date,
          onclick: function () { state.topic = tp; loadArgs().then(render); } });
      })));
    }
    var tp = state.topic;
    root.appendChild(el('div', { 'class': 'card debate-topic' }, [
      el('p', { 'class': 'kicker', text: t('daily') + ' · ' + tp.date }),
      el('h3', { text: tp.title }),
      tp.background ? el('p', { 'class': 'bg', text: tp.background }) : null
    ]));
    root.appendChild(el('div', { 'class': 'sides' }, [renderSide('pro'), renderSide('con')]));

    var box = el('div', { 'class': 'card compose' }, state.auth ? renderPost() : renderLogin());
    if (state.msg) box.appendChild(el('p', { 'class': 'msg' + (state.msgErr ? ' err' : ''), text: state.msg }));
    box.appendChild(el('p', { 'class': 'fine', text: t('fine') }));
    root.appendChild(box);
  }

  function busy(on) { state.busy = on; render(); }

  function sendCode() {
    if (!state.email) { setMsg(errText('invalid_email'), true); render(); return; }
    busy(true);
    api('/api/debate/send-code', { method: 'POST', body: { email: state.email } })
      .then(function () { state.step = 'code'; setMsg(t('sent')); })
      .catch(function (e) { setMsg(errText(e.code), true); })
      .then(function () { busy(false); });
  }

  function verify(code) {
    busy(true);
    api('/api/debate/verify-code', { method: 'POST', body: { email: state.email, code: code } })
      .then(function (d) {
        saveAuth({ token: d.token, id: d.record.id, name: d.record.name, email: d.record.email });
        state.step = 'email'; setMsg('');
      })
      .catch(function (e) { setMsg(errText(e.code), true); })
      .then(function () { busy(false); });
  }

  function submit() {
    var d = state.draft;
    if (!d.claim.trim() || !d.evidence.trim()) { setMsg(errText('need_text'), true); render(); return; }
    busy(true);
    api('/api/collections/arguments/records', { method: 'POST', auth: true,
      body: { topic: state.topic.id, side: d.side, claim: d.claim.trim(), evidence: d.evidence.trim() } })
      .then(function () { state.draft = { side: d.side, claim: '', evidence: '' }; setMsg(t('posted')); return loadArgs(); })
      .catch(function (e) { if (e.code === 'auth') saveAuth(null); setMsg(errText(e.code), true); })
      .then(function () { busy(false); });
  }

  function delArg(id) {
    if (!confirm(t('delConfirm'))) return;
    api('/api/collections/arguments/records/' + encodeURIComponent(id), { method: 'DELETE', auth: true })
      .then(loadArgs)
      .catch(function (e) { if (e.code === 'auth') saveAuth(null); setMsg(errText(e.code), true); })
      .then(render);
  }

  function deleteMe() {
    if (!confirm(t('deleteMeConfirm'))) return;
    api('/api/debate/delete-me', { method: 'POST', auth: true })
      .then(function () { saveAuth(null); setMsg(''); return loadArgs(); })
      .catch(function (e) { setMsg(errText(e.code), true); })
      .then(render);
  }

  // 切换语言时重绘（静态文案靠 .t-zh/.t-en，动态文案靠这里）
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });

  render();
  refreshAuth().then(loadTopics).then(render);
})();
