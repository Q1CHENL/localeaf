const startButton = document.getElementById('startButton');
const status = document.getElementById('status');

startButton.addEventListener('click', () => {
    startButton.disabled = true;
    status.textContent = 'Checking Overleaf status...';
    
    window.electronAPI.startOverleaf().then((result) => {
        if (result === 'already-running') {
            status.textContent = 'Overleaf is already running! Redirecting...';
        }
    }).catch(() => {
        // Error handling is done via the error event
    });
});

window.electronAPI.onOverleafStatusUpdate((event, message) => {
    status.textContent = message;
});

window.electronAPI.onOverleafStarted(() => {
    status.textContent = 'Overleaf is ready! Redirecting to launchpad...';
    setTimeout(() => {
        window.location.href = 'http://127.0.0.1/launchpad';
    }, 1000);
});

window.electronAPI.onOverleafError((event, error) => {
    status.textContent = `Error: ${error}`;
    startButton.disabled = false;
});
