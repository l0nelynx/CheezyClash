; Keep electron-builder's generated uninstaller, pages and extraction. Only
; same-location upgrades bypass the old-uninstaller step. APP_ID, executable
; and existing .lnk files retain their identity, including private overlays.
!define CHEEZY_INSTALLER_DIR "${__FILEDIR__}"

!ifndef BUILD_UNINSTALLER
  Var cheezyUpdate
  Var cheezyPreviousDir
  Var cheezyPreviousVersion
  Var cheezyPreviousMode
  Var cheezyUpdateRadio
  Var cheezyPrepared

  ; Skip the stock directory page for a manually selected update too.
  !undef isUpdated
  !define isUpdated `"" cheezyIsUpdated ""`
  !macro _cheezyIsUpdated _a _b _t _f
    ${StdUtils.TestParameter} $R9 "updated"
    StrCmp $cheezyUpdate "1" 0 +2
    StrCpy $R9 "true"
    StrCmp $R9 "true" `${_t}` `${_f}`
  !macroend
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    LangString cheezyUpdateTitle ${LANG_ENGLISH} "Update ${PRODUCT_NAME}"
    LangString cheezyUpdateTitle ${LANG_RUSSIAN} "Обновление ${PRODUCT_NAME}"
    LangString cheezyUpdateInfo ${LANG_ENGLISH} "Installed version: $cheezyPreviousVersion$\r$\n$cheezyPreviousDir$\r$\n$\r$\nThe running app and its VPN core will be stopped before replacing files."
    LangString cheezyUpdateInfo ${LANG_RUSSIAN} "Установленная версия: $cheezyPreviousVersion$\r$\n$cheezyPreviousDir$\r$\n$\r$\nПеред заменой файлов приложение и его VPN-ядро будут остановлены."
    LangString cheezyUpdateOption ${LANG_ENGLISH} "Update in place (keep shortcuts and pins)"
    LangString cheezyUpdateOption ${LANG_RUSSIAN} "Обновить (сохранить ярлыки и закрепления)"
    LangString cheezyReinstallOption ${LANG_ENGLISH} "Change installation location or users (reinstall)"
    LangString cheezyReinstallOption ${LANG_RUSSIAN} "Изменить папку или пользователей (переустановка)"
  !endif
  LangString cheezyStopFailed ${LANG_ENGLISH} "Cannot stop the installed app or helper. Close it or run this installer as administrator, then retry. No application files have been replaced."
  LangString cheezyStopFailed ${LANG_RUSSIAN} "Не удалось остановить приложение или helper. Закройте их или запустите установщик от администратора и повторите попытку. Файлы приложения ещё не заменены."
!macroend

!macro customInit
  StrCpy $cheezyPrepared "0"
  StrCpy $cheezyUpdate "0"
  ReadRegStr $cheezyPreviousDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $cheezyPreviousVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  StrCpy $cheezyPreviousMode $installMode
  ${If} $cheezyPreviousDir != ""
  ${AndIf} ${FileExists} "$cheezyPreviousDir\${APP_EXECUTABLE_FILENAME}"
    StrCpy $cheezyUpdate "1"
    StrCpy $INSTDIR $cheezyPreviousDir
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom cheezyUpdatePage cheezyUpdatePageLeave
  Function cheezyUpdatePage
    ${If} $cheezyPreviousDir == ""
    ${OrIfNot} ${FileExists} "$cheezyPreviousDir\${APP_EXECUTABLE_FILENAME}"
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "$(cheezyUpdateTitle)" "${PRODUCT_NAME} ${VERSION}"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 76u "$(cheezyUpdateInfo)"
    Pop $0
    ${NSD_CreateRadioButton} 0 84u 100% 20u "$(cheezyUpdateOption)"
    Pop $cheezyUpdateRadio
    ${NSD_CreateRadioButton} 0 110u 100% 20u "$(cheezyReinstallOption)"
    Pop $0
    ${If} $cheezyUpdate == "1"
      ${NSD_Check} $cheezyUpdateRadio
    ${Else}
      ${NSD_Check} $0
    ${EndIf}
    nsDialogs::Show
  FunctionEnd
  Function cheezyUpdatePageLeave
    ${NSD_GetState} $cheezyUpdateRadio $cheezyUpdate
  FunctionEnd
!macroend

!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${If} $cheezyUpdate == "1"
      ${If} $cheezyPreviousMode == "all"
        StrCpy $isForceMachineInstall "1"
      ${Else}
        StrCpy $isForceCurrentInstall "1"
      ${EndIf}
    ${EndIf}
  !endif
!macroend

!macro cheezyStopProcesses
  InitPluginsDir
  File /oname=$PLUGINSDIR\cheezy-installer-processes.ps1 "${CHEEZY_INSTALLER_DIR}\installer-processes.ps1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cheezy-installer-processes.ps1" -InstallDir "$INSTDIR" -AppExecutable "${APP_EXECUTABLE_FILENAME}" -Action Stop'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$(cheezyStopFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    !insertmacro cheezyStopProcesses
  !else
    ; Expanded after installUtil.nsh and installer.nsh define their macros.
    ; The overrides run inside elevated/silent sections too, unlike the stock
    ; assisted CHECK_APP_RUNNING guard. Never modify installed node_modules.
    !include "${CHEEZY_INSTALLER_DIR}\installer-overrides.nsh"
  !endif
!macroend

!macro customInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cheezy-installer-processes.ps1" -InstallDir "$INSTDIR" -AppExecutable "${APP_EXECUTABLE_FILENAME}" -Action InstallHelper -ProductName "${PRODUCT_NAME}"'
  Pop $0
  ${If} $0 != 0
    ; Per-user installs may lack service-control rights. First TUN connection
    ; can request elevation via the existing Ensure helper flow.
    DetailPrint "Helper registration requires administrator rights; use Ensure helper in the app."
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\cheezy-installer-processes.ps1" -InstallDir "$INSTDIR" -AppExecutable "${APP_EXECUTABLE_FILENAME}" -Action RemoveHelper'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "$(cheezyStopFailed)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend
