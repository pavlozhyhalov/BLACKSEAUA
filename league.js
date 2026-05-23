/* ══════════════════════════════════════════════
   LEAGUE TOURNAMENT — league.js
   Залежності з index.html: SUPA_URL, SUPA_KEY,
   accessToken, currentUser, userApproved,
   sbFetch(), openModal(), closeModal(), esc(), pad()
   ══════════════════════════════════════════════ */

// Deadline: 30.05.2026 23:59 Kyiv = UTC+3 → 20:59 UTC
const LEAGUE_REG_END     = new Date('2026-05-30T20:59:00Z');
const LEAGUE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 діб
const PTS_WIN = 3, PTS_DRAW = 1;

let leaguePlayers   = [];
let leagueMatches   = [];
let leagueStartedAt = null;
let lgPollingStarted = false;
let editingMatchId  = null;

/* ═══════════════ STATUS ═══════════════ */
function getLeagueStatus(){
  const now = new Date();
  if(leagueStartedAt){
    const ms = new Date(leagueStartedAt).getTime();
    return (now.getTime() - ms >= LEAGUE_DURATION_MS) ? 'done' : 'active';
  }
  return (now > LEAGUE_REG_END) ? 'reg_closed' : 'reg';
}

/* ═══════════════ TIMER ═══════════════ */
function _timerTick(){
  const status = getLeagueStatus();
  const now    = new Date();

  /* ── Сторінка турніру ── */
  const labelEl  = document.getElementById('leagueTimerLabel');
  const stageEl  = document.getElementById('leagueTimerStage');
  const digitsEl = document.getElementById('leagueTimerDigits');

  if(labelEl && stageEl && digitsEl){
    let diff = 0;
    if(status === 'reg'){
      diff = LEAGUE_REG_END - now;
      if(labelEl) labelEl.textContent = 'До кінця реєстрації';
      if(stageEl) stageEl.textContent = 'Набір заявок · до 30.05.2026 23:59 (Київ)';
    } else if(status === 'active'){
      const endMs = new Date(leagueStartedAt).getTime() + LEAGUE_DURATION_MS;
      diff = endMs - now.getTime();
      if(labelEl) labelEl.textContent = 'До завершення турніру';
      if(stageEl) stageEl.textContent = 'Турнір іде · 7 діб';
    } else {
      if(labelEl) labelEl.textContent = status === 'reg_closed' ? 'Реєстрація закрита' : 'Турнір завершено';
      if(stageEl) stageEl.textContent = '';
      if(digitsEl) digitsEl.textContent = '—';
      diff = 0;
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
      if(digitsEl) digitsEl.innerHTML = parts.join(' ');
    }
  }

  /* ── Головна сторінка ── */
  const homeSegs = document.querySelectorAll('#homeLeagueCountdown .seg b');
  if(homeSegs.length === 4){
    if(status === 'reg'){
      const diff2 = LEAGUE_REG_END - now;
      if(diff2 > 0){
        const d=Math.floor(diff2/86400000),
              h=Math.floor((diff2%86400000)/3600000),
              m=Math.floor((diff2%3600000)/60000),
              s=Math.floor((diff2%60000)/1000);
        homeSegs[0].textContent = d;
        homeSegs[1].textContent = pad(h);
        homeSegs[2].textContent = pad(m);
        homeSegs[3].textContent = pad(s);
      }
    } else {
      homeSegs.forEach(s => s.textContent = '—');
    }
  }
}

function _startLeagueTimer(){
  _timerTick();
  setInterval(_timerTick, 1000);
}

