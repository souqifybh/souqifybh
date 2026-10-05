/* Souqify-bh Accounts module. Loaded by admin.html after the main script. */
(function(){
const $ = id => document.getElementById(id);
const A = { orders:[], docs:{}, exp:[], set:{}, tab:'overview', range:'month', from:'', to:'', sel:{} };
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f3 = n => (Number(n)||0).toFixed(3);
const ymd = d => { const x=new Date(d); return isNaN(x)?'':new Date(x.getTime()+3*36e5).toISOString().slice(0,10); };
const today = () => ymd(Date.now());
const DEF_CATS = ['Meta Ads','Packaging Materials','Delivery Charge','Stock Purchase'];
const rate = () => Number(A.set.acctInrRate)||0.0045;
const fee = () => A.set.acctCourierFee!==undefined && A.set.acctCourierFee!=='' ? Number(A.set.acctCourierFee) : 0.9;
const deduct = () => String(A.set.acctCourierDeduct)!=='false';
const cats = () => { let c=[]; try{c=JSON.parse(A.set.acctCategories||'[]')}catch(e){} return [...new Set([...DEF_CATS,...c])]; };
const isCod = o => /cod|cash on delivery/i.test(o.paymentMethod||'');
const st = o => String(o.orderStatus||'new').toLowerCase();
function val(o){ const v=Number(o.total||0)-Number(o.promoDiscount||0)-Number(o.cartOfferDiscount||0)+Number(o.shippingFee||0); return Math.max(0,v)*(o.currency==='INR'?rate():1); }
function collect(o){ const v=(o.amountCollected!==''&&o.amountCollected!=null)?Number(o.amountCollected):val(o); return v*(o.currency==='INR'?rate():1); }
function nextMonday(d){ const x=new Date(d+'T00:00:00Z'); const add=((8-x.getUTCDay())%7)||7; x.setUTCDate(x.getUTCDate()+add); return x.toISOString().slice(0,10); }
function inRange(d){ return d && (!A.from||d>=A.from) && (!A.to||d<=A.to); }
function setRange(){
  const t=new Date(Date.now()+3*36e5), y=t.getUTCFullYear(), m=t.getUTCMonth(), p=n=>String(n).padStart(2,'0'), r=A.range;
  const last=(yy,mm)=>new Date(Date.UTC(yy,mm+1,0)).getUTCDate();
  if(r==='month'){A.from=`${y}-${p(m+1)}-01`;A.to=`${y}-${p(m+1)}-${last(y,m)}`;}
  else if(r==='last'){const d=new Date(Date.UTC(y,m-1,1));A.from=`${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-01`;A.to=`${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${last(d.getUTCFullYear(),d.getUTCMonth())}`;}
  else if(r==='30'){A.from=ymd(Date.now()-30*864e5);A.to=today();}
  else if(r==='year'){A.from=`${y}-01-01`;A.to=`${y}-12-31`;}
  else if(r==='all'){A.from='';A.to='';}
}
async function api(action, extra){ const r=await fetch(CONFIG.API_URL,{method:'POST',body:JSON.stringify(Object.assign({action,password:ADMIN_PASSWORD},extra||{}))}); return r.json(); }

/* ---------- derive ledger ---------- */
function derive(){
  const sales=[], notes=[], courier=[];
  A.orders.forEach(o=>{
    const d=A.docs[o.id]; if(!d||!d.invoiceNo) return;
    const v=val(o);
    sales.push({o,d,v,date:d.invoiceDate});
    if(st(o)==='cancelled'&&d.creditNoteNo) notes.push({o,d,v,date:d.creditNoteDate||d.invoiceDate});
    if(o.orderType!=='gift' && d.shippedDate && st(o)!=='cancelled') courier.push({o,d,date:d.shippedDate,v:fee()});
  });
  return {sales,notes,courier};
}
function cod(L){ // Delybell COD ledger: delivered COD orders
  return L.sales.filter(s=>st(s.o)==='delivered'&&isCod(s.o)&&s.d.deliveredDate).map(s=>{
    const gross=collect(s.o), f=deduct()?fee():0, rel=nextMonday(s.d.deliveredDate);
    return {id:s.o.id,date:s.d.deliveredDate,release:rel,gross,fee:f,net:gross-f,received:String(s.d.received)==='true'||s.d.received===true,recDate:s.d.receivedDate};
  });
}
function isReceived(s){ const d=s.d; if(d.received===true||String(d.received)==='true') return true; return !isCod(s.o)&&String(s.o.paymentStatus).toLowerCase()==='paid'; }
function totals(){
  const L=derive(), R=x=>x.filter(i=>inRange(i.date));
  const S=R(L.sales).filter(s=>st(s.o)!=='cancelled'||true), N=R(L.notes), C=R(L.courier);
  const gross=S.reduce((a,s)=>a+s.v,0), cn=N.reduce((a,s)=>a+s.v,0), net=gross-cn;
  const E=A.exp.filter(e=>inRange(e.date)), purch=E.filter(e=>e.kind==='purchase').reduce((a,e)=>a+Number(e.amount),0);
  const opexMan=E.filter(e=>e.kind!=='purchase').reduce((a,e)=>a+Number(e.amount),0), delivery=C.reduce((a,c)=>a+c.v,0);
  const opex=opexMan+delivery, gp=net-purch, profit=gp-opex;
  const live=L.sales.filter(s=>st(s.o)!=='cancelled'&&inRange(s.date));
  const recv=live.filter(isReceived).reduce((a,s)=>a+s.v,0), pending=live.reduce((a,s)=>a+s.v,0)-recv;
  const unpaid=E.filter(e=>e.status!=='paid').reduce((a,e)=>a+Number(e.amount),0);
  return {L,S,N,C,E,gross,cn,net,purch,opexMan,delivery,opex,gp,profit,recv,pending,unpaid,count:live.length};
}
const money = n => `<span class="${n<0?'acc-neg':''}">${n<0?'-':''}${f3(Math.abs(n))}</span>`;

/* ---------- svg charts ---------- */
function monthly(T){
  const m={}; const add=(k,f,v)=>{ if(!k) return; m[k]=m[k]||{s:0,e:0}; m[k][f]+=v; };
  T.S.forEach(s=>add(s.date.slice(0,7),'s',s.v)); T.N.forEach(s=>add(s.date.slice(0,7),'s',-s.v));
  T.E.forEach(e=>add(e.date.slice(0,7),'e',Number(e.amount))); T.C.forEach(c=>add(c.date.slice(0,7),'e',c.v));
  return Object.keys(m).sort().map(k=>({k,s:m[k].s,e:m[k].e,p:m[k].s-m[k].e}));
}
function barChart(rows){
  if(!rows.length) return '<p class="muted">No data in this period.</p>';
  const W=640,H=230,pad=34,mx=Math.max(1,...rows.map(r=>Math.max(r.s,r.e))), bw=Math.min(26,(W-pad*2)/rows.length/3.2);
  const x=i=>pad+(i+.5)*((W-pad*2)/rows.length), y=v=>H-24-(Math.max(0,v)/mx)*(H-50);
  let g=''; for(let i=0;i<=4;i++){const v=mx*i/4;g+=`<line x1="${pad}" x2="${W-6}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/><text x="2" y="${y(v)+3}" font-size="9" fill="#999">${v>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0)}</text>`;}
  const pts=rows.map((r,i)=>`${x(i)},${y(r.p)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${g}${rows.map((r,i)=>`<rect x="${x(i)-bw-1}" y="${y(r.s)}" width="${bw}" height="${H-24-y(r.s)}" rx="3" fill="#A5BA4A"><title>${r.k} sales ${f3(r.s)}</title></rect><rect x="${x(i)+1}" y="${y(r.e)}" width="${bw}" height="${H-24-y(r.e)}" rx="3" fill="#E07A5F"><title>${r.k} expenses ${f3(r.e)}</title></rect><text x="${x(i)}" y="${H-8}" font-size="9.5" text-anchor="middle" fill="#6B6B70">${r.k.slice(2)}</text>`).join('')}<polyline points="${pts}" fill="none" stroke="#1C1C1E" stroke-width="2"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.p)}" r="3" fill="#1C1C1E"><title>${r.k} profit ${f3(r.p)}</title></circle>`).join('')}</svg>
  <div class="muted" style="font-size:11.5px"><b style="color:#A5BA4A">■</b> Net sales &nbsp;<b style="color:#E07A5F">■</b> Costs &nbsp;<b>●</b> Profit line</div>`;
}
function hbars(items){
  items=items.filter(i=>i.v>0).sort((a,b)=>b.v-a.v); const tot=items.reduce((a,i)=>a+i.v,0)||1;
  if(!items.length) return '<p class="muted">No costs recorded yet.</p>';
  const col=['#46501B','#A5BA4A','#E07A5F','#3D5A80','#E0A800','#8D6A9F','#5C8D89'];
  return items.map((i,k)=>`<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span>${esc(i.n)}</span><b>${f3(i.v)} <span class="muted">(${(i.v/tot*100).toFixed(0)}%)</span></b></div><div style="background:#f0eded;border-radius:6px;height:9px"><div style="width:${i.v/tot*100}%;background:${col[k%7]};height:9px;border-radius:6px"></div></div></div>`).join('');
}

/* ---------- views ---------- */
const kpi=(l,v,s,c)=>`<div class="stat-card"><div class="lbl">${l}</div><div class="val" style="${c?'color:'+c:''}">${v}</div><div class="delta" style="color:#6B6B70">${s||''}</div></div>`;
function vOverview(T){
  const cat={}; T.E.forEach(e=>cat[e.category]=(cat[e.category]||0)+Number(e.amount)); if(T.delivery) cat['Delivery (Delybell)']=(cat['Delivery (Delybell)']||0)+T.delivery;
  const margin=T.net>0?(T.profit/T.net*100):0, aov=T.count?T.net/T.count:0;
  const cashIn=T.recv, delyPending=cod(T.L).filter(c=>!c.received&&inRange(c.date)).reduce((a,c)=>a+c.net,0);
  return `<div class="stat-grid">
    ${kpi('Net sales (BHD)',f3(T.net),`${T.count} orders · credit notes ${f3(T.cn)}`)}
    ${kpi('Total costs',f3(T.purch+T.opex),`Purchases ${f3(T.purch)} · Expenses ${f3(T.opex)}`)}
    ${kpi(T.profit>=0?'Net profit':'Net loss',(T.profit<0?'-':'')+f3(Math.abs(T.profit)),`Margin ${margin.toFixed(1)}%`,T.profit>=0?'#1E7A44':'#B23B2E')}
    ${kpi('Gross profit',f3(T.gp),'Net sales − purchases')}
    ${kpi('Money received',f3(cashIn),'Confirmed orders paid')}
    ${kpi('Receivable',f3(T.pending),'Not yet received')}
    ${kpi('With Delybell (COD)',f3(delyPending),'Awaiting Monday release')}
    ${kpi('Unpaid bills',f3(T.unpaid),`Avg order ${f3(aov)}`)}
  </div>
  <div class="grid2"><div class="card"><h2>Sales vs costs <span class="muted">by month</span></h2>${barChart(monthly(T))}</div>
  <div class="card"><h2>Where the money goes</h2>${hbars(Object.keys(cat).map(n=>({n,v:cat[n]})).concat([{n:'Stock purchases',v:T.purch}]))}</div></div>`;
}
function tbl(head,rows,empty){ return `<div class="card" style="overflow:auto"><table class="tbl"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr class="empty-row"><td colspan="${head.length}">${empty}</td></tr>`}</tbody></table></div>`; }
function vSales(T){
  const rows=T.S.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{ const r=isReceived(s),c=st(s.o)==='cancelled';
    return `<tr><td><b>${esc(s.d.invoiceNo)}</b><div class="muted">${esc(s.o.id)}</div></td><td>${esc(s.date)}</td><td>${esc(s.o.customerName)}</td><td>${esc(s.o.paymentMethod||'-')}</td><td>${f3(s.v)}</td>
    <td>${c?'<span class="badge">Cancelled</span>':r?'<span class="badge active-yes">Received</span>':'<span class="badge">Pending</span>'}</td>
    <td style="white-space:nowrap"><button class="btn-sm" onclick="Acc.print('${esc(s.o.id)}','inv')">🖨 Invoice</button> ${c?'':`<button class="btn-sm" onclick="Acc.mark(['${esc(s.o.id)}'],${!r})">${r?'Undo':'✓ Received'}</button>`}</td></tr>`; }).join('');
  return tbl(['Invoice','Date','Customer','Payment','Amount (BHD)','Status',''],rows,'No confirmed orders in this period.');
}
function vNotes(T){
  const rows=T.N.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>`<tr><td><b>${esc(s.d.creditNoteNo)}</b></td><td>${esc(s.date)}</td><td>${esc(s.d.invoiceNo)} <span class="muted">${esc(s.o.id)}</span></td><td>${esc(s.o.customerName)}</td><td class="acc-neg">-${f3(s.v)}</td><td><button class="btn-sm" onclick="Acc.print('${esc(s.o.id)}','cn')">🖨 Credit note</button></td></tr>`).join('');
  return tbl(['Credit note','Date','Against invoice','Customer','Amount (BHD)',''],rows,'No cancelled orders in this period.');
}
function vCod(T){
  const all=cod(T.L).sort((a,b)=>a.release.localeCompare(b.release)), g={};
  all.forEach(c=>{(g[c.release]=g[c.release]||[]).push(c);});
  const rows=Object.keys(g).sort().reverse().map(k=>{ const a=g[k], gr=a.reduce((x,c)=>x+c.gross,0), nt=a.reduce((x,c)=>x+c.net,0), done=a.every(c=>c.received), ids=a.map(c=>c.id);
    return `<tr><td><b>${k}</b><div class="muted">Monday release</div></td><td>${a.length}</td><td>${f3(gr)}</td><td>${f3(gr-nt)}</td><td><b>${f3(nt)}</b></td><td>${done?'<span class="badge active-yes">Received</span>':'<span class="badge">Pending</span>'}</td>
    <td><button class="btn-sm" onclick='Acc.mark(${JSON.stringify(ids)},${!done},"${k}")'>${done?'Undo':'✓ Mark week received'}</button></td></tr>`; }).join('');
  const pend=all.filter(c=>!c.received).reduce((a,c)=>a+c.net,0);
  return `<div class="card"><b>Delybell COD:</b> pending <b>${f3(pend)} BHD</b> · fee ${f3(fee())} per delivery ${deduct()?'(deducted from remittance)':'(billed separately)'}. Delivered COD orders are grouped by the Monday they are released.</div>`+tbl(['Release date','Orders','COD collected','Delivery fees','Net remittance','Status',''],rows,'No delivered COD orders yet.');
}
function vExp(T){
  const rows=A.exp.filter(e=>inRange(e.date)).sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<tr><td>${esc(e.date)}</td><td>${e.kind==='purchase'?'🛒 Purchase':'💸 Expense'}</td><td>${esc(e.category)}</td><td>${esc(e.description)}<div class="muted">${esc(e.vendor||'')}</div></td><td>${f3(e.amount)}</td><td>${e.status==='paid'?`<span class="badge active-yes">Paid ${esc(e.paidDate||'')}</span>`:'<span class="badge">Unpaid</span>'}</td>
    <td style="white-space:nowrap"><button class="btn-sm" onclick="Acc.togglePaid('${e.id}')">${e.status==='paid'?'Unpay':'✓ Paid'}</button> <button class="btn-sm" onclick="Acc.edit('${e.id}')">Edit</button> <button class="btn-sm" onclick="Acc.del('${e.id}')">🗑</button></td></tr>`).join('');
  const auto=T.C.length?`<div class="card muted">Plus <b>${f3(T.delivery)} BHD</b> Delybell delivery charges auto-counted from ${T.C.length} shipped/delivered orders (${f3(fee())} each).</div>`:'';
  return `<div style="margin-bottom:12px"><button class="btn" onclick="Acc.edit('')">+ Add expense / purchase</button></div>${auto}`+tbl(['Date','Type','Category','Details','Amount','Status',''],rows,'Nothing recorded in this period. Click “Add expense / purchase”.');
}
function vPnl(T){
  const row=(l,v,b)=>`<tr${b?' style="font-weight:800;background:#faf8f8"':''}><td>${l}</td><td style="text-align:right">${money(v)}</td></tr>`;
  const cat={}; T.E.filter(e=>e.kind!=='purchase').forEach(e=>cat[e.category]=(cat[e.category]||0)+Number(e.amount));
  const m=monthly(T);
  return `<div class="grid2"><div class="card"><h2>Profit &amp; Loss <span class="muted">${A.from||'start'} → ${A.to||'today'}</span></h2><table class="tbl" style="width:100%"><tbody>
    ${row('Gross sales (invoiced)',T.gross)}${row('Less: credit notes (cancelled)',-T.cn)}${row('Net sales',T.net,1)}
    ${row('Less: purchases (cost of goods)',-T.purch)}${row('Gross profit',T.gp,1)}
    ${Object.keys(cat).map(k=>row('&nbsp;&nbsp;'+esc(k),-cat[k])).join('')}${row('&nbsp;&nbsp;Delybell delivery charges',-T.delivery)}${row('Total operating expenses',-T.opex)}
    ${row(T.profit>=0?'NET PROFIT':'NET LOSS',T.profit,1)}</tbody></table>
    <p style="margin-top:12px"><button class="btn-sm" onclick="Acc.csv()">⬇ Export CSV</button> <button class="btn-sm" onclick="window.print()">🖨 Print</button></p></div>
  <div class="card"><h2>Monthly breakdown</h2><table class="tbl" style="width:100%"><thead><tr><th>Month</th><th>Sales</th><th>Costs</th><th>Profit</th></tr></thead><tbody>${m.map(r=>`<tr><td>${r.k}</td><td>${f3(r.s)}</td><td>${f3(r.e)}</td><td>${money(r.p)}</td></tr>`).join('')||'<tr class="empty-row"><td colspan="4">No data.</td></tr>'}</tbody></table>
  <p class="muted" style="font-size:11.5px">Costs here = recorded expenses + Delybell charges. Stock purchases are in the P&amp;L above as cost of goods.</p></div></div>`;
}
function vSettings(){
  return `<div class="card" style="max-width:640px"><h2>Accounts settings</h2>
  <div class="row"><div class="field"><label>Delybell fee per delivery (BHD)</label><input id="acFee" type="number" step="0.001" value="${fee()}"></div>
  <div class="field"><label>INR → BHD rate (gift orders)</label><input id="acRate" type="number" step="0.0001" value="${rate()}"></div></div>
  <div class="field"><label>Delybell remittance</label><select id="acDed"><option value="true" ${deduct()?'selected':''}>Delivery fee is deducted from COD remittance</option><option value="false" ${deduct()?'':'selected'}>Delivery fee billed separately</option></select></div>
  <div class="field"><label>Seller details on invoices</label><textarea id="acSeller" rows="4" placeholder="Business name, address, CR no., phone, email">${esc(A.set.acctSeller||'Souqify-bh\nsouqify-bh.com · WhatsApp +973 3518 4023\ncustomercaresouqifybh@gmail.com\nKingdom of Bahrain')}</textarea></div>
  <button class="btn" onclick="Acc.saveSettings()">Save settings</button></div>`;
}

function render(){
  setRange(); const T=totals(); A.T=T;
  const tabs=[['overview','📈 Overview'],['sales','🧾 Sales & Invoices'],['notes','↩️ Credit Notes'],['cod','🚚 Delybell COD'],['exp','💸 Expenses & Purchases'],['pnl','📒 P&L Report'],['set','⚙️ Settings']];
  const V={overview:vOverview,sales:vSales,notes:vNotes,cod:vCod,exp:vExp,pnl:vPnl,set:vSettings}[A.tab];
  $('accRoot').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${tabs.map(t=>`<button class="btn-sm ${A.tab===t[0]?'acc-on':''}" onclick="Acc.go('${t[0]}')">${t[1]}</button>`).join('')}</div>
  <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 16px"><b style="font-size:12.5px">Period</b>
  <select onchange="Acc.range(this.value)">${[['month','This month'],['last','Last month'],['30','Last 30 days'],['year','This year'],['all','All time'],['custom','Custom']].map(r=>`<option value="${r[0]}" ${A.range===r[0]?'selected':''}>${r[1]}</option>`).join('')}</select>
  <input type="date" value="${A.from}" onchange="Acc.custom('from',this.value)"> → <input type="date" value="${A.to}" onchange="Acc.custom('to',this.value)">
  <button class="btn-sm" style="margin-left:auto" onclick="Acc.load()">↻ Refresh</button></div>${V(T)}`;
}

