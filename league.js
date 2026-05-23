/* ══════════════════════════════════════════════
   LEAGUE TOURNAMENT — league.js
   Залежності з index.html: SUPA_URL, SUPA_KEY,
   accessToken, currentUser, userApproved,
   sbFetch(), openModal(), closeModal(), esc(), pad()
   ══════════════════════════════════════════════ */

// Deadline for registration: 30.05.2026 23:59 Kyiv (UTC+3 = 20:59 UTC)
const LEAGUE_REG_END = new Date('2026-05-30T20:59:00Z');
// Tournament duration: 7 days
const LEAGUE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Points
const PTS_WIN = 3, PTS_DRAW = 1, PTS_LOSS = 0;

let leaguePlayers = [];     // [{id, nick, created_at}]
let leagueMatches = [];     // [{id, home_id, away_id, winner_id, is_draw, round_label}]
let leagueStartedAt = null; // ISO string or null
let lgPollingStarted = false;
let editingMatchId = null;

/* ── SYNC STATUS ── */
function setLeagueSyncStatus(state, text){
  const dot = document.getElementById('leagueSyncDot');
  const txt = document.getElementById('leagueSyncText');
  if(dot) dot.className = 'sync-dot ' + state;
  if(txt) txt.textContent = text;
}

/* ── LOAD ALL DATA ── */
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
    leaguePlayers  = await pRes.json();
    leagueMatches  = await mRes.json();
    const sData    = await sRes.json();
    leagueStartedAt = sData && sData[0] ? sData[0].value : null;
    renderLeagueTable();
    updateLeagueStatusUI();
    setLeagueSyncStatus('ok','Синхронізовано');
    if(!lgPollingStarted){ lgPollingStarted = true; startLeaguePolling(); }
  }catch(e){
    setLeagueSyncStatus('err','Помилка з\'єднання');
  }
}

/* ── POLLING ── */
function startLeaguePolling(){
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
      const np = await pRes.json();
      const nm = await mRes.json();
      const ns = await sRes.json();
      const nStart = ns && ns[0] ? ns[0].value : null;
      const changed =
        JSON.stringify(np) !== JSON.stringify(leaguePlayers) ||
        JSON.stringify(nm) !== JSON.stringify(leagueMatches) ||
        nStart !== leagueStartedAt;
      if(changed){
        leaguePlayers   = np;
        leagueMatches   = nm;
        leagueStartedAt = nStart;
        renderLeagueTable();
        updateLeagueStatusUI();
        if(onSchedule) renderLeagueSchedule();
        setLeagueSyncStatus('ok','Оновлено');
      }
    }catch(e){}
  }, 5000);
}

/* ── ENTRY POINT called from openTournamentLeague() ── */
function leagueInit(){
  updateLeagueAuthUI();
  leagueLoadAll();
  // countdown already ticking from page init; just refresh UI state
  updateLeagueStatusUI();
}

/* ── STATUS HELPERS ── */
function getLeagueStatus(){
  const now = new Date();
  if(leagueStartedAt){
    const startedMs = new Date(leagueStartedAt).getTime();
    if(now.getTime() - startedMs >= LEAGUE_DURATION_MS) return 'done';
    return 'active';
  }
  if(now > LEAGUE_REG_END) return 'reg_closed';
  return 'reg';
}

function updateLeagueStatusUI(){
  const status = getLeagueStatus();

  // ── Tournament page badge ──
  const badge = document.getElementById('leagueStatusBadge');
  if(badge){
    badge.className = 'league-status-badge';
    if(status === 'reg'){        badge.className += ' reg';    badge.textContent = '📋 НАБІР ЗАЯВОК'; }
    else if(status === 'reg_closed'){ badge.className += ' reg'; badge.textContent = '🔒 ЗАЯВКИ ЗАКРИТО'; }
    else if(status === 'active'){ badge.className += ' active'; badge.textContent = '⚔ ТУРНІР ЙДЕ'; }
    else {                        badge.className += ' done';   badge.textContent = '✅ ТУРНІР ЗАВЕРШЕНО'; }
  }

  const regWrap    = document.querySelector('#tournamentLeaguePage .league-reg-timer-wrap');
  const activeWrap = document.getElementById('leagueActiveTimerWrap');
  const applyArea  = document.getElementById('leagueApplyArea');
  if(regWrap)    regWrap.style.display    = (status === 'reg')    ? '' : 'none';
  if(activeWrap) activeWrap.style.display = (status === 'active') ? '' : 'none';
  if(applyArea)  applyArea.style.display  = (status === 'reg')    ? '' : 'none';

  // ── Home page badge ──
  const homeBadge     = document.getElementById('homeLeagueBadge');
  const homeTimerWrap = document.getElementById('homeLeagueTimerWrap');
  if(homeBadge){
    if(status === 'reg')    homeBadge.textContent = '📋 НАБІР ЗАЯВОК';
    else if(status === 'active') homeBadge.textContent = '⚔ ЙДЕ ТУРНІР';
    else                    homeBadge.textContent = '✅ ЗАВЕРШЕНО';
  }
  if(homeTimerWrap) homeTimerWrap.style.display = (status === 'reg') ? '' : 'none';
}

