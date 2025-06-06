const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

ipcMain.handle('start-overleaf', async () => {
  return new Promise((resolve, reject) => {
    const upScript = spawn('../bin/up', [], { 
      cwd: __dirname,
      shell: true 
    });

    upScript.on('close', (code) => {
      if (code === 0) {
        // Send success message to renderer
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0].webContents.send('overleaf-started');
        }
        resolve('success');
      } else {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0].webContents.send('overleaf-error', `Process exited with code ${code}`);
        }
        reject(`Process exited with code ${code}`);
      }
    });

    upScript.on('error', (error) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('overleaf-error', error.message);
      }
      reject(error.message);
    });

    // Give it some time to start up, then signal success
    setTimeout(() => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('overleaf-started');
      }
      resolve('success');
    }, 5000);
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
