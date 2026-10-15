(function(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { commands: [], games: [], category: 'all', mediaInfo: null };

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function setText(id, value){ const el = $(id); if(el) el.textContent = value; }
  function fmtUptime(seconds){
    const s = Math.max(0, Number(seconds) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  }
  function fmtBytes(bytes){
    const n = Math.max(0, Number(bytes) || 0);
    if(n < 1024) return `${n} B`;
    if(n < 1024**2) return `${(n/1024).toFixed(0)} KB`;
    if(n < 1024**3) return `${(n/1024**2).toFixed(0)} MB`;
    return `${(n/1024**3).toFixed(2)} GB`;
  }
  function setWidth(id, pct){ const el=$(id); if(el) el.style.width = `${Math.max(0, Math.min(100, Number(pct)||0))}%`; }

  function setHealth(healthy){
    const badge = $('liveBadge');
    const ring = $('statusRing');
    if(!badge || !ring) return;
    badge.querySelector('span').textContent = healthy ? 'ONLINE' : 'DEGRADED';
    badge.style.borderColor = healthy ? 'rgba(248,249,250,.32)' : 'rgba(173,181,189,.22)';
    const core = ring.querySelector('span');
    core.style.background = healthy ? 'var(--bright-snow)' : 'var(--slate-grey)';
    core.style.boxShadow = healthy ? '0 0 38px rgba(248,249,250,.45)' : '0 0 28px rgba(173,181,189,.25)';
  }

  function renderCategories(){
    const rail = $('categoryRail');
    if(!rail) return;
    const cats = ['all', ...Array.from(new Set(state.commands.map(c => String(c.category || 'misc').toLowerCase()))).sort()];
    rail.innerHTML = cats.map(cat => `<button type="button" class="category-btn ${cat===state.category?'active':''}" data-cat="${esc(cat)}">${esc(cat==='all'?'ALL':cat.toUpperCase())}</button>`).join('');
  }

  function renderCommands(){
    const grid = $('commandGrid');
    const empty = $('commandEmpty');
    if(!grid || !empty) return;
    const q = String($('commandSearch')?.value || '').trim().toLowerCase();
    const list = state.commands.filter(c => {
      const cat = String(c.category || 'misc').toLowerCase();
      if(state.category !== 'all' && cat !== state.category) return false;
      return !q || `${c.command} ${(c.aliases||[]).join(' ')} ${cat}`.toLowerCase().includes(q);
    });
    setText('commandCount', `${list.length} PUBLIC`);
    grid.innerHTML = list.slice(0, 500).map(c => {
      const aliases = Array.isArray(c.aliases) ? c.aliases.slice(0,3).map(a => `-${a}`).join(', ') : '';
      return `<article class="command-card"><strong>-${esc(c.command)}</strong><small>${esc(c.category||'misc')}${aliases ? ` • ${esc(aliases)}`:''}</small></article>`;
    }).join('');
    empty.classList.toggle('hidden', list.length !== 0);
    renderCategories();
  }

  function renderPlatforms(){
    const host = $('platforms');
    if(!host) return;
    const names = ['TikTok','YouTube','Instagram','Facebook','X / Twitter','Pinterest','Reddit','Snapchat','Vimeo','Dailymotion','Bilibili','Twitch'];
    host.innerHTML = names.map(n => `<span class="platform-tag">${esc(n)}</span>`).join('');
  }

  async function fetchJSON(url, options){
    const res = await fetch(url, Object.assign({ cache: 'no-store' }, options || {}));
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function loadStatus(){
    const data = await fetchJSON('/api/status');
    const healthy = data.health === 'ok';
    setHealth(healthy);
    setText('waStatus', String(data.whatsapp?.status || 'unknown').toUpperCase());
    setText('consoleHealth', healthy ? 'All public services responding.' : 'One or more services need attention.');
    setText('uptime', fmtUptime(data.uptime));
    setText('memory', data.memory?.rss ? fmtBytes(data.memory.rss) : '—');
    setText('commands', data.commands?.total ?? '—');
    setText('disk', data.disk?.percent != null ? `${data.disk.percent}%` : '—');
    setText('heroVersion', data.version ? `v${data.version}` : 'ABIX');
    setText('heroUrl', data.publicUrl || data.directUrl || 'Web endpoint');
    setText('footerVersion', data.version ? `v${data.version}` : 'ABIX');
    setText('host', data.host || '0.0.0.0');
    setText('port', data.port || '—');
    setText('domain', data.katabump?.domain || 'Not configured');
    setText('svcWa', String(data.whatsapp?.status || 'unknown').toUpperCase());
    setText('svcGemini', data.gemini?.configured ? 'READY' : 'NOT CONFIGURED');
    setText('svcStorage', data.storage?.backend || 'LOCAL');
    setText('svcWeb', 'ONLINE');
    setText('healthChip', healthy ? 'HEALTHY' : 'DEGRADED');
    setText('katabumpState', data.katabump?.domain ? 'DOMAIN SET' : 'PORT ONLY');
    setText('diskText', data.disk?.percent != null ? `${data.disk.percent}% used` : 'unknown');
    setText('memoryText', data.memory?.rss ? fmtBytes(data.memory.rss) : 'unknown');
    setWidth('diskBar', data.disk?.percent ?? 0);
    const rss = Number(data.memory?.rss || 0) / (1024*1024);
    const memWarn = Number(data.memoryWarnMb || 512);
    setWidth('memoryBar', memWarn ? Math.min(100, (rss/memWarn)*100) : 0);
    const publicUrl = data.katabump?.publicUrl || data.publicUrl || '';
    const directUrl = data.directUrl || '';
    const p = $('publicUrl'), d = $('directUrl');
    if(p){p.textContent = publicUrl || 'Not configured'; p.href = publicUrl || '#';}
    if(d){d.textContent = directUrl || 'Unavailable'; d.href = directUrl || '#';}
    $('dnsNote')?.classList.toggle('hidden', Boolean(data.katabump?.domain));
    try{
      const cmdData = await fetchJSON('/api/commands');
      state.commands = Array.isArray(cmdData.commands) ? cmdData.commands : [];
      renderCommands();
    }catch(err){ console.error(err); }
  }

  function renderMediaInfo(data){
    state.mediaInfo = data;
    $('mediaResult')?.classList.remove('hidden');
    setText('mediaPlatform', String(data.platform || data.extractor || 'MEDIA').toUpperCase());
    setText('mediaTitle', data.title || 'Untitled media');
    setText('mediaMeta', [data.uploader, data.durationText, data.ext].filter(Boolean).join(' • ') || 'Public media');
    const thumb = $('mediaThumb');
    if(thumb){
      if(data.thumbnail){ thumb.src = data.thumbnail; thumb.style.visibility = 'visible'; }
      else { thumb.removeAttribute('src'); thumb.style.visibility = 'hidden'; }
    }
    const formats = Array.isArray(data.formats) ? data.formats.slice(0,8) : [];
    const wrap = $('mediaFormats');
    if(wrap) wrap.innerHTML = formats.map(f => `<span class="format-item">${esc(f.label || 'Format')}</span>`).join('');
    const btn = $('downloadBtn'); if(btn) btn.disabled = false;
  }

  async function inspectMedia(){
    const url = String($('mediaUrl')?.value || '').trim();
    const status = $('mediaStatus');
    if(!url){ status.textContent = 'Enter a public media URL first.'; return; }
    if(!/^https:\/\//i.test(url)){ status.textContent = 'Only HTTPS public URLs are accepted.'; return; }
    $('inspectBtn').disabled = true;
    if($('downloadBtn')) $('downloadBtn').disabled = true;
    status.textContent = 'Resolving media metadata…';
    try{
      const data = await fetchJSON('/api/media/info', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url})});
      renderMediaInfo(data);
      status.textContent = 'Media found. Choose quality and download.';
    }catch(err){
      $('mediaResult')?.classList.add('hidden');
      status.textContent = `❌ ${err.message}`;
    }finally{ $('inspectBtn').disabled = false; }
  }

  async function downloadMedia(){
    const url = String($('mediaUrl')?.value || '').trim();
    if(!url) return;
    const quality = String($('mediaQuality')?.value || 'best');
    const status = $('mediaStatus');
    const wrap = $('downloadProgressWrap');
    wrap?.classList.remove('hidden');
    $('downloadBtn').disabled = true;
    status.textContent = 'Starting download…';
    setWidth('downloadProgressBar', 12); setText('downloadProgressPct','12%'); setText('downloadProgressLabel','Starting…');
    try{
      const job = await fetchJSON('/api/media/download', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,quality})});
      let done = false;
      while(!done){
        const data = await fetchJSON(`/api/media/jobs/${encodeURIComponent(job.jobId)}`);
        const p = Number(data.progress ?? 50);
        setWidth('downloadProgressBar', p); setText('downloadProgressPct', `${Math.round(p)}%`); setText('downloadProgressLabel', data.message || 'Downloading…');
        if(data.status === 'ready'){
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'btn btn-light';
          link.textContent = 'Download File →';
          status.replaceChildren(document.createTextNode('✅ Download ready. '), link);
          setWidth('downloadProgressBar',100); setText('downloadProgressPct','100%'); setText('downloadProgressLabel','Ready');
          done = true;
        }else if(data.status === 'error'){
          throw new Error(data.error || 'Download failed');
        }else{
          await new Promise(r => setTimeout(r, 900));
        }
      }
    }catch(err){
      status.textContent = `❌ ${err.message}`;
      setText('downloadProgressLabel','Failed');
      setWidth('downloadProgressBar',0); setText('downloadProgressPct','0%');
    }finally{
      $('downloadBtn').disabled = false;
      setTimeout(() => wrap?.classList.add('hidden'), 1200);
    }
  }

  function tickClock(){
    setText('consoleTime', new Date().toLocaleTimeString([], {hour12:false}));
  }

  function initNav(){
    const nav=$('nav'), toggle=$('navToggle'), menu=$('navMenu');
    window.addEventListener('scroll', () => {
      nav?.classList.toggle('scrolled', window.scrollY > 12);
      const doc=document.documentElement;
      const max=Math.max(1, doc.scrollHeight-doc.clientHeight);
      const pct=(window.scrollY/max)*100;
      $('scrollProgress')?.style.setProperty('width', `${pct}%`);
    }, {passive:true});
    toggle?.addEventListener('click', () => { const open=menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
    menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.classList.remove('open')));
  }

  function initReveal(){
    const obs = new IntersectionObserver(entries => entries.forEach(e => {if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}}), {threshold:.08});
    document.querySelectorAll('.reveal').forEach((el,i)=>{el.style.transitionDelay=`${Math.min(i*60,360)}ms`;obs.observe(el);});
  }

  function init(){
    renderPlatforms(); initNav(); initReveal(); tickClock(); setInterval(tickClock,1000);
    $('refreshBtn')?.addEventListener('click', () => loadStatus().catch(console.error));
    $('commandSearch')?.addEventListener('input', renderCommands);
    $('categoryRail')?.addEventListener('click', e => { const b=e.target.closest('[data-cat]'); if(!b)return; state.category=b.dataset.cat; renderCommands(); });
    $('inspectBtn')?.addEventListener('click', inspectMedia);
    $('downloadBtn')?.addEventListener('click', downloadMedia);
    $('mediaUrl')?.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inspectMedia();} });
    loadStatus().catch(err => { setHealth(false); setText('waStatus','UNAVAILABLE'); setText('consoleHealth','Web API unavailable.'); setText('healthChip','OFFLINE'); console.error(err); });
    setInterval(() => loadStatus().catch(console.error), 15000);
  }
  init();
})();