/* ── COUNTDOWN TICKS — called once from global init ── */
function updateLeagueRegCountdown(){
  function tick(){
    const now = new Date();
    const st  = getLeagueStatus();

    // Registration countdown
    const regDiff = LEAGUE_REG_END - now;
    const regSegs = document.querySelectorAll('#leagueRegCountdown .seg b');
    if(regDiff > 0 && st === 'reg'){
      const d=Math.floor(regDiff/86400000),
            h=Math.floor((regDiff%86400000)/3600000),
            m=Math.floor((regDiff%3600000)/60000),
            s=Math.floor((regDiff%60000)/1000);
      if(regSegs[0]) regSegs[0].textContent = d;
      if(regSegs[1]) regSegs[1].textContent = pad(h);
      if(regSegs[2]) regSegs[2].textContent = pad(m);
      if(regSegs[3]) regSegs[3].textContent = pad(s);
    } else {
      regSegs.forEach(s => s.textContent = '—');
    }

    // Active tournament countdown
    const actSegs = document.querySelectorAll('#leagueActiveCountdown .seg b');
    if(leagueStartedAt && st === 'active'){
      const endMs   = new Date(leagueStartedAt).getTime() + LEAGUE_DURATION_MS;
      const actDiff = endMs - now.getTime();
      if(actDiff > 0){
        const d=Math.floor(actDiff/86400000),
              h=Math.floor((actDiff%86400000)/3600000),
              m=Math.floor((actDiff%3600000)/60000),
              s=Math.floor((actDiff%60000)/1000);
        if(actSegs[0]) actSegs[0].textContent = d;
        if(actSegs[1]) actSegs[1].textContent = pad(h);
        if(actSegs[2]) actSegs[2].textContent = pad(m);
        if(actSegs[3]) actSegs[3].textContent = pad(s);
      }
    }

    // Home page registration countdown
    const homeSegs = document.querySelectorAll('#homeLeagueCountdown .seg b');
    if(regDiff > 0 && st === 'reg'){
      const d=Math.floor(regDiff/86400000),
            h=Math.floor((regDiff%86400000)/3600000),
            m=Math.floor((regDiff%3600000)/60000),
            s=Math.floor((regDiff%60000)/1000);
      if(homeSegs[0]) homeSegs[0].textContent = d;
      if(homeSegs[1]) homeSegs[1].textContent = pad(h);
      if(homeSegs[2]) homeSegs[2].textContent = pad(m);
      if(homeSegs[3]) homeSegs[3].textContent = pad(s);
    } else {
      homeSegs.forEach(s => s.textContent = '—');
    }
  }
  tick();
  setInterval(tick, 1000);
}

