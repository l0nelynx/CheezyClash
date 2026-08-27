; Included only when the stock install-section macros are available.
!ifndef CHEEZY_INSTALLER_OVERRIDES
!define CHEEZY_INSTALLER_OVERRIDES

!macroundef setIsTryToKeepShortcuts
!macro setIsTryToKeepShortcuts
  ${If} $cheezyPrepared != "1"
    ${If} $cheezyUpdate == "1"
      StrCpy $INSTDIR $cheezyPreviousDir
      StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro setLinkVars
    ${EndIf}
    ; Re-evaluate after scope/directory selection and UAC. A same-path reinstall
    ; is also an update. Silent installers follow exactly the same decision.
    ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    StrCpy $cheezyUpdate "0"
    ${If} $R1 != ""
      GetFullPathName $R1 "$R1"
      GetFullPathName $R2 "$INSTDIR"
      ${If} $R1 == $R2
      ${AndIf} ${FileExists} "$appExe"
        StrCpy $cheezyUpdate "1"
      ${EndIf}
    ${EndIf}
    !insertmacro cheezyStopProcesses
    StrCpy $cheezyPrepared "1"
  ${EndIf}
  StrCpy $isTryToKeepShortcuts "false"
  ${If} $cheezyUpdate == "1"
    StrCpy $isTryToKeepShortcuts "true"
    ; The current install section reads this flag immediately afterwards.
    WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts "true"
  ${EndIf}
!macroend

!macroundef uninstallOldVersion
!macro uninstallOldVersion ROOT_KEY
  ClearErrors
  StrCpy $R0 0
  ${If} $cheezyUpdate != "1"
    ; Also skip the HKCU uninstall when updating HKLM: do not touch another copy.
    Push "${ROOT_KEY}"
    Call uninstallOldVersion
  ${EndIf}
!macroend
!endif