/* ═══════════════ STATUS UI ═══════════════ */
function updateLeagueStatusUI(){
  const status = getLeagueStatus();

  /* badge на сторінці турніру */
  const badge = document.getElementById('leagueStatusBadge');
  if(badge){
    badge.className = 'league-status-badge';
    if(status === 'reg'){
      badge.className += ' reg'; badge.textContent = '📋 НАБІР ЗАЯВОК';
    } else if(status === 'reg_closed'){
      badge.className += ' reg'; badge.textContent = '🔒 ЗАЯВКИ ЗАКРИТО';
    } else if(status === 'active'){
      badge.className += ' active'; badge.textContent = '⚔ ТУРНІР ЙДЕ';
    } else {
      badge.className += ' done'; badge.textContent = '✅ ТУРНІР ЗАВЕРШЕНО';
    }
  }

  /* кнопка подати заявку */
  const applyArea = document.getElementById('leagueApplyArea');
  if(applyArea) applyArea.style.display = (status === 'reg') ? '' : 'none';

  /* badge на головній */
  const homeBadge = document.getElementById('homeLeagueBadge');
  if(homeBadge){
    if(status === 'reg')         homeBadge.textContent = '📋 НАБІР ЗАЯВОК';
    else if(status === 'active') homeBadge.textContent = '⚔ ЙДЕ ТУРНІР';
    else                         homeBadge.textContent = '✅ ЗАВЕРШЕНО';
  }

  const homeTimerWrap = document.getElementById('homeLeagueTimerWrap');
  if(homeTimerWrap) homeTimerWrap.style.display = (status === 'reg') ? '' : 'none';
}

/* ═══════════════ AUTH UI ═══════════════ */
function updateLeagueAuthUI(){
  const canEdit  = currentUser && userApproved;
  const status   = getLeagueStatus();

  const adminCtrl = document.getElementById('leagueAdminControls');
  if(adminCtrl) adminCtrl.style.display = canEdit ? 'flex' : 'none';

  const startBtn = document.getElementById('leagueStartBtn');
  if(startBtn) startBtn.style.display = (canEdit && status === 'reg') ? '' : 'none';

  /* кнопка "Подивитись графік" — прибираємо для публіки якщо турнір не стартував */
  const viewSchedBtn = document.querySelector('.league-schedule-view-btn');
  if(viewSchedBtn) viewSchedBtn.style.display = (status !== 'reg' || canEdit) ? '' : 'none';

  const schedNote = document.getElementById('scheduleAdminNote');
  if(schedNote) schedNote.style.display = canEdit ? 'block' : 'none';

  const delCol = document.getElementById('lgDelCol');
  if(delCol) delCol.style.display = canEdit ? '' : 'none';
}

/* ═══════════════ SYNC STATUS ═══════════════ */
function setLeagueSyncStatus(state, text){
  const dot = document.getElementById('leagueSyncDot');
  const txt = document.getElementById('leagueSyncText');
  if(dot) dot.className = 'sync-dot ' + state;
  if(txt) txt.textContent = text;
}

/* ═══════════════ LOAD DATA ═══════════════ */
async function leagueLoadAll(){
  setLeagueSyncStatus('loading','Підключення...');
  try{
    const [pRes, mRes, sRes] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/league_players?select=*&order=created_at.asc`,
        {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}}),
      fetch(`${SUPA_URL}/rest/v1/league_matches?select=*&order=id.asc`,
        {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}}),
      fetch(`${SUPA_URL}/rest/v1/league_settings?key=eq.started_at&select=value`,
        {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}})
    ]);
    leaguePlayers   = await pRes.json();
    leagueMatches   = await mRes.json();
    const sData     = await sRes.json();
    leagueStartedAt = (sData && sData[0]) ? sData[0].value : null;
    renderLeagueTable();
    updateLeagueStatusUI();
    updateLeagueAuthUI();
    setLeagueSyncStatus('ok','Синхронізовано');
    if(!lgPollingStarted){ lgPollingStarted = true; _startLeaguePolling(); }
  }catch(e){
    setLeagueSyncStatus('err','Помилка з\'єднання');
  }
}

function _startLeaguePolling(){
  setInterval(async()=>{
    const onLeague   = document.getElementById('tournamentLeaguePage')?.classList.contains('active');
    const onSchedule = document.getElementById('leagueSchedulePage')?.classList.contains('active');
    if(!onLeague && !onSchedule) return;
    try{
      const [pRes, mRes, sRes] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/league_players?select=*&order=created_at.asc`,
          {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}}),
        fetch(`${SUPA_URL}/rest/v1/league_matches?select=*&order=id.asc`,
          {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}}),
        fetch(`${SUPA_URL}/rest/v1/league_settings?key=eq.started_at&select=value`,
          {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}})
      ]);
      const np     = await pRes.json();
      const nm     = await mRes.json();
      const ns     = await sRes.json();
      const nStart = (ns && ns[0]) ? ns[0].value : null;
      if(JSON.stringify(np) !== JSON.stringify(leaguePlayers) ||
         JSON.stringify(nm) !== JSON.stringify(leagueMatches) ||
         nStart !== leagueStartedAt){
        leaguePlayers = np; leagueMatches = nm; leagueStartedAt = nStart;
        renderLeagueTable();
        updateLeagueStatusUI();
        updateLeagueAuthUI();
        if(onSchedule) renderLeagueSchedule();
        setLeagueSyncStatus('ok','Оновлено');
      }
    }catch(e){}
  }, 5000);
}

