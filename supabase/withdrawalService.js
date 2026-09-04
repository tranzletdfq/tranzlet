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

export const requestNgnWithdrawal = async (bankAccountId, amountNgn) => {
    const user = await getCurrentAuthenticatedUser();
    const parsedAmount = parseFloat(amountNgn);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid withdrawal amount.');
    }

    const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (walletError || !wallet) {
        throw new Error('Wallet not found.');
    }

    if (parseFloat(wallet.balance_ngn) < parsedAmount) {
        throw new Error('Insufficient wallet balance for this withdrawal.');
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
        .from('withdrawal_requests')
        .insert([{
            user_id: user.id,
            bank_account_id: bankAccountId,
            amount_ngn: parsedAmount.toFixed(2),
            status: 'PENDING'
        }])
        .select()
        .single();

    if (withdrawalError) {
        throw new Error(`Failed to submit withdrawal request: ${withdrawalError.message}`);
    }

    const newBalance = parseFloat(wallet.balance_ngn) - parsedAmount;
    const { error: updateError } = await supabase
        .from('wallets')
        .update({
            balance_ngn: newBalance.toFixed(2),
            updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

    if (updateError) {
        throw new Error(`Failed to debit wallet during withdrawal: ${updateError.message}`);
    }

    return withdrawal;
};
