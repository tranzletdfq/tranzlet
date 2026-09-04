import { supabase } from './supabase.js';
import { getCurrentAuthenticatedUser, signInWithEmailCredentials } from './authManager.js';
import { createTranzletTag } from './tagManager.js';
import { fetchUserDashboardData } from './dashboardService.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await getCurrentAuthenticatedUser();
        if (user) {
            await loadDashboardUI(user.id);
        }
    } catch (error) {
        loadAuthUI();
    }
});

const loadDashboardUI = async (userId) => {
    try {
        const dashboardData = await fetchUserDashboardData();
        console.log('Dashboard data loaded successfully:', dashboardData);
    } catch (error) {
        console.error('Failed to initialize dashboard UI:', error.message);
    }
};

const loadAuthUI = () => {
    const loginForm = document.getElementById('login-form');

    if (!loginForm) {
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const emailInput = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');

        if (!emailInput || !passwordInput) {
            return;
        }

        try {
            await signInWithEmailCredentials(emailInput.value, passwordInput.value);
            window.location.reload();
        } catch (error) {
            alert(`Login failed: ${error.message}`);
        }
    });
};
