/* ══════════════════════════════════════════════
   LEAGUE TOURNAMENT — league.js
   Залежності: SUPA_URL, SUPA_KEY, accessToken,
   currentUser, userApproved, sbFetch(),
   openModal(), closeModal(), esc(), pad()
   ══════════════════════════════════════════════ */

// 30.05.2026 23:59 Kyiv (UTC+3) = 20:59:00 UTC
const LEAGUE_REG_END     = new Date('2026-05-30T20:59:00Z');
const LEAGUE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PTS_WIN = 3, PTS_DRAW = 1;

let leaguePlayers    = [];
let leagueMatches    = [];
let leagueStartedAt  = null;
let lgPollingStarted = false;
let editingMatchId   = null;

/* ═══════════ STATUS ═══════════ */
function getLeagueStatus(){
  const now = Date.now();
  if(leagueStartedAt){
    return (now - new Date(leagueStartedAt).getTime() >= LEAGUE_DURATION_MS) ? 'done' : 'active';
  }
  return (now > LEAGUE_REG_END.getTime()) ? 'reg_closed' : 'reg';
}

/* ═══════════ TIMER ═══════════ */
function _timerTick(){
  const now    = Date.now();
  const status = getLeagueStatus();

  // ── ГОЛОВНА: відлік реєстрації ──
  const homeSegs = document.querySelectorAll('#homeLeagueCountdown .seg b');
  if(homeSegs.length === 4){
    const diff = LEAGUE_REG_END.getTime() - now;
    if(status === 'reg' && diff > 0){
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000)  / 60000);
      const s = Math.floor((diff % 60000)    / 1000);
      homeSegs[0].textContent = d;
      homeSegs[1].textContent = pad(h);
      homeSegs[2].textContent = pad(m);
      homeSegs[3].textContent = pad(s);
    } else {
      homeSegs.forEach(el => el.textContent = '—');
    }
  }

  // ── СТОРІНКА ЛІГИ: timer-slim ──
  const digitsEl = document.getElementById('leagueTimerDigits');
  const labelEl  = document.getElementById('leagueTimerLabel');
  const stageEl  = document.getElementById('leagueTimerStage');
  if(!digitsEl) return;

  let diff = 0;
  if(status === 'reg'){
    diff = LEAGUE_REG_END.getTime() - now;
    if(labelEl) labelEl.textContent = 'До кінця реєстрації';
    if(stageEl) stageEl.textContent = 'Набір заявок · до 30.05.2026 23:59 (Київ)';
  } else if(status === 'active'){
    const endMs = new Date(leagueStartedAt).getTime() + LEAGUE_DURATION_MS;
    diff = endMs - now;
    if(labelEl) labelEl.textContent = 'До завершення турніру';
    if(stageEl) stageEl.textContent = 'Турнір іде · 7 діб';
  } else {
    if(labelEl) labelEl.textContent = status === 'reg_closed' ? 'Реєстрація закрита' : 'Турнір завершено';
    if(stageEl) stageEl.textContent = '';
    digitsEl.textContent = '—';
    return;
  }

  if(diff > 0){
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const s = Math.floor((diff % 60000)    / 1000);
    const parts = [];
    if(d > 0) parts.push(`<span>${d}</span>дн`);
    parts.push(`<span>${pad(h)}</span>год`);
    parts.push(`<span>${pad(m)}</span>хв`);
    parts.push(`<span>${pad(s)}</span>сек`);
    digitsEl.innerHTML = parts.join(' ');
  } else {
    digitsEl.textContent = '—';
  }
}

