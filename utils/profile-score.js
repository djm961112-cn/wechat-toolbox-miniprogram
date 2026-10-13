const STORAGE_KEY = 'toolbox-rating-v1'

function scoreValue(record) {
  const value = Number(record && typeof record === 'object' ? record.value : record)
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : null
}

function readScore() { return scoreValue(wx.getStorageSync(STORAGE_KEY)) }

function readScoreRecord() {
  const record = wx.getStorageSync(STORAGE_KEY)
  const value = scoreValue(record)
  return value === null ? null : { value, updatedAt: record && record.updatedAt || 0 }
}

function saveScore(value) {
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error('请选择 1 至 10 分')
  const record = { value, updatedAt: Date.now() }
  wx.setStorageSync(STORAGE_KEY, record)
  return record
}

module.exports = { readScore, readScoreRecord, saveScore }
