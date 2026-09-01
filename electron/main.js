// Electron 主进程：把概念学习树封装为独立桌面应用（不依赖浏览器）
// - 启动时在内部运行 server.js（端口 8930）
// - 创建独立窗口加载 http://127.0.0.1:8930
// - 安全：渲染进程禁用 Node 集成；Key 由 server 端代理持有，渲染进程接触不到明文
import { app, BrowserWindow, shell, Menu, session } from 'electron'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 8930
const URL = `http://127.0.0.1:${PORT}`

let serverProc = null
let mainWindow = null

// 启动内置 server（独立进程）
// 注意：Electron 里 process.execPath 指向 electron.exe，不能用它跑 node 脚本；
// 用系统 node 可执行文件（ELECTRON_RUN_AS_NODE 环境变量让 electron 以 node 模式运行）
function startServer() {
  const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node'
  serverProc = spawn(nodeBin, [join(__dirname, '..', 'server.js')], {
    cwd: join(__dirname, '..'),
    stdio: 'ignore',
    detached: false,
    env: { ...process.env },
  })
  serverProc.on('error', (e) => console.error('server start error:', e))
}

// 等待服务就绪（最多 10 秒）
function waitForServer() {
  return new Promise((resolve) => {
    const deadline = Date.now() + 10000
    const check = async () => {
      try {
        const res = await fetch(URL + '/api/config')
        if (res.ok) return resolve(true)
      } catch { /* not ready */ }
      if (Date.now() > deadline) return resolve(false)
      setTimeout(check, 300)
    }
    check()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '🌳 概念学习树',
    backgroundColor: '#f6f5f4',
    autoHideMenuBar: true,        // 第二轮 3.9 反馈 #7：隐藏默认菜单栏（file/edit/view/window）
    webPreferences: {
      nodeIntegration: false,      // 禁用 Node 集成（安全）
      contextIsolation: true,      // 上下文隔离
      sandbox: true,               // 沙箱渲染进程
    },
  })

  // 外部链接用系统浏览器打开（不劫持应用内导航）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(URL)

  // 关闭窗口 = 关闭应用（含内置 server）
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  // 第二轮 3.9 反馈 #7：彻底移除默认应用菜单（File/Edit/View/Window）
  Menu.setApplicationMenu(null)
  // 第六轮反馈 #2：所有下载（MD/JSON 导出）统一保存到系统「下载」文件夹，不再弹位置选择
  session.defaultSession.on('will-download', (event, item) => {
    try {
      item.setSavePath(join(app.getPath('downloads'), item.getFilename()))
    } catch (e) {
      console.error('download path error:', e)
    }
  })
  startServer()
  const ok = await waitForServer()
  if (!ok) {
    console.error('❌ 内置服务启动失败（端口 ' + PORT + ' 可能被占用）')
    app.quit()
    return
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 关闭所有窗口 = 退出应用 + 停 server
  app.quit()
})

app.on('before-quit', () => {
  if (serverProc) { try { serverProc.kill() } catch { /* ignore */ } }
})
