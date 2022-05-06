#!/bin/bash
echo $1
sudo cp $1application.procyon.agent.plist /tmp/application.procyon.agent.plist
sudo cp /tmp/application.procyon.agent.plist /Library/LaunchDaemons/application.procyon.agent.plist
sudo launchctl unload -w /Library/LaunchDaemons/application.procyon.agent.plist
sudo launchctl load -w /Library/LaunchDaemons/application.procyon.agent.plist