/* ---------- invoice / credit note print (A4, no VAT) ---------- */
function printDoc(id,type){
  const o=A.orders.find(x=>x.id===id), d=A.docs[id]; if(!o||!d) return alert('Order not found.');
  let items=[]; try{items=JSON.parse(o.items||'[]')}catch(e){}
  const cur=o.currency==='INR'?'INR':'BHD', m=n=>cur==='INR'?'₹'+Number(n).toFixed(2):Number(n).toFixed(3)+' BHD', cn=type==='cn';
  const sub=Number(o.total||0), pr=Number(o.promoDiscount||0), of=Number(o.cartOfferDiscount||0), sh=Number(o.shippingFee||0), wl=Number(o.walletUsed||0), tot=Math.max(0,sub-pr-of+sh);
  const paid=!cn&&(String(d.received)==='true'||(!isCod(o)&&String(o.paymentStatus).toLowerCase()==='paid')), due=Math.max(0,tot-wl);
  const seller=esc(A.set.acctSeller||'Souqify-bh\nsouqify-bh.com').replace(/\n/g,'<br>');
  const w=window.open('','_blank'); if(!w) return alert('Please allow pop-ups to print.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cn?d.creditNoteNo:d.invoiceNo}</title><style>
  @page{size:A4;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;color:#1c1c1e;font-size:12px;margin:0}
  .h{display:flex;justify-content:space-between;border-bottom:3px solid #46501B;padding-bottom:12px}.h img{height:46px}.t{font-size:26px;font-weight:800;color:#46501B;text-align:right}
  .g{display:flex;gap:30px;margin:18px 0}.g>div{flex:1}.l{font-size:10px;font-weight:700;color:#8c8f7c;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
  table{width:100%;border-collapse:collapse}th{background:#46501B;color:#fff;text-align:left;padding:8px;font-size:11px}td{padding:8px;border-bottom:1px solid #e5e5e5;vertical-align:top}
  .r{text-align:right}.tt{width:46%;margin-left:54%;margin-top:14px}.tt td{border:0;padding:4px 8px}.gt td{font-weight:800;font-size:14px;border-top:2px solid #1c1c1e}
  .stamp{display:inline-block;border:2px solid ${cn?'#B23B2E':paid?'#1E7A44':'#8A5A00'};color:${cn?'#B23B2E':paid?'#1E7A44':'#8A5A00'};font-weight:800;padding:3px 12px;border-radius:6px;transform:rotate(-4deg)}
  .f{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;color:#6b6b70;font-size:10.5px;text-align:center}</style></head><body>
  <div class="h"><div><img src="${location.origin}/android-chrome-192x192.png" alt=""><div style="margin-top:6px;line-height:1.5">${seller}</div></div>
  <div><div class="t">${cn?'CREDIT NOTE':'INVOICE'}</div><div class="r" style="margin-top:6px"><b>No:</b> ${esc(cn?d.creditNoteNo:d.invoiceNo)}<br><b>Date:</b> ${esc(cn?(d.creditNoteDate||d.invoiceDate):d.invoiceDate)}<br>${cn?`<b>Against invoice:</b> ${esc(d.invoiceNo)}<br>`:''}<b>Order:</b> ${esc(o.id)}<br><span class="stamp">${cn?'CANCELLED':paid?'PAID':'UNPAID'}</span></div></div></div>
  <div class="g"><div><div class="l">Bill to</div><b>${esc(o.customerName)}</b><br>${esc(o.phone)}<br>${esc(o.customerEmail)}</div><div><div class="l">Ship to</div>${esc(o.recipientName||o.customerName)}<br>${esc(o.recipientAddress||o.address)}</div><div><div class="l">Payment</div>${esc(o.paymentMethod||'-')}</div></div>
  <table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>
  ${items.map((i,k)=>`<tr><td>${k+1}</td><td>${esc(i.name)}${i.color?`<div style="color:#8c8f7c">Color: ${esc(i.color)}</div>`:''}</td><td class="r">${i.qty}</td><td class="r">${m(i.price)}</td><td class="r">${m(i.price*i.qty)}</td></tr>`).join('')}</tbody></table>
  <table class="tt"><tr><td>Subtotal</td><td class="r">${m(sub)}</td></tr>${pr?`<tr><td>Promo discount</td><td class="r">-${m(pr)}</td></tr>`:''}${of?`<tr><td>Offer discount</td><td class="r">-${m(of)}</td></tr>`:''}<tr><td>Delivery</td><td class="r">${sh?m(sh):'FREE'}</td></tr>
  <tr class="gt"><td>${cn?'Total credited':'Total'}</td><td class="r">${cn?'-':''}${m(tot)}</td></tr>${!cn&&wl?`<tr><td>Paid by wallet credit</td><td class="r">-${m(wl)}</td></tr>`:''}${!cn?`<tr><td><b>${paid?'Balance':'Amount due'}</b></td><td class="r"><b>${m(paid?0:due)}</b></td></tr>`:''}</table>
  <div class="f">${cn?'This credit note cancels the invoice above. ':''}Prices are inclusive; no VAT is charged. Thank you for shopping with Souqify-bh.</div>
  <script>setTimeout(function(){window.print()},400)<\/script></body></html>`); w.document.close();
}

/* ---------- actions ---------- */
function modal(e){
  e=e||{}; const old=$('accModal'); if(old) old.remove();
  const d=document.createElement('div'); d.id='accModal'; d.className='rev-modal-overlay show';
  d.innerHTML=`<div class="rev-modal"><button class="close-x" onclick="this.closest('.rev-modal-overlay').remove()">✕</button><h2 style="margin-bottom:14px">${e.id?'Edit':'Add'} entry</h2>
  <div class="row"><div class="field"><label>Type</label><select id="xKind"><option value="expense" ${e.kind!=='purchase'?'selected':''}>Expense</option><option value="purchase" ${e.kind==='purchase'?'selected':''}>Purchase (stock)</option></select></div><div class="field"><label>Date</label><input id="xDate" type="date" value="${e.date||today()}"></div></div>
  <div class="row"><div class="field"><label>Category</label><select id="xCat" onchange="document.getElementById('xNew').style.display=this.value==='__new'?'block':'none'">${cats().map(c=>`<option ${e.category===c?'selected':''}>${esc(c)}</option>`).join('')}<option value="__new">+ Custom category…</option></select><input id="xNew" placeholder="New category name" style="display:none;margin-top:6px"></div><div class="field"><label>Amount (BHD)</label><input id="xAmt" type="number" step="0.001" value="${e.amount||''}"></div></div>
  <div class="field"><label>Description</label><input id="xDesc" value="${esc(e.description||'')}"></div>
  <div class="row"><div class="field"><label>Vendor <span class="opt">(optional)</span></label><input id="xVen" value="${esc(e.vendor||'')}"></div><div class="field"><label>Status</label><select id="xStat"><option value="unpaid" ${e.status!=='paid'?'selected':''}>Unpaid</option><option value="paid" ${e.status==='paid'?'selected':''}>Paid</option></select></div></div>
  <button class="btn" onclick="Acc.saveExp('${e.id||''}')">Save</button> <span id="xMsg" class="muted"></span></div>`;
  document.body.appendChild(d);
}
const Acc={
  go(t){A.tab=t;render();}, range(r){A.range=r;render();}, custom(k,v){A.range='custom';A[k]=v;render();},
  print:printDoc, edit(id){modal(A.exp.find(x=>x.id===id));},
  async load(){ $('accRoot').innerHTML='<p class="muted">Loading accounts…</p>'; const r=await api('acctGetData');
    if(!r.ok){$('accRoot').innerHTML='<div class="card">⚠ '+esc(r.error||'Could not load. Did you add accounts-backend.gs and redeploy?')+'</div>';return;}
    A.orders=r.orders; A.docs={}; r.docs.forEach(d=>A.docs[d.orderId]=d); A.exp=r.expenses; A.set=r.settings||{}; render(); },
  async saveExp(id){ const cat=$('xCat').value==='__new'?$('xNew').value.trim():$('xCat').value; if(!cat) return $('xMsg').textContent='Enter a category.';
    if(!cats().includes(cat)){ const c=cats().filter(x=>!DEF_CATS.includes(x)).concat(cat); await api('updateSettings',{settings:{acctCategories:JSON.stringify(c)}}); A.set.acctCategories=JSON.stringify(c); }
    const r=await api('acctSaveExpense',{id,kind:$('xKind').value,date:$('xDate').value,category:cat,amount:$('xAmt').value,description:$('xDesc').value,vendor:$('xVen').value,status:$('xStat').value});
    if(!r.ok) return $('xMsg').textContent='⚠ '+r.error; $('accModal').remove(); Acc.load(); },
  async togglePaid(id){ const e=A.exp.find(x=>x.id===id); await api('acctSaveExpense',Object.assign({},e,{status:e.status==='paid'?'unpaid':'paid',paidDate:today()})); Acc.load(); },
  async del(id){ if(!confirm('Delete this entry?')) return; await api('acctDeleteExpense',{id}); Acc.load(); },
  async mark(ids,on,date){ const amounts={}; ids.forEach(i=>{const o=A.orders.find(x=>x.id===i); amounts[i]=o?collect(o):0;});
    await api('acctMarkReceived',{ids,received:on,date:on?today():'',amounts}); Acc.load(); },
  async saveSettings(){ await api('updateSettings',{settings:{acctCourierFee:$('acFee').value,acctInrRate:$('acRate').value,acctCourierDeduct:$('acDed').value,acctSeller:$('acSeller').value}}); Acc.load(); },
  csv(){ const T=A.T, rows=[['Item','BHD'],['Gross sales',T.gross],['Credit notes',-T.cn],['Net sales',T.net],['Purchases',-T.purch],['Gross profit',T.gp],['Expenses',-T.opexMan],['Delybell charges',-T.delivery],['Net profit',T.profit]];
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})); a.download='pnl-'+(A.from||'all')+'.csv'; a.click(); }
};
window.Acc=Acc;
const _sw=window.switchTab; window.switchTab=function(t){ _sw(t); if(t==='accounts'&&!A.loaded){A.loaded=true;Acc.load();} };
})();
