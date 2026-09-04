import { supabase } from './supabase.js';

export const getCurrentAuthenticatedUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Unauthorized: No active secure session found.');
    return user;
};

export const signInWithEmailCredentials = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
    });
    if (error) throw new Error(`Authentication failed: ${error.message}`);
    return data;
};

export const signUpWithEmailCredentials = async ({ fullName, phoneNumber, email, password, quickPin, referralCode = '' }) => {
    const name = fullName.trim();
    const phone = phoneNumber.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!name || !phone || !normalizedEmail || !password) {
        throw new Error('Full name, phone number, email and password are required.');
    }
    if (password.length < 8) throw new Error('Password must contain at least 8 characters.');
    if (!/^\d{4}$/.test(quickPin)) throw new Error('Quick PIN must be exactly 4 digits.');

    // The raw PIN is never persisted. Store only non-sensitive signup metadata here;
    // a production Quick PIN authentication flow should use a server-side verifier.
    const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            data: {
                full_name: name,
                phone_number: phone,
                referral_code: referralCode.trim() || null
            }
        }
    });

    if (error) throw new Error(`Account creation failed: ${error.message}`);
    if (!data.user) throw new Error('Account creation did not return a user.');

    // Profile creation should be protected by a database trigger/RPC in production.
    // We keep the client insert compatible with the existing profile RLS contract.
    const { error: profileError } = await supabase.from('profiles').insert([{
        id: data.user.id,
        full_name: name,
        phone_number: phone
    }]);

    if (profileError) {
        throw new Error(`Account profile setup failed: ${profileError.message}`);
    }

    return data;
};

export const signOutSession = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(`Sign out failed: ${error.message}`);
    window.location.href = './index.html';
};
