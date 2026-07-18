; After install: (re)register CheezyHelper Windows service for TUN.
; PRODUCT_NAME comes from electron-builder (CheezyClash / CheezyVPN).
!macro customInstall
  StrCpy $0 "$INSTDIR\resources\helper\CheezyHelperService.exe"
  IfFileExists "$0" 0 cheezy_helper_done

  ; Idempotent: stop + delete any previous service, then create and start
  ExecWait 'sc.exe stop CheezyHelperService'
  ExecWait 'sc.exe delete CheezyHelperService'
  Sleep 500
  ExecWait 'sc.exe create CheezyHelperService binPath= "$0" start= auto DisplayName= "${PRODUCT_NAME} Helper"'
  ExecWait 'sc.exe start CheezyHelperService'

  cheezy_helper_done:
!macroend

!macro customUnInstall
  ExecWait 'sc.exe stop CheezyHelperService'
  ExecWait 'sc.exe delete CheezyHelperService'
!macroend
