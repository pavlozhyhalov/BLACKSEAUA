/* ══════════════════════════════════════════════
   CHALLENGE «Ветеран + Новачок» — challenge.js
   Залежності (з index.html): SUPA_URL, SUPA_KEY,
   accessToken, currentUser, isOfficer, isAdmin,
   sbFetch(), esc(), showPage(), randInt()
   Підрахунок балів і валідації — на сервері (Supabase).
   ══════════════════════════════════════════════ */

const CH_CLASS_LABEL={V:'Ветеран',N1:'Новачок Р1',N2:'Новачок Р2'};
const CH_STATUS={draft:['Чернетка','done'],registration:['Набір заявок','reg'],
  active:['Активний','active'],final:['Фінал','active'],done:['Завершено','done']};

let chChallenges=[], chC=null, chTasks=[], chParts=[], chPairs=[], chScores=[], chFinal=null;
let chPair=null, chPairC=null, chPairRows=[], chPairChallenge=null;
let chPairTasks=[], chPairTaskDone=[];
let chSoloScores=[];
let chSolo=null, chSoloC=null, chSoloRows=[];
let chMedals=[], chMedalProgress=[], chMedalScores=[];
let chWA=0;

/* ═══════════ HOME BANNER: recruitment countdown ═══════════ */
// Набір заявок до 20.09 23:59 за Києвом (UTC+3) = 20:59 UTC
const CH_DEADLINE=new Date('2026-09-20T20:59:00Z');
let chReg=null; // {id,title} of a challenge currently in registration
function chBannerClick(){ if(chReg)openChallenge(chReg.id); else openChallenges(); }
function chPad(n){return String(n).padStart(2,'0');}
function chKyivStr(dl){try{return dl.toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(_){return dl.toLocaleString('uk-UA');}}
function updateChallengeBanner(){
  const b=document.getElementById('chBanner');if(!b)return;
  if(!chReg){b.style.display='none';return;}
  b.style.display='block';
  const t=document.getElementById('chBannerTitle');if(t)t.textContent=chReg.title;
  const dl=chReg.reg_deadline?new Date(chReg.reg_deadline):CH_DEADLINE;
  const diff=dl.getTime()-Date.now();
  const sub=document.getElementById('chBannerSub');
  if(diff<=0){
    if(sub)sub.textContent='Набір завершено';
    ['cbD','cbH','cbM','cbS'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0';});
    return;
  }
  if(sub)sub.textContent='Набір заявок завершується '+chKyivStr(dl)+' за Києвом';
  const d=Math.floor(diff/86400000), h=Math.floor(diff%86400000/3600000),
        m=Math.floor(diff%3600000/60000), s=Math.floor(diff%60000/1000);
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('cbD',d);set('cbH',chPad(h));set('cbM',chPad(m));set('cbS',chPad(s));
}
function chFetchReg(){
  return fetch(SUPA_URL+'/rest/v1/challenge?status=eq.registration&select=id,title,reg_deadline&order=created_at.desc&limit=1',
    {headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}})
    .then(r=>r.ok?r.json():[]).then(d=>{chReg=(Array.isArray(d)&&d[0])?d[0]:null;updateChallengeBanner();}).catch(()=>{});
}
function chInitBanner(){
  updateChallengeBanner();
  chFetchReg();
  setInterval(updateChallengeBanner,1000);
}

const CH_LOADING='<div class="sync-status"><div class="sync-dot loading"></div><span>Завантаження...</span></div>';

function chErrMsg(e){try{const j=JSON.parse(e.message);return j.message||j.hint||j.details||j.error||e.message;}catch(_){return e.message;}}

async function chGet(path){
  const r=await fetch(SUPA_URL+'/rest/v1/'+path,{headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY)}});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}

/* ═══════════ NAVIGATION ═══════════ */
function openChallenges(){showPage('tournamentsListPage');window.location.hash='tournaments';chRenderList();}
function openChallenge(id){showPage('challengePage');window.location.hash='challenge='+id;chLoadChallenge(id);}
function openPair(id){showPage('pairPage');window.location.hash='pair='+id;chLoadPair(id);}
function openSolo(id){showPage('soloPlayerPage');window.location.hash='solo='+id;chLoadSolo(id);}
function chBackToChallenge(){if(chPairChallenge)openChallenge(chPairChallenge);else openChallenges();}

function chOnAuthChange(){
  if(document.getElementById('tournamentsListPage').classList.contains('active'))chRenderList();
  else if(document.getElementById('challengePage').classList.contains('active')&&chC)chRenderChallenge();
  else if(document.getElementById('pairPage').classList.contains('active')&&chPair)chRenderPair();
  else if(document.getElementById('soloPlayerPage').classList.contains('active')&&chSolo)chRenderSolo();
  else if(document.getElementById('visitsPage').classList.contains('active'))loadVisits();
}

