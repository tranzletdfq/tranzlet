import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser } from './authManager.js';

export const fetchUserDashboardData = async () => {
    const user = await getCurrentAuthenticatedUser();

    const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (walletError && walletError.code !== 'PGRST116') {
        throw new Error(`Failed to load wallet: ${walletError.message}`);
    }

    const currentWallet = wallet || { balance_ngn: '0.00' };

    const { data: tags, error: tagsError } = await supabase
        .from('tranzlet_tags')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (tagsError) {
        throw new Error(`Failed to load transaction history: ${tagsError.message}`);
    }

    return {
        user,
        wallet: currentWallet,
        tags: tags || []
    };
};
