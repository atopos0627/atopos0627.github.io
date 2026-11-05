// 辩题分享海报：在浏览器里用 canvas 画一张竖版图（1080×1440），带二维码直达 https://ontic.top/#think/<日期>。
// 由 debate.js 在点“生成分享海报”时按需加载；二维码库在 /assets/vendor/（qrcode-generator 1.4.4，MIT）。
// 结果显示成 <img>：微信里长按保存（微信内置浏览器不支持下载），电脑上点“下载”。
(function () {
  var W = 1080, H = 1440, PAD = 88;
  var C = { bg: '#f5f4ed', band: '#22201c', bandInk: '#f2efe6', strong: '#24292f', soft: '#4a4e55', muted: '#7d786e',
    line: '#e7e3d8', pro: '#2f6f4f', proBg: '#eef5f0', con: '#9a3b2e', conBg: '#f8efec', card: '#ffffff' };
  var FONT = '"LXGW WenKai Screen","TsangerJinKai02",STKaiti,KaiTi,"PingFang SC","Helvetica Neue",Arial,sans-serif';
  var TX = {
    zh: { daily: '辩论日报', pro: '正方', con: '反方', scan: '扫码，写下你的观点和依据', site: 'ontic.top · What You Think',
      title: '分享海报', hint: '长按图片保存后发朋友圈；电脑上点“下载”。', dl: '下载', close: '关闭', fail: '海报生成失败，请稍后再试。' },
    en: { daily: 'Daily debate', pro: 'For', con: 'Against', scan: 'Scan to share your view and grounds', site: 'ontic.top · What You Think',
      title: 'Share poster', hint: 'Long-press the image to save it, or click Download.', dl: 'Download', close: 'Close', fail: "Couldn't create the poster. Try again later." }
  };

  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = '/assets/vendor/qrcode-generator-1.4.4.js';
      s.onload = function () { window.qrcode ? ok(window.qrcode) : bad(new Error('qrcode')); };
      s.onerror = bad;
      document.head.appendChild(s);
    });
  }

  // 正文字体按 unicode-range 分片加载，只拉海报上用到的字；最多等 3 秒，超时就用系统楷体
  function loadFont(text) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var p = Promise.all([document.fonts.load('48px "LXGW WenKai Screen"', text),
      document.fonts.load('bold 48px "LXGW WenKai Screen"', text)]).catch(function () {});
    return Promise.race([p, new Promise(function (r) { setTimeout(r, 3000); })]);
  }

  // 按宽度折行：中文逐字断，英文尽量按词断；超出 maxLines 时末行加省略号
  function wrap(ctx, text, width, maxLines) {
    var tokens = String(text || '').replace(/\s+/g, ' ').trim().match(/[A-Za-z0-9’'.,:;!?%()\-]+ ?|./g) || [];
    var lines = [], cur = '';
    for (var i = 0; i < tokens.length; i++) {
      var next = cur + tokens[i];
      if (ctx.measureText(next.trimEnd ? next.trimEnd() : next).width > width && cur) {
        lines.push(cur.replace(/ $/, ''));
        cur = tokens[i].replace(/^ /, '');
      } else cur = next;
    }
    if (cur) lines.push(cur.replace(/ $/, ''));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(tp, L, qrcode) {
    var t = TX[L];
    var url = 'https://ontic.top/#think/' + tp.date;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.textBaseline = 'top';

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    // 顶部深色条
    ctx.fillStyle = C.band; ctx.fillRect(0, 0, W, 200);
    ctx.fillStyle = C.bandInk;
    ctx.font = 'bold 52px ' + FONT; ctx.fillText(t.daily, PAD, 58);
    ctx.font = '34px ' + FONT; ctx.globalAlpha = .75; ctx.fillText(tp.date, PAD, 128); ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.font = '32px ' + FONT; ctx.fillText('happymaxszdeng', W - PAD, 72); ctx.textAlign = 'left';

    var inner = W - PAD * 2, top = 270;
    var gap = 32, bw = (inner - gap) / 2, bh = 200;
    var qrBox = 280, by = H - PAD - qrBox, limit = by - 56 - 48;   // 正反方框的底边不能超过 limit

    // 先折行算高度，再在顶栏和分隔线之间垂直居中
    ctx.font = 'bold 68px ' + FONT;
    var titleLines = wrap(ctx, tp.title, inner, 3);
    var used = titleLines.length * 96 + 18, bgLines = [];
    if (tp.background) {
      ctx.font = '36px ' + FONT;
      var room = Math.max(1, Math.min(6, Math.floor((limit - bh - 30 - top - used) / 58)));
      bgLines = wrap(ctx, tp.background, inner, room);
      used += bgLines.length * 58 + 30;
    }
    var y = top + Math.max(0, Math.floor((limit - top - used - bh) / 2));

    ctx.fillStyle = C.strong; ctx.font = 'bold 68px ' + FONT;
    titleLines.forEach(function (ln) { ctx.fillText(ln, PAD, y); y += 96; });
    y += 18;
    if (bgLines.length) {
      ctx.fillStyle = C.soft; ctx.font = '36px ' + FONT;
      bgLines.forEach(function (ln) { ctx.fillText(ln, PAD, y); y += 58; });
      y += 30;
    }

    // 正反方
    [['pro', t.pro, tp.pro_label, C.pro, C.proBg], ['con', t.con, tp.con_label, C.con, C.conBg]].forEach(function (s, i) {
      var x = PAD + i * (bw + gap);
      ctx.fillStyle = s[4]; roundRect(ctx, x, y, bw, bh, 18); ctx.fill();
      ctx.fillStyle = s[3]; ctx.fillRect(x, y + 18, 8, bh - 36);
      ctx.font = 'bold 40px ' + FONT; ctx.fillText(s[1], x + 40, y + 32);
      ctx.font = '32px ' + FONT;
      wrap(ctx, s[2] || '', bw - 72, 2).forEach(function (ln, k) { ctx.fillText(ln, x + 40, y + 96 + k * 46); });
    });

    // 底部：二维码 + 说明
    ctx.fillStyle = C.line; ctx.fillRect(PAD, by - 56, inner, 2);
    var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    var n = qr.getModuleCount(), quiet = 16, cell = Math.floor((qrBox - quiet * 2) / n), size = cell * n;
    var qx = W - PAD - qrBox, off = Math.floor((qrBox - size) / 2);
    ctx.fillStyle = C.card; roundRect(ctx, qx, by, qrBox, qrBox, 16); ctx.fill();
    ctx.fillStyle = C.strong;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect(qx + off + c * cell, by + off + r * cell, cell, cell);

    var tw = inner - qrBox - 48;
    ctx.fillStyle = C.strong; ctx.font = 'bold 44px ' + FONT;
    var ly = by + 54;
    wrap(ctx, t.scan, tw, 2).forEach(function (ln) { ctx.fillText(ln, PAD, ly); ly += 64; });
    ctx.fillStyle = C.muted; ctx.font = '32px ' + FONT; ctx.fillText(t.site, PAD, ly + 24);

    return cv.toDataURL('image/png');
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function show(tp, L, onClose) {
    var t = TX[L];
    var body = el('div', { 'class': 'poster-body' }, [el('p', { 'class': 'fine', text: '…' })]);
    var ov;
    function close() { ov.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); }
    function esc(e) { if (e.key === 'Escape') close(); }
    ov = el('div', { 'class': 'poster-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': t.title,
      onclick: function (e) { if (e.target === ov) close(); } }, [
      el('div', { 'class': 'poster-box' }, [
        el('div', { 'class': 'poster-head' }, [el('strong', { text: t.title }),
          el('button', { type: 'button', 'class': 'btn', text: t.close, onclick: close })]),
        body
      ])
    ]);
    document.body.appendChild(ov);
    document.addEventListener('keydown', esc);

    var text = [tp.title, tp.background, tp.pro_label, tp.con_label, tp.date, t.daily, t.pro, t.con, t.scan, t.site, 'happymaxszdeng'].join('');
    Promise.all([loadQR(), loadFont(text)]).then(function (r) {
      var src = draw(tp, L, r[0]);
      body.textContent = '';
      body.appendChild(el('img', { src: src, alt: tp.title, 'class': 'poster-img' }));
      body.appendChild(el('p', { 'class': 'fine', text: t.hint }));
      body.appendChild(el('a', { 'class': 'btn', href: src, download: 'ontic-debate-' + tp.date + '.png', text: t.dl }));
    }).catch(function () {
      body.textContent = '';
      body.appendChild(el('p', { 'class': 'msg err', text: t.fail }));
    });
  }

  window.onticPoster = { show: show };
})();
