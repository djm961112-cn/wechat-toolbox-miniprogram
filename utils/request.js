let requestSequence = 0

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|sessionkey|openid|unionid|account|weight|note/i

function requestPath(url) {
  const value = String(url || '')
  const path = value.replace(/^https?:\/\/[^/]+/i, '').split('?')[0]
  return path || '/'
}

function sanitizeForLog(value, options = {}, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…[TRUNCATED ${value.length - 500}]` : value
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  if (depth >= 6) return '[MAX_DEPTH]'
  seen.add(value)
  if (Array.isArray(value)) {
    const rows = value.slice(0, 20).map((item) => sanitizeForLog(item, options, depth + 1, seen))
    if (value.length > 20) rows.push(`[TRUNCATED ${value.length - 20} ITEMS]`)
    return rows
  }
  const result = {}
  const entries = Object.entries(value)
  entries.slice(0, 80).forEach(([key, item]) => {
    const loginCode = options.authLogin && key.toLowerCase() === 'code'
    result[key] = SENSITIVE_KEY.test(key) || loginCode ? `[REDACTED:${item == null ? 'null' : typeof item}]` : sanitizeForLog(item, options, depth + 1, seen)
  })
  if (entries.length > 80) result.__truncatedKeys = entries.length - 80
  return result
}

function log(level, label, detail) {
  const writer = console[level] || console.log
  writer.call(console, label, detail)
}

function request(options = {}) {
  const requestId = `http-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`
  const startedAt = Date.now()
  const method = String(options.method || 'GET').toUpperCase()
  const url = String(options.url || '')
  const path = requestPath(url)
  const requestSanitizeOptions = { authLogin: path === '/api/v1/auth/wechat-login' }
  log('info', '[HTTP][request]', {
    requestId, method, url, path, timeout: options.timeout,
    header: sanitizeForLog(options.header || {}, requestSanitizeOptions),
    body: sanitizeForLog(options.data, requestSanitizeOptions)
  })

  const success = options.success
  const fail = options.fail
  return wx.request({
    ...options,
    success: (response) => {
      log(response.statusCode >= 200 && response.statusCode < 400 ? 'info' : 'warn', '[HTTP][response]', {
        requestId, method, url, path, durationMs: Date.now() - startedAt, statusCode: response.statusCode,
        header: sanitizeForLog(response.header || {}),
        body: sanitizeForLog(response.data)
      })
      if (success) success(response)
    },
    fail: (error) => {
      log('error', '[HTTP][error]', { requestId, method, url, path, durationMs: Date.now() - startedAt, error: sanitizeForLog(error) })
      if (fail) fail(error)
    }
  })
}

module.exports = { request, sanitizeForLog }
