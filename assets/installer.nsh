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
    # Not running under Wine
    # Desktop shortcut creation is an explicit opt-in handled by the app (first-run prompt).
    # Do not create or recreate desktop shortcuts here (silent updates run this macro).

    # Best-effort refresh of this launcher's EXE icon in Explorer after an in-place upgrade.
    # Avoids clearing the entire system icon cache.
    IfFileExists "$SYSDIR\ie4uinit.exe" 0 +2
      ExecWait '"$SYSDIR\ie4uinit.exe" -show'
    # SHCNE_UPDATEITEM (0x00002000) + SHCNF_PATHW (0x0005)
    IfFileExists "$INSTDIR\${PRODUCT_NAME}.exe" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$INSTDIR\\${PRODUCT_NAME}.exe", i 0)'

    # Also refresh Start Menu shortcuts (these can survive upgrades and keep an old cached icon).
    # Note: We don't assume exact shortcut names; just best-effort notify common paths.
    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\${PRODUCT_NAME}", i 0)'

    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\${PRODUCT_NAME}\\${PRODUCT_NAME}.lnk", i 0)'
    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}\EventideXI.lnk" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\${PRODUCT_NAME}\\EventideXI.lnk", i 0)'
    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}\Eventide Launcher.lnk" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\${PRODUCT_NAME}\\Eventide Launcher.lnk", i 0)'
    IfFileExists "$SMPROGRAMS\EventideXI.lnk" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\EventideXI.lnk", i 0)'
    IfFileExists "$SMPROGRAMS\Eventide Launcher.lnk" 0 +2
      System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\\Eventide Launcher.lnk", i 0)'
  ${EndIf}
!macroend

!macro customUnInstall
  # Windows "Apps & features" uninstall can run the NSIS uninstaller in silent mode.
  # We still want to remove launcher app data (Roaming/Local) in that case.
  # Keep the scope tight: remove launcher data folders, but do not touch game installs.

  # IMPORTANT: electron-updater installs updates by running the installer, which can invoke
  # the uninstaller as part of the update flow. In that case, we must NOT delete user data,
  # otherwise the app behaves like a fresh install (e.g., re-prompts for desktop shortcuts).
  ${If} ${isUpdated}
    DetailPrint "Uninstall invoked by update; skipping app data removal."
  ${EndIf}

  SetShellVarContext current

  DetailPrint "Starting uninstall process..."

  # Delete desktop shortcuts (shortcuts only)
  DetailPrint "Removing desktop shortcuts..."
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\EventideXI.lnk"
  Delete "$DESKTOP\Eventide XI.lnk"
  Delete "$DESKTOP\Eventide Launcher.lnk"

  # Delete Start Menu shortcuts (shortcuts only)
  DetailPrint "Removing Start Menu shortcuts..."
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\EventideXI.lnk"
  Delete "$SMPROGRAMS\Eventide XI.lnk"
  Delete "$SMPROGRAMS\Eventide Launcher.lnk"

  # Remove app data folders.
  # Use RMDir /r (permanent delete) for reliability; Windows uninstalls often run without UI.
  DetailPrint "Removing application data (Roaming/AppData and Local/AppData)..."

  ${IfNot} ${isUpdated}
    # Remove this app's userData folders.
    # Electron's userData path is derived from the app name/productName; keep backward
    # compatibility with older folder names so reinstalls are predictable.

    # Current product name (build.productName) is used in shortcuts and usually userData.
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"

    # Legacy / previously-used folder names.
    RMDir /r "$APPDATA\eventide-launcherv2"
    RMDir /r "$LOCALAPPDATA\eventide-launcherv2-updater"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}-updater"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME} Updater"
  ${EndIf}

  DetailPrint "Uninstall complete."
!macroend

# Function to move a folder to Recycle Bin
# Usage: Push "C:\path\to\folder" then Call un.RecycleBin
Function un.RecycleBin
  Exch $R0  # Get path from stack
  Push $R1
  Push $R2

  # The path to delete - System::Call will handle null termination
  StrCpy $R1 "$R0"

  # Allocate SHFILEOPSTRUCT
  # typedef struct _SHFILEOPSTRUCT {
  #   HWND   hwnd;              // offset 0, 4 bytes
  #   UINT   wFunc;             // offset 4, 4 bytes (FO_DELETE = 3)
  #   LPCTSTR pFrom;            // offset 8, 4 bytes
  #   LPCTSTR pTo;              // offset 12, 4 bytes
  #   FILEOP_FLAGS fFlags;      // offset 16, 2 bytes (FOF_ALLOWUNDO = 0x40, FOF_NOCONFIRMATION = 0x10, FOF_SILENT = 0x4)
  #   BOOL   fAnyOperationsAborted; // offset 18, 4 bytes
  #   LPVOID hNameMappings;     // offset 22, 4 bytes
  #   LPCTSTR lpszProgressTitle; // offset 26, 4 bytes
  # } SHFILEOPSTRUCT;

  System::Call '*(&t1024 "$R1")i.r2'  # pFrom - source path

  # Allocate the structure
  # hwnd=0, wFunc=FO_DELETE(3), pFrom=r2, pTo=0, fFlags=FOF_ALLOWUNDO(0x40)|FOF_NOCONFIRMATION(0x10)|FOF_SILENT(0x4)=0x54
  System::Call '*(i 0, i 3, i r2, i 0, i 0x54, i 0, i 0, i 0) i.r1'

  # Call SHFileOperation
  System::Call 'shell32::SHFileOperation(i r1) i.r0'

  # Free allocated memory
  System::Free $r2
  System::Free $r1

  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd
