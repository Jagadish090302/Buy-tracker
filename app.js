/* JASHxp Buy Tracker
   Configure SUPABASE_URL and SUPABASE_ANON_KEY below, or use Settings in the app.
   Use only the public publishable/anon key. Never use a service-role key in browser code.
*/
const SUPABASE_URL = "https://tbvbsmwuowqmsygxroqt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_m3eyx7jZZREZJSSbspX0GQ_sC18pPvu";

const $ = (id) => document.getElementById(id);
const STATUS = {
  planning: "Planning to buy", purchased: "Purchased", repair_needed: "Repair needed",
  under_repair: "Under repair", repaired: "Repaired", retired: "Retired / sold"
};
const PRIORITY = {low:"Low", medium:"Medium", high:"High", critical:"Critical"};
const STATUS_CLASS = {planning:"status-planning",purchased:"status-purchased",repair_needed:"status-repair_needed",under_repair:"status-under_repair",repaired:"status-repaired",retired:"status-retired"};
const STATUS_ICON = {planning:"◷",purchased:"✓",repair_needed:"⚒",under_repair:"⚒",repaired:"↻",retired:"⌁"};
const DEFAULT_ITEMS = [
  {name:"Monitor",category:"PC & tech",status:"planning",priority:"high",planned_price:0,notes:"Monitor upgrade."},
  {name:"8 GB DDR4 RAM",category:"PC & tech",status:"planning",priority:"high",planned_price:0,notes:"Check laptop compatibility and available memory slot before buying."},
  {name:"1 TB SSD",category:"PC & tech",status:"planning",priority:"high",planned_price:0,notes:"Storage upgrade."},
  {name:"Android Box",category:"Home",status:"planning",priority:"medium",planned_price:0,notes:"TV streaming box."},
  {name:"New headlight / front part for Unicorn bike",category:"Bike",status:"planning",priority:"medium",planned_price:0,notes:"Confirm exact model and fitment before ordering."},
  {name:"New mobile",category:"Mobile",status:"planning",priority:"high",planned_price:0,notes:"Compare current models, storage and software support."},
  {name:"Mic / gaming headphones",category:"Gaming",status:"planning",priority:"medium",planned_price:0,notes:"Prioritise a good microphone and comfort."},
  {name:"Parrot toy",category:"Other",status:"planning",priority:"low",planned_price:0,notes:"Toy from the handwritten list."},
  {name:"Shoes",category:"Clothing",status:"planning",priority:"medium",planned_price:0,notes:""},
  {name:"Slippers",category:"Clothing",status:"planning",priority:"low",planned_price:0,notes:""},
  {name:"Projector",category:"Home",status:"planning",priority:"medium",planned_price:0,notes:""},
  {name:"RE GT 650",category:"Bike",status:"planning",priority:"high",planned_price:0,notes:"Royal Enfield Continental GT 650 goal."}
];
let supabaseClient = null, connected = false, currentUser = null, isOwner = false;
let items = [], activeView = "overview", activeItemId = null, currentPhotoUrl = "", toastTimer = null;

