// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.
var togbtn = document.getElementById("togBtn");
var statusVal = document.getElementById("status");
var statusTxt = document.getElementById("statusText");
var btnBox = document.getElementById("divChck");

var consoleBtn = document.getElementById("console");
var settingsBtn = document.getElementById("settings");
var closeBtn = document.getElementById("close");
var tenantName = document.getElementById("tenantName");
var unregisterFlag = localStorage.setItem("unregister", "false")

// global state
var alreadyLoaded = false;
var connectedInterval;
var checkDeviceStatusRunningState = false;
var watchUrl;
var getUrl = localStorage.getItem('controllerUrl');



window.api.checktouch();

consoleBtn.addEventListener('click', (event) => {
    window.api.openConsole();
});
settingsBtn.addEventListener('click', (event) => {
    window.api.openSettings();
});

closeBtn.addEventListener('click',(event)=>{
    localStorage.setItem('agentStatus','disabled');
    statusTxt.innerHTML = "Disconnecting from agent";
    statusVal.innerHTML = "Disconnecting...";    
    closeBtn.style.display="none";
    btnBox.style.display="none";
    window.api.killAgent();
});

togbtn.addEventListener('click', (event) => {
    var ctrlURL = localStorage.getItem('controllerUrl');

    if (togbtn.checked) {
        statusVal.innerHTML = "Connecting...";
        localStorage.setItem('agentStatus','enabled');
        window.api.enableAgent(ctrlURL);
        statusTxt.style="color:black";
        statusTxt.innerHTML = "Securing your connection with ..." + ctrlURL;
        window.api.logMessage("User input : Connect");
    } else {
        statusTxt.innerHTML = "Disconnecting from agent";
        statusVal.innerHTML = "Disconnecting...";
        window.api.disableAgent(ctrlURL);
        localStorage.setItem("deviceStatus", "disabled");
        localStorage.setItem('agentStatus','disabled');
        window.api.logMessage("User input: Disconnect");            
    
    }
});


// onboard the agent
function onBoardData(token, url, appStarted){
    window.api.checktouch();
    window.api.logMessage("onBoardData starting");
    if(appStarted==false){
        getUrl = localStorage.getItem('controllerUrl');
        if(alreadyLoaded==false){
            window.api.loadAgent(getUrl,true,false);
            alreadyLoaded = true;   
        }
    } 

    const urlPost = "http://localhost:8008/onboard";
    const data = {};
    data.OnboardLinkToken = token;
    data.ControllerURL = url;
    getUrl = data.ControllerURL;

    if(localStorage.getItem('controllerUrl') == url){
        window.api.multiTenantOnboard();
        return ;
    }

    //Update this so the watch url will pick the change and update settings.
    localStorage.setItem('controllerUrl', url);
    localStorage.setItem('agentStatus','enabled');            

    window.api.logMessage("onBoardData starting time");
    window.api.logMessage("Device agent status:"+localStorage.getItem("agentStatus"));
    
    window.api.onbaord(urlPost,data);
}

// start the agent process
function bootAgent(){
    //Load the agent on start and run the background
    setTimeout(() => {
        getUrl = localStorage.getItem('controllerUrl');
        if(alreadyLoaded==false){
            window.api.loadAgent(getUrl,true,false);
            alreadyLoaded = true;   
        }
    }, 500)    
}

