// The CorgiPay billing dashboard: one self-contained page that polls /dashboard/feed every second.
export const dashboardHtml = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CorgiPay · Biscuit Bakery</title>
<style>
:root{--bg:#fbf8f3;--side:#fff;--card:#fff;--fg:#1f1a14;--mute:#7a6f63;--line:#efe7dc;--brand:#f08a24;--brand-soft:#fff1e2;--brand-ink:#b45f0c;
--ok:#18794e;--ok-soft:#e5f5ec;--open:#2463eb;--open-soft:#e8efff;--late:#c2410c;--late-soft:#ffede3;--err:#d92d20;--err-soft:#fdecea;
--shadow:0 1px 2px rgba(60,40,10,.05),0 6px 20px rgba(60,40,10,.06);--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
aside{background:var(--side);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:4px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;font-size:18px;letter-spacing:-.02em;margin:0 6px 18px}
.brand .mark{width:32px;height:32px;border-radius:10px;background:var(--brand);display:inline-flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 4px 12px rgba(240,138,36,.35)}
.nav{padding:7px 10px;border-radius:8px;color:var(--mute);font-weight:550;display:flex;gap:9px;align-items:center}
.nav.on{background:var(--brand-soft);color:var(--brand-ink)}
.test{margin-top:auto;font:600 11px var(--mono);color:var(--brand-ink);background:var(--brand-soft);border-radius:6px;padding:6px 8px;text-align:center}
main{padding:26px 34px 60px;max-width:1180px;width:100%}
.top{display:flex;align-items:center;gap:12px;margin-bottom:20px}.top h1{margin:0;font-size:24px;letter-spacing:-.02em}
.live{display:inline-flex;align-items:center;gap:6px;font:600 12px var(--mono);color:var(--ok);background:var(--ok-soft);border-radius:999px;padding:3px 10px}
.live i{width:7px;height:7px;border-radius:50%;background:var(--ok);animation:p 1.6s infinite}@keyframes p{0%{box-shadow:0 0 0 0 rgba(24,121,78,.5)}100%{box-shadow:0 0 0 7px transparent}}
.sp{flex:1}.sub{font-size:14px;font-weight:500;color:var(--mute);margin-left:6px}.acct{margin:-6px 6px 16px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;font-weight:650;display:flex;flex-direction:column}.acct small{color:var(--mute);font-weight:500;font-size:11.5px}.build{font:12px var(--mono);color:var(--mute)}
.btn{background:var(--brand);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:650}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi .l{color:var(--mute);font-size:12.5px;font-weight:550}.kpi .v{font-size:22px;font-weight:700;letter-spacing:-.02em;margin-top:2px;font-variant-numeric:tabular-nums}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}
.card h2{font-size:15px;margin:0;padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;color:var(--mute);font-weight:600;padding:10px 18px;border-bottom:1px solid var(--line);background:#fffdfa}
td{padding:13px 18px;border-bottom:1px solid var(--line);vertical-align:middle}tr:last-child td{border-bottom:0}
td.amt{font-weight:650;font-variant-numeric:tabular-nums;text-align:right}th.amt{text-align:right}
.cust b{display:block;font-weight:600}.cust span{color:var(--mute);font-size:12.5px}.num{font:12.5px var(--mono);color:var(--mute)}
.pill{display:inline-block;font-size:12px;font-weight:650;border-radius:6px;padding:2px 8px}
.pill.paid{background:var(--ok-soft);color:var(--ok)}.pill.open{background:var(--open-soft);color:var(--open)}.pill.overdue{background:var(--late-soft);color:var(--late)}
.when{color:var(--mute);font-size:13px;white-space:nowrap}
tr.new{animation:arrive 2.6s ease}@keyframes arrive{0%{background:#ffe2c2;transform:translateY(-6px);opacity:0}15%{opacity:1;transform:none}100%{background:transparent}}
.inc{margin-bottom:20px;border-color:#f6c9c4}.inc h2{color:var(--err);background:var(--err-soft)}
.inc td{font-size:13px}.inc code{font:12px var(--mono)}.inc a{color:var(--open);font-weight:600}
.toast{position:fixed;right:22px;bottom:22px;background:#1f1a14;color:#fff;border-radius:12px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;transform:translateY(120%);transition:transform .35s;max-width:420px}
.toast.show{transform:none}.toast b{color:#ffb469}
@media(max-width:860px){.app{grid-template-columns:1fr}aside{display:none}.kpis{grid-template-columns:1fr 1fr}main{padding:18px 16px}.hide-s{display:none}}
</style></head><body><div class="app">
<aside><div class="brand"><span class="mark">🐶</span>CorgiPay</div><div class="acct">🥐 Biscuit Bakery<small>Wholesale · test mode</small></div>
<div class="nav">⌂ Home</div><div class="nav on">▤ Invoices</div><div class="nav">☺ Customers</div><div class="nav">⇄ Payments</div><div class="nav">⚙ Developers</div>
<div class="test">TEST MODE</div></aside>
<main><div class="top"><h1>Invoices <span class="sub">CorgiPay · Biscuit Bakery</span></h1><span class="live"><i></i>Live</span><span class="sp"></span><span class="build" id="build"></span><button class="btn">+ Create invoice</button></div>
<div class="kpis"><div class="kpi"><div class="l">Outstanding</div><div class="v" id="k1">…</div></div><div class="kpi"><div class="l">Paid, last 30 days</div><div class="v" id="k2">…</div></div><div class="kpi"><div class="l">Open invoices</div><div class="v" id="k3">…</div></div><div class="kpi"><div class="l">Overdue</div><div class="v" id="k4">…</div></div></div>
<div class="card inc" id="incCard" hidden><h2>● API errors <span style="font-weight:500;font-size:12.5px">support agent opened a room for each</span></h2><table><tbody id="inc"></tbody></table></div>
<div class="card"><h2>All invoices</h2><table><thead><tr><th>Invoice</th><th>Customer</th><th class="amt">Amount</th><th>Status</th><th class="hide-s">Created</th></tr></thead><tbody id="rows"></tbody></table></div>
</main></div><div class="toast" id="toast"></div>
<script>
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const money=(c,cur='usd')=>new Intl.NumberFormat('en-US',{style:'currency',currency:cur.toUpperCase()}).format(c/100);
const ago=d=>{const s=(Date.now()-new Date(d))/1000;if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+' h ago';return new Date(d).toLocaleDateString([], {month:'short',day:'numeric'})};
let seen=null,seenInc=new Set(),tt;
function toast(h){const t=document.getElementById('toast');t.innerHTML=h;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),5000)}
async function tick(){try{const j=await(await fetch('/dashboard/feed',{cache:'no-store'})).json();
 document.getElementById('build').textContent='build '+String(j.sha).slice(0,7);
 const inv=j.invoices,first=seen===null;seen=seen||new Set(inv.map(i=>i.id));
 const fresh=inv.filter(i=>!seen.has(i.id));
 document.getElementById('rows').innerHTML=inv.map(i=>'<tr class="'+(fresh.includes(i)?'new':'')+'"><td class="num">'+E(i.number)+'</td><td class="cust"><b>'+E(i.customer_name)+'</b><span>'+E(i.customer_email)+'</span></td><td class="amt">'+money(i.total_cents,i.currency)+'</td><td><span class="pill '+E(i.status)+'">'+E(i.status[0].toUpperCase()+i.status.slice(1))+'</span></td><td class="when hide-s">'+ago(i.created)+'</td></tr>').join('');
 for(const i of fresh){seen.add(i.id);toast('🐶 New invoice <b>'+E(i.number)+'</b> · '+E(i.customer_name)+' · '+money(i.total_cents,i.currency))}
 const sum=f=>inv.filter(f).reduce((a,i)=>a+i.total_cents,0);
 k1.textContent=money(sum(i=>i.status!=='paid'));k2.textContent=money(sum(i=>i.status==='paid'));k3.textContent=inv.filter(i=>i.status==='open').length;k4.textContent=inv.filter(i=>i.status==='overdue').length;
 const ic=j.incidents||[];document.getElementById('incCard').hidden=!ic.length;
 document.getElementById('inc').innerHTML=ic.map(x=>'<tr><td><code>'+E(x.request_id)+'</code></td><td><b>500</b> '+E(x.endpoint)+'<div style="color:var(--mute)">'+E(x.error)+'</div></td><td class="when">'+ago(x.at)+' · build '+E(String(x.sha).slice(0,7))+'</td><td>'+(x.room_url?'<a href="'+E(x.room_url)+'" target="_blank">Support room ↗</a>':'')+'</td></tr>').join('');
 for(const x of ic)if(!seenInc.has(x.request_id)){if(!first)toast('⚠️ <b>500</b> on '+E(x.endpoint)+': support agent paged');seenInc.add(x.request_id)}
}catch(e){}}
tick();setInterval(tick,1000)
</script></body></html>`
