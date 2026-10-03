// Native navigation still works without JavaScript; this closes its disclosure.
const menu = document.querySelector('.mobile-menu');

menu?.addEventListener('click', (event) => {
  if (event.target.closest('a[href^="#"]')) menu.open = false;
});

menu?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
