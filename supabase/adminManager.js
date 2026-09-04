import { supabase } from './supabase.js';

export const approveTranzletTagAndCreditWallet = async (tagId, adminUserId) => {
    if (!tagId || !adminUserId) {
        throw new Error('Tag ID and Admin User ID are required.');
    }

    // 1. Fetch the target tag details
    const { data: tag, error: tagError } = await supabase
        .from('tranzlet_tags')
        .select('*')
        .eq('id', tagId)
        .single();

    if (tagError || !tag) {
        throw new Error(`Tag not found: ${tagError?.message || 'Invalid ID'}`);
    }

    if (tag.status === 'APPROVED') {
        throw new Error('This tag has already been approved and credited.');
    }

    // 2. Update tag status to APPROVED
    const { error: updateError } = await supabase
        .from('tranzlet_tags')
        .update({ status: 'APPROVED' })
        .eq('id', tagId);

    if (updateError) {
        throw new Error(`Failed to update tag status: ${updateError.message}`);
    }

    // 3. Fetch or initialize the user's NGN wallet
    let { data: wallet, error: walletFetchError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', tag.user_id)
        .single();

    if (walletFetchError || !wallet) {
        // Create wallet if it doesn't exist
        const { data: newWallet, error: walletCreateError } = await supabase
            .from('wallets')
            .insert([{ user_id: tag.user_id, balance_ngn: tag.amount_ngn }] )
            .select()
            .single();

        if (walletCreateError) {
            throw new Error(`Failed to initialize user wallet: ${walletCreateError.message}`);
        }
        return { success: true, creditedNgn: tag.amount_ngn, wallet: newWallet };
    }

    // 4. Update existing wallet balance by adding the NGN amount
    const updatedBalance = parseFloat(wallet.balance_ngn) + parseFloat(tag.amount_ngn);

    const { data: updatedWallet, error: walletUpdateError } = await supabase
        .from('wallets')
        .update({ 
            balance_ngn: updatedBalance.toFixed(2),
            updated_at: new Date().toISOString()
        })
        .eq('user_id', tag.user_id)
        .select()
        .single();

    if (walletUpdateError) {
        throw new Error(`Failed to credit user wallet balance: ${walletUpdateError.message}`);
    }

    return {
        success: true,
        creditedNgn: tag.amount_ngn,
        newBalance: updatedBalance,
        wallet: updatedWallet
    };
};
