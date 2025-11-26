# Custom NSIS installer script for Eventide FFXI Launcher
# This script adds cleanup logic during uninstall while preserving game data during updates

!macro customInstall
  # This macro runs during installation
  # We don't delete anything during installation to preserve existing data
!macroend

!macro customUnInstall
  # Only delete config files and launcher data during uninstall, NOT game files or downloads
  SetShellVarContext current

  # Delete only config.json and storage.json, but preserve Downloads and Game folders
  Delete "$APPDATA\Eventide Launcherv2\config.json"
  Delete "$APPDATA\Eventide Launcherv2\storage.json"

  # Delete logs folder
  RMDir /r "$APPDATA\Eventide Launcherv2\logs"

  # Only remove the main directory if it's empty (preserves Downloads/Game if they exist)
  RMDir "$APPDATA\Eventide Launcherv2"

  # Also clean up any old Eventide Launcher directory (without v2) - config only
  Delete "$APPDATA\Eventide Launcher\config.json"
  Delete "$APPDATA\Eventide Launcher\storage.json"
  RMDir /r "$APPDATA\Eventide Launcher\logs"
  RMDir "$APPDATA\Eventide Launcher"

  # Delete LocalAppData if it exists - config only
  Delete "$LOCALAPPDATA\Eventide Launcherv2\config.json"
  Delete "$LOCALAPPDATA\Eventide Launcherv2\storage.json"
  RMDir "$LOCALAPPDATA\Eventide Launcherv2"
  Delete "$LOCALAPPDATA\Eventide Launcher\config.json"
  Delete "$LOCALAPPDATA\Eventide Launcher\storage.json"
  RMDir "$LOCALAPPDATA\Eventide Launcher"
!macroend