/* ═══════════ STATUS UI ═══════════ */
function updateLeagueStatusUI(){
  const status = getLeagueStatus();

  const badge = document.getElementById('leagueStatusBadge');
  if(badge){
    badge.className = 'league-status-badge';
    if     (status === 'reg')        { badge.className += ' reg';    badge.textContent = '📋 НАБІР ЗАЯВОК'; }
    else if(status === 'reg_closed') { badge.className += ' reg';    badge.textContent = '🔒 ЗАЯВКИ ЗАКРИТО'; }
    else if(status === 'active')     { badge.className += ' active'; badge.textContent = '⚔ ТУРНІР ЙДЕ'; }
    else                             { badge.className += ' done';   badge.textContent = '✅ ТУРНІР ЗАВЕРШЕНО'; }
  }

  const applyArea = document.getElementById('leagueApplyArea');
  if(applyArea) applyArea.style.display = (status === 'reg') ? '' : 'none';

  const homeBadge = document.getElementById('homeLeagueBadge');
  if(homeBadge){
    if     (status === 'reg')    homeBadge.textContent = '📋 НАБІР ЗАЯВОК';
    else if(status === 'active') homeBadge.textContent = '⚔ ЙДЕ ТУРНІР';
    else                         homeBadge.textContent = '✅ ЗАВЕРШЕНО';
  }

  const homeTimerWrap = document.getElementById('homeLeagueTimerWrap');
  if(homeTimerWrap) homeTimerWrap.style.display = (status === 'reg') ? '' : 'none';
}

/* ═══════════ AUTH UI ═══════════ */
function updateLeagueAuthUI(){
  const canEdit = !!(currentUser && userApproved);
  const status  = getLeagueStatus();

  const adminCtrl = document.getElementById('leagueAdminControls');
  if(adminCtrl) adminCtrl.style.display = canEdit ? 'flex' : 'none';

  const startBtn = document.getElementById('leagueStartBtn');
  if(startBtn) startBtn.style.display = (canEdit && status === 'reg') ? '' : 'none';

  // Кнопка "Подивитись графік" — лише коли турнір стартував або адмін
  const viewBtn = document.querySelector('.league-schedule-view-btn');
  if(viewBtn) viewBtn.style.display = (status !== 'reg' || canEdit) ? '' : 'none';

  const schedNote = document.getElementById('scheduleAdminNote');
  if(schedNote) schedNote.style.display = canEdit ? 'block' : 'none';

  const delCol = document.getElementById('lgDelCol');
  if(delCol) delCol.style.display = canEdit ? '' : 'none';
}

/* ═══════════ SYNC DOT ═══════════ */
function setLeagueSyncStatus(state, text){
  const dot = document.getElementById('leagueSyncDot');
  const txt = document.getElementById('leagueSyncText');
  if(dot) dot.className = 'sync-dot ' + state;
  if(txt) txt.textContent = text;
}

