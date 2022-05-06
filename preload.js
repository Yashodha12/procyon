// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { electron, contextBridge, ipcRenderer, ipcMain, dialog } = require("electron");
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

var sudo = require('sudo-prompt');
const { stderr } = require("process");
const { app } = require("electron/main");
const os = require("os");
ipcRenderer.setMaxListeners(200)
const username = process.env["USER"];

const deviceStatusUrl = "http://localhost:8008/status"

var options = {
  name: 'Procyon Agent'
};

var sessionState = false;

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})


let cyonagent = null
function execSudoCommand(command, onComplete) {
  var child = null
  
  log('info',"Execute command Mac : "+command);

  child = sudo.exec(command, options, (error, stdout, stderr) => {
      
      log('info','Executed :'+command);
      log('error','Error : '+ error);
      log('error', 'StdErr : '+stderr);
      log('info', 'Stdout : '+ stdout);

      if (qrCodeWin != null) {
        qrCodeWin.close();
        qrCodeWin = null;
      }
      
      // call on complete handler
      if (onComplete != null) {
        onComplete();
      }

      if(error) throw error;
    }
  );
}

function run_script(command, callback) {
  log('info','Executing command : '+command);
  var dataval = "";
  cyonagent = child_process.spawn(command, {
    encoding: 'utf8',
    shell: true
  });
  // You can also use a variable to save the output for when the script closes later
  cyonagent.on('error', (error) => {
    dialog.showMessageBox({
      title: 'Title',
      type: 'warning',
      message: 'Error occured.\r\n' + error
    });
  });

  cyonagent.stdout.setEncoding('utf8');
  cyonagent.stdout.on('data', (data) => {
    log('info',"Agent Loaded:");
    log('info',cyonagent.pid);

    //Here is the output
    dataval = data.toString();
    log('info',"Connect result : "+ dataval)
    setTimeout(() => {
      loadDeviceInfo();
    }, 100);    
    deviceInfoSet = true;    
    localStorage.setItem("loadComplete","true");
  });

  cyonagent.stderr.setEncoding('utf8');
  cyonagent.stderr.on('data', (data) => {
    dataval = data.toString();
    log('info',"Connect result : "+ dataval)   
    localStorage.setItem("loadComplete","true");
  });

  cyonagent.on('close', (code) => {

    log('info',"Connect result : "+ dataval)  
  });
  if (typeof callback === 'function')
    callback();
}

function loadDeviceInfo(){
  var deviceInfoUrl='http://localhost:8008/device';
  getData(deviceInfoUrl).then(data=>{
    localStorage.setItem("deviceInfo",JSON.stringify(data));
    log('info',"Device information : "+JSON.stringify(data));
    localStorage.setItem("agentStatus","enabled");
  });
}

const getData = async (args) => {
  const response = await fetch(args);
  const myJson = await response.json(); //extract JSON from the http response
  console.log(myJson);
  return myJson;
}

const postData = async (args, data) => {
  const response = await fetch(args, {
    method: 'POST',
    body: data,
    headers: {
      'Content-Type': 'application/json'
    }
  });
  const myJson = await response.json(); //extract JSON from the http response
  return myJson;
}

var deviceStatusTimer;
var qrCodeWin = null;
var opened = false;
var onbRetryCount = 0;
var errorIdx = 0;

var keepAliveStarted = false;

