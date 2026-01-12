const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let backendProcess = null;
let mainWindow = null;

function startBackend() {
  return new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, '..', 'server', 'index.js');
    
    // 如果是打包后的环境，使用可执行文件所在的目录下的 data 目录
    // 否则（开发环境），使用 server 目录下的 data
    const dataDir = app.isPackaged 
      ? path.join(path.dirname(app.getPath('exe')), 'data') 
      : path.join(__dirname, '..', 'server', 'data');

    backendProcess = fork(serverEntry, [], {
      env: {
        ...process.env,
        PORT: '0',
        APP_DATA_DIR: dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    const timeout = setTimeout(() => {
      reject(new Error('Backend start timeout'));
    }, 15000);

    backendProcess.on('message', (msg) => {
      if (msg && msg.type === 'listening' && msg.port) {
        clearTimeout(timeout);
        resolve({ port: msg.port });
      }
    });

    backendProcess.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited: ${code}`));
    });
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    backendProcess.removeAllListeners();
    backendProcess.kill();
  } catch (_) {
  } finally {
    backendProcess = null;
  }
}

async function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  await mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.whenReady().then(async () => {
  try {
    const { port } = await startBackend();
    await createMainWindow(`http://127.0.0.1:${port}`);
  } catch (e) {
    stopBackend();
    app.quit();
  }
});

