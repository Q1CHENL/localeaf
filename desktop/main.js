const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

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

function checkContainerRunning(containerName) {
  return new Promise((resolve) => {
    const dockerCheck = spawn('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'], {
      stdio: 'pipe'
    });

    let output = '';
    dockerCheck.stdout.on('data', (data) => {
      output += data.toString();
    });

    dockerCheck.on('close', (code) => {
      if (code === 0) {
        const runningContainers = output.trim().split('\n').filter(name => name.trim());
        resolve(runningContainers.includes(containerName));
      } else {
        resolve(false);
      }
    });

    dockerCheck.on('error', () => {
      resolve(false);
    });
  });
}

function checkOverleafAccessible() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1/launchpad', (res) => {
      const isAccessible = res.statusCode === 200 || res.statusCode === 302;
      console.log(`Overleaf status code: ${res.statusCode}, accessible: ${isAccessible}`);
      resolve(isAccessible);
    });
    
    req.on('error', (error) => {
      console.log(`Overleaf accessibility check failed: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForOverleafReady(maxAttempts = 60, intervalMs = 2000) {
  console.log(`Waiting for Overleaf to be ready (max ${maxAttempts} attempts, ${intervalMs}ms interval)`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Health check attempt ${attempt}/${maxAttempts}`);
    
    const status = await checkOverleafStatus();
    console.log(`Status check result:`, status);
    
    if (status.allReady) {
      console.log('Overleaf is ready!');
      return true;
    }
    
    // Send status update to renderer
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const statusMsg = status.containersRunning ? 
        'Containers are running, waiting for service to be ready...' : 
        'Starting containers...';
      windows[0].webContents.send('overleaf-status-update', statusMsg);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  console.log('Timeout waiting for Overleaf to be ready');
  return false;
}

async function checkOverleafStatus() {
  const [sharelatexRunning, mongoRunning, redisRunning, launchpadAccessible] = await Promise.all([
    checkContainerRunning('sharelatex'),
    checkContainerRunning('mongo'),
    checkContainerRunning('redis'),
    checkOverleafAccessible()
  ]);

  return {
    containersRunning: sharelatexRunning && mongoRunning && redisRunning,
    launchpadAccessible,
    allReady: sharelatexRunning && mongoRunning && redisRunning && launchpadAccessible
  };
}

ipcMain.handle('start-overleaf', async () => {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if Overleaf is already running
      const status = await checkOverleafStatus();
      console.log('Initial status check:', status);
      
      if (status.allReady) {
        // Everything is already running and accessible
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0].webContents.send('overleaf-started');
        }
        resolve('already-running');
        return;
      }

      // Need to start Overleaf
      console.log('Starting Overleaf containers...');
      const upScript = spawn('../bin/up', ['-d'], { 
        cwd: __dirname,
        shell: true,
        stdio: 'pipe'
      });

      let scriptCompleted = false;

      upScript.stdout.on('data', (data) => {
        console.log(`Script stdout: ${data}`);
      });

      upScript.stderr.on('data', (data) => {
        console.error(`Script stderr: ${data}`);
      });

      upScript.on('close', async (code) => {
        console.log(`Script completed with code: ${code}`);
        scriptCompleted = true;
        
        if (code === 0) {
          // Script completed successfully, now wait for services to be ready
          const isReady = await waitForOverleafReady();
          
          const windows = BrowserWindow.getAllWindows();
          if (isReady && windows.length > 0) {
            windows[0].webContents.send('overleaf-started');
            resolve('success');
          } else {
            const error = 'Overleaf containers started but service is not responding';
            if (windows.length > 0) {
              windows[0].webContents.send('overleaf-error', error);
            }
            reject(error);
          }
        } else {
          const error = `Process exited with code ${code}`;
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            windows[0].webContents.send('overleaf-error', error);
          }
          reject(error);
        }
      });

      upScript.on('error', (error) => {
        console.error(`Script error: ${error.message}`);
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0].webContents.send('overleaf-error', error.message);
        }
        reject(error.message);
      });

      // Also start checking in parallel (in case script exits early but containers are starting)
      setTimeout(async () => {
        if (!scriptCompleted) {
          console.log('Starting parallel health check...');
          const isReady = await waitForOverleafReady(30, 3000); // Shorter check while script is running
          
          if (isReady) {
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
              windows[0].webContents.send('overleaf-started');
            }
            resolve('success');
          }
        }
      }, 10000);

    } catch (error) {
      console.error('Error in start-overleaf handler:', error);
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('overleaf-error', error.message);
      }
      reject(error.message);
    }
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