/* ═══════════════ ENTRY POINTS ═══════════════ */
function leagueInit(){
  updateLeagueAuthUI();
  updateLeagueStatusUI();
  leagueLoadAll();
}

/* ═══════════════ STANDINGS ═══════════════ */
function calcLeagueStandings(){
  const s = {};
  leaguePlayers.forEach(p=>{
    s[p.id] = {id:p.id, nick:p.nick, played:0, wins:0, draws:0, losses:0, pts:0};
  });
  leagueMatches.forEach(m=>{
    if(m.winner_id === null && !m.is_draw) return;
    const h = s[m.home_id], a = s[m.away_id];
    if(!h || !a) return;
    h.played++; a.played++;
    if(m.is_draw){
      h.draws++; a.draws++; h.pts += PTS_DRAW; a.pts += PTS_DRAW;
    } else if(m.winner_id === m.home_id){
      h.wins++; h.pts += PTS_WIN; a.losses++;
    } else {
      a.wins++; a.pts += PTS_WIN; h.losses++;
    }
  });
  return Object.values(s).sort((a,b) => b.pts-a.pts || b.wins-a.wins || a.losses-b.losses);
}

/* ═══════════════ RENDER TABLE ═══════════════ */
function renderLeagueTable(){
  const tb      = document.getElementById('leagueTbody');
  if(!tb) return;
  const canEdit = currentUser && userApproved;
  const delCol  = document.getElementById('lgDelCol');
  if(delCol) delCol.style.display = canEdit ? '' : 'none';

  if(!leaguePlayers.length){
    tb.innerHTML = `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted);font-style:italic">Поки немає учасників. Подай заявку!</td></tr>`;
    return;
  }
  const standings = calcLeagueStandings();
  tb.innerHTML = standings.map((p, i) => {
    const rc      = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-n';
    const delCell = canEdit ? `<td><button class="delete-btn" onclick="leagueDelPlayer(${p.id})">✕</button></td>` : '';
    return `<tr>
      <td><span class="rank-badge ${rc}">${i+1}</span></td>
      <td class="name-cell">${esc(p.nick)}</td>
      <td style="font-family:var(--f-mono);font-size:12px">${p.played}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--green)">${p.wins}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--accent)">${p.draws}</td>
      <td style="font-family:var(--f-mono);font-size:12px;color:var(--red)">${p.losses}</td>
      <td><span class="score-total ${p.pts===0?'zero':''}">${p.pts}</span></td>
      ${delCell}
    </tr>`;
  }).join('');
}

/* ═══════════════ APPLY MODAL (PUBLIC) ═══════════════ */
function openLeagueApplyModal(){
  if(getLeagueStatus() !== 'reg'){ alert('Набір заявок завершено.'); return; }
  document.getElementById('leagueApplyNick').value = '';
  document.getElementById('leagueApplyError').textContent = '';
  openModal('leagueApplyModal');
  setTimeout(()=>document.getElementById('leagueApplyNick').focus(), 50);
}

async function confirmLeagueApply(){
  const nick  = document.getElementById('leagueApplyNick').value.trim();
  const errEl = document.getElementById('leagueApplyError');
  if(!nick){ errEl.textContent = 'Введи нікнейм'; return; }
  if(leaguePlayers.some(p => p.nick.toLowerCase() === nick.toLowerCase())){
    errEl.textContent = 'Такий нікнейм вже зареєстрований!'; return;
  }
  errEl.textContent = '';
  try{
    const res = await fetch(`${SUPA_URL}/rest/v1/league_players`, {
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},
      body: JSON.stringify({nick})
    });
    if(!res.ok){ throw new Error(await res.text()); }
    const data = await res.json();
    if(Array.isArray(data) && data[0]) leaguePlayers.push(data[0]);
    renderLeagueTable();
    closeModal('leagueApplyModal');
    setLeagueSyncStatus('ok','Заявку подано!');
  }catch(e){ errEl.textContent = 'Помилка: ' + e.message; }
}

