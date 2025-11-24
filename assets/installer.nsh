# Custom NSIS installer script for Eventide FFXI Launcher
# This script adds cleanup logic during uninstall

!macro customUnInstall
  # Delete storage.json and config.json to ensure clean uninstall
  SetShellVarContext current
  
  # Delete AppData\Roaming\Eventide Launcherv2 directory
  RMDir /r "$APPDATA\Eventide Launcherv2"
  
  # Also clean up any old Eventide Launcher directory (without v2)
  RMDir /r "$APPDATA\Eventide Launcher"
  
  # Delete LocalAppData if it exists
  RMDir /r "$LOCALAPPDATA\Eventide Launcherv2"
  RMDir /r "$LOCALAPPDATA\Eventide Launcher"
!macroend