/* ── STANDINGS CALCULATION ── */
function calcLeagueStandings(){
  const standings = {};
  leaguePlayers.forEach(p=>{
    standings[p.id] = {id:p.id, nick:p.nick, played:0, wins:0, draws:0, losses:0, pts:0};
  });
  leagueMatches.forEach(m=>{
    if(m.winner_id === null && !m.is_draw) return; // not played yet
    const h = standings[m.home_id];
    const a = standings[m.away_id];
    if(!h || !a) return;
    h.played++; a.played++;
    if(m.is_draw){
      h.draws++; a.draws++;
      h.pts += PTS_DRAW; a.pts += PTS_DRAW;
    } else if(m.winner_id === m.home_id){
      h.wins++; h.pts += PTS_WIN; a.losses++;
    } else {
      a.wins++; a.pts += PTS_WIN; h.losses++;
    }
  });
  return Object.values(standings)
    .sort((a,b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses);
}

/* ── RENDER LEAGUE TABLE ── */
function renderLeagueTable(){
  const tb = document.getElementById('leagueTbody');
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
    const rc      = i===0 ? 'rank-1' : i===1 ? 'rank-2' : i===2 ? 'rank-3' : 'rank-n';
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

/* ── AUTH UI UPDATE ── */
function updateLeagueAuthUI(){
  const adminCtrl = document.getElementById('leagueAdminControls');
  const canEdit   = currentUser && userApproved;
  const status    = getLeagueStatus();
  if(adminCtrl) adminCtrl.style.display = canEdit ? 'flex' : 'none';
  const startBtn  = document.getElementById('leagueStartBtn');
  if(startBtn) startBtn.style.display = (canEdit && status === 'reg') ? '' : 'none';
  const schedNote = document.getElementById('scheduleAdminNote');
  if(schedNote) schedNote.style.display = canEdit ? '' : 'none';
}

/* ── APPLY MODAL (PUBLIC) ── */
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
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({nick})
    });
    if(!res.ok){ const tx = await res.text(); throw new Error(tx); }
    const data = await res.json();
    if(Array.isArray(data) && data[0]) leaguePlayers.push(data[0]);
    renderLeagueTable();
    closeModal('leagueApplyModal');
    setLeagueSyncStatus('ok','Заявку подано!');
  }catch(e){ errEl.textContent = 'Помилка: ' + e.message; }
}

/* ── ADMIN: START TOURNAMENT ── */
async function leagueAdminStart(){
  if(!userApproved) return;
  if(!confirm('Розпочати турнір? Відлік 7 діб стартує зараз.')) return;
  if(leaguePlayers.length < 2){ alert('Потрібно мінімум 2 учасники!'); return; }
  const nowISO = new Date().toISOString();
  try{
    await fetch(`${SUPA_URL}/rest/v1/league_settings`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + (accessToken || SUPA_KEY),
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({key:'started_at', value: nowISO})
    });
    await generateLeagueMatches();
    leagueStartedAt = nowISO;
    updateLeagueStatusUI();
    updateLeagueAuthUI();
    renderLeagueTable();
    setLeagueSyncStatus('ok','Турнір розпочато!');
  }catch(e){ alert('Помилка: ' + e.message); }
}

async function generateLeagueMatches(){
  // Skip if matches already exist
  const existing = await sbFetch('/rest/v1/league_matches?select=id');
  if(existing.length > 0) return;

  const players = leaguePlayers;
  const matches = [];
  for(let i = 0; i < players.length; i++){
    for(let j = 0; j < players.length; j++){
      if(i === j) continue;
      matches.push({
        home_id: players[i].id,
        away_id: players[j].id,
        winner_id: null,
        is_draw: false,
        round_label: `${players[i].nick} (Д) vs ${players[j].nick} (Г)`
      });
    }
  }
  if(matches.length > 0){
    await sbFetch('/rest/v1/league_matches', {method:'POST', body: JSON.stringify(matches)});
  }
  // Reload
  const mRes = await fetch(`${SUPA_URL}/rest/v1/league_matches?select=*&order=id.asc`,
    {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}});
  leagueMatches = await mRes.json();
}

/* ── ADMIN: DELETE PLAYER ── */
async function leagueDelPlayer(id){
  if(!userApproved) return;
  const p = leaguePlayers.find(x => x.id === id); if(!p) return;
  if(!confirm(`Видалити «${p.nick}»?`)) return;
  try{
    await sbFetch(`/rest/v1/league_players?id=eq.${id}`, {method:'DELETE'});
    leaguePlayers = leaguePlayers.filter(x => x.id !== id);
    renderLeagueTable();
  }catch(e){ alert('Помилка: ' + e.message); }
}

