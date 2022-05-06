#!/bin/bash
echo $1
echo $2
sudo killall cyonagent_mac
sleep 5s
sudo $1/cyonagent_mac -controller $2
