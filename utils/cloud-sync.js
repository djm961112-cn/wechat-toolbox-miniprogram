const auth = require('./auth')

const META_KEY = 'openotools-cloud-sync-v1'
const TOOL_KEYS = {
  mfa: ['mfa-totp-accounts-v1'], weight: ['weight-records-v1'],
  simulation: ['simulation-plans-v1', 'simulation-plan-sources-v1']
}
const timers = {}
const prepared = {}
let retryPromptVisible = false

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function readMeta() { const value = wx.getStorageSync(META_KEY); return value && typeof value === 'object' ? value : {} }
function writeMeta(value) { wx.setStorageSync(META_KEY, value) }
function currentUserId() { const session = auth.readSession(); return session && session.user ? String(session.user.id) : '' }
function toolMeta(tool) {
  const stored = readMeta()[tool]
  return stored && stored.userId === currentUserId() ? stored : { userId: currentUserId(), revision: 0, enabled: false, pendingUpload: false }
}
function setToolMeta(tool, patch) { const value = readMeta(); value[tool] = { ...toolMeta(tool), ...patch, userId: currentUserId() }; writeMeta(value); return value[tool] }

function readLocal(tool) {
  if (!TOOL_KEYS[tool]) throw new Error('不支持的同步工具')
  if (tool === 'simulation') return { plans: wx.getStorageSync(TOOL_KEYS[tool][0]) || [], sources: wx.getStorageSync(TOOL_KEYS[tool][1]) || [] }
  return wx.getStorageSync(TOOL_KEYS[tool][0]) || []
}

function writeLocal(tool, data) {
  if (tool === 'simulation') {
    wx.setStorageSync(TOOL_KEYS[tool][0], Array.isArray(data.plans) ? data.plans : [])
    wx.setStorageSync(TOOL_KEYS[tool][1], Array.isArray(data.sources) ? data.sources : [])
  } else wx.setStorageSync(TOOL_KEYS[tool][0], Array.isArray(data) ? data : [])
}

function isEmpty(tool, data) { return tool === 'simulation' ? !data.plans.length && !data.sources.length : !data.length }
function stamp(item) { return Number(item && (item.updatedAt || item.createdAt)) || 0 }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right) }
function keyFor(tool, item) {
  if (tool === 'mfa') return `${item.secret || ''}\u0000${item.account || ''}\u0000${item.issuer || ''}`
  if (tool === 'weight') return item.id || `${item.createdAt || ''}\u0000${item.weight || ''}`
  return item.id || ''
}

function mergeList(tool, local, remote, preference) {
  const rows = new Map()
  const conflicts = []
  ;(remote || []).forEach((item) => rows.set(keyFor(tool, item), clone(item)))
  ;(local || []).forEach((item) => {
    const key = keyFor(tool, item)
    const cloud = rows.get(key)
    if (!cloud) { rows.set(key, clone(item)); return }
    if (same(item, cloud)) return
    const localStamp = stamp(item), cloudStamp = stamp(cloud)
    if (localStamp !== cloudStamp && (localStamp || cloudStamp)) rows.set(key, clone(localStamp > cloudStamp ? item : cloud))
    else if (preference) rows.set(key, clone(preference === 'local' ? item : cloud))
    else conflicts.push({ key, local: item, cloud })
  })
  return { data: [...rows.values()], conflicts }
}

function mergeToolData(tool, local, remote, preference) {
  if (tool === 'simulation') {
    const plans = mergeList(tool, local.plans, remote.plans, preference)
    const sources = mergeList(tool, local.sources, remote.sources, preference)
    return { data: { plans: plans.data, sources: sources.data }, conflicts: plans.conflicts.concat(sources.conflicts) }
  }
  return mergeList(tool, local, remote, preference)
}

function chooseConflict(tool, count) {
  return new Promise((resolve) => wx.showModal({
    title: '发现数据冲突', content: `${tool} 有 ${count} 条同标识数据无法判断新旧，请选择保留版本。其他不冲突记录会合并。`,
    confirmText: '保留本机', cancelText: '使用云端', success: (result) => resolve(result.confirm ? 'local' : 'cloud'), fail: () => resolve('local')
  }))
}

async function mergeWithPrompt(tool, local, remote) {
  let merged = mergeToolData(tool, local, remote)
  if (merged.conflicts.length) merged = mergeToolData(tool, local, remote, await chooseConflict(tool, merged.conflicts.length))
  return merged.data
}

async function getSummary() { return auth.authenticatedRequest({ path: '/api/v1/cloud-data' }) }
async function getTool(tool) { return auth.authenticatedRequest({ path: `/api/v1/cloud-data/${tool}` }) }
async function putTool(tool, data, revision) {
  return auth.authenticatedRequest({ path: `/api/v1/cloud-data/${tool}`, method: 'PUT', data: { schemaVersion: 1, expectedRevision: revision, data } })
}

