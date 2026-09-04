import { supabase } from './supabase.js';

export const getCurrentAuthenticatedUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('Unauthorized: No active secure session found.');
    }

    return user;
};

export const signInWithEmailCredentials = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
    });

    if (error) {
        throw new Error(`Authentication failed: ${error.message}`);
    }

    return data;
};

export const signOutSession = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
        throw new Error(`Sign out failed: ${error.message}`);
    }

    window.location.href = './index.html';
};
