if (require('electron-squirrel-startup')) return;

const { app, BrowserWindow, ipcMain, protocol } = require('electron/main')

// // this should be placed at top of main.js to handle setup events quickly
// if (handleSquirrelEvent()) {
//   // squirrel event handled and app will exit in 1000ms, so don't do anything else
//   return;
// }

// function handleSquirrelEvent() {
//   if (process.argv.length === 1) {
//     return false;
//   }

//   const ChildProcess = require('child_process');
//   const path = require('path');

//   const appFolder = path.resolve(process.execPath, '..');
//   const rootAtomFolder = path.resolve(appFolder, '..');
//   const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
//   const exeName = path.basename(process.execPath);

//   const spawn = function(command, args) {
//     let spawnedProcess, error;

//     try {
//       spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
//     } catch (error) {}

//     return spawnedProcess;
//   };

//   const spawnUpdate = function(args) {
//     return spawn(updateDotExe, args);
//   };

//   const squirrelEvent = process.argv[1];
//   switch (squirrelEvent) {
//     case '--squirrel-install':
//     case '--squirrel-updated':
//       // Optionally do things such as:
//       // - Add your .exe to the PATH
//       // - Write to the registry for things like file associations and
//       //   explorer context menus

//       // Install desktop and start menu shortcuts
//       spawnUpdate(['--createShortcut', exeName]);

//       setTimeout(app.quit, 1000);
//       return true;

//     case '--squirrel-uninstall':
//       // Undo anything you did in the --squirrel-install and
//       // --squirrel-updated handlers

//       // Remove desktop and start menu shortcuts
//       spawnUpdate(['--removeShortcut', exeName]);

//       setTimeout(app.quit, 1000);
//       return true;

//     case '--squirrel-obsolete':
//       // This is called on the outgoing version of your app before
//       // we update to the new version - it's the opposite of
//       // --squirrel-updated

//       app.quit();
//       return true;
//   }
// };

const path = require('node:path')

const WordExtractor = require("word-extractor");
const extractor = new WordExtractor();

const projectBaseDir = path.join(__dirname, '../..');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  })

  win.loadFile(path.join('build/index.html'));
}

const wordDocumentResolve = async (buffer) => {
  extractor.extract(buffer)
    .then((extracted) => {
        return extracted.getBody();
    });
}

app.whenReady().then(() => {
  ipcMain.handle('wordDocumentResolve', wordDocumentResolve)

  // protocol.interceptFileProtocol('file', (request, callback) => {
  //   const url = request.url.match(/(?:^file:\/\/(\/[A-Za-z]:)?)(.*)$/)[1] ?? request.url.substr(7)    /* all urls start with 'file://' */
  //   callback({ path: path.normalize(`${projectBaseDir}/${url}`)})
  // }, (err) => {
  //   if (err) console.error('Failed to register protocol')
  // })

  createWindow()

  app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
