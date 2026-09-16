/* ══════════════════════════════════════════════
   CHALLENGE «Ветеран + Новачок» — challenge.js
   Залежності (з index.html): SUPA_URL, SUPA_KEY,
   accessToken, currentUser, isOfficer, isAdmin,
   sbFetch(), esc(), showPage(), randInt()
   Підрахунок балів і валідації — на сервері (Supabase).
   ══════════════════════════════════════════════ */

const CH_CLASS_LABEL={V:'Ветеран',N1:'Новачок Р1',N2:'Новачок Р2'};
const CH_STATUS={draft:['Чернетка','done'],registration:['Реєстрація','reg'],
  active:['Активний','active'],final:['Фінал','active'],done:['Завершено','done']};

let chChallenges=[], chC=null, chTasks=[], chParts=[], chPairs=[], chScores=[], chFinal=null;
let chPair=null, chPairC=null, chPairRows=[], chPairChallenge=null;
let chWA=0;

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
function chBackToChallenge(){if(chPairChallenge)openChallenge(chPairChallenge);else openChallenges();}

function chOnAuthChange(){
  if(document.getElementById('tournamentsListPage').classList.contains('active'))chRenderList();
  else if(document.getElementById('challengePage').classList.contains('active')&&chC)chRenderChallenge();
  else if(document.getElementById('pairPage').classList.contains('active')&&chPair)chRenderPair();
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
    chPairs =await chGet('pair?challenge_id=eq.'+id);
    chScores=await chGet('v_pair_scores?challenge_id=eq.'+id);
    const fr=await chGet('final_result?challenge_id=eq.'+id);chFinal=fr[0]||null;
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
    <th style="width:34px">№</th><th style="text-align:left">Завдання</th><th>Р1</th><th>Р2</th><th>Ветеран</th></tr></thead><tbody>${
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
  let h='';

  // header
  h+=`<div class="page-head"><div class="page-title">${esc(chC.title)} ${chStatusBadge(chC.status)}</div>
    <p class="page-lede">${chDateRange(chC)} · Пари формуються випадковим жеребкуванням · Бали пари — сума обох гравців</p></div>`;

  // rules
  h+=`<div class="rules-box"><div class="rules-box-title">Опис</div>
    <div class="ch-desc" id="chRulesView">${chDescHtml(chC.rules_text)}</div>`;
  if(off)h+=`<button class="ch-mini-btn" onclick="chEditRules()">✏ Редагувати опис</button>`;
  h+=`</div>`;
  h+=`<div class="ch-section-label">Норми за класами</div>`+chNormsTable();

  // officer status controls
  if(off){
    h+=`<div class="ch-officer-bar">`;
    if(reg)h+=`<button class="ch-mini-btn" onclick="chOpenAddPart()">＋ Додати учасника</button>`;
    if(reg&&chVets().length>0)h+=`<button class="ch-mini-btn primary" onclick="chFixPairs()">✔ Зафіксувати пари → Активний</button>`;
    if(reg&&chPairs.length>0)h+=`<button class="ch-mini-btn danger" onclick="chResetDraw()">↺ Перезапустити жеребкування</button>`;
    if(chC.status==='active'){h+=`<button class="ch-mini-btn" onclick="chMarkFinalists()">★ Позначити фіналістів (топ-2)</button>`;
      h+=`<button class="ch-mini-btn primary" onclick="chSetStatus('final')">→ До фіналу</button>`;}
    if(chC.status==='final')h+=`<button class="ch-mini-btn primary" onclick="chSetStatus('done')">✔ Завершити челендж</button>`;
    if(chC.status==='done'&&isAdmin)h+=`<button class="ch-mini-btn" onclick="chSetStatus('final')">↩ Розблокувати (адмін)</button>`;
    h+=`</div>`;
  }

  // participants + draw (registration)
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

  // pairs
  h+=`<div class="ch-section-label">Пари (${chPairs.length})</div>`;
  h+=`<div class="ch-pairs">`+chPairCards()+`</div>`;

  // final 2x2
  if(chC.status==='final'||chC.status==='done'){
    h+=chFinalBlock();
  }

  box.innerHTML=h;
  if(reg&&isOfficer&&chVets().length===chNovices().length&&chVets().length>0&&chUnpairedVets().length>0){
    chFillDraw(chUnpairedNovices(), chUnpairedVets());
  }
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
        <div class="ch-pair-names">⚓ ${esc(vet?vet.nickname:'?')} <span class="ch-vs">×</span> ${esc(nov?nov.nickname:'?')} <span class="ch-rank">${nov?CH_CLASS_LABEL[nov.class]:''}</span></div>
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
  openModal('chAddPartModal');
  setTimeout(()=>document.getElementById('chPartNick').focus(),50);
}
async function chConfirmAddParticipant(){
  const nick=document.getElementById('chPartNick').value.trim();
  const cls=document.getElementById('chPartClass').value;
  const err=document.getElementById('chPartError');err.textContent='';
  if(!nick){err.textContent='Введи нікнейм';return;}
  try{
    await sbFetch('/rest/v1/participant',{method:'POST',body:JSON.stringify({challenge_id:chC.id,nickname:nick,class:cls})});
    closeModal('chAddPartModal');
    chParts=await chGet('participant?challenge_id=eq.'+chC.id+'&order=created_at.asc');
    chRenderChallenge();
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
  const pairTotal=nPts+vPts;
  const locked=chPairC.status==='done'&&!isAdmin;
  const canEdit=isOfficer&&!locked;

  let h=`<div class="page-head"><div class="page-title">${esc(vet?.nickname||'?')} <span class="ch-vs">×</span> ${esc(nov?.nickname||'?')} <span class="ch-rank">${nov?CH_CLASS_LABEL[nov.class]:''}</span></div>
    <p class="page-lede">${esc(chPairC.title)}</p></div>`;
  h+=`<div class="ch-pairtot-box"><div class="ch-pairtot-lbl">Бали пари</div><div class="ch-pairtot-val">${pairTotal}</div>
    <div class="ch-help ok">Ветеран ${vPts} б (${vDone}/7) · Новачок ${nPts} б (${nDone}/7)</div></div>`;
  if(locked)h+=`<p class="hint">🔒 Челендж завершено — редагування заблоковане.</p>`;

  const notV=vRows.filter(r=>r.status!=='done').map(r=>taskById[r.task_id]?.title).filter(Boolean);
  const notN=nRows.filter(r=>r.status!=='done').map(r=>taskById[r.task_id]?.title).filter(Boolean);
  h+=`<div class="ch-notclosed"><b>${esc(vet?.nickname||'Ветеран')}</b> — ${notV.length?'не закрито: '+notV.map(esc).join(', '):'усі завдання виконано ✓'}</div>`;
  h+=`<div class="ch-notclosed"><b>${esc(nov?.nickname||'Новачок')}</b> — ${notN.length?'не закрито: '+notN.map(esc).join(', '):'усі завдання виконано ✓'}</div>`;
  h+=`<div id="chPairMsg" class="ch-row-err" style="margin:10px 0"></div>`;
  h+=`<p class="hint" style="margin-bottom:6px">↔ Таблицю можна гортати вліво-вправо</p>`;
  h+=chPairTable(vet,nov,vRows,nRows,taskById,canEdit);

  box.innerHTML=h;
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
      <th colspan="4" class="grp">Ветеран${vet?' · '+esc(vet.nickname):''}</th>
      <th colspan="5" class="grp2">Новачок${nov?' · '+esc(nov.nickname):''}</th>
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
