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
function chNextUnpairedVet(){const set=new Set(chPairs.map(p=>p.veteran_id));return chVets().find(v=>!set.has(v.id))||null;}

function chRenderChallenge(){
  const box=document.getElementById('chDetail');if(!box||!chC)return;
  const off=isOfficer;
  const reg=chC.status==='registration'||chC.status==='draft';
  let h='';

  // header
  h+=`<div class="page-head"><div class="page-title">${esc(chC.title)} ${chStatusBadge(chC.status)}</div>
    <p class="page-lede">${chDateRange(chC)} · Поріг допомоги: новачок ${chC.help_threshold}/7</p></div>`;

  // rules
  h+=`<div class="rules-box"><div class="rules-box-title">Правила</div>
    <div class="ch-rules-text" id="chRulesView">${esc(chC.rules_text||'').replace(/\n/g,'<br>')}</div>`;
  if(chC.pdf_url)h+=`<a class="ch-pdf" href="${esc(chC.pdf_url)}" target="_blank" rel="noopener">📄 Правила у PDF ↗</a>`;
  if(off)h+=`<button class="ch-mini-btn" onclick="chEditRules()">✏ Редагувати правила</button>`;
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
      const vet=chNextUnpairedVet();
      if(nv===nn&&nv>0&&vet){
        h+=`<div class="ch-draw-vet">Жеребкуємо новачка для ветерана: <b>${esc(vet.nickname)}</b></div>
          <div class="wheel-frame ch-wheel-frame"><canvas id="chWheel" width="300" height="300"></canvas><div class="pointer"></div></div>
          <label class="ch-balance"><input type="checkbox" id="chBalance"> Балансувати ранги (N1/N2)</label>
          <button class="spin-btn" id="chSpinBtn" onclick="chDrawSpin()">Крутити колесо</button>`;
      }else if(nv===nn&&nv>0&&!vet){
        h+=`<p class="hint">✔ Усі ветерани отримали пару. Натисніть «Зафіксувати пари».</p>`;
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
  if(reg&&isOfficer&&chNextUnpairedVet()&&chVets().length===chNovices().length&&chVets().length>0){
    chDrawWheelStatic(chUnpairedNovices());
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
    const thr=chC.help_threshold, nd=s.novice_done||0;
    const help=nd>=thr?`Новачок ${nd}/7 ✓`:`Новачок ${nd}/7 · бали ветерана заморожені`;
    const finalist=p.is_finalist||(idx<2&&(chC.status==='final'||chC.status==='done'));
    return `<div class="ch-pair-card" onclick="openPair(${p.id})">
      <div class="ch-pair-top">
        <div class="ch-pair-names">⚓ ${esc(vet?vet.nickname:'?')} <span class="ch-vs">×</span> ${esc(nov?nov.nickname:'?')} <span class="ch-rank">${nov?CH_CLASS_LABEL[nov.class]:''}</span></div>
        ${finalist?'<span class="ch-finalist">★ ФІНАЛІСТ</span>':''}
      </div>
      <div class="ch-pair-total">${s.pair_total||0}<span> балів</span></div>
      <div class="ch-help ${nd>=thr?'ok':'frozen'}">${help}</div>
      <div class="ch-detail-link">Детально →</div>
    </div>`;
  }).join('');
}

