// Modules to control application life and create native browser window
const { app, BrowserWindow, Menu, Tray, screen,nativeImage,powerMonitor,systemPreferences, dialog } = require('electron')
const path = require('path');
const fs = require('fs');
const { serialize } = require('v8');
const positioner = require('electron-traywindow-positioner');
const { ipcMain } = require('electron')
const { net } = require('electron')
const log = require('electron-log');
const shell = require('electron').shell;
const { spawn } = require ('child_process');
const { platform } = require('os');
const username = process.env["USER"];

const userDataPath = app.getPath('userData');

let tray = null

var appState = {
  canTouchStored: false,
  appStarted: false,
  deeplinkingUrl: '',
  controllerUrl: '',
  mainWindow: null,
  registerNotPerformed: false
}

process.on('uncaughtException', function (error) {
  log.error(error);
});

ipcMain.setMaxListeners(0);

log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.streamConfig = {flags: 'a'};


function createWindow() {
  // Create the browser window.
  appState.mainWindow = new BrowserWindow({
    width: 265,
    height: 240,
    frame: false,
    resizable:false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      enableRemoteModule: true
    },
    show: false
  });
  appState.mainWindow.removeMenu();
  appState.mainWindow.on('close', function (event) {
    if (!app.isQuitting) {
      event.preventDefault();
      appState.mainWindow.hide();
    }
    return false;
  });
  appState.mainWindow.on('blur', function (event) {
    appState.mainWindow.hide();
  });  
  if (process.platform === 'darwin'){
    appState.mainWindow.loadFile('index_darwin.html')
  } else {
    // and load the index.html of the app.
    appState.mainWindow.loadFile('index.html')
  }
  appState.mainWindow.webContents.setWindowOpenHandler(({ url }) => {

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        fullscreenable: false,
        backgroundColor: 'black',
        icon:path.join(__dirname, 'logo_small.png')        
      }
    }
  })
  
  if(process.platform === 'darwin' && systemPreferences.canPromptTouchID()==true){
    var data = fs.readFileSync('/etc/pam.d/sudo', 'utf8');
    if(data.includes('auth       sufficient     pam_tid.so')){
      appState.canTouchStored = true;
      appState.mainWindow.webContents.executeJavaScript("localStorage.setItem('touchStored',true);");
    } else {
      appState.mainWindow.webContents.executeJavaScript("localStorage.setItem('touchStored',false);");
    }
  }
  log.info('touch sudo stored status:'+appState.canTouchStored);

  //Boot the agent
  appState.mainWindow.webContents.executeJavaScript("bootAgent();");

  //If deep link available on boot
  if(appState.deeplinkingUrl && process.platform === 'win32'){
    //Windows onboard
    log.info("Deep link url : "+appState.deeplinkingUrl)
    var onboardToken = getOnboardToken(appState.deeplinkingUrl);
    registerDevice(onboardToken);
    
  } else if (appState.registerNotPerformed==true){
    //This is for darwin onboard
    var onboardToken = getOnboardToken(appState.deeplinkingUrl);
    registerDevice(onboardToken); 
  }
  
  // Open the DevTools. Only for debugging
  // appState.mainWindow.webContents.openDevTools({ mode: 'undocked' });

  appState.appStarted = true;
}

// handle app open by deep link URL
function openDeeplinkUrl(event,url){
  event.preventDefault();
  log.info("Magic link request:"+url)
  appState.deeplinkingUrl = url;
  
  var onboardToken = getOnboardToken(appState.deeplinkingUrl);
  log.info("App started from open url ? "+appState.appStarted);
  if(appState.appStarted==true){
    registerDevice(onboardToken); 
  } else {
    appState.registerNotPerformed = true;
  }
}


// parse the Url to get the onboarding token
function getOnboardToken(url){
  // process url of this form
  //url="https://procyonwallet.page.link/?link=https://asm-dev.proxyon.cloud/ui/register?register.token=41b7d227-f473-41fe-961e-cf3c39d6582e.30d03fd7c443911d9ca918750c32eece88018db1f4adba1abccd03095cfd1461&apn=com.ai.procyon&amv=1&ibi=com.procyon.ProcyonWallet&isi=1576605834&imv=1&ius=procyonwallet"
  var strData = url.replace('procyon://','').split('link=');
  var finalString = strData[1].split('=');
  appState.controllerUrl = finalString[0].replace("/ui/register?register.token","");
  var onbToken = finalString[1].split('&')[0];
  log.info(onbToken);
  log.info(appState.controllerUrl);
  return onbToken;
}

// perform device onboarding
function registerDevice(onboardToken){
  var payload = JSON.stringify({"OnboardLinkToken":""+onboardToken+"","ControllerURL":""+appState.controllerUrl+""});
  log.info("Deep link registration in progress:"+payload);
  appState.mainWindow.webContents.executeJavaScript("onBoardData('"+onboardToken+"','"+appState.controllerUrl+"',"+appState.appStarted+");");
}


powerMonitor.on('resume', () => {
  log.info("App resumed")
  appState.mainWindow.webContents.executeJavaScript("connectOnWake();");
});

