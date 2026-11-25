const { authenticatedRequest } = require('./auth')

function stockRequest(path, method = 'GET', data) {
  return authenticatedRequest({ path: `/api/v1/${path}`, method, data })
}

function rulePayload(form, original) {
  if (String(form.threshold == null ? '' : form.threshold).trim() === '') throw new Error('请输入目标值')
  const value = Number(form.threshold)
  if (!Number.isFinite(value) || (form.metric === 'PRICE' && value <= 0)) throw new Error('请输入有效的目标值')
  return {
    symbol: form.symbol, metric: form.metric, comparison: form.comparison,
    threshold: value, repeatMode: form.repeatMode, enabled: form.enabled !== false,
    matchCurrent: Boolean(form.matchCurrent),
    requestId: original ? `edit-${original.id}` : (form.requestId || `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    expectedVersion: original ? original.version : 1
  }
}

function normalizeCode(input) {
  const code = String(input || '').trim().toUpperCase()
  if (/^(SH|SZ)\.\d{6}$/.test(code)) return code
  if (/^[69]\d{5}$/.test(code)) return `SH.${code}`
  if (/^[03]\d{5}$/.test(code)) return `SZ.${code}`
  throw new Error('请输入沪深股票代码，例如 600519 或 SZ.000001')
}

function normalizeBarkKey(input) {
  const value = String(input || '').trim()
  const match = value.match(/^https:\/\/api\.day\.app\/([A-Za-z0-9_-]{8,128})(?:[/?#].*)?$/i)
  const key = match ? match[1] : value
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error('请粘贴 Bark 设备 Key 或默认推送地址')
  return key
}

module.exports = { stockRequest, rulePayload, normalizeCode, normalizeBarkKey }
