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
  # During auto-updates, the installer runs in silent mode (/S flag)
  # We should NOT delete user data during updates, only during full uninstalls
  # Check if running in silent mode (auto-update) vs interactive uninstall

  ${IfNot} ${Silent}
    # Only delete user data during interactive (non-silent) uninstall
    # This preserves storage.json, config.json, and game data during auto-updates

    SetShellVarContext current

    # Build list of directories that will be removed
    StrCpy $R9 "The following locations will be moved to the Recycle Bin:$\n$\n"

    IfFileExists "$APPDATA\Eventide Launcherv2\*.*" 0 +2
      StrCpy $R9 "$R9• $APPDATA\Eventide Launcherv2$\n"
    IfFileExists "$APPDATA\Eventide Launcher\*.*" 0 +2
      StrCpy $R9 "$R9• $APPDATA\Eventide Launcher$\n"
    IfFileExists "$APPDATA\eventide-launcherv2\*.*" 0 +2
      StrCpy $R9 "$R9• $APPDATA\eventide-launcherv2$\n"
    IfFileExists "$APPDATA\eventide-launcher\*.*" 0 +2
      StrCpy $R9 "$R9• $APPDATA\eventide-launcher$\n"
    IfFileExists "$LOCALAPPDATA\Eventide Launcherv2\*.*" 0 +2
      StrCpy $R9 "$R9• $LOCALAPPDATA\Eventide Launcherv2$\n"
    IfFileExists "$LOCALAPPDATA\Eventide Launcher\*.*" 0 +2
      StrCpy $R9 "$R9• $LOCALAPPDATA\Eventide Launcher$\n"
    IfFileExists "$LOCALAPPDATA\eventide-launcherv2\*.*" 0 +2
      StrCpy $R9 "$R9• $LOCALAPPDATA\eventide-launcherv2$\n"
    IfFileExists "$LOCALAPPDATA\eventide-launcher\*.*" 0 +2
      StrCpy $R9 "$R9• $LOCALAPPDATA\eventide-launcher$\n"
    IfFileExists "$LOCALAPPDATA\${PRODUCT_NAME}\*.*" 0 +2
      StrCpy $R9 "$R9• $LOCALAPPDATA\${PRODUCT_NAME}$\n"
    IfFileExists "$DOCUMENTS\Eventide\*.*" 0 +2
      StrCpy $R9 "$R9• $DOCUMENTS\Eventide$\n"
    IfFileExists "$DOCUMENTS\EventideXI\*.*" 0 +2
      StrCpy $R9 "$R9• $DOCUMENTS\EventideXI$\n"

    StrCpy $R9 "$R9$\nAll items will be sent to the Recycle Bin and can be restored if needed.$\n$\nContinue with uninstall?"

    MessageBox MB_YESNO|MB_ICONQUESTION "$R9" IDYES proceed_uninstall
      Abort "Uninstall cancelled by user"
    proceed_uninstall:

    DetailPrint "Starting uninstall process..."
    DetailPrint "Moving files to Recycle Bin..."

    # Delete desktop shortcuts (these are just shortcuts, so permanent delete is fine)
    DetailPrint "Removing desktop shortcuts..."
    IfFileExists "$DESKTOP\${PRODUCT_NAME}.lnk" 0 +2
      DetailPrint "  - Removing $DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

    IfFileExists "$DESKTOP\EventideXI.lnk" 0 +2
      DetailPrint "  - Removing $DESKTOP\EventideXI.lnk"
    Delete "$DESKTOP\EventideXI.lnk"

    IfFileExists "$DESKTOP\Eventide XI.lnk" 0 +2
      DetailPrint "  - Removing $DESKTOP\Eventide XI.lnk"
    Delete "$DESKTOP\Eventide XI.lnk"

    IfFileExists "$DESKTOP\Eventide Launcher.lnk" 0 +2
      DetailPrint "  - Removing $DESKTOP\Eventide Launcher.lnk"
    Delete "$DESKTOP\Eventide Launcher.lnk"

    # Delete Start Menu shortcuts (these are just shortcuts, so permanent delete is fine)
    DetailPrint "Removing Start Menu shortcuts..."
    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}" 0 +2
      DetailPrint "  - Removing Start Menu folder: $SMPROGRAMS\${PRODUCT_NAME}"
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

    IfFileExists "$SMPROGRAMS\${PRODUCT_NAME}.lnk" 0 +2
      DetailPrint "  - Removing $SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"

    IfFileExists "$SMPROGRAMS\EventideXI.lnk" 0 +2
      DetailPrint "  - Removing $SMPROGRAMS\EventideXI.lnk"
    Delete "$SMPROGRAMS\EventideXI.lnk"

    IfFileExists "$SMPROGRAMS\Eventide XI.lnk" 0 +2
      DetailPrint "  - Removing $SMPROGRAMS\Eventide XI.lnk"
    Delete "$SMPROGRAMS\Eventide XI.lnk"

    IfFileExists "$SMPROGRAMS\Eventide Launcher.lnk" 0 +2
      DetailPrint "  - Removing $SMPROGRAMS\Eventide Launcher.lnk"
    Delete "$SMPROGRAMS\Eventide Launcher.lnk"

    # Move data folders to Recycle Bin using SHFileOperation
    DetailPrint "Moving application data to Recycle Bin..."

    # APPDATA directories
    IfFileExists "$APPDATA\Eventide Launcherv2\*.*" 0 +3
      DetailPrint "  - Recycling $APPDATA\Eventide Launcherv2 (legacy v2)"
      Push "$APPDATA\Eventide Launcherv2"
      Call un.RecycleBin

    IfFileExists "$APPDATA\Eventide Launcher\*.*" 0 +3
      DetailPrint "  - Recycling $APPDATA\Eventide Launcher"
      Push "$APPDATA\Eventide Launcher"
      Call un.RecycleBin

    IfFileExists "$APPDATA\eventide-launcherv2\*.*" 0 +3
      DetailPrint "  - Recycling $APPDATA\eventide-launcherv2 (legacy v2)"
      Push "$APPDATA\eventide-launcherv2"
      Call un.RecycleBin

    IfFileExists "$APPDATA\eventide-launcher\*.*" 0 +3
      DetailPrint "  - Recycling $APPDATA\eventide-launcher"
      Push "$APPDATA\eventide-launcher"
      Call un.RecycleBin

    # LOCALAPPDATA directories
    DetailPrint "Moving local application data to Recycle Bin..."

    IfFileExists "$LOCALAPPDATA\Eventide Launcherv2\*.*" 0 +3
      DetailPrint "  - Recycling $LOCALAPPDATA\Eventide Launcherv2 (legacy v2)"
      Push "$LOCALAPPDATA\Eventide Launcherv2"
      Call un.RecycleBin

    IfFileExists "$LOCALAPPDATA\Eventide Launcher\*.*" 0 +3
      DetailPrint "  - Recycling $LOCALAPPDATA\Eventide Launcher"
      Push "$LOCALAPPDATA\Eventide Launcher"
      Call un.RecycleBin

    IfFileExists "$LOCALAPPDATA\eventide-launcherv2\*.*" 0 +3
      DetailPrint "  - Recycling $LOCALAPPDATA\eventide-launcherv2 (legacy v2)"
      Push "$LOCALAPPDATA\eventide-launcherv2"
      Call un.RecycleBin

    IfFileExists "$LOCALAPPDATA\eventide-launcher\*.*" 0 +3
      DetailPrint "  - Recycling $LOCALAPPDATA\eventide-launcher"
      Push "$LOCALAPPDATA\eventide-launcher"
      Call un.RecycleBin

    IfFileExists "$LOCALAPPDATA\${PRODUCT_NAME}\*.*" 0 +3
      DetailPrint "  - Recycling $LOCALAPPDATA\${PRODUCT_NAME}"
      Push "$LOCALAPPDATA\${PRODUCT_NAME}"
      Call un.RecycleBin

    # DOCUMENTS directories
    DetailPrint "Moving user documents to Recycle Bin..."

    IfFileExists "$DOCUMENTS\Eventide\*.*" 0 +3
      DetailPrint "  - Recycling $DOCUMENTS\Eventide"
      Push "$DOCUMENTS\Eventide"
      Call un.RecycleBin

    IfFileExists "$DOCUMENTS\EventideXI\*.*" 0 +3
      DetailPrint "  - Recycling $DOCUMENTS\EventideXI"
      Push "$DOCUMENTS\EventideXI"
      Call un.RecycleBin

    DetailPrint "Uninstall complete. All data has been moved to Recycle Bin."
  ${EndIf}
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
