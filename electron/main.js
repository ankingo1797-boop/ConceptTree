// Electron 主进程：把概念学习树封装为独立桌面应用（不依赖浏览器）
// 第十八轮：内置服务改为「进程内运行」（不再 spawn 外部 node.exe），
//          打包态把数据/配置/日志/备份写到用户 AppData（userData），程序目录只读也能存。
// 安全：渲染进程禁用 Node 集成 + 上下文隔离 + 沙箱；Key 由本地服务持有，渲染进程接触不到明文。
import { app, BrowserWindow, shell, Menu, session } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.CT_PORT || 8930)
const URL = `http://127.0.0.1:${PORT}`

let mainWindow = null

// 运行环境：打包态数据进 userData；始终关闭 server.js 自动启动，改由主进程显式 startServer()
function configureRuntime() {
  if (app.isPackaged) {
    const base = app.getPath('userData')
    process.env.CT_DATA_DIR = join(base, 'data')
    process.env.CT_CONFIG_FILE = join(base, 'config.json')
    process.env.CT_LOG_DIR = join(base, 'logs')
    process.env.CT_BACKUP_DIR = join(base, 'backups')
    process.env.CT_DIST_DIR = join(__dirname, '..', 'dist')
  }
  process.env.CT_PORT = String(PORT)
  process.env.CT_NO_AUTOSTART = '1'
}

// 进程内启动本地服务（import 前须先设好上面的 env）
async function startServer() {
  configureRuntime()
  const mod = await import('../server.js')
  mod.startServer()
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
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  // 外部链接用系统浏览器打开（不劫持应用内导航）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL(URL)
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  // 所有下载（MD/JSON 导出）统一保存到系统「下载」文件夹，不弹位置选择
  session.defaultSession.on('will-download', (event, item) => {
    try {
      item.setSavePath(join(app.getPath('downloads'), item.getFilename()))
    } catch (e) {
      console.error('download path error:', e)
    }
  })

  await startServer()
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
  // 关闭所有窗口 = 退出应用（进程内服务随主进程一起结束）
  app.quit()
})
