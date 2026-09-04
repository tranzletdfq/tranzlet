import { getCurrentAuthenticatedUser, signInWithEmailCredentials, signOutSession } from './authManager.js';
import { fetchUserDashboardData } from './dashboardService.js';
import { initializeDashboardInteractions } from './uiManager.js';

const toggleView = (viewId) => {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const authStatus = document.getElementById('auth-status-container');

    const isDashboard = viewId === 'dashboard-view';

    loginView?.classList.toggle('hidden', isDashboard);
    dashboardView?.classList.toggle('hidden', !isDashboard);

    if (authStatus) {
        if (isDashboard) {
            authStatus.innerHTML = '<button id="sign-out-btn" type="button" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-white transition">Sign Out</button>';
            bindSignOut();
        } else {
            authStatus.textContent = 'Secure Portal';
        }
    }
};

const bindSignOut = () => {
    const signOutBtn = document.getElementById('sign-out-btn');
    if (!signOutBtn) return;

    signOutBtn.addEventListener('click', async () => {
        try {
            signOutBtn.disabled = true;
            await signOutSession();
        } catch (error) {
            signOutBtn.disabled = false;
            alert(`Sign out failed: ${error.message}`);
        }
    });
};

const loadDashboardUI = async () => {
    const dashboardData = await fetchUserDashboardData();

    const walletDisplay = document.getElementById('wallet-balance-display');
    if (walletDisplay) {
        const balance = Number.parseFloat(dashboardData.wallet.balance_ngn) || 0;
        walletDisplay.textContent = `₦${balance.toLocaleString('en-NG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    const ledgerContainer = document.getElementById('tags-ledger-container');
    if (!ledgerContainer) return;

    if (!dashboardData.tags?.length) {
        ledgerContainer.innerHTML = '<p class="text-slate-400 italic text-sm">No remittance tags created yet.</p>';
        return;
    }

    ledgerContainer.replaceChildren(...dashboardData.tags.map((tag) => {
        const row = document.createElement('div');
        row.className = 'bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-sm';

        const details = document.createElement('div');
        const reference = document.createElement('p');
        reference.className = 'font-mono font-bold text-slateNavy';
        reference.textContent = tag.reference_tag;

        const amounts = document.createElement('p');
        amounts.className = 'text-xs text-slate-500';
        amounts.textContent = `$${tag.amount_usd} USD → ₦${tag.amount_ngn} NGN`;

        details.append(reference, amounts);

        const status = document.createElement('span');
        status.className = `text-xs px-2 py-1 rounded font-semibold ${getStatusBadgeStyle(tag.status)}`;
        status.textContent = tag.status;

        row.append(details, status);
        return row;
    }));
};

const getStatusBadgeStyle = (status) => {
    switch (status) {
        case 'APPROVED':
            return 'bg-emerald-100 text-emerald-700';
        case 'PROOF_SUBMITTED':
            return 'bg-amber-100 text-amber-700';
        case 'REJECTED':
            return 'bg-red-100 text-red-700';
        default:
            return 'bg-slate-200 text-slate-700';
    }
};

const loadAuthUI = () => {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');
        const submitButton = loginForm.querySelector('button[type="submit"]');

        if (!emailInput || !passwordInput) return;

        try {
            submitButton?.setAttribute('disabled', 'disabled');
            await signInWithEmailCredentials(emailInput.value, passwordInput.value);
            window.location.reload();
        } catch (error) {
            alert(`Login failed: ${error.message}`);
            submitButton?.removeAttribute('disabled');
        }
    });
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await getCurrentAuthenticatedUser();
        toggleView('dashboard-view');
        await loadDashboardUI();
        await initializeDashboardInteractions();
    } catch (error) {
        toggleView('login-view');
        loadAuthUI();
    }
});
