import { supabase } from './supabase.js';
import { fetchUserDashboardData } from './dashboardService.js';

const money = (value) => `₦${Number.parseFloat(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusClass = (status) => {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'PROOF_SUBMITTED') return 'bg-amber-100 text-amber-700';
  if (status === 'REJECTED') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
};

const renderTags = (tags) => {
  const container = document.getElementById('tags-ledger-container');
  if (!container) return;
  if (!tags?.length) {
    container.innerHTML = '<p class="text-sm text-slate-400">No remittance tags yet. Create your first tag when you are ready.</p>';
    return;
  }
  container.innerHTML = tags.map((tag) => `
    <article class="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4">
      <div class="min-w-0"><p class="font-mono text-sm font-semibold truncate">${tag.reference_tag}</p><p class="mt-1 text-xs text-slate-500">$${tag.amount_usd} USD → ${money(tag.amount_ngn)}</p></div>
      <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(tag.status)}">${tag.status}</span>
    </article>
  `).join('');
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
    alert('Unable to sign out. Please try again.');
    return;
  }
  window.location.replace('./login.html');
});

document.getElementById('create-tag-btn')?.addEventListener('click', () => {
  window.location.hash = 'create-tag';
  // The full tag creation workflow will be attached here in the next dashboard pass.
});

load();
