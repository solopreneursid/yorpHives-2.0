(() => {
  'use strict';
  document.querySelectorAll('.access-card small').forEach(item => { item.textContent = 'Private owner session'; });
  const environment = document.querySelector('.live-indicator');
  if (environment) environment.textContent = 'SELF-HOSTED WORKSPACE';
  const logout = document.getElementById('logout');
  if (logout) { logout.href = '/auth/logout'; logout.setAttribute('aria-label', 'Sign out of your Headquarters'); }
})();
