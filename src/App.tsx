// 主应用：顶栏 + 系列页 / 设置页（第一轮 1.5：ui-ux-pro-max 设计系统落地）
import React from 'react'
import SeriesPage from './SeriesPage.tsx'
import { getConfig, saveConfig, listBackups, createBackup, restoreBackup, EXPORT_URL, type BackupInfo } from './api.ts'
import { SaveProvider, SaveIndicator, useSave } from './SaveContext.tsx'
import { Modal } from './ui.tsx'
import GlobalSearch from './features/GlobalSearch.tsx'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref, type ThemePref } from './features/theme.ts'
import { ResolvedDarkContext } from './ui.tsx'
import Ferrofluid from './components/Ferrofluid.tsx'
import { IconSettings, IconSave, IconLock, IconBackup, IconDownload, IconBack, IconCalendar, IconSun, IconMoon, IconMonitor, IconGrid } from './icons.tsx'
import ClickSpark from './components/ClickSpark.tsx'
import EntranceOverlay from './EntranceOverlay.tsx'
import type { Series } from './types'

export default function App() {
  const [config, setConfig] = React.useState(null)   // null=加载中
  const [showSettings, setShowSettings] = React.useState(false)
  // 第二轮 3.9 反馈 #2：打开的系列由 App 持有 —— 设置页返回后回到原系列而非首页
  const [openId, setOpenId] = React.useState<string | null>(null)
  // 第十三轮：开场粒子汇聚动画，仅冷启动播一次（动画结束或减弱动效时置 false）
  const [bootIntro, setBootIntro] = React.useState(true)
  // 第二轮 2a/2b：顶栏日历按钮 + 全局搜索都依赖"当前打开的系列"，由 SeriesPage 上报
  const [openSeries, setOpenSeries] = React.useState<Series | null>(null)
  const [calSeq, setCalSeq] = React.useState(0)
  const [statsSeq, setStatsSeq] = React.useState(0)
  const [locateId, setLocateId] = React.useState<string | null>(null)
  const [locateSeq, setLocateSeq] = React.useState(0)
  // 第五轮 C：Ctrl/Cmd+K 唤起全局搜索
  const [searchFocusSeq, setSearchFocusSeq] = React.useState(0)
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (!openSeries) return
        e.preventDefault()
        setSearchFocusSeq((s) => s + 1)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [openSeries])
  // 第二轮 2c：暗色主题三态（亮/暗/跟随系统），默认亮
  const [themePref, setThemePref] = React.useState<ThemePref>(() => loadThemePref())

  React.useEffect(() => {
    const apply = () => {
      const systemDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', resolveTheme(themePref, systemDark))
    }
    apply()
    if (themePref !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => apply()
    if (mq.addEventListener) mq.addEventListener('change', h)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', h) }
  }, [themePref])

  // 第七轮：解析后的深浅色（供微光标题/点击粒子取色）
  const resolvedDark = React.useMemo(() => {
    if (themePref === 'dark') return true
    if (themePref === 'light') return false
    return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  }, [themePref])
  const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // 第十三轮：Hero（大字 logo + 标语）在开场动画期间隐藏，落定瞬间浮现
  const introActive = bootIntro && !reducedMotion

  const cycleTheme = () => setThemePref((p) => {
    const next = nextThemePref(p)
    saveThemePref(next)
    return next
  })

  // 第十二轮：主题切换过渡动画（首帧不挂类；切换时挂 500ms 过渡类后摘除）
  const firstThemeRef = React.useRef(true)
  React.useEffect(() => {
    if (firstThemeRef.current) { firstThemeRef.current = false; return }
    const el = document.documentElement
    el.classList.add('ct-theme-anim')
    const t = window.setTimeout(() => el.classList.remove('ct-theme-anim'), 500)
    return () => window.clearTimeout(t)
  }, [resolvedDark])

  // 第七轮：点击粒子包装（尊重减弱动效偏好）
  const withSparks = (node: React.ReactNode) => {
    if (reducedMotion) return node as React.ReactElement
    return (
      <ClickSpark sparkColor={resolvedDark ? '#8b7ff0' : '#6f5fe6'} sparkSize={9} sparkRadius={16} sparkCount={7} duration={380}>
        {node}
      </ClickSpark>
    )
  }

  // 第九轮反馈 #5：Ferrofluid 应用背景，主题自适应（深底发浅光流体 / 浅底发深色低透明流体）
  // WebGL 不可用（如 jsdom 测试环境）时跳过，保证测试与老旧环境不崩
  const webglOk = React.useMemo(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
    } catch { return false }
  }, [])
  const withBg = (node: React.ReactNode) => (
    <ResolvedDarkContext.Provider value={resolvedDark}>
      {webglOk && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }} aria-hidden="true">
          <Ferrofluid
            colors={resolvedDark ? ['#ffffff', '#ffffff', '#ffffff'] : ['#141414', '#141414', '#141414']}
            speed={0.2}
            scale={3}
            turbulence={0.15}
            fluidity={0.06}
            rimWidth={0.23}
            sharpness={3}
            shimmer={1}
            glow={resolvedDark ? 2 : 1}
            flowDirection="down"
            opacity={resolvedDark ? 0.85 : 0.12}
            mouseInteraction
            mouseStrength={0.8}
            mouseRadius={0.3}
          />
        </div>
      )}
      {/* 第十轮反馈 #1：进入系列后给大背景加一层朦胧，避免流体过于抢眼（系列管理页不加） */}
      {openSeries && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', background: 'var(--ct-veil)' }} aria-hidden="true" />
      )}
      <div style={{ position: 'relative', zIndex: 1, height: '100vh' }}>{node}</div>
    </ResolvedDarkContext.Provider>
  )

  React.useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig({ apiUrl: '', model: '', hasKey: false }))
  }, [])

  if (config === null) {
    return <div style={styles.center}>加载中…</div>
  }

  // 未配置或用户点设置 → 设置页（已配置时可返回，第一轮 1.5 修复 #9）
  if (showSettings || (!config.apiUrl && !config.hasKey)) {
    return withSparks(withBg(<SettingsPage
      initialUrl={config.apiUrl}
      initialModel={config.model}
      initialHasKey={config.hasKey}
      onSaved={(c) => { setConfig(c); setShowSettings(false) }}
      onCancel={(config.apiUrl || config.hasKey) ? () => setShowSettings(false) : undefined}
    />))
  }

  return withSparks(withBg(
    <SaveProvider>
      {/* 第十三轮：开场粒子汇聚动画（仅冷启动，减弱动效时不挂载） */}
      {bootIntro && !reducedMotion && <EntranceOverlay dark={resolvedDark} onDone={() => setBootIntro(false)} />}
      <div style={styles.app}>
        <div style={styles.topbar}>
          <span style={styles.brand}>
            {/* 第十一轮：新 logo（白线稿；浅色模式反色为黑），去掉原标题文字 */}
            <img src="/logo.png" alt="概念学习树" className={resolvedDark ? 'ct-logo-dark' : 'ct-logo-light'} style={{ width: 28, height: 28 }} />
          </span>
          {/* 第二轮 2b：顶栏全局搜索（只在打开系列时可用） */}
          {openSeries && (
            <GlobalSearch series={openSeries} focusSignal={searchFocusSeq} onPick={(id) => { setLocateId(id); setLocateSeq((s) => s + 1) }} />
          )}
          <span style={styles.topbarRight}>
            <span style={styles.modelBadge}>{config.model || '默认模型'}</span>
            <SaveIndicator />
            <ManualSaveButton />
            {openSeries && (
              <button className="ct-btn" onClick={() => setCalSeq((s) => s + 1)} title="查看复习日历（到期热力图）">
                <IconCalendar size={15} /> 日历
              </button>
            )}
            {openSeries && (
              <button className="ct-btn" onClick={() => setStatsSeq((s) => s + 1)} title="查看学习报告（统计）">
                <IconGrid size={15} /> 统计
              </button>
            )}
            <button className="ct-btn" onClick={() => setShowSettings(true)}><IconSettings size={15} /> 设置</button>
            {/* 第二轮 2c：主题三态切换（亮/暗/跟随系统） */}
            <button className="ct-btn ct-btn-ghost" onClick={cycleTheme}
              title={themePref === 'light' ? '主题：亮色（点击切换）' : themePref === 'dark' ? '主题：暗色（点击切换）' : '主题：跟随系统（点击切换）'}
              aria-label="切换主题">
              {themePref === 'light' ? <IconSun size={15} /> : themePref === 'dark' ? <IconMoon size={15} /> : <IconMonitor size={15} />}
            </button>
          </span>
        </div>
        <div style={styles.body}>
          <SeriesPage
            model={config.model}
            openId={openId}
            onOpenId={setOpenId}
            onSeriesOpen={setOpenSeries}
            calendarRequest={calSeq}
            statsRequest={statsSeq}
            locateRequest={locateId ? { id: locateId, seq: locateSeq } : null}
            introActive={introActive}
          />
        </div>
        <DataFooter />
      </div>
    </SaveProvider>
  ))
}