function responseRevision(response, fallback) { return Number(response && response.revision) || fallback }

async function syncNow(tool, allowRetry = true) {
  const meta = toolMeta(tool)
  if (!auth.readSession() || !meta.enabled) return { skipped: true }
  const local = readLocal(tool)
  try {
    const response = await putTool(tool, local, meta.revision || 0)
    setToolMeta(tool, { revision: responseRevision(response, (meta.revision || 0) + 1), enabled: true, pendingUpload: false, lastError: '', syncedAt: Date.now() })
    return response
  } catch (error) {
    if (error.statusCode === 409 && allowRetry) {
      const cloud = await getTool(tool)
      const merged = await mergeWithPrompt(tool, local, cloud.data)
      writeLocal(tool, merged)
      setToolMeta(tool, { revision: cloud.revision, enabled: true })
      return syncNow(tool, false)
    }
    setToolMeta(tool, { lastError: error.message || '同步失败' })
    throw error
  }
}

function promptRetry(tool, error) {
  if (retryPromptVisible) return
  retryPromptVisible = true
  wx.showModal({ title: '云同步失败', content: `${error.message || '网络异常'}。本地数据已保存，可稍后重试。`, confirmText: '重试', cancelText: '稍后',
    success: (result) => { if (result.confirm) syncNow(tool).catch(() => {}) }, complete: () => { retryPromptVisible = false } })
}

function scheduleSync(tool, delay = 900) {
  if (!auth.readSession() || !toolMeta(tool).enabled) return
  if (timers[tool]) clearTimeout(timers[tool])
  timers[tool] = setTimeout(() => { delete timers[tool]; syncNow(tool).catch((error) => promptRetry(tool, error)) }, delay)
}

async function restoreTool(tool) {
  const local = readLocal(tool)
  try {
    const cloud = await getTool(tool)
    const merged = await mergeWithPrompt(tool, local, cloud.data)
    writeLocal(tool, merged)
    setToolMeta(tool, { revision: cloud.revision, enabled: true, pendingUpload: false, lastError: '', restoredAt: Date.now() })
    prepared[`${currentUserId()}:${tool}`] = true
    if (!same(merged, cloud.data)) await syncNow(tool)
    return { restored: true, pendingUpload: false }
  } catch (error) {
    if (error.statusCode === 404 && error.code === 'CLOUD_DATA_NOT_FOUND') {
      const pendingUpload = !isEmpty(tool, local)
      setToolMeta(tool, { revision: 0, enabled: !pendingUpload, pendingUpload, lastError: '' })
      prepared[`${currentUserId()}:${tool}`] = true
      return { restored: false, pendingUpload }
    }
    setToolMeta(tool, { lastError: error.message || '云端读取失败' })
    throw error
  }
}

async function prepareTool(tool) {
  if (prepared[`${currentUserId()}:${tool}`]) return { restored: false, pendingUpload: toolMeta(tool).pendingUpload }
  try { return await restoreTool(tool) }
  catch (error) {
    if (error.statusCode === 401) return { restored: false, authExpired: true, error }
    wx.showModal({ title: '云端数据暂不可用', content: `${error.message || '网络异常'}。本地数据不会丢失，请稍后重试。`, showCancel: false })
    return { restored: false, error }
  }
}

async function importLocalData(retry = true) {
  const summary = await getSummary()
  const list = Array.isArray(summary) ? summary : summary.items || summary.tools || []
  const byTool = new Map(list.map((item) => [item.tool, item]))
  const items = []
  for (const tool of Object.keys(TOOL_KEYS)) {
    const local = readLocal(tool)
    const saved = byTool.get(tool)
    let data = local, revision = 0
    if (saved) {
      const cloud = await getTool(tool)
      data = await mergeWithPrompt(tool, local, cloud.data)
      revision = cloud.revision
      writeLocal(tool, data)
    }
    items.push({ tool, schemaVersion: 1, expectedRevision: revision, data })
  }
  try {
    const response = await auth.authenticatedRequest({ path: '/api/v1/cloud-data/import', method: 'POST', data: { items } })
    const updated = await getSummary()
    const updatedList = Array.isArray(updated) ? updated : updated.items || updated.tools || []
    Object.keys(TOOL_KEYS).forEach((tool) => {
      const item = updatedList.find((row) => row.tool === tool)
      setToolMeta(tool, { revision: item ? item.revision : 1, enabled: true, pendingUpload: false, lastError: '', syncedAt: Date.now() })
      prepared[`${currentUserId()}:${tool}`] = true
    })
    return response
  } catch (error) {
    if (error.statusCode === 409 && retry) return importLocalData(false)
    throw error
  }
}

module.exports = { TOOL_KEYS, readLocal, writeLocal, toolMeta, mergeToolData, getSummary, getTool, restoreTool, prepareTool, scheduleSync, syncNow, importLocalData }