/* ═══════════════ ADMIN: START ═══════════════ */
async function leagueAdminStart(){
  if(!userApproved) return;
  if(!confirm('Розпочати турнір? Відлік 7 діб стартує зараз.')) return;
  if(leaguePlayers.length < 2){ alert('Потрібно мінімум 2 учасники!'); return; }
  const nowISO = new Date().toISOString();
  try{
    await fetch(`${SUPA_URL}/rest/v1/league_settings`, {
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
      body: JSON.stringify({key:'started_at', value: nowISO})
    });
    await _generateLeagueMatches();
    leagueStartedAt = nowISO;
    updateLeagueStatusUI();
    updateLeagueAuthUI();
    renderLeagueTable();
    setLeagueSyncStatus('ok','Турнір розпочато!');
  }catch(e){ alert('Помилка: ' + e.message); }
}

async function _generateLeagueMatches(){
  const existing = await sbFetch('/rest/v1/league_matches?select=id');
  if(existing.length > 0) return;
  const matches = [];
  for(let i=0; i<leaguePlayers.length; i++){
    for(let j=0; j<leaguePlayers.length; j++){
      if(i===j) continue;
      matches.push({home_id:leaguePlayers[i].id, away_id:leaguePlayers[j].id, winner_id:null, is_draw:false, round_label:''});
    }
  }
  if(matches.length) await sbFetch('/rest/v1/league_matches', {method:'POST', body:JSON.stringify(matches)});
  const mRes = await fetch(`${SUPA_URL}/rest/v1/league_matches?select=*&order=id.asc`,
    {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}});
  leagueMatches = await mRes.json();
}

/* ═══════════════ ADMIN: DELETE PLAYER ═══════════════ */
async function leagueDelPlayer(id){
  if(!userApproved) return;
  const p = leaguePlayers.find(x=>x.id===id); if(!p) return;
  if(!confirm(`Видалити «${p.nick}»?`)) return;
  try{
    await sbFetch(`/rest/v1/league_players?id=eq.${id}`, {method:'DELETE'});
    leaguePlayers = leaguePlayers.filter(x=>x.id!==id);
    renderLeagueTable();
  }catch(e){ alert('Помилка: '+e.message); }
}

/* ═══════════════ SCHEDULE RENDER ═══════════════ */
function renderLeagueSchedule(){
  const container = document.getElementById('leagueScheduleContent');
  if(!container) return;
  const canEdit   = currentUser && userApproved;
  const schedNote = document.getElementById('scheduleAdminNote');
  if(schedNote) schedNote.style.display = canEdit ? 'block' : 'none';

  if(!leagueMatches.length){
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-style:italic">Графік з'явиться після старту турніру</div>`;
    return;
  }

  const playerMap = {};
  leaguePlayers.forEach(p => { playerMap[p.id] = p.nick; });

  const byHome = {};
  leagueMatches.forEach(m => {
    if(!byHome[m.home_id]) byHome[m.home_id] = [];
    byHome[m.home_id].push(m);
  });

  let html = '';
  leaguePlayers.forEach(p => {
    const matches = byHome[p.id];
    if(!matches || !matches.length) return;
    html += `<div class="schedule-round"><div class="schedule-round-title">🏠 Домашні бої — ${esc(p.nick)}</div>`;
    matches.forEach(m => {
      const homeNick = playerMap[m.home_id] || '?';
      const awayNick = playerMap[m.away_id] || '?';
      const played   = m.winner_id !== null || m.is_draw;
      let resultBadge = '', winnerBadge = '';
      if(played){
        if(m.is_draw){
          resultBadge = `<span class="match-result done">НЧ</span>`;
          winnerBadge = `<span class="match-winner-badge draw">Нічия</span>`;
        } else {
          resultBadge = `<span class="match-result done">✓</span>`;
          winnerBadge = `<span class="match-winner-badge win">⚑ ${esc(playerMap[m.winner_id]||'?')}</span>`;
        }
      } else {
        resultBadge = `<span class="match-result pending">—</span>`;
      }
      const editClass = canEdit ? 'editable-match' : '';
      const clickAttr = canEdit ? `onclick="openMatchResult(${m.id})"` : '';
      const editHint  = canEdit && !played ? `<span style="font-family:var(--f-mono);font-size:9px;color:var(--muted)">↑ клік</span>` : '';
      const editIcon  = canEdit && played  ? `<span style="font-family:var(--f-mono);font-size:9px;color:var(--border2);cursor:pointer" onclick="event.stopPropagation();openMatchResult(${m.id})">✏</span>` : '';
      html += `<div class="match-row ${editClass}" ${clickAttr}>
        <span class="match-type-badge home-badge">ДОМ</span>
        <span class="match-team home">${esc(homeNick)}</span>
        <span class="match-vs">⚔</span>
        <span class="match-team away">${esc(awayNick)}</span>
        <span class="match-type-badge away-badge">ГОСТ</span>
        ${resultBadge}${winnerBadge}${editHint}${editIcon}
      </div>`;
    });
    html += `</div>`;
  });
  container.innerHTML = html;
}