/* ═══════════ HELPERS ═══════════ */
function chStatusBadge(s){const m=CH_STATUS[s]||['—','done'];return `<span class="ch-badge ${m[1]}">${m[0]}</span>`;}
function chFmtDT(v){if(!v)return '—';const d=new Date(v);if(isNaN(d))return '—';
  return d.toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
function chToLocalInput(v){if(!v)return '';const d=new Date(v);if(isNaN(d))return '';
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function chDateRange(c){const a=c.date_from?new Date(c.date_from).toLocaleDateString('uk-UA'):null;
  const b=c.date_to?new Date(c.date_to).toLocaleDateString('uk-UA'):null;
  return a&&b?`${a} — ${b}`:(a||'Дати не задані');}
function chDescHtml(text){
  const lines=(text||'').split('\n');let html='',inList=false;
  const closeList=()=>{if(inList){html+='</ul>';inList=false;}};
  for(const raw of lines){
    const l=raw.trim();
    if(!l){closeList();continue;}
    if(l.startsWith('•')){if(!inList){html+='<ul class="ch-desc-ul">';inList=true;}html+='<li>'+esc(l.replace(/^•\s*/,''))+'</li>';continue;}
    closeList();
    const isHead=l.length<=32&&!/[.!?:]$/.test(l)&&!l.includes(',');
    html+=isHead?('<div class="ch-desc-h">'+esc(l)+'</div>'):('<p class="ch-desc-p">'+esc(l)+'</p>');
  }
  closeList();return html;
}

/* ═══════════ LIST ═══════════ */
async function chRenderList(){
  const off=document.getElementById('chListOfficer');if(off)off.style.display=isOfficer?'block':'none';
  const grid=document.getElementById('chListGrid');if(!grid)return;
  grid.innerHTML=CH_LOADING;
  try{chChallenges=await chGet('challenge?select=*&order=created_at.desc');}
  catch(e){grid.innerHTML='<p class="hint">Помилка завантаження: '+esc(chErrMsg(e))+'</p>';return;}
  if(!chChallenges.length){grid.innerHTML='<p class="hint">Ще немає челенджів.</p>';return;}
  grid.innerHTML=chChallenges.map(c=>`
    <div class="card" onclick="openChallenge(${c.id})" style="border-left:2px solid var(--accent)">
      <span class="card-num">${chStatusBadge(c.status)}</span>
      <div class="card-title">${esc(c.title)}</div>
      <div class="card-desc">${chDateRange(c)}</div>
    </div>`).join('');
  grid.querySelectorAll('.card').forEach(el=>el.classList.add('visible'));
}

async function chCreateChallenge(){
  if(!isOfficer)return;
  const title=prompt('Назва нового челенджу:','Челендж «Ветеран + Новачок»');
  if(!title)return;
  try{
    await sbFetch('/rest/v1/challenge',{method:'POST',body:JSON.stringify({title:title.trim(),status:'registration'})});
    chRenderList();
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}

/* ═══════════ CHALLENGE DETAIL ═══════════ */
async function chLoadChallenge(id){
  const box=document.getElementById('chDetail');if(box)box.innerHTML=CH_LOADING;
  try{
    const cs=await chGet('challenge?id=eq.'+id+'&select=*');chC=cs[0];
    if(!chC){box.innerHTML='<p class="hint">Челендж не знайдено.</p>';return;}
    chTasks =await chGet('challenge_task?challenge_id=eq.'+id+'&order=row_no.asc');
    chParts =await chGet('participant?challenge_id=eq.'+id+'&order=created_at.asc');
    chPairs=[];chScores=[];chFinal=null;chSoloScores=[];chMedals=[];chMedalProgress=[];chMedalScores=[];
    if(chC.mode==='solo'){
      chSoloScores=await chGet('v_solo_scores?challenge_id=eq.'+id);
    }else if(chC.mode==='medals'){
      chMedals=await chGet('medal?challenge_id=eq.'+id+'&order=ord.asc');
      chMedalScores=await chGet('v_medal_scores?challenge_id=eq.'+id);
      const ids=chParts.map(p=>p.id);
      chMedalProgress=ids.length?await chGet('medal_progress?participant_id=in.('+ids.join(',')+')&select=*'):[];
    }else{
      chPairs =await chGet('pair?challenge_id=eq.'+id);
      chScores=await chGet('v_pair_scores?challenge_id=eq.'+id);
      const fr=await chGet('final_result?challenge_id=eq.'+id);chFinal=fr[0]||null;
    }
    const cr=document.getElementById('chCrumb');if(cr)cr.textContent=chC.title;
    chRenderChallenge();
  }catch(e){if(box)box.innerHTML='<p class="hint">Помилка: '+esc(chErrMsg(e))+'</p>';}
}

async function chReloadPairs(){
  chPairs =await chGet('pair?challenge_id=eq.'+chC.id);
  chScores=await chGet('v_pair_scores?challenge_id=eq.'+chC.id);
}

function chSortedPairs(){
  const sById=Object.fromEntries(chScores.map(s=>[s.pair_id,s]));
  return [...chPairs].sort((a,b)=>{
    const sa=sById[a.id]||{},sb=sById[b.id]||{};
    if((sb.pair_total||0)!==(sa.pair_total||0))return (sb.pair_total||0)-(sa.pair_total||0);
    const la=sa.last_closed_at?Date.parse(sa.last_closed_at):Infinity;
    const lb=sb.last_closed_at?Date.parse(sb.last_closed_at):Infinity;
    return la-lb;
  });
}

function chNormsTable(){
  return `<div class="table-wrapper"><table class="lb ch-norms"><thead><tr>
    <th style="width:34px">№</th><th style="text-align:left">Завдання</th><th>I–IV</th><th>V–VII</th><th>VIII–Легенди</th></tr></thead><tbody>${
    chTasks.map(t=>`<tr><td>${t.row_no}</td><td style="text-align:left">${esc(t.title)}</td>
      <td>${esc(t.norm_n1||'—')}</td><td>${esc(t.norm_n2||'—')}</td><td>${esc(t.norm_v||'—')}</td></tr>`).join('')
  }</tbody></table></div>`;
}

function chVets(){return chParts.filter(p=>p.class==='V');}
function chNovices(){return chParts.filter(p=>p.class!=='V');}
function chUnpairedNovices(){const set=new Set(chPairs.map(p=>p.novice_id));return chNovices().filter(n=>!set.has(n.id));}
function chUnpairedVets(){const set=new Set(chPairs.map(p=>p.veteran_id));return chVets().filter(v=>!set.has(v.id));}
function chNextUnpairedVet(){return chUnpairedVets()[0]||null;}

function chRenderChallenge(){
  const box=document.getElementById('chDetail');if(!box||!chC)return;
  const off=isOfficer;
  const reg=chC.status==='registration'||chC.status==='draft';
  const solo=chC.mode==='solo';
  const medals=chC.mode==='medals';
  let h='';

  // header
  h+=`<div class="page-head"><div class="page-title ch-title-row">${esc(chC.title)} ${chStatusBadge(chC.status)}</div></div>`;

  // rules
  h+=`<div class="rules-box"><div class="rules-box-title">Опис</div>
    <div class="ch-desc" id="chRulesView">${chDescHtml(chC.rules_text)}</div>`;
  if(off)h+=`<button class="ch-mini-btn" onclick="chEditRules()">✏ Редагувати опис</button>`;
  h+=`</div>`;
  if(!medals)h+=`<div class="ch-section-label">Норми за класами</div>`+chNormsTable();

  // officer controls
  if(off){
    // Block 1 — management: status + recruitment deadline
    h+=`<div class="ch-manage">
      <div class="ch-manage-item">
        <span class="ch-manage-lbl">Статус челенджу</span>
        <select class="ch-inp" onchange="chSetStatus(this.value)">${
          ['registration','active','final','done'].map(s=>`<option value="${s}"${chC.status===s?' selected':''}>${CH_STATUS[s][0]}</option>`).join('')
        }</select>
      </div>
      <div class="ch-manage-item">
        <span class="ch-manage-lbl">Дедлайн набору (за вашим часовим поясом)</span>
        <div class="ch-manage-inline">
          <input type="datetime-local" id="chDeadlineInp" class="ch-inp" value="${chToLocalInput(chC.reg_deadline)}">
          <button class="ch-mini-btn primary" onclick="chSetDeadline()">Зберегти</button>
        </div>
      </div>
    </div>`;

    // Block 2 — actions: participants / pairs
    let acts='';
    if(reg)acts+=`<button class="ch-mini-btn" onclick="chOpenAddPart()">＋ Додати учасника</button>`;
    if(reg&&!solo&&!medals&&chVets().length>0)acts+=`<button class="ch-mini-btn primary" onclick="chFixPairs()">✔ Зафіксувати пари → Активний</button>`;
    if(reg&&!solo&&!medals&&chPairs.length>0)acts+=`<button class="ch-mini-btn danger" onclick="chResetDraw()">↺ Перезапустити жеребкування</button>`;
    if(chC.status==='active'&&!solo&&!medals)acts+=`<button class="ch-mini-btn" onclick="chMarkFinalists()">★ Позначити фіналістів (топ-2)</button>`;
    if(acts)h+=`<div class="ch-officer-bar">${acts}</div>`;
  }

  if(medals){
    // ── MEDALS: players × medals matrix ──
    if(reg&&off){
      h+=`<div class="ch-section-label">Учасники (${chParts.length})</div>`;
      if(!chParts.length)h+=`<p class="hint">Учасників ще немає.</p>`;
      else h+=`<div class="ch-part-list">`+chParts.map(p=>`<span class="ch-chip">${esc(p.nickname)}${
        off?` <b onclick="event.stopPropagation();chDelPart(${p.id})">✕</b>`:''}</span>`).join('')+`</div>`;
    }
    h+=`<div class="ch-section-label">Таблиця медалей (${chParts.length} гравців)</div>`;
    h+=`<p class="hint" style="margin-bottom:6px">Таблицю можна гортати вліво-вправо${off?' · натисни клітинку, щоб зарахувати медаль':''}</p>`;
    h+=chMedalMatrix();
  }else if(solo){
    // ── SOLO: individual leaderboard ──
    if(reg&&off){
      h+=`<div class="ch-section-label">Учасники (${chParts.length})</div>`;
      if(!chParts.length)h+=`<p class="hint">Учасників ще немає.</p>`;
      else h+=`<div class="ch-part-list">`+chParts.map(p=>`<span class="ch-chip cls-${p.class}">${esc(p.nickname)} <i>${CH_CLASS_LABEL[p.class]}</i>${
        off?` <b onclick="event.stopPropagation();chDelPart(${p.id})">✕</b>`:''}</span>`).join('')+`</div>`;
    }
    h+=`<div class="ch-section-label">Рейтинг (${chParts.length})</div>`;
    h+=chSoloBoard();
  }else{
    // ── PAIRS ──
    if(reg){
      h+=`<div class="ch-section-label">Учасники (${chParts.length})</div>`;
      if(!chParts.length)h+=`<p class="hint">Учасників ще немає.</p>`;
      else{
        h+=`<div class="ch-part-list">`+chParts.map(p=>`<span class="ch-chip cls-${p.class}">${esc(p.nickname)} <i>${CH_CLASS_LABEL[p.class]}</i>${
          off?` <b onclick="event.stopPropagation();chDelPart(${p.id})">✕</b>`:''}</span>`).join('')+`</div>`;
      }
      const nv=chVets().length, nn=chNovices().length;
      if(off){
        h+=`<div class="ch-draw">`;
        if(nv!==nn)h+=`<p class="hint">⚠ Для жеребкування кількість ветеранів (${nv}) має дорівнювати кількості новачків (${nn}).</p>`;
        const upv=chUnpairedVets();
        if(nv===nn&&nv>0&&upv.length>0){
          h+=`<div class="ch-draw-title">Жеребкування пар</div>
            <p class="hint">Натисни «Жеребкувати» — нікнейми перемішаються, і пара утвориться між тими, хто опинився в одному рядку.</p>
            <div class="table-wrapper"><table class="ch-draw-table"><thead><tr><th>Новачки</th><th></th><th>Ветерани</th></tr></thead><tbody id="chDrawBody"></tbody></table></div>
            <button class="spin-btn" id="chDrawBtn" onclick="chDrawAll()">Жеребкувати пари</button>`;
        }else if(nv===nn&&nv>0&&upv.length===0){
          h+=`<p class="hint">✔ Усі пари сформовано. Натисни «Зафіксувати пари → Активний».</p>`;
        }
        h+=`</div>`;
      }
    }
    h+=`<div class="ch-section-label">Пари (${chPairs.length})</div>`;
    h+=`<div class="ch-pairs">`+chPairCards()+`</div>`;
    if(chC.status==='final'||chC.status==='done')h+=chFinalBlock();
  }

  box.innerHTML=h;
  if(!solo&&reg&&isOfficer&&chVets().length===chNovices().length&&chVets().length>0&&chUnpairedVets().length>0){
    chFillDraw(chUnpairedNovices(), chUnpairedVets());
  }
}

function chSoloBoard(){
  if(!chParts.length)return '<p class="hint">Учасників ще немає.</p>';
  const sById=Object.fromEntries(chSoloScores.map(s=>[s.participant_id,s]));
  const sorted=[...chParts].sort((a,b)=>{
    const sa=sById[a.id]||{},sb=sById[b.id]||{};
    if((sb.points||0)!==(sa.points||0))return (sb.points||0)-(sa.points||0);
    const la=sa.last_done_at?Date.parse(sa.last_done_at):Infinity;
    const lb=sb.last_done_at?Date.parse(sb.last_done_at):Infinity;
    return la-lb;
  });
  return `<div class="table-wrapper"><table class="lb ch-solo-board"><thead><tr>
    <th style="width:34px">#</th><th style="text-align:left">Гравець</th><th>Клас</th><th>Виконано</th><th>Бали</th></tr></thead><tbody>${
    sorted.map((p,i)=>{const s=sById[p.id]||{};return `<tr onclick="openSolo(${p.id})" style="cursor:pointer">
      <td>${i+1}</td><td style="text-align:left">${esc(p.nickname)}</td>
      <td>${CH_CLASS_LABEL[p.class]}</td><td>${s.done_count||0}/7</td>
      <td class="pts">${s.points||0}</td></tr>`;}).join('')
  }</tbody></table></div>`;
}

function chMedalMatrix(){
  if(!chParts.length)return '<p class="hint">Гравців ще немає.</p>';
  const sById=Object.fromEntries(chMedalScores.map(s=>[s.participant_id,s]));
  const prog={};chMedalProgress.forEach(d=>{prog[d.participant_id+'_'+d.medal_id]=d;});
  const canEdit=isOfficer&&!(chC.status==='done'&&!isAdmin);
  const players=[...chParts].sort((a,b)=>((sById[b.id]?.points||0)-(sById[a.id]?.points||0)));
  const head=`<tr><th class="mx-nick">Гравець</th><th class="mx-sum">Бали</th>${
    chMedals.map(m=>`<th class="mx-med${m.awardable?'':' na'}"><span>${esc(m.title)}</span></th>`).join('')}</tr>`;
  let body='';
  players.forEach(p=>{
    const pts=sById[p.id]?.points||0;
    body+=`<tr><td class="mx-nick">${esc(p.nickname)}</td><td class="mx-sum">${pts}</td>${
      chMedals.map(m=>{
        const d=(m.awardable)?prog[p.id+'_'+m.id]:null;
        if(!d)return `<td class="mx-cell na">—</td>`;
        const on=d.done;
        if(canEdit)return `<td class="mx-cell ${on?'on':''}" onclick="chToggleMedal(${d.id},${on?'false':'true'})">${on?'1':'·'}</td>`;
        return `<td class="mx-cell ${on?'on':''}">${on?'1':''}</td>`;
      }).join('')}</tr>`;
  });
  return `<div class="table-wrapper"><table class="ch-medal-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
async function chToggleMedal(id,done){
  try{
    await sbFetch('/rest/v1/medal_progress?id=eq.'+id,{method:'PATCH',body:JSON.stringify({done,updated_at:new Date().toISOString()})});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}

function chPairCards(){
  if(!chPairs.length)return '<p class="hint">Пари ще не жеребкувалися.</p>';
  const byId=Object.fromEntries(chParts.map(p=>[p.id,p]));
  const sById=Object.fromEntries(chScores.map(s=>[s.pair_id,s]));
  const sorted=chSortedPairs();
  return sorted.map((p,idx)=>{
    const s=sById[p.id]||{};
    const vet=byId[p.veteran_id],nov=byId[p.novice_id];
    const finalist=p.is_finalist||(idx<2&&(chC.status==='final'||chC.status==='done'));
    return `<div class="ch-pair-card" onclick="openPair(${p.id})">
      <div class="ch-pair-top">
        <div class="ch-pair-names">${esc(vet?vet.nickname:'?')} <span class="ch-vs">×</span> ${esc(nov?nov.nickname:'?')}</div>
        ${finalist?'<span class="ch-finalist">★ ФІНАЛІСТ</span>':''}
      </div>
      <div class="ch-pair-total">${s.pair_total||0}<span> балів</span></div>
      <div class="ch-help ok">Ветеран ${s.vet_points||0} · Новачок ${s.novice_points||0}</div>
      <div class="ch-detail-link">Детально →</div>
    </div>`;
  }).join('');
}

/* ═══════════ DRAW (two-column shuffle) ═══════════ */
function chShuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=randInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function chNameOf(id){const p=chParts.find(x=>x.id===id);return p?p.nickname:'?';}
function chDrawRows(novList,vetList){
  const body=document.getElementById('chDrawBody');if(!body)return;
  const n=Math.max(novList.length,vetList.length);let h='';
  for(let i=0;i<n;i++){
    const nn=novList[i], vv=vetList[i];
    h+=`<tr><td class="dn">${nn?esc(typeof nn==='object'?nn.nickname:chNameOf(nn)):''}</td><td class="dvs">×</td><td class="dv">${vv?esc(typeof vv==='object'?vv.nickname:chNameOf(vv)):''}</td></tr>`;
  }
  body.innerHTML=h;
}
function chFillDraw(novs,vets){chDrawRows(novs,vets);}

async function chDrawAll(){
  if(!isOfficer)return;
  const vets=chUnpairedVets(), novs=chUnpairedNovices();
  if(vets.length!==novs.length||!vets.length){alert('Кількість вільних ветеранів і новачків має збігатися.');return;}
  const btn=document.getElementById('chDrawBtn');if(btn){btn.disabled=true;btn.textContent='Жеребкування...';}
  let result;
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/rpc/draw_all_pairs',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json'},
      body:JSON.stringify({p_challenge:chC.id})
    });
    if(!r.ok)throw new Error(await r.text());
    result=await r.json();   // [{veteran_id, novice_id}...]
  }catch(e){alert('Помилка жеребкування: '+chErrMsg(e));if(btn){btn.disabled=false;btn.textContent='Жеребкувати пари';}return;}

  // animate: shuffle both columns for ~2.4s, then settle to the server result
  await new Promise(resolve=>{
    const vetObjs=vets, novObjs=novs;
    let ticks=0; const maxTicks=26;
    const iv=setInterval(()=>{
      chDrawRows(chShuffle(novObjs), chShuffle(vetObjs));
      if(++ticks>=maxTicks){
        clearInterval(iv);
        const finalVets=result.map(p=>p.veteran_id);
        const finalNovs=result.map(p=>p.novice_id);
        chDrawRows(finalNovs, finalVets);
        setTimeout(resolve,500);
      }
    },90);
  });
  await chReloadPairs();
  chRenderChallenge();
}

/* ═══════════ OFFICER ACTIONS ═══════════ */
function chOpenAddPart(){
  document.getElementById('chPartNick').value='';
  document.getElementById('chPartError').textContent='';
  const medals=chC.mode==='medals';
  const cr=document.getElementById('chPartClassRow');if(cr)cr.style.display=medals?'none':'block';
  const sb=document.getElementById('chPartSub');if(sb)sb.textContent=medals?'Нік гравця у грі.':'Нік у грі та рівень кораблів.';
  openModal('chAddPartModal');
  setTimeout(()=>document.getElementById('chPartNick').focus(),50);
}
async function chConfirmAddParticipant(){
  const nick=document.getElementById('chPartNick').value.trim();
  const cls=chC.mode==='medals'?null:document.getElementById('chPartClass').value;
  const err=document.getElementById('chPartError');err.textContent='';
  if(!nick){err.textContent='Введи нікнейм';return;}
  try{
    await sbFetch('/rest/v1/participant',{method:'POST',body:JSON.stringify({challenge_id:chC.id,nickname:nick,class:cls})});
    closeModal('chAddPartModal');
    await chLoadChallenge(chC.id);
  }catch(e){err.textContent=chErrMsg(e);}
}
async function chDelPart(id){
  if(!confirm('Видалити учасника?'))return;
  try{
    await sbFetch('/rest/v1/participant?id=eq.'+id,{method:'DELETE'});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chFixPairs(){
  const vets=chVets(),paired=new Set(chPairs.map(p=>p.veteran_id));
  if(!vets.length){alert('Немає ветеранів.');return;}
  if(vets.some(v=>!paired.has(v.id))){alert('Не всі ветерани отримали пару — заверши жеребкування.');return;}
  try{
    await sbFetch('/rest/v1/challenge?id=eq.'+chC.id,{method:'PATCH',body:JSON.stringify({status:'active',updated_at:new Date().toISOString()})});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chResetDraw(){
  if(!confirm('Видалити всі пари й перезапустити жеребкування?'))return;
  try{
    await sbFetch('/rest/v1/pair?challenge_id=eq.'+chC.id,{method:'DELETE'});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chSetStatus(s){
  try{
    await sbFetch('/rest/v1/challenge?id=eq.'+chC.id,{method:'PATCH',body:JSON.stringify({status:s,updated_at:new Date().toISOString()})});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chMarkFinalists(){
  const top=chSortedPairs().slice(0,2).map(p=>p.id);
  try{
    for(const p of chPairs){
      const want=top.includes(p.id);
      if(p.is_finalist!==want)await sbFetch('/rest/v1/pair?id=eq.'+p.id,{method:'PATCH',body:JSON.stringify({is_finalist:want})});
    }
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chSetDeadline(){
  const v=document.getElementById('chDeadlineInp')?.value;
  if(!v){alert('Вкажи дату й час дедлайну набору.');return;}
  try{
    await sbFetch('/rest/v1/challenge?id=eq.'+chC.id,{method:'PATCH',body:JSON.stringify({reg_deadline:new Date(v).toISOString(),updated_at:new Date().toISOString()})});
    await chLoadChallenge(chC.id);
    chFetchReg();
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}
async function chEditRules(){
  const cur=chC.rules_text||'';
  const val=prompt('Текст правил:',cur);
  if(val===null)return;
  try{
    await sbFetch('/rest/v1/challenge?id=eq.'+chC.id,{method:'PATCH',body:JSON.stringify({rules_text:val,updated_at:new Date().toISOString()})});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}

/* ═══════════ FINAL 2×2 ═══════════ */
function chFinalBlock(){
  const finalists=chSortedPairs().filter(p=>p.is_finalist).slice(0,2);
  if(finalists.length<2)return `<div class="ch-section-label">Фінал 2×2</div><p class="hint">Позначте двох фіналістів.</p>`;
  const byId=Object.fromEntries(chParts.map(p=>[p.id,p]));
  const nm=p=>`${esc(byId[p.veteran_id]?.nickname||'?')} × ${esc(byId[p.novice_id]?.nickname||'?')}`;
  const a=finalists[0],b=finalists[1];
  const sa=chFinal&&chFinal.pair_a_id===a.id?chFinal.score_a:(chFinal&&chFinal.pair_b_id===a.id?chFinal.score_b:0);
  const sb=chFinal&&chFinal.pair_a_id===b.id?chFinal.score_a:(chFinal&&chFinal.pair_b_id===b.id?chFinal.score_b:0);
  let h=`<div class="ch-section-label">Фінал 2×2 (Bo3)</div><div class="ch-final">`;
  h+=`<div class="ch-final-row"><span class="ch-final-name">${nm(a)}</span>`;
  if(isOfficer)h+=`<input type="number" min="0" max="3" id="chFinA" value="${sa}" class="ch-final-inp">`;
  else h+=`<span class="ch-final-score">${sa}</span>`;
  h+=`</div><div class="ch-final-vs">VS</div><div class="ch-final-row"><span class="ch-final-name">${nm(b)}</span>`;
  if(isOfficer)h+=`<input type="number" min="0" max="3" id="chFinB" value="${sb}" class="ch-final-inp">`;
  else h+=`<span class="ch-final-score">${sb}</span>`;
  h+=`</div>`;
  if(isOfficer)h+=`<button class="ch-mini-btn primary" onclick="chSaveFinal(${a.id},${b.id})">Зберегти результат</button>`;
  h+=`</div>`;
  return h;
}
async function chSaveFinal(aId,bId){
  const sa=parseInt(document.getElementById('chFinA').value||'0',10);
  const sb=parseInt(document.getElementById('chFinB').value||'0',10);
  const body={challenge_id:chC.id,pair_a_id:aId,pair_b_id:bId,score_a:sa,score_b:sb,updated_at:new Date().toISOString()};
  try{
    await fetch(SUPA_URL+'/rest/v1/final_result?on_conflict=challenge_id',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(body)
    }).then(async r=>{if(!r.ok)throw new Error(await r.text());});
    await chLoadChallenge(chC.id);
  }catch(e){alert('Помилка: '+chErrMsg(e));}
}

/* ═══════════ PAIR PAGE ═══════════ */
async function chLoadPair(id){
  const box=document.getElementById('chPairDetail');if(box)box.innerHTML=CH_LOADING;
  try{
    const ps=await chGet('pair?id=eq.'+id+'&select=*');chPair=ps[0];
    if(!chPair){box.innerHTML='<p class="hint">Пару не знайдено.</p>';return;}
    chPairChallenge=chPair.challenge_id;
    const cs=await chGet('challenge?id=eq.'+chPair.challenge_id+'&select=*');chPairC=cs[0];
    chTasks=await chGet('challenge_task?challenge_id=eq.'+chPair.challenge_id+'&order=row_no.asc');
    chParts=await chGet('participant?id=in.('+chPair.veteran_id+','+chPair.novice_id+')');
    chPairRows=await chGet('v_progress_points?pair_id=eq.'+id+'&select=*');
    chPairTasks=await chGet('pair_task?challenge_id=eq.'+chPair.challenge_id+'&order=row_no.asc');
    chPairTaskDone=await chGet('pair_task_done?pair_id=eq.'+id);
    const cr=document.getElementById('chPairCrumbCh');if(cr)cr.textContent=chPairC.title;
    chRenderPair();
  }catch(e){if(box)box.innerHTML='<p class="hint">Помилка: '+esc(chErrMsg(e))+'</p>';}
}

function chRenderPair(){
  const box=document.getElementById('chPairDetail');if(!box||!chPair)return;
  const byId=Object.fromEntries(chParts.map(p=>[p.id,p]));
  const vet=byId[chPair.veteran_id], nov=byId[chPair.novice_id];
  const taskById=Object.fromEntries(chTasks.map(t=>[t.id,t]));
  const rowsOf=pid=>chPairRows.filter(r=>r.participant_id===pid);
  const sumPts=rows=>rows.reduce((a,r)=>a+(r.points||0),0);
  const doneCnt=rows=>rows.filter(r=>r.status==='done').length;
  const vRows=rowsOf(chPair.veteran_id), nRows=rowsOf(chPair.novice_id);
  const vPts=sumPts(vRows), nPts=sumPts(nRows);
  const vDone=doneCnt(vRows), nDone=doneCnt(nRows);
  const ptById=Object.fromEntries(chPairTasks.map(t=>[t.id,t]));
  const ptPts=chPairTaskDone.reduce((a,d)=>a+(d.done?(ptById[d.pair_task_id]?.points||0):0),0);
  const pairTotal=nPts+vPts+ptPts;
  const locked=chPairC.status==='done'&&!isAdmin;
  const canEdit=isOfficer&&!locked;

  let h=`<div class="page-head"><div class="page-title">${esc(vet?.nickname||'?')} <span class="ch-vs">×</span> ${esc(nov?.nickname||'?')}</div>
    <p class="page-lede">${esc(chPairC.title)}</p></div>`;
  h+=`<div class="ch-pairtot-box"><div class="ch-pairtot-lbl">Бали пари</div><div class="ch-pairtot-val">${pairTotal}</div>
    <div class="ch-help ok">${esc(vet?.nickname||'Ветеран')} ${vPts} б (${vDone}/7) · ${esc(nov?.nickname||'Новачок')} ${nPts} б (${nDone}/7)${chPairTasks.length?` · Парні ${ptPts} б`:''}</div></div>`;
  if(locked)h+=`<p class="hint">🔒 Челендж завершено — редагування заблоковане.</p>`;

  const notV=vRows.filter(r=>r.status!=='done').map(r=>taskById[r.task_id]?.title).filter(Boolean);
  const notN=nRows.filter(r=>r.status!=='done').map(r=>taskById[r.task_id]?.title).filter(Boolean);
  h+=`<div class="ch-notclosed"><b>${esc(vet?.nickname||'Ветеран')}</b> — ${notV.length?'не закрито: '+notV.map(esc).join(', '):'усі завдання виконано ✓'}</div>`;
  h+=`<div class="ch-notclosed"><b>${esc(nov?.nickname||'Новачок')}</b> — ${notN.length?'не закрито: '+notN.map(esc).join(', '):'усі завдання виконано ✓'}</div>`;
  h+=`<div id="chPairMsg" class="ch-row-err" style="margin:10px 0"></div>`;
  h+=`<p class="hint" style="margin-bottom:6px">Таблицю можна гортати вліво-вправо</p>`;
  h+=chPairTable(vet,nov,vRows,nRows,taskById,canEdit);
  h+=chPairTasksBlock(canEdit);

  box.innerHTML=h;
}

function chPairTasksBlock(canEdit){
  if(!chPairTasks.length)return '';
  const doneBy=Object.fromEntries(chPairTaskDone.map(d=>[d.pair_task_id,d]));
  let h=`<div class="ch-section-label">Парні завдання</div><div class="ch-ptasks">`;
  chPairTasks.forEach(t=>{
    const d=doneBy[t.id]; const done=d&&d.done;
    h+=`<div class="ch-ptask ${done?'done':''}">
      <div class="ch-ptask-main"><span class="ch-ptask-title">${esc(t.title)}</span></div>
      <div class="ch-ptask-right">${
        canEdit&&d?`<label class="ch-cb"><input type="checkbox" ${done?'checked':''} onchange="chTogglePairTask(${d.id},this.checked)"> Виконано</label>`
                 :`<span class="ch-ptask-status ${done?'ok':''}">${done?'Виконано ✓':'Не виконано'}</span>`}
        <span class="ch-ptask-pts">${done?('+'+(t.points||0)+' б'):''}</span></div>
    </div>`;
  });
  return h+`</div>`;
}
async function chTogglePairTask(doneId,done){
  const msg=document.getElementById('chPairMsg');if(msg)msg.textContent='';
  try{
    await sbFetch('/rest/v1/pair_task_done?id=eq.'+doneId,{method:'PATCH',body:JSON.stringify({done,updated_at:new Date().toISOString()})});
    await chLoadPair(chPair.id);
  }catch(e){const m='⚠ '+chErrMsg(e);if(msg)msg.textContent=m;else alert(m);await chLoadPair(chPair.id);}
}

function chPairTable(vet,nov,vRows,nRows,taskById,canEdit){
  const vBy=Object.fromEntries(vRows.map(r=>[r.task_id,r]));
  const nBy=Object.fromEntries(nRows.map(r=>[r.task_id,r]));
  const novNorm=t=>nov&&nov.class==='N1'?t.norm_n1:t.norm_n2;
  const stSel=r=>`<select id="st_${r.id}" class="ch-inp"><option value="not_done"${r.status!=='done'?' selected':''}>Не виконано</option><option value="done"${r.status==='done'?' selected':''}>Виконано</option></select>`;
  const cb=(id,ch)=>`<input type="checkbox" id="${id}"${ch?' checked':''}>`;
  const head=`<thead>
    <tr>
      <th rowspan="2">№</th><th rowspan="2" class="lft">Завдання</th>
      <th colspan="4" class="grp">${vet?esc(vet.nickname):'Ветеран'}</th>
      <th colspan="5" class="grp2">${nov?esc(nov.nickname):'Новачок'}</th>
      ${canEdit?'<th rowspan="2"></th>':''}
    </tr>
    <tr>
      <th class="grp">Норма</th><th class="grp">Статус</th><th class="grp">Загін</th><th class="grp">Бали</th>
      <th class="grp2">Норма</th><th class="grp2">Статус</th><th class="grp2">Загін</th><th class="grp2">Норма ветерана</th><th class="grp2">Бали</th>
    </tr>
  </thead>`;
  let body='';
  chTasks.forEach(t=>{
    const vr=vBy[t.id], nr=nBy[t.id];
    const vDone=vr&&vr.status==='done', nDone=nr&&nr.status==='done';
    body+=`<tr>
      <td>${t.row_no}</td><td class="lft">${esc(t.title)}</td>
      <td>${esc(t.norm_v||'—')}</td>
      <td>${canEdit?stSel(vr):(vDone?'Виконано':'Не виконано')}</td>
      <td>${canEdit?cb('sq_'+vr.id,vr.bonus_squad):(vr&&vr.bonus_squad?'Так':'—')}</td>
      <td class="pts">${vr?vr.points:0}</td>
      <td>${esc(novNorm(t)||'—')}</td>
      <td>${canEdit?stSel(nr):(nDone?'Виконано':'Не виконано')}</td>
      <td>${canEdit?cb('sq_'+nr.id,nr.bonus_squad):(nr&&nr.bonus_squad?'Так':'—')}</td>
      <td>${canEdit?cb('vn_'+nr.id,nr.bonus_vet_norm):(nr&&nr.bonus_vet_norm?'Так':'—')}</td>
      <td class="pts">${nr?nr.points:0}</td>
      ${canEdit?`<td><button class="ch-mini-btn primary ch-save-btn" onclick="chSaveTaskRow(${vr.id},${nr.id})">Зберегти</button></td>`:''}
    </tr>`;
  });
  return `<div class="table-wrapper"><table class="lb ch-pair-table">${head}<tbody>${body}</tbody></table></div>`;
}

async function chPatchProgress(id,squadOff){
  const st=document.getElementById('st_'+id);if(!st)return;
  const status=st.value;
  const bonus_squad=squadOff?false:(document.getElementById('sq_'+id)?.checked||false);
  const bonus_vet_norm=document.getElementById('vn_'+id)?.checked||false;
  await sbFetch('/rest/v1/progress?id=eq.'+id,{method:'PATCH',
    body:JSON.stringify({status,bonus_squad,bonus_vet_norm,updated_at:new Date().toISOString()})});
}

// Save a whole task row (veteran + novice). Two passes so a «Загін» bonus is
// validated only after both players already have their done battle recorded.
async function chSaveTaskRow(vId,nId){
  const msg=document.getElementById('chPairMsg');if(msg)msg.textContent='';
  try{
    await chPatchProgress(vId,true);
    await chPatchProgress(nId,true);
    await chPatchProgress(vId,false);
    await chPatchProgress(nId,false);
    await chLoadPair(chPair.id);
  }catch(e){
    const m='⚠ '+chErrMsg(e);
    if(msg)msg.textContent=m; else alert(m);
    await chLoadPair(chPair.id);
  }
}

/* ═══════════ SOLO PLAYER PAGE ═══════════ */
async function chLoadSolo(id){
  const box=document.getElementById('chSoloDetail');if(box)box.innerHTML=CH_LOADING;
  try{
    const ps=await chGet('participant?id=eq.'+id+'&select=*');chSolo=ps[0];
    if(!chSolo){box.innerHTML='<p class="hint">Гравця не знайдено.</p>';return;}
    chPairChallenge=chSolo.challenge_id;
    const cs=await chGet('challenge?id=eq.'+chSolo.challenge_id+'&select=*');chSoloC=cs[0];
    chTasks=await chGet('challenge_task?challenge_id=eq.'+chSolo.challenge_id+'&order=row_no.asc');
    chSoloRows=await chGet('v_progress_points?participant_id=eq.'+id+'&select=*');
    const cr=document.getElementById('chSoloCrumbCh');if(cr)cr.textContent=chSoloC.title;
    chRenderSolo();
  }catch(e){if(box)box.innerHTML='<p class="hint">Помилка: '+esc(chErrMsg(e))+'</p>';}
}

function chRenderSolo(){
  const box=document.getElementById('chSoloDetail');if(!box||!chSolo)return;
  const taskById=Object.fromEntries(chTasks.map(t=>[t.id,t]));
  const rows=[...chSoloRows].sort((a,b)=>(taskById[a.task_id]?.row_no||0)-(taskById[b.task_id]?.row_no||0));
  const pts=rows.reduce((a,r)=>a+(r.points||0),0);
  const done=rows.filter(r=>r.status==='done').length;
  const locked=chSoloC.status==='done'&&!isAdmin;
  const canEdit=isOfficer&&!locked;
  const normOf=t=>chSolo.class==='V'?t.norm_v:(chSolo.class==='N1'?t.norm_n1:t.norm_n2);
  const notClosed=rows.filter(r=>r.status!=='done').map(r=>taskById[r.task_id]?.title).filter(Boolean);

  let h=`<div class="page-head"><div class="page-title">${esc(chSolo.nickname)} <span class="ch-rank">${CH_CLASS_LABEL[chSolo.class]}</span></div>
    <p class="page-lede">${esc(chSoloC.title)}</p></div>`;
  h+=`<div class="ch-pairtot-box"><div class="ch-pairtot-lbl">Бали гравця</div><div class="ch-pairtot-val">${pts}</div>
    <div class="ch-help ok">Виконано ${done} із 7</div></div>`;
  if(locked)h+=`<p class="hint">🔒 Челендж завершено — редагування заблоковане.</p>`;
  h+=`<div class="ch-notclosed">${notClosed.length?('Не закрито: '+notClosed.map(esc).join(', ')):'Усі завдання виконано ✓'}</div>`;
  h+=`<div id="chSoloMsg" class="ch-row-err" style="margin:10px 0"></div>`;
  h+=`<div class="table-wrapper"><table class="lb ch-solo-table"><thead><tr>
    <th>№</th><th class="lft">Завдання</th><th>Норма</th><th>Статус</th><th>Бали</th>${canEdit?'<th></th>':''}</tr></thead><tbody>`;
  rows.forEach(r=>{
    const t=taskById[r.task_id]||{};const d=r.status==='done';
    h+=`<tr>
      <td>${t.row_no}</td><td class="lft">${esc(t.title)}</td><td>${esc(normOf(t)||'—')}</td>
      <td>${canEdit
        ?`<select id="ss_${r.id}" class="ch-inp"><option value="not_done"${!d?' selected':''}>Не виконано</option><option value="done"${d?' selected':''}>Виконано</option></select>`
        :(d?'Виконано':'Не виконано')}</td>
      <td class="pts">${r.points||0}</td>
      ${canEdit?`<td><button class="ch-mini-btn primary ch-save-btn" onclick="chSaveSoloRow(${r.id})">Зберегти</button></td>`:''}
    </tr>`;
  });
  h+=`</tbody></table></div>`;
  box.innerHTML=h;
}

async function chSaveSoloRow(id){
  const st=document.getElementById('ss_'+id);if(!st)return;
  const msg=document.getElementById('chSoloMsg');if(msg)msg.textContent='';
  try{
    await sbFetch('/rest/v1/progress?id=eq.'+id,{method:'PATCH',
      body:JSON.stringify({status:st.value,bonus_squad:false,bonus_vet_norm:false,updated_at:new Date().toISOString()})});
    await chLoadSolo(chSolo.id);
  }catch(e){const m='⚠ '+chErrMsg(e);if(msg)msg.textContent=m;else alert(m);await chLoadSolo(chSolo.id);}
}

/* ═══════════ VISIT LOG (owner-only journal) ═══════════ */
const SUPER_ADMIN='pavlozhyhalov@gmail.com';
function isSuperAdmin(){return !!(currentUser&&currentUser.email&&currentUser.email.toLowerCase()===SUPER_ADMIN);}
function chDetectBot(ua){
  return /bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|headless|preview|python|curl|wget|monitor|uptime|semrush|ahrefs|petalbot|scan/i.test(ua||'')
    || (navigator.webdriver===true);
}
function logVisit(){
  try{
    let vid=null;try{vid=localStorage.getItem('visitor_id');}catch(_){}
    if(!vid){vid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+'-'+Math.random().toString(16).slice(2));try{localStorage.setItem('visitor_id',vid);}catch(_){}}
    const ua=(navigator.userAgent||'').slice(0,300);
    fetch(SUPA_URL+'/rest/v1/visit_log',{method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({visitor_id:vid,email:currentUser?currentUser.email:null,path:(location.hash||'/').slice(0,120),user_agent:ua,referer:(document.referrer||'').slice(0,300),is_bot:chDetectBot(ua)})
    }).catch(()=>{});
  }catch(_){}
}
function chUAShort(ua){
  ua=ua||'';let os='?';
  if(/iPhone|iPad|iPod/.test(ua))os='iPhone/iPad';
  else if(/Android/.test(ua))os='Android';
  else if(/Windows/.test(ua))os='Windows';
  else if(/Mac OS X|Macintosh/.test(ua))os='Mac';
  else if(/Linux/.test(ua))os='Linux';
  let br='';
  if(/CriOS|Chrome/.test(ua))br='Chrome';
  else if(/Firefox|FxiOS/.test(ua))br='Firefox';
  else if(/Safari/.test(ua)&&!/Chrome|CriOS/.test(ua))br='Safari';
  return os+(br?' · '+br:'');
}
function openVisits(){showPage('visitsPage');window.location.hash='visits';loadVisits();}
async function loadVisits(){
  const box=document.getElementById('visitsBody');if(!box)return;
  if(!isSuperAdmin()){box.innerHTML='<p class="hint">Доступно лише власнику акаунта.</p>';return;}
  box.innerHTML=CH_LOADING;
  try{const rows=await chGet('visit_log?select=*&order=created_at.desc&limit=500');renderVisits(rows);}
  catch(e){box.innerHTML='<p class="hint">Помилка: '+esc(chErrMsg(e))+'</p>';}
}
function renderVisits(rows){
  const box=document.getElementById('visitsBody');if(!box)return;
  const now=Date.now();
  const within=(r,ms)=>now-Date.parse(r.created_at)<=ms;
  const uniq=arr=>new Set(arr.map(r=>r.visitor_id||('id'+r.id))).size;
  const day=rows.filter(r=>within(r,86400000));
  const dayHumans=day.filter(r=>!r.is_bot), dayBots=day.filter(r=>r.is_bot);
  const weekHumans=rows.filter(r=>within(r,7*86400000)&&!r.is_bot);
  let h=`<div class="ch-manage" style="gap:14px">
    <div class="ch-manage-item"><span class="ch-manage-lbl">Унікальні люди · 24 год</span><div class="ch-pairtot-val" style="font-size:30px">${uniq(dayHumans)}</div></div>
    <div class="ch-manage-item"><span class="ch-manage-lbl">Заходів людей · 24 год</span><div class="ch-pairtot-val" style="font-size:30px">${dayHumans.length}</div></div>
    <div class="ch-manage-item"><span class="ch-manage-lbl">Ботів · 24 год</span><div class="ch-pairtot-val" style="font-size:30px;color:var(--muted)">${dayBots.length}</div></div>
    <div class="ch-manage-item"><span class="ch-manage-lbl">Унікальні люди · 7 днів</span><div class="ch-pairtot-val" style="font-size:30px">${uniq(weekHumans)}</div></div>
  </div>`;
  if(!rows.length){h+='<p class="hint">Записів ще немає — журнал почне наповнюватися з наступних відкриттів сайту.</p>';box.innerHTML=h;return;}
  h+=`<p class="hint" style="margin:16px 0 6px">Останні візити (до 500) · час за Києвом</p>`;
  h+=`<div class="table-wrapper"><table class="lb ch-visit-table"><thead><tr>
    <th class="lft">Час</th><th>Тип</th><th class="lft">Хто</th><th class="lft">Пристрій</th><th class="lft">Локація</th><th class="lft">Звідки</th></tr></thead><tbody>${
    rows.map(r=>{
      const t=new Date(r.created_at).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const who=r.email?esc(r.email):('гість · '+esc((r.visitor_id||'').replace(/^ip:/,'').slice(0,6)));
      const loc=[r.city,r.country].filter(Boolean).map(esc).join(', ')||'—';
      const ref=r.referer?esc(r.referer.replace(/^https?:\/\//,'').replace(/\/$/,'').slice(0,40)):'—';
      return `<tr class="${r.is_bot?'v-bot':''}"><td class="lft">${t}</td><td>${r.is_bot?'🤖 бот':'🧑 людина'}</td><td class="lft">${who}</td><td class="lft">${esc(chUAShort(r.user_agent))}</td><td class="lft">${loc}</td><td class="lft">${ref}</td></tr>`;
    }).join('')
  }</tbody></table></div>`;
  box.innerHTML=h;
}

/* start home recruitment banner */
chInitBanner();
