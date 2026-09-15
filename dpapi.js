// DPAPI 加解密模块：用 Windows DPAPI（当前用户凭据）加密/解密敏感值
// 安全性：密钥由 Windows 用户凭据管理（不落盘），只有当前用户能解密。
// 加密后的值以 base64 存 config.json；启动时自动解密。
import { spawnSync } from 'node:child_process'

// 加密：明文 → base64 密文
export function dpapiEncrypt(plain) {
  if (!plain) return ''
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [Text.Encoding]::UTF8.GetBytes($env:DPAPI_PLAIN)
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, [byte[]]@(), 'CurrentUser')
[Convert]::ToBase64String($enc)
`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, DPAPI_PLAIN: plain },
    timeout: 15000,
  })
  if (result.status !== 0) {
    console.error('dpapiEncrypt failed:', result.stderr || result.stdout)
    throw new Error('DPAPI 加密失败')
  }
  const out = result.stdout.trim()
  return out
}

// 解密：base64 密文 → 明文
export function dpapiDecrypt(cipher) {
  if (!cipher) return ''
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String($env:DPAPI_CIPHER)
$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, [byte[]]@(), 'CurrentUser')
[Text.Encoding]::UTF8.GetString($dec)
`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, DPAPI_CIPHER: cipher },
    timeout: 15000,
  })
  if (result.status !== 0) {
    console.error('dpapiDecrypt failed:', result.stderr || result.stdout)
    return ''  // 解密失败返回空（视为未配置）
  }
  return result.stdout.trim()
}