/* ── SCHEDULE RENDER ── */
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

  // Group matches by home player
  const byHome = {};
  leagueMatches.forEach(m => {
    if(!byHome[m.home_id]) byHome[m.home_id] = [];
    byHome[m.home_id].push(m);
  });

  let html = '';
  leaguePlayers.forEach(p => {
    const matches = byHome[p.id];
    if(!matches || !matches.length) return;
    html += `<div class="schedule-round">
      <div class="schedule-round-title">🏠 Домашні бої — ${esc(p.nick)}</div>`;
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
          const winnerNick = playerMap[m.winner_id] || '?';
          resultBadge = `<span class="match-result done">✓</span>`;
          winnerBadge = `<span class="match-winner-badge win">⚑ ${esc(winnerNick)}</span>`;
        }
      } else {
        resultBadge = `<span class="match-result pending">—</span>`;
      }
      const editClass  = canEdit ? 'editable-match' : '';
      const clickAttr  = canEdit ? `onclick="openMatchResult(${m.id})"` : '';
      const editHint   = canEdit && !played
        ? `<span style="font-family:var(--f-mono);font-size:9px;color:var(--muted)">↑ клік</span>` : '';
      const editIcon   = canEdit && played
        ? `<span style="font-family:var(--f-mono);font-size:9px;color:var(--border2);cursor:pointer" onclick="event.stopPropagation();openMatchResult(${m.id})">✏</span>` : '';
      html += `<div class="match-row ${editClass}" ${clickAttr}>
        <span class="match-type-badge home-badge">ДОМ</span>
        <span class="match-team home">${esc(homeNick)}</span>
        <span class="match-vs">⚔</span>
        <span class="match-team away">${esc(awayNick)}</span>
        <span class="match-type-badge away-badge">ГОСТ</span>
        ${resultBadge}
        ${winnerBadge}
        ${editHint}${editIcon}
      </div>`;
    });
    html += `</div>`;
  });
  container.innerHTML = html;
}

/* ── MATCH RESULT MODAL ── */
function openMatchResult(matchId){
  if(!userApproved) return;
  const m = leagueMatches.find(x => x.id === matchId); if(!m) return;
  editingMatchId = matchId;
  const playerMap = {};
  leaguePlayers.forEach(p => { playerMap[p.id] = p.nick; });
  const homeNick = playerMap[m.home_id] || '?';
  const awayNick = playerMap[m.away_id] || '?';
  document.getElementById('matchResultTitle').textContent = 'Результат бою';
  document.getElementById('matchResultSub').textContent   = `${homeNick} (Д) vs ${awayNick} (Г)`;
  document.getElementById('matchResultOptions').innerHTML = `
    <button class="match-choice-btn" onclick="setMatchResult(${m.home_id}, false)">
      <span class="choice-icon">🏠</span>
      <span>Переміг <b>${esc(homeNick)}</b> (домашній)</span>
    </button>
    <button class="match-choice-btn" onclick="setMatchResult(${m.away_id}, false)">
      <span class="choice-icon">✈</span>
      <span>Переміг <b>${esc(awayNick)}</b> (гостьовий)</span>
    </button>
    <button class="match-choice-btn" onclick="setMatchResult(null, true)">
      <span class="choice-icon">🤝</span>
      <span>Нічия</span>
    </button>
    <button class="match-choice-btn" onclick="resetMatchResult()" style="border-color:var(--border)">
      <span class="choice-icon">↩</span>
      <span style="color:var(--muted)">Скинути результат</span>
    </button>`;
  openModal('matchResultModal');
}

async function setMatchResult(winnerId, isDraw){
  if(editingMatchId === null) return;
  try{
    const body = {winner_id: isDraw ? null : winnerId, is_draw: isDraw};
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`, {method:'PATCH', body: JSON.stringify(body)});
    const m = leagueMatches.find(x => x.id === editingMatchId);
    if(m){ m.winner_id = body.winner_id; m.is_draw = isDraw; }
    closeModal('matchResultModal');
    renderLeagueTable();
    renderLeagueSchedule();
    setLeagueSyncStatus('ok','Збережено');
  }catch(e){ alert('Помилка: ' + e.message); }
}

async function resetMatchResult(){
  if(editingMatchId === null) return;
  try{
    await sbFetch(`/rest/v1/league_matches?id=eq.${editingMatchId}`,
      {method:'PATCH', body: JSON.stringify({winner_id:null, is_draw:false})});
    const m = leagueMatches.find(x => x.id === editingMatchId);
    if(m){ m.winner_id = null; m.is_draw = false; }
    closeModal('matchResultModal');
    renderLeagueTable();
    renderLeagueSchedule();
  }catch(e){ alert('Помилка: ' + e.message); }
}
