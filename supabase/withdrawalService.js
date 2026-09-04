import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser } from './authManager.js';

export const fetchUserBankAccounts = async () => {
    const user = await getCurrentAuthenticatedUser();

    const { data, error } = await supabase
        .from('user_bank_accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`Failed to fetch bank accounts: ${error.message}`);
    }

    return data || [];
};

export const addUserBankAccount = async (bankName, accountNumber, accountName) => {
    const user = await getCurrentAuthenticatedUser();

    if (!bankName || !accountNumber || !accountName) {
        throw new Error('All bank details are required.');
    }

    const { data, error } = await supabase
        .from('user_bank_accounts')
        .insert([{
            user_id: user.id,
            bank_name: bankName.trim(),
            account_number: accountNumber.trim(),
            account_name: accountName.trim()
        }])
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to save bank account: ${error.message}`);
    }

    return data;
};

export const requestNgnWithdrawalAtomic = async (bankAccountId, amountNgn) => {
    await getCurrentAuthenticatedUser();

    const parsedAmount = parseFloat(amountNgn);

    if (!bankAccountId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid bank account or withdrawal amount.');
    }

    const { data, error } = await supabase.rpc('request_withdrawal_atomic', {
        p_bank_account_id: bankAccountId,
        p_amount_ngn: parsedAmount
    });

    if (error) {
        throw new Error(`Withdrawal failed: ${error.message}`);
    }

    return data;
};
