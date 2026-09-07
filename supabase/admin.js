import { supabase } from './supabase.js';
import { getSecureProofSignedUrl } from './paymentProof.js';

const ROUTES = [
  ['PAYPAL','PayPal'],['CASHAPP','Cash App'],['USDT','USDT'],['BITCOIN','Bitcoin'],['WISE','Wise'],['WESTERN_UNION','Western Union'],['SKRILL','Skrill'],['REVOLUT','Revolut'],['MONEYGRAM','MoneyGram'],['BINANCE','Binance'],['RIA','RIA'],['ZELLE','Zelle']
];
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money = (value) => `₦${Number.parseFloat(value || 0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const message = (text, error=false) => { const el=document.getElementById('admin-message'); if(el){el.textContent=text;el.className=`mt-3 text-sm ${error?'text-red-600':'text-emerald-600'}`;} };

const requireAdmin = async () => {
  const {data:{user},error}=await supabase.auth.getUser();
  if(error || !user){window.location.replace('./login.html');return null;}
  const {data:isAdmin,error:roleError}=await supabase.rpc('is_admin_user');
  if(roleError || !isAdmin){message('This page is not available for this account.',true);setTimeout(()=>window.location.replace('./dashboard.html'),700);return null;}
  document.getElementById('admin-email').textContent=user.email||'';
  return user;
};

const loadTags = async () => {
  const container=document.getElementById('admin-tags');
  const {data,error}=await supabase.from('tranzlet_tags').select('*, profiles(full_name,phone_number)').eq('status','PROOF_SUBMITTED').order('created_at',{ascending:false});
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load submitted proofs.</p>';return;}
  if(!data?.length){container.innerHTML='<p class="text-sm text-slate-400">No submitted payment proofs.</p>';return;}
  container.innerHTML=data.map(tag=>`<article class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><p class="font-mono text-sm font-semibold">${escapeHtml(tag.reference_tag)}</p><span class="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">PROOF SUBMITTED</span></div><p class="mt-2 text-sm font-semibold">${escapeHtml(tag.asset_type)} · $${escapeHtml(tag.amount_usd)} · customer estimate ${money(tag.amount_ngn)}</p><p class="mt-1 text-xs text-slate-500">Sender: ${escapeHtml(tag.sender_name||'Not provided')} · Transaction: ${escapeHtml(tag.transaction_identifier||'Not provided')}</p><p class="mt-1 text-xs text-slate-400">Customer: ${escapeHtml(tag.profiles?.full_name||'')} ${tag.profiles?.phone_number?`· ${escapeHtml(tag.profiles.phone_number)}`:''}</p></div><div class="w-full max-w-sm space-y-2 lg:w-auto"><div class="flex flex-wrap gap-2"><button data-proof="${escapeHtml(tag.proof_image_url||'')}" class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">View proof</button><button data-reject="${escapeHtml(tag.id)}" class="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600">Reject</button></div><div class="flex items-center gap-2"><label class="sr-only" for="credit-${escapeHtml(tag.id)}">Final NGN credit</label><input id="credit-${escapeHtml(tag.id)}" data-credit="${escapeHtml(tag.id)}" value="${escapeHtml(Number(tag.amount_ngn||0).toFixed(2))}" inputmode="decimal" type="number" min="0.01" step="0.01" class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Final NGN credit"><button data-approve="${escapeHtml(tag.id)}" class="rounded-lg bg-orange px-3 py-2 text-sm font-semibold text-white">Approve & credit</button></div><p class="text-[11px] leading-4 text-slate-400">Confirm the proof and final NGN amount before crediting.</p></div></div></article>`).join('');
  container.querySelectorAll('[data-proof]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;button.textContent='Opening…';try{const url=await getSecureProofSignedUrl(button.dataset.proof);window.open(url,'_blank','noopener,noreferrer');}catch(error){message(error.message||'Unable to open proof.',true);}finally{button.disabled=false;button.textContent='View proof';}}));
  container.querySelectorAll('[data-approve]').forEach(button=>button.addEventListener('click',async()=>{const input=container.querySelector(`[data-credit="${button.dataset.approve}"]`);const amount=Number.parseFloat(input?.value);if(!Number.isFinite(amount)||amount<=0){message('Enter a valid final NGN credit amount before approving.',true);input?.focus();return;}if(!window.confirm(`Credit ${money(amount)} to this customer wallet?`))return;button.disabled=true;button.textContent='Processing…';const {error:rpcError}=await supabase.rpc('approve_tag_and_credit_wallet_atomic',{p_tag_id:button.dataset.approve,p_credit_ngn:amount});if(rpcError){message(rpcError.message,true);button.disabled=false;button.textContent='Approve & credit';return;}message(`Tag approved and ${money(amount)} was credited.`);await loadTags();}));
  container.querySelectorAll('[data-reject]').forEach(button=>button.addEventListener('click',async()=>{if(!window.confirm('Reject this payment proof?'))return;button.disabled=true;button.textContent='Rejecting…';const {error:rpcError}=await supabase.rpc('reject_tag',{p_tag_id:button.dataset.reject});if(rpcError){message(rpcError.message,true);button.disabled=false;button.textContent='Reject';return;}message('Payment proof rejected.');await loadTags();}));
};

const loadHandles = async () => {
  const container=document.getElementById('admin-handles');
  const {data,error}=await supabase.from('company_payment_handles').select('*').order('asset_type');
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load payment accounts.</p>';return;}
  const byAsset=new Map((data||[]).map(row=>[row.asset_type,row]));
  container.innerHTML=ROUTES.map(([key,name])=>{const h=byAsset.get(key);return `<form data-route="${key}" data-id="${escapeHtml(h?.id||'')}" class="rounded-xl border border-slate-200 p-4"><div class="flex items-center justify-between gap-3"><div><p class="text-sm font-semibold">${name}</p><p class="mt-0.5 text-xs text-slate-400">${h?'Configured':'Not configured'}</p></div><label class="flex items-center gap-2 text-xs text-slate-500"><input name="active" type="checkbox" ${h?.is_active!==false?'checked':''}> Active</label></div><div class="mt-3 grid gap-3 sm:grid-cols-2"><input name="handle_name" value="${escapeHtml(h?.handle_name||'Tranzlet '+name+' account')}" required class="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Account label"><input name="handle_value" value="${escapeHtml(h?.handle_value||'')}" required class="rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Account, username or wallet address"></div><button class="mt-3 w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white">Save ${name} details</button></form>`;}).join('');
  container.querySelectorAll('form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');const body=new FormData(form);button.disabled=true;try{const payload={asset_type:form.dataset.route,handle_name:String(body.get('handle_name')).trim(),handle_value:String(body.get('handle_value')).trim(),is_active:body.get('active')==='on',updated_at:new Date().toISOString()};const result=form.dataset.id?await supabase.from('company_payment_handles').update(payload).eq('id',form.dataset.id):await supabase.from('company_payment_handles').insert([payload]);if(result.error)throw result.error;message(`${form.dataset.route} payment details saved.`);await loadHandles();}catch(error){message(error.message||'Unable to save payment details.',true);}finally{button.disabled=false;}}));
};

const loadWithdrawals = async () => {
  const container=document.getElementById('admin-withdrawals');
  const {data,error}=await supabase.from('withdrawal_requests').select('id,user_id,bank_account_id,amount_ngn,status,created_at,profiles(full_name,phone_number),user_bank_accounts(bank_name,account_name,account_number)').order('created_at',{ascending:false});
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load withdrawal requests.</p>';return;}
  if(!data?.length){container.innerHTML='<p class="text-sm text-slate-400">No withdrawal requests.</p>';return;}
  container.innerHTML=data.map(w=>`<article class="rounded-xl border border-slate-200 p-4"><div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p class="text-lg font-semibold">${money(w.amount_ngn)}</p><p class="mt-1 text-sm">${escapeHtml(w.profiles?.full_name||'Customer')}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(w.user_bank_accounts?.bank_name||'Bank')} · ${escapeHtml(w.user_bank_accounts?.account_name||'')} · ${escapeHtml(w.user_bank_accounts?.account_number||'')}</p><p class="mt-1 text-xs text-slate-400">Request ${escapeHtml(w.id.slice(0,8))} · ${escapeHtml(w.status)} · ${new Date(w.created_at).toLocaleString('en-NG')}</p></div><span class="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold">${escapeHtml(w.status)}</span></div></article>`).join('');
};

const load=async()=>{if(!await requireAdmin())return;await Promise.all([loadTags(),loadHandles(),loadWithdrawals()]);};
document.getElementById('refresh-tags')?.addEventListener('click',loadTags);
document.getElementById('admin-sign-out')?.addEventListener('click',async()=>{await supabase.auth.signOut();window.location.replace('./login.html');});
load();
