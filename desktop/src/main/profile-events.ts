import { BrowserWindow } from 'electron'

export function notifyProfilesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('profiles:changed')
  }
}
