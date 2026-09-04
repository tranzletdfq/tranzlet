import { createTranzletTag } from './tagManager.js';
import { fetchActiveCompanyHandles } from './companyHandles.js';
import { submitPaymentProof } from './paymentProof.js';

export const initializeDashboardInteractions = async () => {
    try {
        const handles = await fetchActiveCompanyHandles();
        renderCompanyHandles(handles);
    } catch (error) {
        console.error('Failed to load company payment handles:', error.message);
    }

    const tagForm = document.getElementById('create-tag-form');
    if (!tagForm) {
        return;
    }

    tagForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const assetType = document.getElementById('asset-type-select')?.value;
        const amountUsd = document.getElementById('amount-usd-input')?.value;
        const exchangeRate = document.getElementById('exchange-rate-display')?.dataset.rate || '1500';

        try {
            const newTag = await createTranzletTag(assetType, amountUsd, exchangeRate);
            alert(`Remittance tag initialized successfully: ${newTag.reference_tag}`);
            window.location.reload();
        } catch (error) {
            alert(`Tag creation failed: ${error.message}`);
        }
    });
};

const renderCompanyHandles = (handles) => {
    const container = document.getElementById('company-handles-container');
    if (!container) return;

    if (!handles || handles.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-sm italic">No active payment handles available.</p>';
        return;
    }

    container.innerHTML = handles.map((handle) => `
        <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center text-sm">
            <div>
                <span class="font-semibold text-slateNavy uppercase">${handle.asset_type}:</span>
                <span class="text-slate-600 ml-1">${handle.handle_name}</span>
            </div>
            <code class="bg-white px-2 py-1 rounded border border-slate-300 font-mono text-xs text-vibrantOrange font-bold">${handle.handle_value}</code>
        </div>
    `).join('');
};
