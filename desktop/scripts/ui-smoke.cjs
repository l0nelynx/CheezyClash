const { app, BrowserWindow, session, nativeTheme } = require('electron')
const { join } = require('node:path')
const { writeFileSync } = require('node:fs')
const assert = require('node:assert/strict')
const root = process.argv[2]
app.setPath('userData', join(root,'user-data'))
app.commandLine.appendSwitch('lang','en-US')
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']}, (_details, callback) => callback({cancel:true}))
  const win = new BrowserWindow({show:false,width:1000,height:780,webPreferences:{preload:join(__dirname,'ui-fixture.cjs'),sandbox:false,contextIsolation:true,backgroundThrottling:false,offscreen:true}})
  const errors=[]
  win.webContents.on('console-message',(_event, details)=>{if(details?.level==='error')errors.push(details.message)})
  const js = code => win.webContents.executeJavaScript(code)
  const pause = () => new Promise(resolve=>setTimeout(resolve,80))
  const wait = async condition => {
    for(let i=0;i<80;i++){if(await js(condition))return;await pause()}
    throw new Error(`Timed out: ${condition}\n${await js('document.body.innerText')}`)
  }
  const click = async text => { await js(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(text)})?.click()`);await pause() }
  const nav = async title => {await js(`document.querySelector('button[title=${JSON.stringify(title)}]')?.click()`);await pause()}
  const field = async (selector,value) => {await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause()}
  const select = async (label,value) => {await js(`(()=>{const el=document.querySelector('select[data-testid=${JSON.stringify(label.toLowerCase())}]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause()}
  const capture = async name => {await new Promise(resolve=>setTimeout(resolve,400));writeFileSync(join(root,name+'.png'),(await win.webContents.capturePage()).toPNG())}
  try {
    await win.loadFile(join(__dirname,'../out/renderer/index.html'))
    await wait("document.body.innerText.includes('Could not load the app')")
    await js('window.qa.allowAuth()');await click('Try again')
    await wait("document.body.innerText.includes('Core running')")
    assert.equal(await js("document.body.innerText.includes('Install helper')"),false)
    await nav('Proxies');await click('Main')
    // Group button includes its selected server; click it by aria-expanded instead.
    await js("document.querySelector('button[aria-expanded]')?.click()")
    await wait("document.querySelector('ul[aria-label=Servers]') !== null")
    assert.ok(await js("document.querySelectorAll('ul[aria-label=Servers] button').length")<=20)
    await field('input[aria-label="Search servers"]','0999')
    await wait("document.querySelectorAll('ul[aria-label=Servers] button').length === 1")
    await nav('Home');await nav('Proxies')
    assert.equal(await js("document.querySelector('input[aria-label=\"Search servers\"]').value"),'0999')
    await nav('Profiles')
    assert.equal(await js("document.body.innerText.includes('SECRET_TOKEN')"),false)
    await field('input[placeholder="Subscription URL"]','https://example.invalid/broken')
    await click('Import URL')
    await wait("document.body.innerText.includes('Import failed for test')")
    assert.equal(await js("document.querySelector('input[placeholder=\"Subscription URL\"]').value"),'https://example.invalid/broken')
    await nav('Logs')
    await js("window.qa.emitLog('[401] [error] https://example.invalid/SECRET_TOKEN token=PRIVATE newest')")
    await wait("document.body.innerText.includes('newest')")
    assert.equal(await js("document.body.innerText.includes('PRIVATE') || document.body.innerText.includes('SECRET_TOKEN')"),false)
    assert.ok(await js("(()=>{const e=document.querySelector('div.overflow-auto');return e.scrollHeight-e.scrollTop-e.clientHeight<2})()"))
    await js("(()=>{const e=document.querySelector('div.overflow-auto');e.scrollTop=0;e.dispatchEvent(new Event('scroll',{bubbles:true}))})()")
    await pause();await js("window.qa.emitLog('[402] [info] AFTER_PAUSE')");await pause()
    assert.equal(await js("document.body.innerText.includes('AFTER_PAUSE')"),false)
    await js("document.querySelector('button[aria-label=Dismiss]')?.click()")
    await nav('Settings');await select('Language','ru');await select('Theme','light')
    await wait("document.documentElement.lang==='ru' && document.documentElement.classList.contains('light')")
    assert.ok(await js("document.body.innerText.toLowerCase().includes('внешний вид')"), await js('document.body.innerText'))
    await capture('settings-ru-light')
    await select('Theme','dark');await capture('settings-ru-dark')
    await nav('Главная');await wait("document.querySelector('h2')?.textContent === 'Test subscription'");await capture('home-ru-dark')
    await nav('Настройки');await select('Theme','system');nativeTheme.themeSource='light'
    await wait("document.documentElement.classList.contains('light')")
    nativeTheme.themeSource='dark'
    await wait("document.documentElement.classList.contains('dark')")
    await win.webContents.reload();await wait("document.documentElement.lang==='ru'")
    assert.equal(errors.length,0,errors.join('\n'))
    console.log('UI smoke passed: startup retry, import failure, 1000-server list, navigation, logs, privacy, RU and themes')
    console.log('Screenshots: '+root)
    app.exit(0)
  } catch(error) {console.error(error);await capture('failure');console.log('Screenshots: '+root);app.exit(1)}
})