function watchDeviceStatus() {
  
  if(keepAliveStarted==true) return; //Ensure keepalive is running one instance

  localStorage.setItem("deviceStatus", "error");
  var deviceInfoSet = false;  
  deviceStatusTimer = setInterval(() => {
    keepAliveStarted = true;

    getData(deviceStatusUrl).then(data => {

      errorIdx=0;
      agentState = data.AgentState;
      localStorage.setItem("deviceStatus", agentState);
      onbRetryCount++;
      if (agentState == 'connected') {
        onbRetryCount = 0;
        if(deviceInfoSet==false){
          loadDeviceInfo();
          deviceInfoSet = true;
        }
        if(opened==true){
          localStorage.setItem("newdevice", "true");
          opened = false;
          if (qrCodeWin != null) {
            qrCodeWin.close();
            qrCodeWin = null;
          }
        }
      } else if (agentState == 'enabled' && data.ControllerConnectionStatus == 'not connected' && onbRetryCount > 3 && opened==false) {
          opened = true;
          
          if (qrCodeWin != null) {
            qrCodeWin.close();
            qrCodeWin = null;
          }
          log('info', 'QR code opened')
          qrCodeWin = window.open('http://localhost:8008/agent', '_blank', 'width=380,height=500,top=100,left=500,toolbar=false,nodeIntegration=yes,maximizable=false,minimizable=false');
      }
    }).catch(err => {
      log('error', "Get device status error: " + err);
      log('error', "Adapter is disconnected")
      localStorage.setItem('deviceStatus','error');
      errorIdx++;

      // try restarting the agent
      if (errorIdx > 5) {
        var ctrlUrl = localStorage.getItem('controllerUrl');
        var loadComplete = localStorage.getItem('loadComplete')
        if (loadComplete != "true") {
          launchAgent(ctrlUrl);
          localStorage.setItem("loadComplete","true");  
        }    
      }
    });
  }, 1000);
}
function stopDeviceStatusWatch() {
  clearInterval(deviceStatusTimer);
  deviceStatusTimer = null;
  keepAliveStarted= false;
}


function killCynoagent(command, onComplete) {

  log('info','Command requested for execution : '+command);
  
  var agent = child_process.spawn(command, {
    encoding: 'utf8',
    shell: true
  });
  agent.stdout.setEncoding('utf8');
  agent.stdout.on('data', (data) => {
    cyonagent = null;
    //Here is the output
    var dataval = data.toString();
    log('info','kill agent response : '+dataval);
    stopDeviceStatusWatch();

    killInProgress = false;

    // call on complete handler
    if (onComplete != null) {
      onComplete();
    }
  });
  agent.on('close', (code) => {

    log('info','Killing the agent completely close event triggered:');
    
    localStorage.setItem("deviceStatus", "error");
    localStorage.setItem('agentStatus','disabled');

    // call on complete handler
    if (onComplete != null) {
      onComplete();
    }
  });
}

var externalOptions = {
  // Supported by macOS only
  activate: true,
}


const readFile = (path, type) => new Promise((resolve, reject) => {
  fs.readFile(path, type, (err, file) => {
    if (err) { reject(err); log('error', err); }
    resolve(file)
  });
});

const writeFile = (filepath, content) => new Promise((resolve, reject) => {
  fs.writeFile(filepath, content, (err) => {
    if (err) {
      console.log(err);
      log('error', err);
      reject(err);
    }
    resolve(true);
  });
});


var settingsWin;

function openConsole() {
  var deviceStatus = localStorage.getItem("deviceStatus");
  if(deviceStatus=="connected"){
    openConsoleWindow('https://console.tun.procyon.ai/');
  } else {
    if (qrCodeWin != null && !qrCodeWin.closed) {
      qrCodeWin.focus();
    } else {
      var wihe = ',width=' + screen.availWidth + ',height=' + screen.availHeight;
      qrCodeWin = window.open('http://localhost:8008/agent', '_blank', 'width=380,height=500,top=100,left=400,toolbar=false,nodeIntegration=yes,maximizable=false,minimizable=false');
  
    }
  
  }
}


function openSettings() {
  if (settingsWin != null && !settingsWin.closed) {
    settingsWin.focus();
  } else {
    if (process.platform === 'darwin') {
      settingsWin = window.open('./mac/settings.html', '_blank', 'top=100,left=200,nodeIntegration=no,maximizable=false,minimizable=false,resizable=false');
    } else {
      settingsWin = window.open('./windows/settings.html', '_blank', 'top=100,left=200,nodeIntegration=no,maximizable=false,minimizable=false,resizable=false');
    }
  }
}


var canTouch = false;
function canTouchEnabled(){
  ipcRenderer.on('cantouch', (event, arg) => {
    canTouch = arg;
    if(canTouch==true){
      canTouchStored();
    }
    
  })
  ipcRenderer.send('cantouch', 'ping');  
}

var touchStored = false;

