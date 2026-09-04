import { supabase } from './supabase.js';

export const createTranzletTag = async (assetType, amountUsd, exchangeRate) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        throw new Error('Unauthorized: You must be logged in to create a remittance tag.');
    }

    const normalizedAsset = assetType.toUpperCase();
    const parsedUsd = parseFloat(amountUsd);
    const parsedRate = parseFloat(exchangeRate);

    if (isNaN(parsedUsd) || parsedUsd <= 0) {
        throw new Error('Invalid USD amount provided.');
    }

    if (isNaN(parsedRate) || parsedRate <= 0) {
        throw new Error('Invalid exchange rate provided.');
    }

    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestampSuffix = Date.now().toString().slice(-4);
    const referenceTag = `TRZ-NGN-${timestampSuffix}-${randomHex}-${normalizedAsset}`;
    const amountNgn = parsedUsd * parsedRate;

    const payload = {
        user_id: user.id,
        reference_tag: referenceTag,
        asset_type: normalizedAsset,
        amount_usd: parsedUsd.toFixed(2),
        amount_ngn: amountNgn.toFixed(2),
        exchange_rate: parsedRate.toFixed(2),
        status: 'PENDING_DEPOSIT',
        expires_at: null
    };

    const { data, error } = await supabase
        .from('tranzlet_tags')
        .insert([payload])
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to initialize tag: ${error.message}`);
    }

    return data;
};
