// Mock OpenAI 兼容服务：模拟真实平台（含 SSE 流式响应）
// 用于端到端验证概念学习树的 AI 代理链路（/api/chat → 上游转发 → 流式回传）
// 启动: node mock-openai.mjs（端口 9899）
import http from 'node:http'

const PORT = 9899

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  console.log('MOCK 收到:', req.method, url.pathname)

  if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body || '{}')
    console.log('  model:', payload.model, '| messages:', payload.messages?.length, '| stream:', payload.stream)

    // 验证鉴权头
    const auth = req.headers.authorization || ''
    if (!auth.startsWith('Bearer ')) {
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'missing bearer token' } }))
    }
    console.log('  auth: Bearer ***' + auth.slice(-6))

    // 若 system prompt 是概念提取器 → 返回 JSON 数组（模拟 AI 增强检测）
    const sys = payload.messages?.find((m) => m.role === 'system')?.content || ''
    const isExtractor = sys.includes('概念提取器')
    const reply = isExtractor
      ? '["Transformer","Attention","反向传播","过拟合"]'
      : '这是来自 mock AI 的回答，用于验证流式转发链路。机器学习是人工智能的核心领域。Transformer 架构和深度学习是其重要概念。'

    if (payload.stream) {
      // SSE 流式响应
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      // 模拟分块发送
      const chunks = []
      for (let i = 0; i < reply.length; i += 10) chunks.push(reply.slice(i, i + 10))
      for (let i = 0; i < chunks.length; i++) {
        const data = JSON.stringify({
          id: 'chatcmpl-mock-' + i,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: chunks[i] }, finish_reason: null }],
        })
        res.write(`data: ${data}\n\n`)
        await new Promise((r) => setTimeout(r, 30))
      }
      res.write('data: [DONE]\n\n')
      res.end()
    } else {
      // 非流式 JSON
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }))
    }
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message: 'not found: ' + url.pathname } }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('🤖 Mock OpenAI 服务运行在 http://127.0.0.1:' + PORT)
})
