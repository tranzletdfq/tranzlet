import { supabase } from './supabase.js';

const form = document.getElementById('login-form');
const submitButton = document.getElementById('login-submit');
const errorBox = document.getElementById('login-error');
const forgotPasswordLink = document.getElementById('forgot-password-link');

const showError = (message) => {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
};

const setBusy = (busy) => {
  submitButton.disabled = busy;
  submitButton.textContent = busy ? 'Signing in…' : 'Sign in';
};

const redirectAuthenticatedUser = async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.replace('./dashboard.html');
};

document.addEventListener('DOMContentLoaded', redirectAuthenticatedUser);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');

  const email = document.getElementById('email-input')?.value.trim();
  const password = document.getElementById('password-input')?.value;

  if (!email || !password) {
    showError('Enter your email address and password to continue.');
    return;
  }

  setBusy(true);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    window.location.replace('./dashboard.html');
  } catch (error) {
    showError(error?.message || 'Unable to sign in. Please check your details and try again.');
  } finally {
    setBusy(false);
  }
});

forgotPasswordLink?.addEventListener('click', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  const email = document.getElementById('email-input')?.value.trim();

  if (!email) {
    showError('Enter your email address first, then select “Forgot password?”.');
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`
    });
    if (error) throw error;
    showError('If an account exists for that email, a password reset link has been sent.');
    errorBox.classList.remove('text-red-700', 'bg-red-50', 'border-red-100');
    errorBox.classList.add('text-emerald-700', 'bg-emerald-50', 'border-emerald-100');
  } catch (error) {
    showError(error?.message || 'Unable to send the password reset email.');
  }
});
