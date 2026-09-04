import { supabase } from './supabase.js';
import { fetchUserDashboardData } from './dashboardService.js';
import { fetchUserBankAccounts, addUserBankAccount } from './withdrawalService.js';

const money = (value) => `₦${Number.parseFloat(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const statusClass = (status) => {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'PROOF_SUBMITTED') return 'bg-amber-100 text-amber-700';
  if (status === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
};

const showTagNotice = (message) => {
  const existing = document.getElementById('tag-action-message');
  if (existing) {
    existing.textContent = message;
    existing.className = 'mt-3 text-sm text-slate-500';
    return;
  }
  const button = document.getElementById('create-tag-btn');
  if (!button) return;
  const notice = document.createElement('p');
  notice.id = 'tag-action-message';
  notice.className = 'mt-3 text-sm text-slate-500';
  notice.textContent = message;
  button.closest('section')?.querySelector('div')?.appendChild(notice);
};

const renderTags = (tags) => {
  const container = document.getElementById('tags-ledger-container');
  if (!container) return;
  if (!tags?.length) {
    container.innerHTML = '<p class="text-sm text-slate-400">No remittance tags yet.</p>';
    return;
  }
  container.innerHTML = tags.map((tag) => `
    <article class="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
      <div class="min-w-0"><p class="font-mono text-sm font-semibold truncate">${escapeHtml(tag.reference_tag)}</p><p class="mt-1 text-xs text-slate-500">$${escapeHtml(tag.amount_usd)} USD → ${money(tag.amount_ngn)}</p></div>
      <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(tag.status)}">${escapeHtml(tag.status)}</span>
    </article>
  `).join('');
};

const renderBankAccounts = (accounts) => {
  const container = document.getElementById('bank-accounts-container');
  if (!container) return;
  if (!accounts?.length) {
    container.innerHTML = '<p class="text-sm text-slate-400">No bank accounts saved.</p>';
    return;
  }
  container.innerHTML = accounts.map((account) => {
    const number = escapeHtml(account.account_number || '');
    const masked = number.length > 4 ? `${'•'.repeat(Math.max(0, number.length - 4))}${number.slice(-4)}` : number;
    return `<article class="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
      <div><p class="font-semibold">${escapeHtml(account.bank_name)}</p><p class="mt-1 text-xs text-slate-500">${escapeHtml(account.account_name)} · ${masked}</p></div>
      <span class="text-xs font-medium text-slate-400">Saved</span>
    </article>`;
  }).join('');
};

const loadBankAccounts = async () => {
  try {
    renderBankAccounts(await fetchUserBankAccounts());
  } catch (error) {
    console.error('Bank account load failed:', error);
    const container = document.getElementById('bank-accounts-container');
    if (container) container.innerHTML = '<p class="text-sm text-red-600">We could not load your bank accounts. Please refresh and try again.</p>';
  }
};

const bindBankAccountForm = () => {
  const form = document.getElementById('bank-account-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('save-bank-account-btn');
    const message = document.getElementById('bank-account-message');
    const bankName = document.getElementById('bank-name-input').value;
    const accountNumber = document.getElementById('account-number-input').value.replace(/\s+/g, '');
    const accountName = document.getElementById('account-name-input').value;

    if (!/^\d{10}$/.test(accountNumber)) {
      message.textContent = 'Enter a valid 10-digit Nigerian account number.';
      message.className = 'mt-3 text-sm text-red-600';
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    message.textContent = '';
    try {
      await addUserBankAccount(bankName, accountNumber, accountName);
      form.reset();
      message.textContent = 'Bank account saved.';
      message.className = 'mt-3 text-sm text-emerald-600';
      await loadBankAccounts();
    } catch (error) {
      message.textContent = error.message || 'Unable to save bank account.';
      message.className = 'mt-3 text-sm text-red-600';
    } finally {
      button.disabled = false;
      button.textContent = 'Save bank account';
    }
  });
};

const load = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('./login.html');
    return;
  }
  const userEmail = document.getElementById('user-email');
  if (userEmail) userEmail.textContent = session.user.email || '';
  try {
    const data = await fetchUserDashboardData();
    const balance = money(data.wallet?.balance_ngn);
    document.getElementById('wallet-balance-display').textContent = balance;
    document.getElementById('withdraw-balance-display').textContent = balance;
    document.getElementById('tag-count-display').textContent = String(data.tags?.length || 0);
    renderTags(data.tags);
    await loadBankAccounts();
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    document.getElementById('tags-ledger-container').innerHTML = '<p class="text-sm text-red-600">We could not load your account activity. Please refresh and try again.</p>';
  }
};

document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
  const button = document.getElementById('sign-out-btn');
  button.disabled = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    button.disabled = false;
    showTagNotice('Unable to sign out. Please try again.');
    return;
  }
  window.location.replace('./login.html');
});

document.getElementById('create-tag-btn')?.addEventListener('click', () => {
  showTagNotice('Payment tags are not available yet. Please check back later.');
});

bindBankAccountForm();
load();
