const modal = document.getElementById('authModal');
const title = document.getElementById('authTitle');
const description = document.getElementById('authDescription');
const formMessage = document.getElementById('formMessage');
function openAuth(mode='signup') {
  title.textContent = mode === 'login' ? 'Member login — coming soon' : 'Join the waitlist';
  description.textContent = mode === 'login'
    ? 'Secure login will be enabled after authentication and database setup. This preview does not accept passwords.'
    : 'This starter build is a visual preview. Secure signup and payment will be enabled after backend setup and testing.';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  formMessage.textContent = '';
}
function closeAuth() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
document.querySelectorAll('[data-open-auth]').forEach(button => button.addEventListener('click', () => openAuth(button.dataset.openAuth)));
document.getElementById('closeAuth').addEventListener('click', closeAuth);
modal.addEventListener('click', event => { if (event.target === modal) closeAuth(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAuth(); });
document.getElementById('waitlistForm').addEventListener('submit', event => {
  event.preventDefault();
  formMessage.textContent = 'Preview only: no information was sent or saved. Backend setup is required.';
});
document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('mobileMenu').addEventListener('click', () => {
  const nav = document.querySelector('.desktop-nav');
  const visible = nav.style.display === 'flex';
  nav.style.display = visible ? 'none' : 'flex';
  if (!visible) {
    nav.style.position = 'absolute'; nav.style.top = '75px'; nav.style.left = '0'; nav.style.right = '0';
    nav.style.padding = '18px'; nav.style.flexDirection = 'column'; nav.style.background = '#0b1a14';
    nav.style.border = '1px solid rgba(193,231,210,.12)'; nav.style.borderRadius = '14px';
  }
});