import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser } from './authManager.js';
import { submitPaymentProof } from './paymentProof.js';
import { createTranzletTag } from './tagManager.js';

const ROUTES = [
  { key:'PAYPAL', name:'PayPal', type:'Online payments', icon:'P', iconClass:'bg-[#003087] text-white' },
  { key:'CASHAPP', name:'Cash App', type:'Mobile payments', icon:'$', iconClass:'bg-[#00D632] text-white' },
  { key:'USDT', name:'USDT', type:'Stablecoin', icon:'₮', iconClass:'bg-[#26A17B] text-white' },
  { key:'BITCOIN', name:'Bitcoin', type:'Cryptocurrency', icon:'₿', iconClass:'bg-[#F7931A] text-white' },
  { key:'WISE', name:'Wise', type:'International transfers', icon:'7', iconClass:'bg-[#9FE870] text-[#0B1F12]' },
  { key:'WESTERN_UNION', name:'Western Union', type:'Money transfer', icon:'WU', iconClass:'bg-black text-[#FFD400]' },
  { key:'SKRILL', name:'Skrill', type:'Online payments', icon:'S', iconClass:'bg-[#6A0DAD] text-white' },
  { key:'REVOLUT', name:'Revolut', type:'Global finance', icon:'R', iconClass:'bg-black text-white' },
  { key:'MONEYGRAM', name:'MoneyGram', type:'Money transfer', icon:'M', iconClass:'border border-red-100 bg-white text-[#D71920]' },
  { key:'BINANCE', name:'Binance', type:'Crypto exchange', icon:'◇', iconClass:'bg-[#111827] text-[#F3BA2F]' },
  { key:'RIA', name:'RIA', type:'Money transfer', icon:'ria', iconClass:'bg-[#F36C21] text-white' },
  { key:'ZELLE', name:'Zelle', type:'Bank transfer', icon:'Z', iconClass:'bg-[#6D28D9] text-white' }
];

const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

export const renderRouteCards = (container) => {
  container.innerHTML = ROUTES.map(route => `
    <button type="button" class="route-card group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left sm:p-5" data-route="${route.key}" aria-label="Choose ${escapeHtml(route.name)}">
      <span class="route-icon ${route.iconClass}">${route.icon}</span>
      <span class="min-w-0 flex-1"><span class="block truncate text-[15px] font-semibold text-navy sm:text-base">${escapeHtml(route.name)}</span><span class="mt-1 block truncate text-xs text-slate-500 sm:text-sm">${escapeHtml(route.type)}</span></span>
      <span class="route-arrow">›</span>
    </button>`).join('');
};

const fetchHandle = async (assetType) => {
  const { data, error } = await supabase.from('company_payment_handles').select('id,asset_type,handle_name,handle_value,is_active').eq('asset_type', assetType).eq('is_active', true).maybeSingle();
  if (error) throw new Error(`Unable to load payment details: ${error.message}`);
  return data;
};

const panel = document.getElementById('route-panel');
const panelTitle = document.getElementById('route-panel-title');
const panelCopy = document.getElementById('route-panel-copy');
const handleBox = document.getElementById('route-handle-box');
const form = document.getElementById('remittance-proof-form');
const amountInput = document.getElementById('remittance-amount');
const rateInput = document.getElementById('remittance-rate');
const senderInput = document.getElementById('sender-name');
const transactionInput = document.getElementById('transaction-id');
const proofInput = document.getElementById('payment-proof');
const submitButton = document.getElementById('submit-remittance');
const formMessage = document.getElementById('remittance-form-message');
let selectedRoute = null;

const setMessage = (text, error = false) => {
  if (!formMessage) return;
  formMessage.textContent = text;
  formMessage.className = `mt-4 text-sm ${error ? 'text-red-600' : 'text-emerald-600'}`;
};

const closePanel = () => {
  panel?.classList.add('hidden');
  form?.reset();
  setMessage('');
  selectedRoute = null;
};

const showRoute = async (route) => {
  selectedRoute = route;
  panel?.classList.remove('hidden');
  panel?.scrollIntoView({ behavior:'smooth', block:'nearest' });
  panelTitle.textContent = route.name;
  panelCopy.textContent = `Use your ${route.name} account to send the remittance, then submit the payment proof below.`;
  handleBox.innerHTML = '<p class="text-sm text-slate-500">Loading payment details…</p>';
  setMessage('');

  try {
    const handle = await fetchHandle(route.key);
    if (!handle) {
      handleBox.innerHTML = '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4"><p class="text-sm font-semibold text-navy">Payment details are not available yet.</p><p class="mt-1 text-sm text-slate-500">Please check back later or choose another route.</p></div>';
      form?.classList.add('hidden');
      return;
    }
    form?.classList.remove('hidden');
    handleBox.innerHTML = `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4"><p class="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">Send to</p><p class="mt-2 text-sm font-semibold text-navy">${escapeHtml(handle.handle_name)}</p><div class="mt-2 flex items-center gap-2"><code class="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-sm text-slate-700">${escapeHtml(handle.handle_value)}</code><button type="button" id="copy-handle" class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">Copy</button></div></div>`;
    document.getElementById('copy-handle')?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(handle.handle_value);
      document.getElementById('copy-handle').textContent = 'Copied';
      setTimeout(() => { const btn=document.getElementById('copy-handle'); if(btn) btn.textContent='Copy'; }, 1200);
    });
  } catch (error) {
    handleBox.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message)}</p>`;
    form?.classList.add('hidden');
  }
};

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedRoute) return;
  const amount = Number.parseFloat(amountInput.value);
  const rate = Number.parseFloat(rateInput.value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) {
    setMessage('Enter a valid amount and exchange rate.', true);
    return;
  }
  if (!proofInput.files?.[0]) {
    setMessage('Upload your payment proof before submitting.', true);
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';
  setMessage('');
  try {
    await getCurrentAuthenticatedUser();
    const tag = await createTranzletTag(selectedRoute.key, amount, rate);
    await submitPaymentProof(tag.id, senderInput.value, transactionInput.value, proofInput.files[0]);
    setMessage('Payment proof submitted. Your wallet will be credited after review.');
    form.reset();
    window.dispatchEvent(new CustomEvent('tranzlet:remittance-submitted'));
  } catch (error) {
    setMessage(error.message || 'Unable to submit the remittance.', true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit payment proof';
  }
});

document.getElementById('route-panel-close')?.addEventListener('click', closePanel);
document.getElementById('asset-selector')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-route]');
  if (!button) return;
  const route = ROUTES.find(item => item.key === button.dataset.route);
  if (route) showRoute(route);
});
