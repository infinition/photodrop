const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { startServer, DROP_DIR_NAME } = require('../server');

const PORT = Number(process.env.PORT) || 3456;
const estWindows = process.platform === 'win32';
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a1a',
    show: false,
    icon: estWindows
      ? path.join(__dirname, '..', 'public', 'assets', 'icon.ico')
      : path.join(__dirname, '..', 'public', 'assets', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: false });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('app:minimize', () => {
  mainWindow && mainWindow.minimize();
});

ipcMain.handle('app:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('app:close', () => {
  mainWindow && mainWindow.close();
});

ipcMain.handle('app:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('app:open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choisir le dossier de destination'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('app:open-explorer', async (event, folderPath) => {
  if (folderPath) {
    shell.openPath(folderPath);
  }
});

app.whenReady().then(async () => {
  try {
    // app.getPath('desktop') renvoie le vrai Bureau de la session, dans la
    // langue du compte et apres redirection (OneDrive, dossier localise),
    // sur Windows comme sur macOS et Linux.
    const bureau = app.getPath('desktop');
    await startServer(PORT, {
      targetDir: path.join(bureau, DROP_DIR_NAME)
    });
  } catch (err) {
    console.error('Server failed to start:', err);
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
