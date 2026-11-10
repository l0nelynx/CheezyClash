const { app, BrowserWindow, session } = require('electron')
const { join } = require('node:path')
const { mkdirSync, writeFileSync } = require('node:fs')
app.setPath('userData', join(process.argv[2], 'user-data'))
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => { /* Rendering may create the baseline window next. */ })
const output = join(__dirname, 'screenshots')
mkdirSync(output, { recursive: true })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
  const win = new BrowserWindow({ show: false, width: 1440, height: 980, frame: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const errors = []
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  const js = code => win.webContents.executeJavaScript(code)
  const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const choose = (selector, value) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`)
  const capture = async name => {
    await pause(180)
    writeFileSync(join(output, `${name}.png`), (await win.webContents.capturePage(undefined, { stayHidden: true })).toPNG())
    console.log(`Rendered ${name}.png`)
  }
  try {
    await win.loadFile(join(__dirname, 'index.html'))
    await capture('01-overview-dark')
    await click('#theme'); await capture('02-overview-light'); await click('#theme')
    await click('[data-page="servers"]'); await capture('03-servers')
    await click('[data-page="connections"]'); await capture('04-connections')
    await choose('#scenario', 'empty'); await capture('05-first-run')
    await choose('#scenario', 'error'); await capture('06-tun-error')
    await choose('#scenario', 'updated'); await capture('07-profile-updated')
    await choose('#scenario', 'connected')
    win.setSize(1024, 800); await capture('08-overview-1024')
    win.setSize(390, 950); await capture('09-overview-390')
    if (process.argv.includes('--check')) {
      const assert = require('node:assert/strict')
      const field = (selector,value) => js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`)
      win.setSize(1024,800); await click('[data-page="home"]');await click('[data-action="quick-proxy"]')
      const inside = () => js(`(()=>{const r=document.querySelector('#quick-proxy').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`)
      assert.ok(await inside());await capture('10-quick-proxy')
      await js('window.scrollTo(0,250)');await pause(100);assert.ok(await inside())
      win.setSize(390,700);await pause(100);assert.ok(await inside())
      await field('#quick-search','Frankfurt');assert.equal(await js('document.querySelectorAll("[data-quick-server]").length'),1)
      await click('[data-quick-server="fra"]');assert.equal(await js('document.querySelector("#quick-server-trigger strong").textContent'),'Frankfurt')
      win.setSize(1024,800)
      await click('[data-mode="proxy"]');await click('[data-dialog-cancel]')
      await click('[data-action="connect"]');await click('[data-action="connect"]');await pause(1000)
      assert.ok(await js('document.body.innerText.includes("Подключение активно")'))
      await click('[data-page="servers"]')
      for(const group of ['list','grid','carousel']) for(const layout of ['list','large-grid','small-grid']) {
        await choose('#group-layout',group);await choose('#proxy-layout',layout)
        assert.ok(await js('document.querySelectorAll(".proxy-tile").length > 0'))
        assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'),group+'/'+layout)
      }
      await click('[data-group="Мессенджеры"]');await click('[data-server="hel"]');await click('[data-page="home"]')
      assert.equal(await js('document.querySelector("#quick-server-trigger strong").textContent'),'Frankfurt')
      for(const page of ['logs','about']){await click('[data-page="settings"]');await click(`[data-page="${page}"]`);assert.ok(await js('document.querySelector(".log-panel") !== null'))}
      for(const width of [1440,1024,800,390]) {
        win.setSize(width,980);await pause(100)
        for(const page of ['home','servers','connections','profiles','settings']) {
          await click(`[data-page="${page}"]`);assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'),page+' at '+width)
        }
      }
      console.log('Widgets, anchored picker, nine proxy layouts and responsive checks passed.')
    }
    if (errors.length) throw new Error(errors.join('\n'))
    win.destroy()
    if (process.argv.includes('--baseline')) {
      const current = new BrowserWindow({ show: false, width: 1440, height: 980, frame: false, webPreferences: { preload: join(__dirname, '../scripts/ui-fixture.cjs'), additionalArguments: ['--connections-preview'], sandbox: false, contextIsolation: true, backgroundThrottling: false, offscreen: true } })
      await current.loadFile(join(__dirname, '../out/renderer/index.html'))
      for (let i = 0; i < 50; i++) {
        if (await current.webContents.executeJavaScript('document.querySelector("button[title=Главная]") !== null')) break
        await pause(100)
      }
      await pause(500)
      writeFileSync(join(output, '00-current-home.png'), (await current.webContents.capturePage(undefined, { stayHidden: true })).toPNG())
      current.destroy()
      console.log('Rendered current application with existing demo fixture.')
    }
    app.quit()
  } catch (error) { console.error(error); app.exit(1) }
})