function canTouchStored(){
  ipcRenderer.on('cantouchstored', (event, arg) => {
    touchStored = arg;
    if(!touchStored){
      var cmd="sed -i '' '2s/^/auth       sufficient     pam_tid.so\n/' /etc/pam.d/sudo";
      //Todo
      //execSudoCommand(cmd,false,false,false);
    }
  })
  ipcRenderer.send('cantouchstored', 'ping');  
}

function openConsoleWindow(url){
  log('info',"url to load:"+url);
  ipcRenderer.on('openConsole', (event, url) => {
    console.log(url);
    log('info',"Console opened: "+url)
  })
  ipcRenderer.send('openConsole', url);

}

function toggleMainWindow() {
  ipcRenderer.on('toogleMain', (event, arg) => {
    console.log(arg);
  })
  ipcRenderer.send('toogleMain', 'ping');
}

function showMainWindow() {
  ipcRenderer.on('showWindow', (event, arg) => {
    console.log(arg);
  })
  ipcRenderer.send('showWindow', 'ping');
}

function sendKill() {
  ipcRenderer.on('kill', (event, arg) => {
    console.log(arg);
  })
  ipcRenderer.send('kill', 'ping');
}

function log(type, msg) {
  if (type == 'info') {

    ipcRenderer.on('logInfo', (event, msg) => {
      console.log(msg);
    })
    ipcRenderer.send('logInfo', msg);

  } else if (type == 'error') {

    ipcRenderer.on('logError', (event, msg) => {
      console.log(msg);
    })
    ipcRenderer.send('logError', msg);

  } else if (type == 'warn') {

    ipcRenderer.on('logWarn', (event, msg) => {
      console.log(msg);
    })
    ipcRenderer.send('logWarn', msg);

  }
}


function isAgentConnected(){
  var deviceRegStatus = localStorage.getItem("deviceStatus");
  var agentStatus = localStorage.getItem("agentStatus");
  if((deviceRegStatus=="connected" || deviceRegStatus=="registered" || deviceRegStatus=="enabled") && 
      agentStatus=="enabled"){
    log('info','Agent is running and in connected state. [isAgentConnected]')
    return true;//Connected status
  } else {
    log('info','Agent is not running. [isAgentConnected]')
    return false;//Disconnected status
  }
}


function launchAgent(controllerUrl) {
  // start watching device status
  watchDeviceStatus();

  //If already connected then no need to connect again.
  if(isAgentConnected()) {
    return;
  }

  var path = __dirname;
  var cmd = "cyonagent -controller " + controllerUrl;
  opened = false;
  onbRetryCount = 0;

  if(controllerUrl==null || controllerUrl==""){
    controllerUrl = "https://app.proxyon.cloud";
    loadSettings(controllerUrl);
  }

  if (process.platform === 'darwin') {
    touchStoredStatus();
    var path = __dirname;
    console.log(path);
    log('info', 'File path:' + path)
    path = path.replace("/app.asar", "")    
    cmd = path+"/cyonagent_mac -controller "+controllerUrl;
    log('info',"Connect - Can touch:"+canTouch);
    log('info',"Connect - Touch Stored:"+touchStored);
    //canTouch = false;
    if(canTouch==true && touchStored==true){
      cmd = "sudo "+cmd;
      run_script(cmd, null);
    } else{  
      execSudoCommand(cmd, (err) => {
        log('error', cmd + ' command exited');
        localStorage.setItem("loadComplete","false");      
      });
    }
  } else {
    setTimeout(() => {
      run_script(cmd, null);
    }, 50);

  }
  localStorage.setItem("command", cmd);
  log('info', "Connect:" + cmd)
  console.log(cmd);

}


function touchStoredStatus(){
  var touchData = false;
  if(localStorage.getItem("touchStored")=="true"){
    touchData =true;
  }
  touchStored = touchData;  
}


