import { supabase } from './supabase.js';

export const fetchActiveCompanyHandles = async () => {
    const { data, error } = await supabase
        .from('company_payment_handles')
        .select('*')
        .eq('is_active', true);

    if (error) {
        throw new Error(`Failed to load payment handles: ${error.message}`);
    }

    return data;
};

export const adminUpdateCompanyHandle = async (handleId, handleValue, isActive) => {
    const { data, error } = await supabase
        .from('company_payment_handles')
        .update({
            handle_value: handleValue.trim(),
            is_active: isActive,
            updated_at: new Date().toISOString()
        })
        .eq('id', handleId)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update company handle: ${error.message}`);
    }

    return data;
};