/* ═══════════ LOAD DATA ═══════════ */
async function leagueLoadAll(){
  setLeagueSyncStatus('loading','Підключення...');
  try{
    const h = {'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY};
    const [pRes,mRes,sRes] = await Promise.all([
      fetch(SUPA_URL+'/rest/v1/league_players?select=*&order=created_at.asc',{headers:h}),
      fetch(SUPA_URL+'/rest/v1/league_matches?select=*&order=id.asc',{headers:h}),
      fetch(SUPA_URL+'/rest/v1/league_settings?key=eq.started_at&select=value',{headers:h})
    ]);
    leaguePlayers   = await pRes.json();
    leagueMatches   = await mRes.json();
    const sd        = await sRes.json();
    leagueStartedAt = (sd && sd[0]) ? sd[0].value : null;
    renderLeagueTable();
    updateLeagueStatusUI();
    updateLeagueAuthUI();
    setLeagueSyncStatus('ok','Синхронізовано');
    if(!lgPollingStarted){ lgPollingStarted=true; _startPolling(); }
  }catch(e){ setLeagueSyncStatus('err','Помилка з\'єднання'); }
}

function _startPolling(){
  setInterval(async()=>{
    const onL = document.getElementById('tournamentLeaguePage')?.classList.contains('active');
    const onS = document.getElementById('leagueSchedulePage')?.classList.contains('active');
    if(!onL && !onS) return;
    try{
      const h = {'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY};
      const [pRes,mRes,sRes] = await Promise.all([
        fetch(SUPA_URL+'/rest/v1/league_players?select=*&order=created_at.asc',{headers:h}),
        fetch(SUPA_URL+'/rest/v1/league_matches?select=*&order=id.asc',{headers:h}),
        fetch(SUPA_URL+'/rest/v1/league_settings?key=eq.started_at&select=value',{headers:h})
      ]);
      const np=await pRes.json(), nm=await mRes.json(), ns=await sRes.json();
      const nStart=(ns&&ns[0])?ns[0].value:null;
      if(JSON.stringify(np)!==JSON.stringify(leaguePlayers)||
         JSON.stringify(nm)!==JSON.stringify(leagueMatches)||
         nStart!==leagueStartedAt){
        leaguePlayers=np; leagueMatches=nm; leagueStartedAt=nStart;
        renderLeagueTable(); updateLeagueStatusUI(); updateLeagueAuthUI();
        if(onS) renderLeagueSchedule();
        setLeagueSyncStatus('ok','Оновлено');
      }
    }catch(e){}
  },5000);
}

/* ═══════════ ENTRY POINT ═══════════ */
function leagueInit(){
  updateLeagueAuthUI();
  updateLeagueStatusUI();
  leagueLoadAll();
}

/* ═══════════ STANDINGS ═══════════ */
function calcLeagueStandings(){
  const s={};
  leaguePlayers.forEach(p=>{ s[p.id]={id:p.id,nick:p.nick,played:0,wins:0,draws:0,losses:0,pts:0}; });
  leagueMatches.forEach(m=>{
    if(m.winner_id===null && !m.is_draw) return;
    const h=s[m.home_id], a=s[m.away_id];
    if(!h||!a) return;
    h.played++; a.played++;
    if(m.is_draw){ h.draws++; a.draws++; h.pts+=PTS_DRAW; a.pts+=PTS_DRAW; }
    else if(m.winner_id===m.home_id){ h.wins++; h.pts+=PTS_WIN; a.losses++; }
    else { a.wins++; a.pts+=PTS_WIN; h.losses++; }
  });
  return Object.values(s).sort((a,b)=>b.pts-a.pts||b.wins-a.wins||a.losses-b.losses);
}

/* ═══════════ RENDER TABLE ═══════════ */
function renderLeagueTable(){
  const tb=document.getElementById('leagueTbody'); if(!tb) return;
  const canEdit=!!(currentUser&&userApproved);
  const delCol=document.getElementById('lgDelCol');
  if(delCol) delCol.style.display=canEdit?'':'none';

  if(!leaguePlayers.length){
    tb.innerHTML=`<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted);font-style:italic">Поки немає учасників. Подай заявку!</td></tr>`;
    return;
  }
  const st=calcLeagueStandings();
  tb.innerHTML=st.map((p,i)=>{
    const rc=i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-n';
    const del=canEdit?`<td><button class="delete-btn" onclick="leagueDelPlayer(${p.id})">✕</button></td>`:'';
    return `<tr>
      <td><span class="rank-badge ${rc}">${i+1}</span></td>
      <td class="name-cell">${esc(p.nick)}</td>
      <td style="font-family:var(--f-mono);font-size:12px">${p.played}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--green)">${p.wins}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--accent)">${p.draws}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--red)">${p.losses}</td>
      <td><span class="score-total ${p.pts===0?'zero':''}">${p.pts}</span></td>
      ${del}
    </tr>`;
  }).join('');
}

/* ═══════════ APPLY MODAL ═══════════ */
function openLeagueApplyModal(){
  if(getLeagueStatus()!=='reg'){ alert('Набір заявок завершено.'); return; }
  document.getElementById('leagueApplyNick').value='';
  document.getElementById('leagueApplyError').textContent='';
  openModal('leagueApplyModal');
  setTimeout(()=>document.getElementById('leagueApplyNick').focus(),50);
}

async function confirmLeagueApply(){
  const nick=document.getElementById('leagueApplyNick').value.trim();
  const errEl=document.getElementById('leagueApplyError');
  if(!nick){ errEl.textContent='Введи нікнейм'; return; }
  if(leaguePlayers.some(p=>p.nick.toLowerCase()===nick.toLowerCase())){
    errEl.textContent='Такий нікнейм вже зареєстрований!'; return;
  }
  errEl.textContent='';
  try{
    const res=await fetch(SUPA_URL+'/rest/v1/league_players',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify({nick})
    });
    if(!res.ok) throw new Error(await res.text());
    const data=await res.json();
    if(Array.isArray(data)&&data[0]) leaguePlayers.push(data[0]);
    renderLeagueTable();
    closeModal('leagueApplyModal');
    setLeagueSyncStatus('ok','Заявку подано!');
  }catch(e){ errEl.textContent='Помилка: '+e.message; }
}

/* ═══════════ ADMIN: START ═══════════ */
async function leagueAdminStart(){
  if(!userApproved) return;
  if(!confirm('Розпочати турнір? Відлік 7 діб стартує зараз.')) return;
  if(leaguePlayers.length<2){ alert('Потрібно мінімум 2 учасники!'); return; }
  const nowISO=new Date().toISOString();
  try{
    await fetch(SUPA_URL+'/rest/v1/league_settings',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
      body:JSON.stringify({key:'started_at',value:nowISO})
    });
    await _generateMatches();
    leagueStartedAt=nowISO;
    updateLeagueStatusUI(); updateLeagueAuthUI(); renderLeagueTable();
    setLeagueSyncStatus('ok','Турнір розпочато!');
  }catch(e){ alert('Помилка: '+e.message); }
}

