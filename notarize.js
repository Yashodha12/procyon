require('dotenv').config();
const fs = require('fs')
const path = require('path')
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;  
  if (electronPlatformName !== 'darwin') {
    return;
  }
  console.log('afterSign hook triggered', context)
  const appName = context.packager.appInfo.productFilename;

  console.log(
    `Notarizing ${appName} with Apple ID ${process.env.APPLEID} at ${appOutDir}/${appName}.app`
    )

  return await notarize({
    appBundleId: 'com.procyon.ai.agent',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLEID,
    appleIdPassword: process.env.APPLEIDPASS,
  });
};