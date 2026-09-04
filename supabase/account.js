import { supabase } from './supabase.js';

const $ = (id) => document.getElementById(id);

const setMessage = (element, text, type = 'default') => {
  if (!element) return;
  element.textContent = text;
  element.className = `mt-3 text-sm ${type === 'error' ? 'text-red-600' : type === 'success' ? 'text-emerald-600' : 'text-slate-500'}`;
};

const loadProfile = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    window.location.replace('./login.html');
    return null;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', user.id)
    .single();

  if (error) throw new Error('Unable to load your profile.');

  $('full-name').value = profile?.full_name || '';
  $('phone-number').value = profile?.phone_number || '';
  $('email-address').value = user.email || '';
  return user;
};

const saveProfile = async (event) => {
  event.preventDefault();
  const button = $('save-profile-btn');
  const message = $('profile-message');
  const fullName = $('full-name').value.trim();
  const phoneNumber = $('phone-number').value.trim();

  if (!fullName || !phoneNumber) {
    setMessage(message, 'Full name and phone number are required.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving…';
  setMessage(message, '');

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Your session has ended. Please sign in again.');

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone_number: phoneNumber })
      .eq('id', user.id);

    if (error) throw new Error(error.message);
    setMessage(message, 'Changes saved.', 'success');
  } catch (error) {
    setMessage(message, error.message || 'Unable to save changes.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Save changes';
  }
};

const changePassword = async () => {
  const message = $('security-message');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    setMessage(message, 'Unable to start password reset.', 'error');
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/reset-password.html`
  });

  if (error) {
    setMessage(message, 'Unable to send the password reset email.', 'error');
    return;
  }
  setMessage(message, 'Check your email for the password reset link.', 'success');
};

const signOut = async () => {
  const buttons = [$('sign-out-btn'), $('sign-out-secondary')].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });

  const { error } = await supabase.auth.signOut();
  if (error) {
    buttons.forEach((button) => { button.disabled = false; });
    setMessage($('security-message'), 'Unable to sign out. Please try again.', 'error');
    return;
  }
  window.location.replace('./login.html');
};

$('profile-form')?.addEventListener('submit', saveProfile);
$('change-password-btn')?.addEventListener('click', changePassword);
$('sign-out-btn')?.addEventListener('click', signOut);
$('sign-out-secondary')?.addEventListener('click', signOut);

loadProfile().catch((error) => {
  console.error(error);
  setMessage($('profile-message'), error.message || 'Unable to load your profile.', 'error');
});
