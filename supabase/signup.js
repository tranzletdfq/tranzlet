import { signUpWithEmailCredentials } from './authManager.js';

const form = document.getElementById('signup-form');
const submitButton = document.getElementById('signup-submit');
const message = document.getElementById('signup-message');

const showMessage = (text, type = 'error') => {
    message.textContent = text;
    message.className = `rounded-xl px-4 py-3 text-sm ${type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`;
};

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.classList.add('hidden');

    const quickPin = document.getElementById('quick-pin').value;
    if (!/^\d{4}$/.test(quickPin)) {
        message.classList.remove('hidden');
        showMessage('Enter a valid 4-digit Quick PIN.');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Creating account…';

    try {
        const data = await signUpWithEmailCredentials({
            fullName: document.getElementById('full-name').value,
            phoneNumber: document.getElementById('phone-number').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            quickPin,
            referralCode: document.getElementById('referral-code').value
        });

        message.classList.remove('hidden');
        if (data.session) {
            showMessage('Account created. Opening your dashboard…', 'success');
            window.setTimeout(() => { window.location.href = './dashboard.html'; }, 700);
        } else {
            showMessage('Account created. Check your email to confirm your address, then sign in.', 'success');
            form.reset();
        }
    } catch (error) {
        message.classList.remove('hidden');
        showMessage(error.message || 'We could not create your account. Please try again.');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Create account';
    }
});
