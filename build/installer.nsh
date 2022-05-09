!include MUI2.nsh

!macro customInstall
  ExecWait '"$INSTDIR\tap-windows.exe"';
  ExecWait '"$INSTDIR\cyonagent.bat procyonagent https://asm-dev.proxyon.cloud"'
!macroend 