function safeJsonParse(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
function money(value) { return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value)||0); }
function dateLabel(value) { if(!value) return "—"; const d = new Date(value+"T00:00:00"); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}); }
function daysSince(value) { if(!value) return null; const start = new Date(value+"T00:00:00"); const now = new Date(); start.setHours(0,0,0,0); now.setHours(0,0,0,0); return Math.max(0,Math.floor((now-start)/86400000)); }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3200); }
function notice(message, show=true) { $("notice").textContent=message; $("notice").classList.toggle("hidden",!show); }
function getSavedConfig() { return {url:localStorage.getItem("jxbuy_url")||SUPABASE_URL,key:localStorage.getItem("jxbuy_key")||SUPABASE_ANON_KEY}; }
function localMode() { return localStorage.getItem("jxbuy_demo_items"); }
function normalizeItem(row) { return {...row, links:Array.isArray(row.links)?row.links:[], repairs:Array.isArray(row.repairs)?row.repairs:[], price_history:Array.isArray(row.price_history)?row.price_history:[], planned_price:Number(row.planned_price)||0, actual_price:Number(row.actual_price)||0, repair_cost:Number(row.repair_cost)||0, rating:Number(row.rating)||0, quality_rating:Number(row.quality_rating)||0, value_rating:Number(row.value_rating)||0, durability_rating:Number(row.durability_rating)||0}; }
function updateConnectionUI() {
  $("connection-label").textContent = connected ? (isOwner ? "Cloud sync · Owner" : "Cloud sync · Read-only") : "Demo mode";
  document.querySelector(".status-dot").classList.toggle("online",connected);
  $("footer-status").textContent = connected ? (isOwner ? "Connected to Supabase · edits sync to cloud." : "Public view · sign in as owner to edit.") : "Demo mode: changes stay in this browser until Supabase is connected.";
  $("add-item-button").disabled = connected && !isOwner;
  $("add-item-button").title = connected && !isOwner ? "Sign in as owner to edit" : "";
}
function canEdit() { return !connected || isOwner; }
function loadDemoItems() {
  const saved=localMode();
  items=(saved?safeJsonParse(saved,[]):DEFAULT_ITEMS.map((x,i)=>({...x,id:"demo-"+(i+1),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),links:[],repairs:[],price_history:[]}))).map(normalizeItem);
  if(!saved) localStorage.setItem("jxbuy_demo_items",JSON.stringify(items));
}
async function initialize() {
  const cfg=getSavedConfig();
  if(cfg.url && cfg.key && window.supabase) {
    try {
      supabaseClient=window.supabase.createClient(cfg.url,cfg.key);
      const {data:{session}}=await supabaseClient.auth.getSession();
      currentUser=session?.user||null;
      await refreshOwnerState();
      const {data,error}=await supabaseClient.from("tracker_items").select("*").order("created_at",{ascending:true});
      if(error) throw error;
      items=(data||[]).map(normalizeItem); connected=true;
      supabaseClient.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null; setTimeout(async()=>{await refreshOwnerState();updateConnectionUI();renderAll();},0);});
      updateConnectionUI(); notice("",false); renderAll(); return;
    } catch(err) {
      console.error(err); connected=false; supabaseClient=null;
      notice("Could not connect to Supabase. Check the project URL/key, run the SQL setup, and confirm GitHub Pages is using the latest files. Showing local demo data. Details: "+(err.message||"connection error"));
    }
  } else {
    notice("Demo mode is active. Connect Supabase in Settings to enable cloud storage and owner-only editing.");
  }
  loadDemoItems(); updateConnectionUI(); renderAll();
}
async function refreshOwnerState() {
  isOwner=false;
  if(!supabaseClient||!currentUser) return;
  try {
    const {data,error}=await supabaseClient.rpc("is_tracker_owner");
    if(!error) isOwner=!!data;
  } catch(e) { console.warn("Owner check failed",e); }
}
async function reloadItems() {
  if(connected && supabaseClient) {
    const {data,error}=await supabaseClient.from("tracker_items").select("*").order("created_at",{ascending:true});
    if(error) { toast("Could not reload: "+error.message); return; }
    items=(data||[]).map(normalizeItem);
  } else loadDemoItems();
  renderAll();
}
function persistDemo() { localStorage.setItem("jxbuy_demo_items",JSON.stringify(items)); }
async function saveItemRecord(row, isNew=false) {
  if(connected) {
    if(!isOwner) throw new Error("Sign in as the owner to edit this tracker.");
    const payload={...row}; delete payload.id; delete payload.created_at; delete payload.updated_at;
    if(isNew) payload.owner_id = currentUser.id;
    let query;
    if(isNew) query=await supabaseClient.from("tracker_items").insert(payload).select().single();
    else query=await supabaseClient.from("tracker_items").update(payload).eq("id",row.id).select().single();
    if(query.error) throw query.error;
    const saved=normalizeItem(query.data);
    const index=items.findIndex(x=>x.id===saved.id);
    if(index>=0) items[index]=saved; else items.unshift(saved);
    return saved;
  }
  const now=new Date().toISOString();
  if(isNew) { row.id="demo-"+Date.now(); row.created_at=now; row.updated_at=now; items.unshift(normalizeItem(row)); }
  else { const i=items.findIndex(x=>x.id===row.id); row.updated_at=now; if(i>=0) items[i]=normalizeItem(row); }
  persistDemo(); return row;
}
async function deleteItem(id) {
  if(!canEdit()) return toast("Only the owner can delete items.");
  if(!confirm("Delete this item and its saved links, ratings, repair and price history? This cannot be undone.")) return;
  if(connected) { const {error}=await supabaseClient.from("tracker_items").delete().eq("id",id); if(error) return toast(error.message); }
  items=items.filter(x=>x.id!==id); if(!connected)persistDemo();
  $("detail-dialog").close(); renderAll(); toast("Item deleted.");
}
function filteredItems() {
  const query=$("search-input").value.trim().toLowerCase(), category=$("category-filter").value, sort=$("sort-select").value;
  let list=items.filter(x=>(activeView==="overview"||activeView==="all"||
    (activeView==="planning"&&x.status==="planning")||
    (activeView==="purchased"&&["purchased","repair_needed","under_repair"].includes(x.status))||
    (activeView==="repair"&&["repair_needed","under_repair"].includes(x.status))||
    (activeView==="repaired"&&x.status==="repaired")||(activeView==="retired"&&x.status==="retired")) &&
    (!query||[x.name,x.category,x.model,x.notes].join(" ").toLowerCase().includes(query))&&(!category||x.category===category));
  if(sort==="name")list.sort((a,b)=>a.name.localeCompare(b.name));
  if(sort==="priority")list.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]??2)-({critical:0,high:1,medium:2,low:3}[b.priority]??2));
  if(sort==="price-high")list.sort((a,b)=>(b.actual_price||b.planned_price)-(a.actual_price||a.planned_price));
  if(sort==="rating")list.sort((a,b)=>(b.rating||0)-(a.rating||0));
  if(sort==="updated")list.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0));
  return list;
}
function iconFor(item) { return item.photo_url?`<img src="${esc(item.photo_url)}" alt="">`:esc((item.name||"?").trim().slice(0,1).toUpperCase()); }
function statusPill(status) { return `<span class="status-pill ${STATUS_CLASS[status]||"status-retired"}">${esc(STATUS[status]||status)}</span>`; }
function ratingText(item) { return item.rating?`★ ${item.rating.toFixed(1)}/5`:"Not rated"; }
function renderStats() {
  const planning=items.filter(x=>x.status==="planning"), owned=items.filter(x=>["purchased","repair_needed","under_repair","repaired"].includes(x.status));
  const planned=planning.reduce((s,x)=>s+x.planned_price,0), spent=items.reduce((s,x)=>s+x.actual_price+x.repair_cost,0);
  const attention=items.filter(x=>["repair_needed","under_repair"].includes(x.status)||(x.warranty_end&&daysUntil(x.warranty_end)>=0&&daysUntil(x.warranty_end)<=30)).length;
  $("stat-planned").textContent=money(planned); $("stat-spent").textContent=money(spent); $("stat-owned").textContent=owned.length; $("stat-attention").textContent=attention;
  $("budget-planned").textContent=money(planned); $("budget-actual").textContent=money(spent);
  $("budget-bar").style.width=(planned?Math.min(100,spent/planned*100):0)+"%";
  $("budget-caption").textContent=planned?`${Math.round(spent/planned*100)}% of your remaining planned budget is represented by total recorded spend.`:"Add planned prices to see your budget.";
  const rated=items.filter(x=>x.rating>0); $("average-rating").textContent=rated.length?(rated.reduce((s,x)=>s+x.rating,0)/rated.length).toFixed(1)+" / 5":"—";
  $("repair-completed").textContent=items.reduce((s,x)=>s+x.repairs.filter(r=>r.completed_date).length,0);
  const count=(view)=>items.filter(x=>view==="all"?true:view==="planning"?x.status==="planning":view==="purchased"?["purchased","repair_needed","under_repair"].includes(x.status):view==="repair"?["repair_needed","under_repair"].includes(x.status):view==="repaired"?x.status==="repaired":x.status==="retired").length;
  $("nav-all-count").textContent=count("all"); $("nav-planning-count").textContent=count("planning"); $("nav-purchased-count").textContent=count("purchased"); $("nav-repair-count").textContent=count("repair"); $("nav-repaired-count").textContent=count("repaired"); $("nav-retired-count").textContent=count("retired");
}
function daysUntil(value) { if(!value)return null; const a=new Date(value+"T00:00:00"); const b=new Date();b.setHours(0,0,0,0);return Math.ceil((a-b)/86400000); }
function renderRoadmap() {
  const list=items.filter(x=>x.status==="planning").sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]??2)-({critical:0,high:1,medium:2,low:3}[b.priority]??2)).slice(0,5);
  $("roadmap-list").innerHTML=list.length?list.map(x=>`<div class="roadmap-row" data-open-item="${esc(x.id)}"><div class="item-avatar">${iconFor(x)}</div><div><div class="roadmap-name">${esc(x.name)}</div><div class="roadmap-meta">${esc(x.category||"Uncategorised")} · ${esc(PRIORITY[x.priority]||"Medium")} priority</div></div><div class="roadmap-price">${x.planned_price?money(x.planned_price):"Set price"}</div></div>`).join(""):`<div class="detail-empty">No planned purchases yet. Add an item to get started.</div>`;
}
function renderCards() {
  const list=filteredItems(); $("items-grid").innerHTML=list.map(x=>{
    const repairDate=x.last_repaired_date||x.repairs.filter(r=>r.completed_date).map(r=>r.completed_date).sort().at(-1);
    const repairDays=repairDate!==undefined&&repairDate!==null?daysSince(repairDate):null;
    const price=x.status==="planning"?x.planned_price:x.actual_price;
    return `<article class="item-card" data-open-item="${esc(x.id)}" tabindex="0" role="button" aria-label="Open ${esc(x.name)}">
      <div class="card-top"><div class="card-identity"><div class="item-avatar">${iconFor(x)}</div><div><div class="card-name">${esc(x.name)}</div><div class="card-category">${esc(x.category||"Uncategorised")}</div></div></div><button class="more-button" data-more-item="${esc(x.id)}" aria-label="Item actions">⋯</button></div>
      <div style="margin-top:13px;display:flex;gap:6px;flex-wrap:wrap">${statusPill(x.status)}${x.priority==="high"||x.priority==="critical"?`<span class="priority-pill priority-${esc(x.priority)}">${esc(PRIORITY[x.priority])} priority</span>`:""}</div>
      <p class="card-notes">${esc(x.notes||x.model||"No notes yet. Open this item to add details, links and history.")}</p>
      <div class="card-bottom"><div><div class="price-label">${x.status==="planning"?"Target price":"Purchase price"}</div><div class="price-value">${price?money(price):"Not set"}</div></div><div class="card-rating">${x.rating?`★ ${x.rating.toFixed(1)}`:"☆ Not rated"}</div></div>
      <div class="card-footer"><span class="priority-text">${x.warranty_end?`Warranty ${daysUntil(x.warranty_end)<0?"expired":daysUntil(x.warranty_end)<=30?"ends soon":"until "+dateLabel(x.warranty_end)}`:""}</span>${repairDays!==null?`<span class="repair-counter">Repaired ${repairDays} ${repairDays===1?"day":"days"} ago</span>`:""}</div>
    </article>`;
  }).join("");
  $("empty-state").classList.toggle("hidden",list.length>0); $("items-grid").classList.toggle("hidden",!list.length);
  const titles={overview:"All items",all:"All items",planning:"Planning to buy",purchased:"Purchased",repair:"Repair centre",repaired:"Repaired",retired:"Retired / sold"};
  $("list-title").textContent=titles[activeView]||"All items";
  $("list-subtitle").textContent=activeView==="overview"?"Your list, saved in one place.":`${list.length} item${list.length===1?"":"s"} in this section.`;
}
function renderAll() {
  renderStats(); renderRoadmap(); renderCards();
  const cats=[...new Set(items.map(x=>x.category).filter(Boolean))].sort();
  const current=$("category-filter").value;
  $("category-filter").innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if(cats.includes(current))$("category-filter").value=current;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===activeView||(activeView==="overview"&&b.dataset.view==="overview")));
}
function openItemDialog(item=null) {
  if(!canEdit()) return toast("Sign in as owner to add or edit items.");
  $("item-form").reset(); $("item-id").value=item?.id||""; currentPhotoUrl=item?.photo_url||"";
  $("item-dialog-title").textContent=item?"Edit item":"Add an item";
  $("item-name").value=item?.name||""; $("item-category").value=item?.category||""; $("item-status").value=item?.status||"planning"; $("item-priority").value=item?.priority||"medium";
  $("item-planned-price").value=item?.planned_price||""; $("item-actual-price").value=item?.actual_price||""; $("item-target-date").value=item?.target_date||""; $("item-purchase-date").value=item?.purchase_date||""; $("item-warranty-date").value=item?.warranty_end||""; $("item-model").value=item?.model||""; $("item-notes").value=item?.notes||"";
  $("current-photo-label").textContent=currentPhotoUrl?"Current photo saved. Upload a new image to replace it.":"";
  $("item-dialog").showModal();
}
async function uploadPhoto(file,itemId) {
  if(!file)return currentPhotoUrl||null;
  if(!file.type.startsWith("image/"))throw new Error("Choose an image file.");
  if(file.size>8*1024*1024)throw new Error("Image must be 8 MB or smaller.");
  if(connected) {
    if(!isOwner)throw new Error("Only the owner can upload images.");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const path=`${itemId||crypto.randomUUID()}/${Date.now()}.${ext}`;
    const {error}=await supabaseClient.storage.from("tracker-photos").upload(path,file,{upsert:true,contentType:file.type});
    if(error)throw error;
    const {data}=supabaseClient.storage.from("tracker-photos").getPublicUrl(path); return data.publicUrl;
  }
  return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
}
$("item-form").addEventListener("submit",async e=>{
  e.preventDefault(); const id=$("item-id").value; const existing=items.find(x=>x.id===id);
  const button=$("save-item-button");button.disabled=true;button.textContent="Saving…";
  try {
    const row={...(existing||{}),name:$("item-name").value.trim(),category:$("item-category").value.trim()||"Other",status:$("item-status").value,priority:$("item-priority").value,
      planned_price:Number($("item-planned-price").value)||0,actual_price:Number($("item-actual-price").value)||0,target_date:$("item-target-date").value||null,purchase_date:$("item-purchase-date").value||null,warranty_end:$("item-warranty-date").value||null,model:$("item-model").value.trim(),notes:$("item-notes").value.trim(),
      links:existing?.links||[],repairs:existing?.repairs||[],price_history:existing?.price_history||[],rating:existing?.rating||0,quality_rating:existing?.quality_rating||0,value_rating:existing?.value_rating||0,durability_rating:existing?.durability_rating||0,repair_cost:existing?.repair_cost||0,last_repaired_date:existing?.last_repaired_date||null,photo_url:existing?.photo_url||null};
    if(row.status!=="planning"&&!row.purchase_date)row.purchase_date=new Date().toISOString().slice(0,10);
    const file=$("item-photo").files[0]; if(file)row.photo_url=await uploadPhoto(file,id||crypto.randomUUID());
    const old=existing?.actual_price||0;
    if(row.actual_price>0&&row.actual_price!==old)row.price_history=[...(row.price_history||[]),{date:row.purchase_date||new Date().toISOString().slice(0,10),amount:row.actual_price,note:"Purchase price"}];
    const saved=await saveItemRecord(row,!id); $("item-dialog").close();renderAll();toast("Item saved."); if(activeItemId===saved.id)openDetail(saved.id);
  } catch(err) { console.error(err);toast("Save failed: "+(err.message||"Unknown error")); }
  finally {button.disabled=false;button.textContent="Save item";}
});
function openDetail(id) {
  const x=items.find(i=>i.id===id); if(!x)return; activeItemId=id;
  const repairDate=x.last_repaired_date||x.repairs.filter(r=>r.completed_date).map(r=>r.completed_date).sort().at(-1);
  const since=repairDate!==undefined&&repairDate!==null?daysSince(repairDate):null;
  const links=x.links||[], repairs=[...(x.repairs||[])].sort((a,b)=>(b.started_date||"").localeCompare(a.started_date||"")), prices=[...(x.price_history||[])].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  $("detail-content").innerHTML=`<div class="detail-hero"><div class="detail-title-row"><div class="item-avatar">${iconFor(x)}</div><div style="min-width:0"><h2 class="detail-title">${esc(x.name)}</h2><div class="detail-subtitle">${esc(x.category||"Uncategorised")}${x.model?" · "+esc(x.model):""}</div><div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">${statusPill(x.status)}<span class="priority-pill">${esc(PRIORITY[x.priority]||"Medium")} priority</span></div></div><div class="detail-actions">${canEdit()?`<button class="button button-secondary" data-edit-item="${esc(x.id)}">Edit</button><button class="button button-secondary" data-delete-item="${esc(x.id)}">Delete</button>`:""}<button class="icon-button" data-close="detail-dialog" aria-label="Close">×</button></div></div></div>
  <div class="detail-body"><div class="detail-metrics"><div class="metric"><small>${x.status==="planning"?"Planned price":"Purchase price"}</small><strong>${money(x.status==="planning"?x.planned_price:x.actual_price)}</strong></div><div class="metric"><small>Overall rating</small><strong>${x.rating?`★ ${x.rating.toFixed(1)} / 5`:"Not rated"}</strong></div><div class="metric"><small>Purchase date</small><strong>${dateLabel(x.purchase_date)}</strong></div><div class="metric"><small>Repair status</small><strong>${since!==null?`${since} days since repair`:"No repair logged"}</strong></div></div>
  ${canEdit()?`<div class="inline-actions" style="flex-wrap:wrap"><button class="button button-primary" data-action="status" data-id="${esc(x.id)}">Change status</button><button class="button button-secondary" data-action="link" data-id="${esc(x.id)}">＋ Add link</button><button class="button button-secondary" data-action="repair" data-id="${esc(x.id)}">＋ Log repair</button><button class="button button-secondary" data-action="price" data-id="${esc(x.id)}">＋ Price record</button><button class="button button-secondary" data-action="rating" data-id="${esc(x.id)}">★ Rate item</button></div>`:""}
  <section class="detail-section"><h3>Notes</h3><p>${esc(x.notes||"No notes added yet.")}</p></section>
  <section class="detail-section"><h3>Warranty & dates</h3><div class="detail-list"><div class="detail-row"><span>Target date</span><strong>${dateLabel(x.target_date)}</strong></div><div class="detail-row"><span>Warranty ends</span><strong>${dateLabel(x.warranty_end)}${x.warranty_end&&daysUntil(x.warranty_end)>=0&&daysUntil(x.warranty_end)<=30?` · ${daysUntil(x.warranty_end)} days left`:""}</strong></div><div class="detail-row"><span>Total repair cost</span><strong>${money(x.repair_cost)}</strong></div></div></section>
  <section class="detail-section"><h3>Shopping & reference links</h3><div class="detail-list">${links.length?links.map((l,i)=>`<div class="detail-row"><div><strong>${esc(l.title||"Reference link")}</strong><br><small>${esc(l.type||"Other")}</small></div><a href="${safeHref(l.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>${canEdit()?`<button class="text-button" data-remove-link="${i}" data-id="${esc(x.id)}">Remove</button>`:""}</div>`).join(""):`<div class="detail-empty">No links added yet.</div>`}</div></section>
  <section class="detail-section"><h3>Repair history</h3><div class="detail-list">${repairs.length?repairs.map((r,i)=>`<div class="detail-row"><div><strong>${esc(r.description||"Repair")}</strong><br><small>${dateLabel(r.started_date)}${r.completed_date?" → "+dateLabel(r.completed_date):" · In progress"}${r.completed_date?" · "+daysSince(r.completed_date)+" days since completion":""}</small>${r.notes?`<p style="margin:6px 0 0">${esc(r.notes)}</p>`:""}</div><strong>${money(r.cost)}</strong>${canEdit()?`<button class="text-button" data-remove-repair="${i}" data-id="${esc(x.id)}">Remove</button>`:""}</div>`).join(""):`<div class="detail-empty">No repairs recorded. Log a repair to start the history.</div>`}</div></section>
  <section class="detail-section"><h3>Price history</h3><div class="detail-list">${prices.length?prices.map(p=>`<div class="detail-row"><span>${dateLabel(p.date)} · ${esc(p.note||"Price update")}</span><strong>${money(p.amount)}</strong></div>`).join(""):`<div class="detail-empty">No price history yet.</div>`}</div></section>
  <section class="detail-section"><h3>Ratings</h3><div class="detail-list"><div class="detail-row"><span>Overall</span><strong class="rating-stars">${x.rating?"★".repeat(Math.round(x.rating))+"☆".repeat(5-Math.round(x.rating))+" "+x.rating.toFixed(1):"Not rated"}</strong></div><div class="detail-row"><span>Quality</span><strong>${x.quality_rating?x.quality_rating+"/5":"—"}</strong></div><div class="detail-row"><span>Value for money</span><strong>${x.value_rating?x.value_rating+"/5":"—"}</strong></div><div class="detail-row"><span>Durability</span><strong>${x.durability_rating?x.durability_rating+"/5":"—"}</strong></div></div></section>
  <div class="detail-section"><button class="button button-secondary" data-copy-link="${esc(x.id)}">Copy item URL</button></div></div>`;
  $("detail-dialog").showModal();
}
function safeHref(url) { try { const u=new URL(url); return ["http:","https:"].includes(u.protocol)?esc(u.href):"#"; } catch { return "#"; } }
function actionDialog(title,subtitle,fields,submitLabel,onSubmit) {
  $("action-content").innerHTML=`<div class="action-content"><div class="modal-header" style="padding:0;margin-bottom:8px"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button" data-close="action-dialog" aria-label="Close">×</button></div><form id="action-form"><div class="action-fields">${fields}</div><div class="modal-footer" style="padding:18px 0 0;margin-top:20px"><button type="button" class="button button-secondary" data-close="action-dialog">Cancel</button><button class="button button-primary" type="submit">${esc(submitLabel)}</button></div></form></div>`;
  $("action-dialog").showModal(); $("action-form").addEventListener("submit",async e=>{e.preventDefault();try{await onSubmit(new FormData(e.currentTarget));$("action-dialog").close();renderAll();openDetail(activeItemId);toast("Saved.");}catch(err){toast(err.message||"Could not save.");}});
}
async function updateCurrent(mutator) {
  if(!canEdit())throw new Error("Sign in as the owner to edit this tracker.");
  const x=items.find(i=>i.id===activeItemId);if(!x)throw new Error("Item not found.");
  const updated={...x};mutator(updated);await saveItemRecord(updated,false);
}
function openAction(kind,id) {
  if(!canEdit())return toast("Sign in as owner to edit.");
  activeItemId=id;const x=items.find(i=>i.id===id);if(!x)return;
  if(kind==="status") actionDialog("Change item status",`Update status for ${x.name}.`, `<label class="field"><span>Status</span><select name="status">${Object.entries(STATUS).map(([v,l])=>`<option value="${v}" ${x.status===v?"selected":""}>${l}</option>`).join("")}</select></label><label class="field"><span>Change note (optional)</span><input name="note" placeholder="e.g. Bought from local shop"></label>`, "Update status",async f=>{
    const status=f.get("status"),note=String(f.get("note")||"").trim(); await updateCurrent(row=>{row.status=status;if(status!=="planning"&&!row.purchase_date)row.purchase_date=new Date().toISOString().slice(0,10);if(status==="purchased"&&!row.actual_price)row.actual_price=row.planned_price;if(status==="repaired"){row.last_repaired_date=new Date().toISOString().slice(0,10);const last=[...row.repairs].reverse().find(r=>!r.completed_date);if(last)last.completed_date=row.last_repaired_date;}row.notes=note?`${row.notes?row.notes+"\n\n":""}Status update: ${note}`:row.notes;});
  });
  if(kind==="link") actionDialog("Add a link",`Save a shopping, review, manual or warranty link for ${x.name}.`,`<label class="field"><span>Link title *</span><input name="title" required placeholder="Official product page"></label><label class="field"><span>URL *</span><input name="url" type="url" required placeholder="https://…"></label><label class="field"><span>Type</span><select name="type"><option>Shopping</option><option>Price comparison</option><option>YouTube / review</option><option>Manual</option><option>Warranty / support</option><option>Other</option></select></label>`,"Add link",async f=>{const url=String(f.get("url"));if(!/^https?:\/\//i.test(url))throw new Error("Use a full http:// or https:// URL.");await updateCurrent(row=>row.links=[...row.links,{title:String(f.get("title")),url,type:String(f.get("type"))}]);});
  if(kind==="repair") actionDialog("Log a repair",`Record repair or service work for ${x.name}.`,`<label class="field"><span>Repair description *</span><input name="description" required placeholder="e.g. Replaced charging port"></label><label class="field"><span>Repair started</span><input name="started_date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field"><span>Repair completed (optional)</span><input name="completed_date" type="date"></label><label class="field"><span>Repair cost (₹)</span><input name="cost" type="number" min="0" step=".01" value="0"></label><label class="field"><span>Notes</span><textarea name="notes" rows="2" placeholder="Parts, service centre, warranty claim…"></textarea></label>`,"Save repair",async f=>{const cost=Number(f.get("cost"))||0,done=String(f.get("completed_date")||"")||null;await updateCurrent(row=>{row.repairs=[...row.repairs,{description:String(f.get("description")),started_date:String(f.get("started_date")||new Date().toISOString().slice(0,10)),completed_date:done,cost,notes:String(f.get("notes")||"")}];row.repair_cost=(Number(row.repair_cost)||0)+cost;row.status=done?"repaired":"under_repair";if(done)row.last_repaired_date=done;});});
  if(kind==="price") actionDialog("Add a price record",`Track a quote or price change for ${x.name}.`,`<label class="field"><span>Price (₹) *</span><input name="amount" type="number" min="0" step=".01" required></label><label class="field"><span>Date</span><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="field"><span>Note / retailer</span><input name="note" placeholder="e.g. Online sale"></label><label class="field"><span>Update planned price too?</span><select name="update_planned"><option value="no">No, history only</option><option value="yes">Yes</option></select></label>`,"Save price",async f=>{const amount=Number(f.get("amount"));if(amount<0)throw new Error("Price cannot be negative.");await updateCurrent(row=>{row.price_history=[...row.price_history,{amount,date:String(f.get("date")||new Date().toISOString().slice(0,10)),note:String(f.get("note")||"Price update")}];if(f.get("update_planned")==="yes")row.planned_price=amount;});});
  if(kind==="rating") actionDialog("Rate this item",`Your real-world experience with ${x.name}.`,`<label class="field"><span>Overall rating *</span><select name="rating" required>${[5,4,3,2,1].map(n=>`<option value="${n}" ${x.rating===n?"selected":""}>${"★".repeat(n)}${"☆".repeat(5-n)} — ${n}/5</option>`).join("")}</select></label><label class="field"><span>Quality</span><select name="quality">${[0,5,4,3,2,1].map(n=>`<option value="${n}" ${x.quality_rating===n?"selected":""}>${n?n+"/5":"Not rated"}</option>`).join("")}</select></label><label class="field"><span>Value for money</span><select name="value">${[0,5,4,3,2,1].map(n=>`<option value="${n}" ${x.value_rating===n?"selected":""}>${n?n+"/5":"Not rated"}</option>`).join("")}</select></label><label class="field"><span>Durability</span><select name="durability">${[0,5,4,3,2,1].map(n=>`<option value="${n}" ${x.durability_rating===n?"selected":""}>${n?n+"/5":"Not rated"}</option>`).join("")}</select></label>`,"Save rating",async f=>{await updateCurrent(row=>{row.rating=Number(f.get("rating"));row.quality_rating=Number(f.get("quality"));row.value_rating=Number(f.get("value"));row.durability_rating=Number(f.get("durability"));});});
}
function exportData(format="json") {
  const data=items.map(({id,created_at,updated_at,...x})=>x);
  let blob,name,type;
  if(format==="csv") {
    const columns=["name","category","status","priority","planned_price","actual_price","purchase_date","warranty_end","rating","repair_cost","notes"];
    const quote=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv=[columns.join(","),...data.map(row=>columns.map(c=>quote(row[c])).join(","))].join("\r\n");
    blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});name="jashxp-buy-tracker.csv";
  } else {blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),currency:"INR",items},null,2)],{type:"application/json"});name="jashxp-buy-tracker.json";}
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);toast("Export downloaded.");
}
function copyItemUrl(id) { const url=new URL(location.href);url.hash="item="+encodeURIComponent(id);navigator.clipboard?.writeText(url.href).then(()=>toast("Item URL copied.")).catch(()=>prompt("Copy this item URL:",url.href)); }
function handleDeepLink() { if(location.hash.startsWith("#item=")){const id=decodeURIComponent(location.hash.slice(6));if(items.some(x=>x.id===id))openDetail(id);} }
function setView(view) {
  activeView=view;const labels={overview:"Overview",all:"All items",planning:"Planning to buy",purchased:"Purchased",repair:"Repair centre",repaired:"Repaired",retired:"Retired / sold"};
  $("page-label").textContent=labels[view]||"Overview";$("heading-title").textContent=view==="overview"?"Your buying roadmap.":labels[view]+".";
  $("heading-subtitle").textContent=view==="overview"?"Keep your next purchases, current gear and repairs in one clear place.":`Manage and review your ${labels[view].toLowerCase()} items.`;
  $("overview-panels").classList.toggle("hidden",view!=="overview");renderAll();
}
document.addEventListener("click",async e=>{
  const close=e.target.closest("[data-close]");if(close){$(close.dataset.close).close();return;}
  const nav=e.target.closest("[data-view]");if(nav){setView(nav.dataset.view);return;}
  const openView=e.target.closest("[data-open-view]");if(openView){setView(openView.dataset.openView);return;}
  const more=e.target.closest("[data-more-item]");if(more){e.stopPropagation();const x=items.find(i=>i.id===more.dataset.moreItem);if(x)openDetail(x.id);return;}
  const open=e.target.closest("[data-open-item]");if(open){if(e.target.closest("button"))return;openDetail(open.dataset.openItem);return;}
  const edit=e.target.closest("[data-edit-item]");if(edit){const x=items.find(i=>i.id===edit.dataset.editItem);$("detail-dialog").close();openItemDialog(x);return;}
  const del=e.target.closest("[data-delete-item]");if(del){deleteItem(del.dataset.deleteItem);return;}
  const act=e.target.closest("[data-action]");if(act){openAction(act.dataset.action,act.dataset.id);return;}
  const cp=e.target.closest("[data-copy-link]");if(cp){copyItemUrl(cp.dataset.copyLink);return;}
  const removeLink=e.target.closest("[data-remove-link]");if(removeLink){const i=Number(removeLink.dataset.removeLink);await updateCurrent(row=>row.links.splice(i,1));renderAll();openDetail(activeItemId);toast("Link removed.");return;}
  const removeRepair=e.target.closest("[data-remove-repair]");if(removeRepair){const i=Number(removeRepair.dataset.removeRepair);if(!confirm("Remove this repair record? The repair cost total will be recalculated."))return;await updateCurrent(row=>{const [r]=row.repairs.splice(i,1);row.repair_cost=row.repairs.reduce((s,v)=>s+(Number(v.cost)||0),0);if(row.last_repaired_date===r?.completed_date)row.last_repaired_date=row.repairs.filter(v=>v.completed_date).map(v=>v.completed_date).sort().at(-1)||null;});renderAll();openDetail(activeItemId);toast("Repair removed.");return;}
});
document.addEventListener("keydown",e=>{const card=e.target.closest?.("[data-open-item]");if(card&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openDetail(card.dataset.openItem);}});
$("add-item-button").addEventListener("click",()=>openItemDialog());$("empty-add-button").addEventListener("click",()=>openItemDialog());
$("search-input").addEventListener("input",renderCards);$("category-filter").addEventListener("change",renderCards);$("sort-select").addEventListener("change",renderCards);
$("export-button").addEventListener("click",()=>exportData("json"));$("settings-export-button").addEventListener("click",()=>exportData("json"));$("settings-csv-button").addEventListener("click",()=>exportData("csv"));
$("refresh-button").addEventListener("click",reloadItems);$("settings-button").addEventListener("click",()=>$("settings-dialog").showModal());
$("connect-button").addEventListener("click",async()=>{
  const url=$("supabaseClient-url").value.trim().replace(/\/$/,""),key=$("supabaseClient-key").value.trim();
  if(!/^https:\/\/.+\.supabaseClient\.co$/.test(url)||!key)return toast("Enter a valid Supabase project URL and publishable/anon key.");
  localStorage.setItem("jxbuy_url",url);localStorage.setItem("jxbuy_key",key);toast("Configuration saved. Connecting…");await initialize();if(connected)toast("Supabase connected.");
});
$("login-form").addEventListener("submit",async e=>{e.preventDefault();if(!supabaseClient)return toast("Connect Supabase first.");const {error}=await supabaseClient.auth.signInWithPassword({email:$("login-email").value.trim(),password:$("login-password").value});if(error){$("auth-message").textContent=error.message;return;}const {data:{user}}=await supabaseClient.auth.getUser();currentUser=user;await refreshOwnerState();$("auth-message").textContent=isOwner?"Signed in as tracker owner.":"Signed in, but this account is not configured as the owner.";updateConnectionUI();await reloadItems();toast(isOwner?"Signed in successfully.":"Account is not the configured owner.");});
$("logout-button").addEventListener("click",async()=>{if(supabaseClient)await supabaseClient.auth.signOut();currentUser=null;isOwner=false;updateConnectionUI();$("auth-message").textContent="Signed out.";await reloadItems();toast("Signed out.");});
window.addEventListener("hashchange",handleDeepLink);
document.addEventListener("DOMContentLoaded",()=>{const cfg=getSavedConfig();$("supabaseClient-url").value=cfg.url;$("supabaseClient-key").value=cfg.key;initialize().then(handleDeepLink);});
