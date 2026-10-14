const { tools } = require('./tool-data')
const { readScore } = require('./profile-score')

const STORAGE_KEY = 'tool-preferences-v1'

function readOverrides() {
  const value = wx.getStorageSync(STORAGE_KEY)
  if (!value) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('工具喜好数据格式异常')
  return value
}

function defaultEnabled(tool) { return tool.defaultEnabled !== false }

function availableTools() {
  let simulationUnlocked = false
  try { simulationUnlocked = readScore() === 99 } catch (error) {}
  return tools.filter((tool) => tool.id !== 'simulation' || simulationUnlocked)
}

function isEnabled(tool, overrides) {
  return Object.prototype.hasOwnProperty.call(overrides, tool.id) ? overrides[tool.id] === true : defaultEnabled(tool)
}

function readToolPreferences() {
  const overrides = readOverrides()
  return availableTools().map((tool) => ({ ...tool, enabled: isEnabled(tool, overrides) }))
}

function readEnabledTools() {
  const overrides = readOverrides()
  return tools.filter((tool) => isEnabled(tool, overrides)).map((tool) => ({ ...tool, enabled: true }))
}

function setToolEnabled(id, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('工具喜好状态无效')
  const tool = availableTools().find((item) => item.id === id)
  if (!tool) throw new Error('工具不存在，请刷新后重试')
  const overrides = readOverrides()
  if (enabled === defaultEnabled(tool)) delete overrides[id]
  else overrides[id] = enabled
  wx.setStorageSync(STORAGE_KEY, overrides)
}

module.exports = { readToolPreferences, readEnabledTools, setToolEnabled }