/* ═══════════════ MATCH RESULT MODAL ═══════════════ */
function openMatchResult(matchId){
  if(!userApproved) return;
  const m = leagueMatches.find(x=>x.id===matchId); if(!m) return;
  editingMatchId = matchId;
  const playerMap = {};
  leaguePlayers.forEach(p => { playerMap[p.id] = p.nick; });
  const homeNick = playerMap[m.home_id]||'?';
  const awayNick = playerMap[m.away_id]||'?';
  document.getElementById('matchResultTitle').textContent = 'Результат бою';
  document.getElementById('matchResultSub').textContent   = `${homeNick} (Д) vs ${awayNick} (Г)`;
  document.getElementById('matchResultOptions').innerHTML = `
    <button class="match-choice-btn" onclick="setMatchResult(${m.home_id},false)">
      <span class="choice-icon">🏠</span><span>Переміг <b>${esc(homeNick)}</b></span>
    </button>
    <button class="match-choice-btn" onclick="setMatchResult(${m.away_id},false)">
      <span class="choice-icon">✈</span><span>Переміг <b>${esc(awayNick)}</b></span>
    </button>
    <button class="match-choice-btn" onclick="setMatchResult(null,true)">
      <span class="choice-icon">🤝</span><span>Нічия</span>
    </button>
    <button class="match-choice-btn" onclick="resetMatchResult()" style="border-color:var(--border)">
      <span class="choice-icon">↩</span><span style="color:var(--muted)">Скинути результат</span>
    </button>`;
  openModal('matchResultModal');
}

async function setMatchResult(winnerId, isDraw){
  if(editingMatchId===null) return;
  try{
    const body = {winner_id: isDraw?null:winnerId, is_draw: isDraw};
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`, {method:'PATCH', body:JSON.stringify(body)});
    const m = leagueMatches.find(x=>x.id===editingMatchId);
    if(m){ m.winner_id=body.winner_id; m.is_draw=isDraw; }
    closeModal('matchResultModal');
    renderLeagueTable();
    renderLeagueSchedule();
    setLeagueSyncStatus('ok','Збережено');
  }catch(e){ alert('Помилка: '+e.message); }
}

async function resetMatchResult(){
  if(editingMatchId===null) return;
  try{
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`,
      {method:'PATCH', body:JSON.stringify({winner_id:null,is_draw:false})});
    const m = leagueMatches.find(x=>x.id===editingMatchId);
    if(m){ m.winner_id=null; m.is_draw=false; }
    closeModal('matchResultModal');
    renderLeagueTable();
    renderLeagueSchedule();
  }catch(e){ alert('Помилка: '+e.message); }
}

/* ═══════════════ BOOTSTRAP ═══════════════
   Запускається одразу після завантаження скрипту.
   Стартує таймер і відображає статус на головній.
   leagueInit() викликається з openTournamentLeague().
═══════════════════════════════════════════ */
_startLeagueTimer();
updateLeagueStatusUI();
