function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ild_theme', theme);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === theme));
}

document.querySelectorAll('.theme-swatch').forEach(s => s.addEventListener('click', () => setTheme(s.dataset.theme)));
setTheme(localStorage.getItem('ild_theme') || 'green');
