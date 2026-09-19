// Both login methods open the same seller workspace and approval state.
export function initSellerAccess(acceptSession) {
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-seller-login-method]');
    if (!button) return;
    const password = button.dataset.sellerLoginMethod === 'password';
    document.querySelectorAll('[data-seller-login-method]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    const otp = document.querySelector('.firebase-phone-form[data-role="seller"]');
    const form = document.querySelector('[data-seller-password-login]');
    if (otp) otp.hidden = password;
    if (form) { form.hidden = !password; form.querySelector('[name="password"]').value = ''; }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-seller-password-login],[data-seller-password-settings]');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('[data-access-message]');
    const data = Object.fromEntries(new FormData(form));
    const login = form.hasAttribute('data-seller-password-login');
    if (!login && data.password !== data.confirmPassword) { msg.textContent = 'The new passwords do not match.'; return; }
    delete data.confirmPassword;
    button.disabled = true;
    msg.textContent = login ? 'Signing in…' : 'Saving password…';
    try {
      const response = await fetch('/api/auth/' + (login ? 'seller-password-login' : 'seller-password'), {
        method: login ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', ...(!login ? {Authorization:'Bearer ' + localStorage.getItem('axzenToken')} : {}) },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Please try again.');
      form.reset();
      if (login) { await acceptSession(result); msg.textContent = ''; }
      else { localStorage.setItem('axzenToken', result.token); msg.textContent = result.message; }
    } catch (error) { msg.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
export function passwordSettings() {
  return `<article class="dashboard-panel" data-seller-section="profile"><h3>Store login password</h3><p>Use your current password, or sign in with mobile OTP and set a new password within 10 minutes.</p><form class="workspace-form" data-seller-password-settings><label>Current password<input type="password" name="currentPassword" autocomplete="current-password" maxlength="128"><small>Leave empty after a fresh OTP login.</small></label><label>New password<input type="password" name="password" minlength="10" maxlength="128" autocomplete="new-password" required></label><label>Confirm new password<input type="password" name="confirmPassword" minlength="10" maxlength="128" autocomplete="new-password" required></label><button type="submit">Save password</button><p data-access-message role="status"></p></form></article>`;
}