/* ═══════════ WHEEL (draw) ═══════════ */
const CH_SC=['#0d2540','#0f2e38','#112038','#0d2b30','#162040','#0d2838','#102030','#142838'];
function chWheelDraw(ctx,sz,list){
  const cx=sz/2,cy=sz/2,r=sz/2-6,n=list.length;if(!n)return;const sl=Math.PI*2/n;
  ctx.clearRect(0,0,sz,sz);
  for(let i=0;i<n;i++){
    const s=chWA+i*sl,e=s+sl;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,s,e);ctx.closePath();
    ctx.fillStyle=CH_SC[i%CH_SC.length];ctx.fill();ctx.strokeStyle='#07101a';ctx.lineWidth=1.5;ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(s+sl/2);ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillStyle='#d8eaf5';ctx.font='600 '+(n<=6?12:n<=12?10:9)+'px Syne,sans-serif';
    const nm=list[i].nickname, lb=nm.length>12?nm.slice(0,11)+'…':nm;
    ctx.fillText(lb,r-8,0);ctx.restore();
  }
  ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.fillStyle='#07101a';ctx.fill();ctx.strokeStyle='#b8923e';ctx.lineWidth=2;ctx.stroke();
}
function chDrawWheelStatic(list){
  const cv=document.getElementById('chWheel');if(!cv)return;
  chWheelDraw(cv.getContext('2d'),cv.width,list);
}
function chAnimateWheel(list,targetIdx){
  return new Promise(resolve=>{
    const cv=document.getElementById('chWheel');if(!cv||!list.length){resolve();return;}
    const ctx=cv.getContext('2d'),sz=cv.width,n=list.length,sl=Math.PI*2/n;
    const tgt=(((-Math.PI/2)-targetIdx*sl-sl/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    const cur=((chWA%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    let diff=tgt-cur;if(diff<0)diff+=Math.PI*2;
    const total=(6+randInt(4))*Math.PI*2+diff, sa=chWA, dur=3500+randInt(1200), t0=performance.now();
    const ease=t=>1-Math.pow(1-t,4);
    (function fr(now){
      const tm=Math.min((now-t0)/dur,1);
      chWA=sa+total*ease(tm);chWheelDraw(ctx,sz,list);
      if(tm<1)requestAnimationFrame(fr);else{chWA=sa+total;chWheelDraw(ctx,sz,list);resolve();}
    })(t0);
  });
}
async function chDrawSpin(){
  if(!isOfficer)return;
  const vet=chNextUnpairedVet();if(!vet)return;
  const remaining=chUnpairedNovices();if(!remaining.length)return;
  const balance=document.getElementById('chBalance')?.checked||false;
  const btn=document.getElementById('chSpinBtn');if(btn)btn.disabled=true;
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/rpc/draw_next_pair',{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+(accessToken||SUPA_KEY),'Content-Type':'application/json'},
      body:JSON.stringify({p_challenge:chC.id,p_veteran:vet.id,p_balance:balance})
    });
    if(!r.ok)throw new Error(await r.text());
    const noviceId=await r.json();
    let idx=remaining.findIndex(n=>n.id===noviceId);if(idx<0)idx=0;
    await chAnimateWheel(remaining,idx);
    await chReloadPairs();
    chRenderChallenge();
  }catch(e){alert('Помилка жеребкування: '+chErrMsg(e));if(btn)btn.disabled=false;}
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
  const thr=chPairC.help_threshold;
  const rowsOf=pid=>chPairRows.filter(r=>r.participant_id===pid);
  const sumPts=rows=>rows.reduce((a,r)=>a+(r.points||0),0);
  const doneCnt=rows=>rows.filter(r=>r.status==='done').length;
  const vRows=rowsOf(chPair.veteran_id), nRows=rowsOf(chPair.novice_id);
  const vPts=sumPts(vRows), nPts=sumPts(nRows), nDone=doneCnt(nRows);
  const vetCounted=nDone>=thr?vPts:0, pairTotal=nPts+vetCounted;
  const locked=chPairC.status==='done'&&!isAdmin;
  const canEdit=isOfficer&&!locked;

  let h=`<div class="page-head"><div class="page-title">${esc(vet?.nickname||'?')} <span class="ch-vs">×</span> ${esc(nov?.nickname||'?')} <span class="ch-rank">${nov?CH_CLASS_LABEL[nov.class]:''}</span></div>
    <p class="page-lede">${esc(chPairC.title)} · Поріг допомоги: ${thr}/7</p></div>`;
  h+=`<div class="ch-pairtot-box"><div class="ch-pairtot-lbl">Бали пари</div><div class="ch-pairtot-val">${pairTotal}</div>
    <div class="ch-help ${nDone>=thr?'ok':'frozen'}">${nDone>=thr?`Новачок ${nDone}/7 ✓ — бали ветерана зараховано`:`Новачок ${nDone}/7 · бали ветерана заморожені (треба ${thr})`}</div></div>`;
  if(locked)h+=`<p class="hint">🔒 Челендж завершено — редагування заблоковане.</p>`;

  h+=chPlayerBlock('Ветеран', vet, vRows, taskById, thr, canEdit, sumPts(vRows), doneCnt(vRows), false, vetCounted, nDone>=thr);
  h+=chPlayerBlock('Новачок', nov, nRows, taskById, thr, canEdit, nPts, nDone, true, nPts, true);

  box.innerHTML=h;
}

function chPlayerBlock(role, part, rows, taskById, thr, canEdit, pts, done, isNovice, countedPts, counted){
  if(!part)return '';
  rows=[...rows].sort((a,b)=>(taskById[a.task_id]?.row_no||0)-(taskById[b.task_id]?.row_no||0));
  const notClosed=rows.filter(r=>r.status!=='done').map(r=>esc(taskById[r.task_id]?.title||'')).filter(Boolean);
  const normOf=t=>isNovice?(part.class==='N1'?t.norm_n1:t.norm_n2):t.norm_v;
  let h=`<div class="ch-player-block"><div class="ch-player-head"><span class="ch-player-role ${isNovice?'nov':'vet'}">${role}</span>
    <span class="ch-player-nick">${esc(part.nickname)}</span><span class="ch-rank">${CH_CLASS_LABEL[part.class]}</span></div>`;
  h+=`<div class="ch-notclosed">${notClosed.length?('Не закрито: '+notClosed.join(', ')):'Усі завдання виконано ✓'}</div>`;
  h+=`<div class="ch-rows">`;
  rows.forEach(r=>{
    const t=taskById[r.task_id]||{};const done_=r.status==='done';
    h+=`<div class="ch-row ${done_?'done':''}">
      <div class="ch-row-head"><span class="ch-row-no">№${t.row_no}</span><span class="ch-row-title">${esc(t.title)}</span>
        <span class="ch-row-pts">${r.points||0} б</span></div>
      <div class="ch-row-norm">Норма: ${esc(normOf(t)||'—')}</div>`;
    if(canEdit){
      h+=`<div class="ch-row-edit">
        <select id="st_${r.id}" class="ch-inp"><option value="not_done"${!done_?' selected':''}>Не виконано</option><option value="done"${done_?' selected':''}>Виконав</option></select>
        <input type="datetime-local" id="bt_${r.id}" class="ch-inp" value="${chToLocalInput(r.battle_at)}">
        <label class="ch-cb"><input type="checkbox" id="sq_${r.id}"${r.bonus_squad?' checked':''}> Загін</label>
        ${isNovice?`<label class="ch-cb"><input type="checkbox" id="vn_${r.id}"${r.bonus_vet_norm?' checked':''}> Норма ветерана</label>`:''}
        <button class="ch-mini-btn primary" onclick="chSaveRow(${r.id})">Зберегти</button>
      </div><div class="ch-row-err" id="er_${r.id}"></div>`;
    }else{
      h+=`<div class="ch-row-ro">Статус: <b>${done_?'Виконав':'Не виконано'}</b>${done_?` · Бій: ${chFmtDT(r.battle_at)}${r.bonus_squad?' · Загін':''}${r.bonus_vet_norm?' · Норма ветерана':''}`:''}</div>`;
    }
    h+=`</div>`;
  });
  h+=`</div><div class="ch-player-sum">Виконано ${done}/7 · бали ${pts}${(!isNovice&&!counted)?' <span class="frozen">(заморожено)</span>':''}</div></div>`;
  return h;
}

async function chSaveRow(id){
  const status=document.getElementById('st_'+id).value;
  const btVal=document.getElementById('bt_'+id)?.value;
  const battle_at=(status==='done'&&btVal)?new Date(btVal).toISOString():null;
  const bonus_squad=document.getElementById('sq_'+id)?.checked||false;
  const bonus_vet_norm=document.getElementById('vn_'+id)?.checked||false;
  const err=document.getElementById('er_'+id);if(err)err.textContent='';
  const body={status,battle_at,bonus_squad,bonus_vet_norm,updated_at:new Date().toISOString()};
  try{
    await sbFetch('/rest/v1/progress?id=eq.'+id,{method:'PATCH',body:JSON.stringify(body)});
    await chLoadPair(chPair.id);
  }catch(e){if(err)err.textContent='⚠ '+chErrMsg(e);}
}
