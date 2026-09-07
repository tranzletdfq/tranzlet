import { supabase } from './supabase.js';
import { fetchUserDashboardData } from './dashboardService.js';
import { fetchUserBankAccounts, addUserBankAccount, requestNgnWithdrawalAtomic } from './withdrawalService.js';
import { renderRouteCards } from './remittanceFlow.js';

const money = (value) => `₦${Number.parseFloat(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const statusClass = (status) => status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : status === 'PROOF_SUBMITTED' ? 'bg-amber-100 text-amber-700' : status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
let bankAccounts = [];

const renderTags = (tags) => {
  const container = document.getElementById('tags-ledger-container');
  if (!container) return;
  if (!tags?.length) {
    container.innerHTML = '<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No remittance submissions yet. Choose a payment route above to begin.</div>';
    return;
  }
  container.innerHTML = `<div class="mb-3"><h3 class="text-base font-semibold">Your remittance history</h3><p class="mt-1 text-sm text-slate-500">Track each submission from proof review to wallet credit.</p></div>` + tags.map(tag => `
    <article class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0"><p class="font-mono text-sm font-semibold truncate">${escapeHtml(tag.reference_tag)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(tag.asset_type)} · $${escapeHtml(tag.amount_usd)} USD → ${money(tag.amount_ngn)}</p>${tag.transaction_identifier ? `<p class="mt-1 text-xs text-slate-400">Ref: ${escapeHtml(tag.transaction_identifier)}</p>` : ''}</div>
        <span class="w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(tag.status)}">${escapeHtml(tag.status.replaceAll('_',' '))}</span>
      </div>
    </article>`).join('');
};

const renderBankAccounts = (accounts) => {
  bankAccounts = accounts || [];
  const container = document.getElementById('bank-accounts-container');
  const select = document.getElementById('withdraw-bank');
  if (container) {
    if (!bankAccounts.length) container.innerHTML = '<p class="text-sm text-slate-400">No bank accounts saved.</p>';
    else container.innerHTML = bankAccounts.map(account => {
      const number = escapeHtml(account.account_number || '');
      const masked = number.length > 4 ? `${'•'.repeat(Math.max(0, number.length - 4))}${number.slice(-4)}` : number;
      return `<article class="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4"><div><p class="font-semibold">${escapeHtml(account.bank_name)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(account.account_name)} · ${masked}</p></div><span class="text-xs font-medium text-slate-400">Saved</span></article>`;
    }).join('');
  }
  if (select) select.innerHTML = '<option value="">Select saved account</option>' + bankAccounts.map(account => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.bank_name)} · ${escapeHtml(account.account_name)}</option>`).join('');
};

const loadBankAccounts = async () => {
  try { renderBankAccounts(await fetchUserBankAccounts()); }
  catch (error) { console.error(error); document.getElementById('bank-accounts-container').innerHTML = '<p class="text-sm text-red-600">We could not load your bank accounts. Please refresh and try again.</p>'; }
};

const bindBankAccountForm = () => {
  const form = document.getElementById('bank-account-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('save-bank-account-btn');
    const message = document.getElementById('bank-account-message');
    const bankName = document.getElementById('bank-name-input').value.trim();
    const accountNumber = document.getElementById('account-number-input').value.replace(/\s+/g, '');
    const accountName = document.getElementById('account-name-input').value.trim();
    if (!/^\d{10}$/.test(accountNumber)) { message.textContent='Enter a valid 10-digit Nigerian account number.'; message.className='mt-3 text-sm text-red-600'; return; }
    button.disabled=true; button.textContent='Saving…'; message.textContent='';
    try { await addUserBankAccount(bankName, accountNumber, accountName); form.reset(); message.textContent='Bank account saved.'; message.className='mt-3 text-sm text-emerald-600'; await loadBankAccounts(); }
    catch(error) { message.textContent=error.message || 'Unable to save bank account.'; message.className='mt-3 text-sm text-red-600'; }
    finally { button.disabled=false; button.textContent='Save bank account'; }
  });
};

const bindWithdrawalForm = () => {
  const form = document.getElementById('withdrawal-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const bankId = document.getElementById('withdraw-bank').value;
    const amount = document.getElementById('withdraw-amount').value;
    const button = document.getElementById('withdraw-submit');
    const message = document.getElementById('withdrawal-message');
    if (!bankId) { message.textContent='Select a saved Nigerian bank account.'; message.className='mt-3 text-sm text-red-600'; return; }
    button.disabled=true; button.textContent='Submitting…'; message.textContent='';
    try {
      const result = await requestNgnWithdrawalAtomic(bankId, amount);
      const newBalance = result?.new_balance ?? result?.newBalance;
      if (newBalance !== undefined) document.getElementById('wallet-balance-display').textContent = money(newBalance);
      document.getElementById('withdraw-amount').value='';
      message.textContent='Withdrawal request submitted for review.'; message.className='mt-3 text-sm text-emerald-600';
    } catch(error) { message.textContent=error.message || 'Withdrawal request failed.'; message.className='mt-3 text-sm text-red-600'; }
    finally { button.disabled=false; button.textContent='Request withdrawal'; }
  });
};

const load = async () => {
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session) { window.location.replace('./login.html'); return; }
  const userEmail=document.getElementById('user-email'); if(userEmail) userEmail.textContent=session.user.email || '';
  try {
    const data=await fetchUserDashboardData();
    const balance=money(data.wallet?.balance_ngn);
    document.getElementById('wallet-balance-display').textContent=balance;
    document.getElementById('withdraw-balance-display').textContent=balance;
    document.getElementById('tag-count-display').textContent=String(data.tags?.length || 0);
    renderTags(data.tags);
    await loadBankAccounts();
  } catch(error) {
    console.error('Dashboard initialization failed:',error);
    document.getElementById('tags-ledger-container').innerHTML='<p class="text-sm text-red-600">We could not load your account activity. Please refresh and try again.</p>';
  }
};

window.addEventListener('tranzlet:remittance-submitted', load);
document.getElementById('sign-out-btn')?.addEventListener('click', async () => { const button=document.getElementById('sign-out-btn'); button.disabled=true; const {error}=await supabase.auth.signOut(); if(error){button.disabled=false;return;} window.location.replace('./login.html'); });
renderRouteCards(document.getElementById('asset-selector'));
bindBankAccountForm();
bindWithdrawalForm();
load();