function watchDeviceConnectedStatus(){
    
    if (checkDeviceStatusRunningState==true) return;
    checkDeviceStatusRunningState = true;

    var agentStatus = localStorage.getItem("agentStatus");
    getUrl = localStorage.getItem('controllerUrl');
    var stars =0;


    connectedInterval = setInterval(()=>{
        agentStatus = localStorage.getItem("agentStatus");
        var deviceRegStatus = localStorage.getItem("deviceStatus");

        if (agentStatus!=='enabled'){
            togbtn.checked = false;
            statusTxt.style="color:black";
            statusVal.innerHTML = "Disconnected";
            statusTxt.innerHTML = "";
        } else {
            togbtn.checked = true;
        } 
        if (deviceRegStatus==='enabled'){
            btnBox.style.display="";
            stars=0; 
            statusTxt.style="color:red";
            statusVal.innerHTML = "Connecting...";
            statusTxt.innerHTML = "Device is not registered...";
        } else if(deviceRegStatus==='error'){
            stars++;
            if(stars>14) stars=1;
            statusTxt.style="color:black";
            statusVal.innerHTML = "Connecting...";
            statusTxt.innerHTML = "Securing your connection with " + getUrl +" "+getStar(stars);
        } else if (deviceRegStatus==='registered') {
            stars++;
            if(stars>14) stars=1;
            var newDevice = localStorage.getItem("newdevice");
            if(newDevice=="true"){
                localStorage.setItem("newdevice","false");
                window.open('onboard.html', '_blank', 'width=380,height=500,top=100,left=500,toolbar=false,nodeIntegration=yes,maximizable=false,minimizable=false');                    
            }
            btnBox.style.display="";
            statusTxt.style="color:black";
            statusVal.innerHTML = "Connecting to proxy...";
            statusTxt.innerHTML = "Securing your connection with " + getUrl +" "+getStar(stars);
        } else if (deviceRegStatus == 'connected') {
            stars=0;
            var newDevice = localStorage.getItem("newdevice");
            if(newDevice=="true"){
                localStorage.setItem("newdevice","false");
                window.open('onboard.html', '_blank', 'width=380,height=500,top=100,left=500,toolbar=false,nodeIntegration=yes,maximizable=false,minimizable=false');                    
                setConnected(true);
            } else {
                setConnected(false);
            }
        } else {
            statusTxt.style="color:red";
            statusVal.innerHTML = "Disconnected";
            statusTxt.innerHTML = "Device is in " + deviceRegStatus + " state...";
        }
    },1500);
}

function getStar(indx){
    var star = "";
    
    for(var i=0;i<indx;i++){
        star = star + "*";
    }
    return star;
}

function connectOnWake(){
    var connectedStatus = localStorage.getItem('currentState');
    var getUrlv = localStorage.getItem('controllerUrl');
    //console.log("Connected status:" + connectedStatus);
    window.api.logMessage("Connected status:" + connectedStatus);
    if(connectedStatus==='enabled'){
        statusVal.innerHTML = "Connecting...";
        setTimeout(() => {
            window.api.enableAgent(getUrlv);
            watchDeviceConnectedStatus();
        }, 4000)

        statusTxt.innerHTML = "Securing your connection with ..." + getUrlv;
    }

}

function setConnected(showWindow){
    btnBox.style.display="";
    statusTxt.style="color:black";
    statusVal.innerHTML = "Connected";   
    statusTxt.innerHTML = "Connected to " + getUrl;   
    
    if(showWindow) {
        window.api.showWindow();
    }        
}

function watchUrlChange(){
    getUrl = localStorage.getItem("controllerUrl");
    watchUrl = setInterval(()=>{
        var currenUrl = localStorage.getItem("controllerUrl");

        if(getUrl == '' || getUrl != currenUrl){
            window.api.logMessage("Url change triggered the job old: " + getUrl + ", new: ", currenUrl);
            window.api.loadUrl(currenUrl);
            getUrl = currenUrl;
            localStorage.setItem("deviceStatus","error");
            
            window.api.logMessage("Reconnecting from url change");

            window.api.disableAgent(currenUrl);
            setTimeout(()=>{                                  
                localStorage.setItem('agentStatus','enabled');
                localStorage.setItem("newdevice","false");
                statusTxt.style="color:black";
                window.api.enableAgent(currenUrl);
                statusVal.innerHTML = "Reconnecting";
                statusTxt.innerHTML = "Securing your connection with ..." + currenUrl;
            },50);
            
        }
    },1000);
}

function setStatus(cb) {
    statusTxt.style="color:black";
    if (!cb.checked) {
        statusVal.innerHTML = "Disconnected";
        statusTxt.innerHTML = "";        
    }
}


function watchUnregisterFlag(){
    watchUnregister = setInterval(()=>{
        // console.log("watchUrl unregistered");
        var current_status_unregister = localStorage.getItem("unregister");
        if (current_status_unregister == "true"){
            window.api.offboard();
        } 
    },3000);
}


btnBox.style.display="none";
if(getUrl==null || getUrl==''){
    //console.log("Loading the url from settings as it is null or empty")
    window.api.logMessage("Loading the url from settings as it is null or empty");
    window.api.loadUrl(getUrl);
}


// display tenant name
setInterval(()=>{
    var deviceStatus = localStorage.getItem("deviceStatus");
    var deviceInfo = localStorage.getItem("deviceInfo");
   
    tenantName.innerHTML = "";

    try {
        var deviceData = JSON.parse(deviceInfo);
        
        if(deviceStatus == "connected"){
            tenantName.innerHTML = deviceData.ObjectMeta.Tenant;
        }
    }
    catch(e) {
        console.log(e);
    }
}, 3000)

watchUrlChange();
setStatus(togbtn);   
watchUnregisterFlag();    
watchDeviceConnectedStatus();