import { supabase } from './supabase.js';

const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money = (value) => `₦${Number.parseFloat(value || 0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const message = (text, error = false) => { const el=document.getElementById('admin-message'); if(el){el.textContent=text; el.className=`text-sm ${error?'text-red-600':'text-slate-500'}`;} };

const requireAdmin = async () => {
  const { data:{ user }, error } = await supabase.auth.getUser();
  if(error || !user) { window.location.replace('./login.html'); return null; }
  const { data:isAdmin, error:roleError } = await supabase.rpc('is_admin_user');
  if(roleError || !isAdmin) { message('This page is not available for this account.', true); setTimeout(()=>window.location.replace('./dashboard.html'),700); return null; }
  document.getElementById('admin-email').textContent = user.email || '';
  return user;
};

const loadTags = async () => {
  const container=document.getElementById('admin-tags');
  const { data, error } = await supabase.from('tranzlet_tags').select('*').eq('status','PROOF_SUBMITTED').order('created_at',{ascending:false});
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load submitted tags.</p>'; return;}
  if(!data?.length){container.innerHTML='<p class="text-sm text-slate-400">No submitted payment proofs.</p>';return;}
  container.innerHTML=data.map(tag=>`<article class="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><p class="font-mono text-sm font-semibold">${escapeHtml(tag.reference_tag)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(tag.asset_type)} · $${escapeHtml(tag.amount_usd)} → ${money(tag.amount_ngn)}</p><p class="mt-1 text-xs text-slate-500">Sender: ${escapeHtml(tag.sender_name || 'Not provided')}</p><p class="mt-1 text-xs text-slate-500">Transaction: ${escapeHtml(tag.transaction_identifier || 'Not provided')}</p></div><button data-approve="${escapeHtml(tag.id)}" class="rounded-lg bg-orange text-white px-4 py-2.5 text-sm font-semibold">Approve & credit</button></article>`).join('');
  container.querySelectorAll('[data-approve]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true; button.textContent='Processing…';
    const { error:rpcError }=await supabase.rpc('approve_tag_and_credit_wallet_atomic',{p_tag_id:button.dataset.approve});
    if(rpcError){message(rpcError.message,true);button.disabled=false;button.textContent='Approve & credit';return;}
    message('Tag approved and wallet credited.'); await loadTags();
  }));
};

const loadHandles = async () => {
  const container=document.getElementById('admin-handles');
  const { data,error }=await supabase.from('company_payment_handles').select('*').order('asset_type');
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load payment handles.</p>';return;}
  if(!data?.length){container.innerHTML='<p class="text-sm text-slate-400">No payment handles configured.</p>';return;}
  container.innerHTML=data.map(h=>`<form data-handle="${escapeHtml(h.id)}" class="grid gap-3 sm:grid-cols-[100px_1fr_1.5fr_auto] items-end rounded-xl border border-slate-200 p-4"><div><p class="text-xs font-semibold uppercase text-slate-400">Asset</p><p class="mt-1 text-sm font-semibold">${escapeHtml(h.asset_type)}</p></div><label><span class="text-xs font-semibold uppercase text-slate-400">Name</span><input name="handle_name" value="${escapeHtml(h.handle_name)}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></label><label><span class="text-xs font-semibold uppercase text-slate-400">Handle</span><input name="handle_value" value="${escapeHtml(h.handle_value)}" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"></label><button class="rounded-lg bg-navy text-white px-4 py-2 text-sm font-semibold">Save</button></form>`).join('');
  container.querySelectorAll('form').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;const body=new FormData(form);const {error:updateError}=await supabase.from('company_payment_handles').update({handle_name:String(body.get('handle_name')).trim(),handle_value:String(body.get('handle_value')).trim(),updated_at:new Date().toISOString()}).eq('id',form.dataset.handle);button.disabled=false;if(updateError)message(updateError.message,true);else message('Payment handle updated.');}));
};

const loadWithdrawals = async () => {
  const container=document.getElementById('admin-withdrawals');
  const { data,error }=await supabase.from('withdrawal_requests').select('id,user_id,bank_account_id,amount_ngn,status,created_at').order('created_at',{ascending:false});
  if(error){container.innerHTML='<p class="text-sm text-red-600">Unable to load withdrawal requests.</p>';return;}
  if(!data?.length){container.innerHTML='<p class="text-sm text-slate-400">No withdrawal requests.</p>';return;}
  container.innerHTML=data.map(w=>`<article class="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4"><div><p class="font-semibold">${money(w.amount_ngn)}</p><p class="mt-1 text-xs text-slate-500">Request ${escapeHtml(w.id.slice(0,8))} · ${escapeHtml(w.status)}</p><p class="mt-1 text-xs text-slate-400">${new Date(w.created_at).toLocaleString('en-NG')}</p></div><span class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold">${escapeHtml(w.status)}</span></article>`).join('');
};

const load=async()=>{if(!await requireAdmin())return;await Promise.all([loadTags(),loadHandles(),loadWithdrawals()]);};
document.getElementById('refresh-tags')?.addEventListener('click',loadTags);
document.getElementById('admin-sign-out')?.addEventListener('click',async()=>{await supabase.auth.signOut();window.location.replace('./login.html');});
load();
