# Custom NSIS installer script for Eventide FFXI Launcher
# This script adds cleanup logic during uninstall while preserving game data during updates

# Function to detect if running under Wine
!macro IsWine _result
  ClearErrors
  ReadRegStr ${_result} HKLM "SOFTWARE\Wine" ""
  ${If} ${Errors}
    # Wine key not found - not running under Wine
    StrCpy ${_result} ""
  ${Else}
    # Wine key exists - running under Wine
    StrCpy ${_result} "1"
  ${EndIf}
!macroend

!macro customInstall
  # This macro runs during installation
  # We don't delete anything during installation to preserve existing data

  # Detect Wine and skip desktop shortcut creation if running under Wine
  # The launcher will create a proper .desktop file on first run instead
  Var /GLOBAL IsWineResult
  !insertmacro IsWine $IsWineResult

  ${If} $IsWineResult == "1"
    # Running under Wine - remove any shortcuts that were already created
    # to prevent Wine from generating broken .desktop files
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\EventideXI.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\EventideXI.lnk"
  ${Else}
    # Not running under Wine - ensure desktop shortcut exists
    # This is especially important during silent updates where shortcuts may not be recreated
    SetShellVarContext current
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe" "" "$INSTDIR\${PRODUCT_NAME}.exe" 0
  ${EndIf}
!macroend

!macro customUnInstall
  # During auto-updates, the installer runs in silent mode (/S flag)
  # We should NOT delete user data during updates, only during full uninstalls
  # Check if running in silent mode (auto-update) vs interactive uninstall

  ${IfNot} ${Silent}
    # Only delete user data during interactive (non-silent) uninstall
    # This preserves storage.json, config.json, and game data during auto-updates

    SetShellVarContext current

    # Delete desktop shortcuts (all possible names)
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\EventideXI.lnk"
    Delete "$DESKTOP\Eventide XI.lnk"
    Delete "$DESKTOP\Eventide Launcher.lnk"

    # Delete Start Menu shortcuts
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\EventideXI.lnk"
    Delete "$SMPROGRAMS\Eventide XI.lnk"
    Delete "$SMPROGRAMS\Eventide Launcher.lnk"

    # Delete all data from APPDATA (including Game and Downloads)
    RMDir /r "$APPDATA\Eventide Launcherv2"
    RMDir /r "$APPDATA\Eventide Launcher"
    RMDir /r "$APPDATA\eventide-launcherv2"
    RMDir /r "$APPDATA\eventide-launcher"

    # Delete all data from LOCALAPPDATA
    RMDir /r "$LOCALAPPDATA\Eventide Launcherv2"
    RMDir /r "$LOCALAPPDATA\Eventide Launcher"
    RMDir /r "$LOCALAPPDATA\eventide-launcherv2"
    RMDir /r "$LOCALAPPDATA\eventide-launcher"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"

    # Delete Eventide folder from common locations (custom install dirs)
    RMDir /r "$DOCUMENTS\Eventide"
    RMDir /r "$DOCUMENTS\EventideXI"
  ${EndIf}
!macroend
