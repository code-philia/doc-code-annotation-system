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

// NOTE when using eval, Electron build will not automatically copy `word-to-markdown`

let wordToMarkdown;
const wordToMarkdownImport = async () => {
  if (!wordToMarkdown) {
    const { default: _wordToMarkdown } = await (eval('import("word-to-markdown")'));
    wordToMarkdown = _wordToMarkdown;
  }
  return wordToMarkdown;
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  })

  // https://stackoverflow.com/questions/75832777/inject-variable-into-renderers-window-object-before-any-javascript-on-the-rende
  // win.webContents.on("did-start-loading", () => {
  //   configPromise = new Promise((resolve) => {
  //     win.webContents.executeJavaScript(`window.__BUILD_TYPE__ = 'electron'; console.log('assigning __BUILD_TYPE__');`, () => {
  //       resolve();
  //     });
  //   });
  // });

  win.loadFile(path.join(process.resourcesPath, 'build', 'index.html'));
  // win.loadFile(path.join(__dirname, '../..', 'build', 'index.html'));  // DEBUG
}

const wordDocumentResolve = async (event, content) => {
  content = Buffer.from(new Uint8Array(content));

  // NOTE No need to convert. .docx is originally UTF-8
  // const encoding = jschardet.detect(content).encoding ?? 'GB18030';
  // if (encoding !== 'UTF-8') {
  //   const actualString = new TextDecoder(encoding).decode(content);
  //   content = Buffer.from(actualString, 'utf-8');
  // }

  const wordToMarkdown = await wordToMarkdownImport();
  const resultString = await wordToMarkdown(content);
  return resultString;
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