async function _generateMatches(){
  const ex=await sbFetch('/rest/v1/league_matches?select=id');
  if(ex.length>0) return;
  const matches=[];
  for(let i=0;i<leaguePlayers.length;i++)
    for(let j=0;j<leaguePlayers.length;j++){
      if(i===j) continue;
      matches.push({home_id:leaguePlayers[i].id,away_id:leaguePlayers[j].id,winner_id:null,is_draw:false,round_label:''});
    }
  if(matches.length) await sbFetch('/rest/v1/league_matches',{method:'POST',body:JSON.stringify(matches)});
  const r=await fetch(SUPA_URL+'/rest/v1/league_matches?select=*&order=id.asc',
    {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}});
  leagueMatches=await r.json();
}

/* ═══════════ ADMIN: DELETE ═══════════ */
async function leagueDelPlayer(id){
  if(!userApproved) return;
  const p=leaguePlayers.find(x=>x.id===id); if(!p) return;
  if(!confirm(`Видалити «${p.nick}»?`)) return;
  try{
    await sbFetch(`/rest/v1/league_players?id=eq.${id}`,{method:'DELETE'});
    leaguePlayers=leaguePlayers.filter(x=>x.id!==id);
    renderLeagueTable();
  }catch(e){ alert('Помилка: '+e.message); }
}

/* ═══════════ SCHEDULE ═══════════ */
function renderLeagueSchedule(){
  const container=document.getElementById('leagueScheduleContent'); if(!container) return;
  const canEdit=!!(currentUser&&userApproved);
  const sn=document.getElementById('scheduleAdminNote');
  if(sn) sn.style.display=canEdit?'block':'none';

  if(!leagueMatches.length){
    container.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted);font-style:italic">Графік з'явиться після старту турніру</div>`;
    return;
  }
  const pm={};
  leaguePlayers.forEach(p=>{pm[p.id]=p.nick;});
  const byHome={};
  leagueMatches.forEach(m=>{ if(!byHome[m.home_id]) byHome[m.home_id]=[]; byHome[m.home_id].push(m); });

  let html='';
  leaguePlayers.forEach(p=>{
    const ms=byHome[p.id]; if(!ms||!ms.length) return;
    html+=`<div class="schedule-round"><div class="schedule-round-title">🏠 Домашні бої — ${esc(p.nick)}</div>`;
    ms.forEach(m=>{
      const hn=pm[m.home_id]||'?', an=pm[m.away_id]||'?';
      const played=m.winner_id!==null||m.is_draw;
      let rb='',wb='';
      if(played){
        rb=m.is_draw?`<span class="match-result done">НЧ</span>`:`<span class="match-result done">✓</span>`;
        wb=m.is_draw?`<span class="match-winner-badge draw">Нічия</span>`:`<span class="match-winner-badge win">⚑ ${esc(pm[m.winner_id]||'?')}</span>`;
      } else { rb=`<span class="match-result pending">—</span>`; }
      const ec=canEdit?'editable-match':'', ca=canEdit?`onclick="openMatchResult(${m.id})"`:'' ;
      const eh=canEdit&&!played?`<span style="font-family:var(--f-mono);font-size:9px;color:var(--muted)">↑ клік</span>`:'';
      const ei=canEdit&&played?`<span style="font-family:var(--f-mono);font-size:9px;color:var(--border2);cursor:pointer" onclick="event.stopPropagation();openMatchResult(${m.id})">✏</span>`:'';
      html+=`<div class="match-row ${ec}" ${ca}>
        <span class="match-type-badge home-badge">ДОМ</span>
        <span class="match-team home">${esc(hn)}</span>
        <span class="match-vs">⚔</span>
        <span class="match-team away">${esc(an)}</span>
        <span class="match-type-badge away-badge">ГОСТ</span>
        ${rb}${wb}${eh}${ei}
      </div>`;
    });
    html+=`</div>`;
  });
  container.innerHTML=html;
}