function killAgent() {
    var cmd = "Taskkill /IM cyonagent.exe /F";

  if (process.platform === 'darwin') {
    touchStoredStatus();
    var path = __dirname;
    path = path.replace("/app.asar", "")
    cmd = "killall cyonagent_mac";
    log('info',"Connect - Can touch: "+canTouch);
    log('info',"Connect - Touch Stored: "+touchStored);      
    //canTouch = false;    
    if(canTouch==true && touchStored==true){
      cmd = "sudo "+cmd;
      log('info','Killing the agent completely:');
      killCynoagent(cmd, (err) => {
        localStorage.setItem("deviceStatus", "error");
        localStorage.setItem('agentStatus','disabled');
        sendKill();
      });
    } else {
      execSudoCommand(cmd, (err) => {
        log('info', 'sudo command ' + cmd + ' completed');

        localStorage.setItem("deviceStatus", "error");
        localStorage.setItem('agentStatus','disabled');
        sendKill();
      });
    }
  } else {
    killCynoagent(cmd, (err) => {
      localStorage.setItem("deviceStatus", "error");
      localStorage.setItem('agentStatus','disabled');
      sendKill();
    })
  }

  localStorage.setItem("agentStatus", "disabled");
  localStorage.setItem("deviceStatus", "error");
}

var userDataPath = null;

function loadUserPath() {
  ipcRenderer.on('userdata', (event, arg) => {
    console.log(arg);
    userDataPath = arg;
  })
  ipcRenderer.send('userdata', 'ping');
}

loadUserPath();

function osSpecificPath(){
  var pathSep = process.platform === 'darwin'?"/":"\\";
  return pathSep;
}

loadUserPath();

function loadSettings(url) {

  var settingsPath = userDataPath;
  log('info',"User data path:"+settingsPath);
  
  if (!fs.existsSync(settingsPath + osSpecificPath()+"settings.txt")) {
    
    var pathD = __dirname;
    log('info','PathD value:'+pathD);
    pathD = pathD.replace(osSpecificPath()+"app.asar", "")
    log('info','PathD valu after replace:'+pathD);
    settingsPath = pathD;
    log('info',"No userdata path so loading from :"+settingsPath);
  }
  
  readFile(settingsPath + osSpecificPath()+"settings.txt", 'utf8')
    .then((file) => {
        console.log(file);
        log('info', 'Settings file value for controller url:' + file)
        log('info', 'Settings update for controller url:' + url)
        if ((url==null || url == '') && file != localStorage.getItem('controllerUrl')) {
          
          log('info', 'Settings url updated for connection:' + file)
          localStorage.setItem('controllerUrl', file);

        } else if (url==null || url == '' || file !== url) {
          
          log('info', 'Settings update url:' + url)
          settingsPath = userDataPath;
          writeFile(settingsPath +osSpecificPath()+ "settings.txt", url).then((retValue) => {
            log('info', 'Settings update for controller url completed:' + retValue)
          });
        }
    });
}


function unregister(){
  console.log("method unregistered triggered");
  var arg = "http://localhost:8008/unregister";
  var status = localStorage.getItem("deviceStatus");
  getData(arg).then(data =>{
    var result = data
    console.log("result", result);
    if (status == "true" && result == "true"){
      localStorage.setItem("deviceStatus", false);
    } 
  })
}


var onboardRetryTimer;
var onboardRetryCount = 0;
function onBoardDevice(url,data){
  clearInterval(onboardRetryTimer);
  onboardRetryCount = 0;
  onboardRetryTimer = setInterval(() => {
    onBoardAgentApi(url,data);
    onboardRetryCount++;
    if (onboardRetryCount > 5) {
      clearInterval(onboardRetryTimer);
    }
  }, 5000);
  onBoardAgentApi(url,data);
}


function onBoardAgentApi(url,data){
    onbRetryCount = 0;
    log('info',"Attempting Device onbaording..");
    postData(url,JSON.stringify(data)).then(dataRes=>{
      try{
        var oldUrl = localStorage.getItem('controllerUrl');
        log('info',"Device onbaording response :"+JSON.stringify(dataRes));
        localStorage.setItem('controllerUrl', data.ControllerURL);
        log('info',"Old url:"+oldUrl);
        log('info',"New url:"+data.ControllerURL);
        if (dataRes.Status == "FAILURE") {
          log('error', 'onboarding failed with error: ' + dataRes.Error)

          // show a message informing user of the failure
          ipcRenderer.invoke('dialog', 'showMessageBox', {
            title: 'Onboarding failed',
            type: 'warning',
            message: 'Onboarding failed!\nInvalid Onboarding link' 
          });
        }
      } catch(e){
        log('error',"onboarding exception : "+e);
      }
      
      // stop the timer when it suceeds
      clearInterval(onboardRetryTimer);
      localStorage.setItem("newdevice", "true");
      log('info', "onboarding successful. stopping retry..");
    }).catch(e=>{
      log('info','onboarding error while posting the data :'+e);
    });

    // start watching device status
    watchDeviceStatus();
}

