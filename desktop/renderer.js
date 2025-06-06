const startButton = document.getElementById('startButton');
const status = document.getElementById('status');

startButton.addEventListener('click', () => {
    startButton.disabled = true;
    status.textContent = 'Starting Overleaf...';
    
    window.electronAPI.startOverleaf();
});

window.electronAPI.onOverleafStarted(() => {
    status.textContent = 'Overleaf started! Redirecting...';
    setTimeout(() => {
        window.location.href = 'http://localhost/launchpad';
    }, 1000);
});

window.electronAPI.onOverleafError((error) => {
    status.textContent = `Error: ${error}`;
    startButton.disabled = false;
});