/* ═══════════ MATCH MODAL ═══════════ */
function openMatchResult(matchId){
  if(!userApproved) return;
  const m=leagueMatches.find(x=>x.id===matchId); if(!m) return;
  editingMatchId=matchId;
  const pm={}; leaguePlayers.forEach(p=>{pm[p.id]=p.nick;});
  const hn=pm[m.home_id]||'?', an=pm[m.away_id]||'?';
  document.getElementById('matchResultTitle').textContent='Результат бою';
  document.getElementById('matchResultSub').textContent=`${hn} (Д) vs ${an} (Г)`;
  document.getElementById('matchResultOptions').innerHTML=`
    <button class="match-choice-btn" onclick="setMatchResult(${m.home_id},false)"><span class="choice-icon">🏠</span><span>Переміг <b>${esc(hn)}</b></span></button>
    <button class="match-choice-btn" onclick="setMatchResult(${m.away_id},false)"><span class="choice-icon">✈</span><span>Переміг <b>${esc(an)}</b></span></button>
    <button class="match-choice-btn" onclick="setMatchResult(null,true)"><span class="choice-icon">🤝</span><span>Нічия</span></button>
    <button class="match-choice-btn" onclick="resetMatchResult()" style="border-color:var(--border)"><span class="choice-icon">↩</span><span style="color:var(--muted)">Скинути результат</span></button>`;
  openModal('matchResultModal');
}

async function setMatchResult(winnerId,isDraw){
  if(editingMatchId===null) return;
  try{
    const body={winner_id:isDraw?null:winnerId,is_draw:isDraw};
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`,{method:'PATCH',body:JSON.stringify(body)});
    const m=leagueMatches.find(x=>x.id===editingMatchId);
    if(m){m.winner_id=body.winner_id;m.is_draw=isDraw;}
    closeModal('matchResultModal'); renderLeagueTable(); renderLeagueSchedule();
    setLeagueSyncStatus('ok','Збережено');
  }catch(e){ alert('Помилка: '+e.message); }
}

async function resetMatchResult(){
  if(editingMatchId===null) return;
  try{
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`,{method:'PATCH',body:JSON.stringify({winner_id:null,is_draw:false})});
    const m=leagueMatches.find(x=>x.id===editingMatchId);
    if(m){m.winner_id=null;m.is_draw=false;}
    closeModal('matchResultModal'); renderLeagueTable(); renderLeagueSchedule();
  }catch(e){ alert('Помилка: '+e.message); }
}

/* ═══════════ BOOTSTRAP ═══════════
   Запускається одразу при завантаженні файлу.
   DOM вже готовий (скрипт в кінці body).
═══════════════════════════════════ */
_timerTick();                    // перший рендер одразу
setInterval(_timerTick, 1000);   // оновлення кожну секунду
updateLeagueStatusUI();          // бейдж / домашній блок