/** 手动保存：冲刷所有已登记草稿（各草稿自行走 run() 状态机） */
function ManualSaveButton() {
  const { flushDrafts } = useSave()
  return (
    <button className="ct-btn" onClick={() => { flushDrafts() }} title="冲刷未保存的草稿并立即写入">
      <IconSave size={15} /> 手动保存
    </button>
  )
}

/** 底栏：本地优先安心锚（仅保存在这台电脑 · 上次备份 X） */
export function DataFooter() {
  const [last, setLast] = React.useState<string | null | undefined>(undefined)

  const load = React.useCallback(() => {
    listBackups()
      .then((r) => setLast(r.backups[0] ? r.backups[0].createdAt : null))
      .catch(() => setLast(null))
  }, [])

  React.useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('ct-backups-changed', h)
    const t = window.setInterval(load, 60000)
    return () => { window.removeEventListener('ct-backups-changed', h); window.clearInterval(t) }
  }, [load])

  const text = last === undefined
    ? '…'
    : last === null
      ? '尚未备份'
      : '上次备份 ' + new Date(last).toLocaleString()

  return <div style={styles.footer} role="status"><IconLock size={13} /> <span>仅保存在这台电脑 · {text}</span></div>
}

// ---------- 设置页 ----------
function SettingsPage({ initialUrl, initialModel, initialHasKey, onSaved, onCancel }) {
  const [apiUrl, setApiUrl] = React.useState(initialUrl || '')
  const [model, setModel] = React.useState(initialModel || '')
  const [apiKey, setApiKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)

  const save = () => {
    // 第一轮 1.5 修复 #9：已配置 Key 时留空 = 保留原 Key，不再强制重填
    if (!apiUrl.trim()) {
      setError('请填写 API URL')
      return
    }
    if (!apiKey.trim() && !initialHasKey) {
      setError('请填写 API Key')
      return
    }
    setBusy(true); setError(null)
    saveConfig({ apiUrl: apiUrl.trim(), apiKey: apiKey.trim(), model: model.trim() })
      .then(() => onSaved({ apiUrl: apiUrl.trim(), model: model.trim(), hasKey: true }))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return (
    <div style={styles.settingsWrap}>
      <div className="ct-glass ct-rise" style={styles.settingsCard}>
        {/* 第一轮 1.5 修复 #9：返回入口 */}
        <div style={styles.settingsHeaderRow}>
          <h2 style={styles.settingsTitle}><span className="ct-gradient-text">连接 AI</span></h2>
          {onCancel && <button className="ct-btn" onClick={onCancel}><IconBack size={14} /> 返回</button>}
        </div>
        <p style={styles.settingsDesc}>
          填写你的 OpenAI 兼容 API 信息。支持任意兼容平台（DeepSeek、通义、硅基流动等）。
          Key 只保存在本机 config.json，由本地服务代理请求，不会暴露给浏览器。
        </p>
        <label style={styles.label}>API URL</label>
        <input
          className="ct-input"
          style={{ width: '100%' }}
          placeholder="如 https://api.deepseek.com/v1 或 https://api.openai.com/v1"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
        />
        <label style={styles.label}>模型名 {model && <span style={styles.hint}>(可选)</span>}</label>
        <input
          className="ct-input"
          style={{ width: '100%' }}
          placeholder="如 deepseek-chat 或 gpt-4o-mini（留空用默认）"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <label style={styles.label}>API Key {initialHasKey && <span style={styles.hint}>(已配置，留空保持不变)</span>}</label>
        <input
          className="ct-input"
          style={{ width: '100%' }}
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
        />
        {error && <div style={styles.error}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
          <button className="ct-btn ct-btn-primary" onClick={save} disabled={busy}>
            {busy ? '保存中…' : (initialHasKey ? '保存修改' : '保存并进入')}
          </button>
          {onCancel && !busy && <button className="ct-btn" onClick={onCancel}>取消</button>}
        </div>

        <DataBackupSection />
      </div>
    </div>
  )
}

// ---------- 数据与备份（第一轮 B）----------
function DataBackupSection() {
  const [backups, setBackups] = React.useState<BackupInfo[]>([])
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = React.useState<BackupInfo | null>(null)

  const load = React.useCallback(() => {
    listBackups().then((r) => setBackups(r.backups)).catch(() => setBackups([]))
  }, [])
  React.useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener('ct-backups-changed', h)
    return () => window.removeEventListener('ct-backups-changed', h)
  }, [load])

  const changed = () => window.dispatchEvent(new Event('ct-backups-changed'))

  const doBackup = () => {
    setBusy(true); setMsg(null)
    createBackup()
      .then(() => { setMsg('✓ 备份完成'); changed() })
      .catch((e) => setMsg('备份失败: ' + e.message))
      .finally(() => setBusy(false))
  }

  const doRestore = (b: BackupInfo) => {
    setBusy(true); setMsg(null)
    restoreBackup(b.file)
      .then(() => {
        setConfirmTarget(null)
        setMsg('✓ 恢复完成（已先做安全备份）')
        changed()
        window.dispatchEvent(new Event('ct-data-changed')) // 通知主界面重载数据
      })
      .catch((e) => setMsg('恢复失败: ' + e.message))
      .finally(() => setBusy(false))
  }

  const fmtSize = (n: number) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

  return (
    <div style={styles.backupSection}>
      <h3 style={styles.backupTitle}><IconBackup size={16} /> 数据与备份</h3>
      <p style={styles.settingsDesc}>
        学习数据仅存本机。恢复前会自动对当前数据做安全备份，失败自动回滚，不会破坏主数据。
      </p>
      <div style={styles.backupActions}>
        <button className="ct-btn ct-btn-primary" onClick={doBackup} disabled={busy}>{busy ? '处理中…' : '立即备份'}</button>
        <button className="ct-btn" onClick={() => { window.location.href = EXPORT_URL }} title="下载全量 JSON"><IconDownload size={15} /> 导出全部</button>
      </div>
      {msg && <div style={styles.hint}>{msg}</div>}
      <div style={styles.backupList}>
        {backups.length === 0
          ? <div style={styles.hint}>还没有备份。</div>
          : backups.map((b) => (
            <div key={b.file} style={styles.backupRow}>
              <span style={styles.backupMeta}>
                {new Date(b.createdAt).toLocaleString()} · {fmtSize(b.size)}
              </span>
              <button className="ct-btn" style={{ padding: '3px 10px', fontSize: 12 }} disabled={busy} onClick={() => setConfirmTarget(b)}>恢复</button>
            </div>
          ))}
      </div>

      {confirmTarget && (
        <Modal title="恢复备份" onClose={() => setConfirmTarget(null)}>
          <p style={styles.modalText}>
            将数据恢复到 <b>{new Date(confirmTarget.createdAt).toLocaleString()}</b> 的备份版本。
            恢复前会先对当前数据做一份安全备份；若恢复失败会自动回滚，不破坏主数据。
          </p>
          <div style={styles.modalActions}>
            <button className="ct-btn ct-btn-primary" onClick={() => doRestore(confirmTarget)} disabled={busy}>确认恢复</button>
            <button className="ct-btn" onClick={() => setConfirmTarget(null)}>取消</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  center: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ct-fg-tertiary)' },
  app: { height: '100vh', display: 'flex', flexDirection: 'column' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--ct-border)', background: 'var(--ct-panel)', flexWrap: 'wrap', rowGap: 8, columnGap: 10, boxShadow: '0 4px 16px rgba(55,53,47,.05)' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  brand: { display: 'inline-flex', alignItems: 'center', gap: 10 },
  brandMark: { width: 30, height: 30, borderRadius: 8, background: '#1a1a1a', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: 600, fontFamily: 'var(--ct-font-display)', letterSpacing: '-0.01em', color: 'var(--ct-fg)' },
  modelBadge: { fontSize: 12, color: 'var(--ct-fg-secondary)', background: 'var(--ct-surface)', padding: '3px 10px', borderRadius: 999, border: '1px solid var(--ct-border)' },
  body: { flex: 1, minHeight: 0, overflow: 'auto' },
  footer: { padding: '6px 20px', borderTop: '1px solid var(--ct-border)', background: 'var(--ct-surface)', fontSize: 12, color: 'var(--ct-fg-tertiary)', display: 'flex', alignItems: 'center', gap: 6 },
  settingsWrap: { minHeight: '100vh', padding: '56px 20px', overflow: 'auto', background: 'transparent' },
  settingsCard: { maxWidth: 560, margin: '0 auto', background: 'var(--ct-panel)', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-md)', boxShadow: 'var(--ct-shadow-1)', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 10 },
  settingsTitle: { fontSize: 22, marginBottom: 4, color: 'var(--ct-fg)', fontWeight: 600 },
  settingsHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  settingsDesc: { fontSize: 13, color: 'var(--ct-fg-secondary)', lineHeight: 1.6, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--ct-fg)', marginTop: 6 },
  hint: { fontWeight: 400, color: 'var(--ct-fg-muted)', fontSize: 12 },
  error: { color: 'var(--ct-destructive)', fontSize: 13 },
  backupSection: { marginTop: 28, borderTop: '1px solid var(--ct-border-soft)', paddingTop: 16 },
  backupTitle: { fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ct-fg)', fontWeight: 600 },
  backupActions: { display: 'flex', gap: 8, alignItems: 'center' },
  backupList: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 },
  backupRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--ct-border)', borderRadius: 'var(--ct-radius-sm)', padding: '6px 10px', background: 'var(--ct-surface-soft)' },
  backupMeta: { fontSize: 12, color: 'var(--ct-fg-tertiary)' },
  modalText: { fontSize: 13, lineHeight: 1.7, color: 'var(--ct-fg)', margin: '0 0 14px' },
  modalActions: { display: 'flex', gap: 8 },
}
