#!/bin/bash

export DEBUG=electron-builder
export CSC_LINK=../..//Certificates.p12 
export CSC_KEY_PASSWORD=password
export CSC_IDENTITY_AUTO_DISCOVERY=true
export APPLEID=arunachalam@asmltd.com
export APPLEIDPASS=hujp-kpuy-rbad-wixl

set -x

# copy binaries
cp $GOPATH/bin/cyonagent ./cyonagent_mac
mkdir -p build/pkg-scripts
cp mac/package/postinstall build/pkg-scripts/

# build the app
npx electron-builder --mac --x64
retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error building Electron app"
    exit $retVal
fi

productsign --sign "Developer ID Installer: Procyon Inc (F79MX5V887)" ./build/Procyon.ai-1.0.0-x64.pkg ./build/Procyon.ai-1.0.0-x64_signed.pkg
retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error signing the package"
    exit $retVal
fi

NotarizeOut=$(xcrun altool --notarize-app --primary-bundle-id "ai.procyon.procyonagent" --username "arunachalam@asmltd.com" --password "hujp-kpuy-rbad-wixl" --file ./build/Procyon.ai-1.0.0-x64_signed.pkg --asc-provider "F79MX5V887")
retVal=$?
if [ $retVal -ne 0 ]; then
    echo "Error submitting for notarization"
    exit $retVal
fi

echo "Notarize app(xcrun altool --notarize-app) output:\n $NotarizeOut"
PkgUuid=$(echo "$NotarizeOut" | grep RequestUUID | awk '{print $3}')
echo "Package UUID: $PkgUuid"

iter=1
while [ $iter -le 60 ]; do
    # Run this to check the status of notarization
    NotarizeStatus=$(xcrun altool --notarization-info $PkgUuid  --username "arunachalam@asmltd.com" --password "hujp-kpuy-rbad-wixl")
    
    echo "$NotarizeStatus"
    PkgStatus=$(echo "$NotarizeStatus" | grep "Status:" | awk -F': ' '{print $2}')
    echo "Package status: $PkgStatus"
    StatusMsg=$(echo "$NotarizeStatus" | grep "Status Message:" | awk -F': ' '{print $2}')
    echo "Package status: $PkgStatus"

    # Check if the package was approved
    if [ "$PkgStatus" == "success" -a "$StatusMsg" == "Package Approved" ]; then
        # Staple the package
        xcrun stapler staple ./build/Procyon.ai-1.0.0-x64_signed.pkg
        if [ $retVal -ne 0 ]; then
            echo "Error signing the package"
            exit $retVal
        fi

        echo "SUCCESS: package notarized and staped"
        exit 0
    fi

    # wait a little and retry
    echo "package not notarized. Retrying..."
    sleep 15
done

echo "ERROR: package is still not notarized"
echo "Try manually running:"
echo xcrun altool --notarization-info $PkgUuid  --username "arunachalam@asmltd.com" --password "hujp-kpuy-rbad-wixl"
exit 1
