// Shared light/dark theme toggle, backed by the same localStorage key
// ('game-theme') the original two games already use, so switching games
// in the hub keeps a consistent theme everywhere.
document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem('game-theme') === 'light') {
        document.body.classList.add('light-mode');
        const btn = document.getElementById('themeBtn');
        if (btn) btn.textContent = '🌙 Dark';
    }
});

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = isLight ? '🌙 Dark' : '☀️ Light';
    localStorage.setItem('game-theme', isLight ? 'light' : 'dark');
}