function enableAgentApi(data){
  onbRetryCount = 0;
  postData("http://localhost:8008/enable",JSON.stringify(data)).then(dataRes=>{
    log('info', 'agent enable was successful: ' + dataRes)
  }).catch(e=>{
    log('info','enabling error while posting the data :'+e);
  });

  // start watching device status
  watchDeviceStatus();
}

function disableAgentApi(data){
  postData("http://localhost:8008/disable",JSON.stringify(data)).then(dataRes=>{
    log('info', 'agent disable was successful: ' + dataRes)
  }).catch(e=>{
    log('info','disabling error while posting the data :'+e);
  });

  // stop watching device status
  stopDeviceStatusWatch();
}

// error handling for multiple tenant onboarding on same controller
function handleMutlipleTenantOnboard() {
    log('error', 'multiple onboarding not permitted on same controller')

    // show a message informing user in case of duplicate onboarding on same controller
    ipcRenderer.invoke('dialog', 'showMessageBox', {
      title: 'Duplicate Onboarding on Controller',
      type: 'warning',
      message: 'Onboarding failed!\n Multiple tenant onboarding not allowed' 
    });
}


contextBridge.exposeInMainWorld(
  "api", {
  send: (channel, data) => {
    // whitelist channels
    let validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    let validChannels = ["fromMain"];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender` 
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  loadExternal: (cmd) => {
    log('info', 'Execute command' + cmd)
    run_script(cmd, null)
  },
  openConsole: () => {
    log('info', 'Console window opened');
    openConsole();
    toggleMainWindow();
  },
  openSettings: () => {
    log('info', 'Settings window opened');
    openSettings();
    toggleMainWindow();
  },
  loadAgent: (controllerUrl) => {
    sessionState = true;
    log('info', 'load agent for controller: ' + controllerUrl);
    localStorage.setItem('agentStatus', 'enabled');
    localStorage.setItem("deviceStatus", "error"); 
    launchAgent(controllerUrl);
    localStorage.setItem("loadComplete","true");      
  },
  killAgent: () => {
    log('info', 'Agent shutdown.')
    killAgent();
  },
  enableAgent: (controllerUrl) => {
    log('info', 'enabling agent for controller: ' + controllerUrl)
    const data = {};
    data.ControllerURL = controllerUrl;
    enableAgentApi(data);
  },
  disableAgent: (controllerUrl) => {
    log('info', 'disabling agent for controller: ' + controllerUrl)
    const data = {};
    data.ControllerURL = controllerUrl;
    disableAgentApi(data);
  },
  showWindow: () => {
    showMainWindow();
  },
  loadUrl: (url) => {
    log('info', 'Agent loading with:' + url)
    loadSettings(url);
  },
  updateControllerUrl: (url) => {
    console.log("updateControllerUrl");
    log('info', 'controller URL is updated with:' + url);
  },
  onbaord:(url,data)=>{
    log('info','device onboarding for:'+data.ControllerURL);
    log('info',"Data to process"+JSON.stringify(data));
    log('info',"Register device with url : "+url);
    
    onBoardDevice(url,data);

  },
  checktouch:()=>{
    canTouchEnabled();
  },
  offboard:()=>{
    unregister();
  },
  manageSession:(val)=>{
    sessionState = val;
  },
  logMessage:(msg)=>{
    log('info',msg);
  },
  multiTenantOnboard:()=>{
    handleMutlipleTenantOnboard()
  },
  openDialog: (method, config) => ipcRenderer.invoke('dialog', method, config)
});