powerMonitor.on('shutdown', () => {
  log.info("OS shutdown initiated")
  appState.mainWindow = null;
  app.exit(0);
});

powerMonitor.on('suspend', () => {
  log.info("OS suspend initiated")  
  appState.mainWindow.webContents.executeJavaScript("localStorage.setItem('currentState',localStorage.getItem('agentStatus'));");
  appState.mainWindow.webContents.executeJavaScript("window.api.disableAgent('');");
});


app.on('open-url', function (event, url) {
  log.info("onboard triggered from open-url")
  openDeeplinkUrl(event,url)
});


const toggleWindow = () => {
  if (appState.mainWindow.isVisible()) return appState.mainWindow.hide();
  return showWindow();
};

const showWindow = () => {
  positioner.position(appState.mainWindow, tray.getBounds());
  appState.mainWindow.show();
};

ipcMain.on('hidewindow',(event,arg)=>{
  appState.mainWindow.hide();
});

ipcMain.on('showWindow',(event,arg)=>{
  showWindow();
});

ipcMain.on('kill',(event,arg)=>{
  log.info('App shutdown');
  app.exit(0);
});

ipcMain.on('logInfo',(event,arg)=>{
  log.info(arg);
});

ipcMain.on('logError',(event,arg)=>{
  log.error(arg);
});

ipcMain.on('logWarn',(event,arg)=>{
  log.warn(arg);
});

ipcMain.on('toogleMain', (event, arg) => {
  toggleWindow();
  event.reply('toogleMain', 'swiched');
});

ipcMain.on('userdata', (event, arg) => {
  event.reply('userdata', userDataPath);
});

ipcMain.on('openConsole', (event, arg) => {
  log.info("url is: "+arg);
  shell.openExternal(arg);
  event.reply('openConsole', arg);
});

ipcMain.on('cantouch', (event, arg) => {
  if (process.platform === 'darwin') {
  event.reply('cantouch', systemPreferences.canPromptTouchID());
  } else {
    event.reply('cantouch', false);
  }
});

ipcMain.on('cantouchstored', (event, arg) => {
  event.reply('cantouchstored', appState.canTouchStored);
});


ipcMain.on('updatePlistFile', (event, arg) => {

  if(writtenContent.length>0) 
    event.reply('updatePlistFile', true);
  else
    event.reply('updatePlistFile', false);

});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {

  log.info("App when ready triggered")

  createWindow();
  const image = nativeImage.createFromPath(path.join(__dirname, 'logo.png'))
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.on('click', function () {
    toggleWindow();
  })
  ipcMain.handle('dialog', (event, method, params) => {       
    dialog[method](params);
  });

  if (process.platform === 'darwin') {
    log.info(systemPreferences.canPromptTouchID());

    if(systemPreferences.canPromptTouchID()==true){
      var data = fs.readFileSync('/etc/pam.d/sudo', 'utf8');
      if(data.includes('auth       sufficient     pam_tid.so')){
        appState.canTouchStored = true;
      }
    } 
    log.info(systemPreferences.canPromptTouchID());
    systemPreferences.isTrustedAccessibilityClient(true);   
  }

  app.on('activate', function () {
    log.info("App activated")
    log.info(process.platform)
    
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (appState.mainWindow) {
      log.info("App created and window launched")
      appState.mainWindow.show();
    }
  })

  appState.mainWindow.on('close', (e) => {
    appState.mainWindow = null;
    tray.destroy();   
  });


  if (process.platform === 'darwin') {
    app.on('before-quit', function() {
      log.info("App quit requested")
      appState.mainWindow.webContents.executeJavaScript("window.api.killAgent();");
    });
    appState.mainWindow.on('close', function(event) {
      log.info("App window closed")
      event.preventDefault();
    });
  }


})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    log.info("App quit executed")
    appState.mainWindow.webContents.executeJavaScript("window.api.killAgent();");
    app.quit();
  } 
  setTimeout(() => {
    app.exit(0);    
  }, 5000);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.


if (process.platform == 'win32') {
  
  // Set the path of electron.exe and your app.
  // These two additional parameters are only available on windows.
  // Setting this is required to get this working in dev mode.
  app.setAsDefaultProtocolClient('procyon', process.execPath, [ path.resolve(app.getAppPath())]);

  appState.deeplinkingUrl = process.argv.find((arg) => arg.startsWith('procyon://'));
} else {
  app.setAsDefaultProtocolClient('procyon');
}





// Force single application instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
app.quit();
} else {
app.on('second-instance', (e, argv) => {
  log.info("Arguments windows onboarding : "+argv);
  if (process.platform !== 'darwin') {
    log.info("Arguments windows onboarding : "+argv);
    // Find the arg that is our custom protocol url and store it
    appState.deeplinkingUrl = argv.find((arg) => arg.startsWith('procyon://'));
    log.info("Windows agent onboarding : "+appState.deeplinkingUrl)
    var onboardToken = getOnboardToken(appState.deeplinkingUrl);
    log.info("App started:"+appState.appStarted);
    if(appState.appStarted==true){
      registerDevice(onboardToken);
    }
  }
});
}