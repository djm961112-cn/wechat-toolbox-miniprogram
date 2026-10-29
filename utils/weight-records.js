const STORAGE_KEY = 'weight-records-v1'
const cloud = require('./cloud-sync')

function pad(value) { return String(value).padStart(2, '0') }
function dayKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function normalizeWeight(value) {
  const text = String(value == null ? '' : value).trim()
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) throw new Error('请输入有效体重')
  const weight = Number(text)
  if (weight < 20 || weight > 300) throw new Error('请输入 20～300 kg 的体重')
  return Number(weight.toFixed(2))
}

function readRecords() {
  const value = cloud.readToolData('weight')
  if (!value) return []
  if (!Array.isArray(value)) throw new Error('体重记录格式异常')
  return value.filter((item) => item && Number.isFinite(item.weight) && Number.isFinite(item.createdAt)).sort((a, b) => a.createdAt - b.createdAt)
}

function saveRecord(value, now = Date.now()) {
  const record = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, weight: normalizeWeight(value), createdAt: now }
  cloud.writeToolData('weight', [...readRecords(), record])
  return record
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }

function periodRows(records, period, now = Date.now()) {
  const current = new Date(now)
  let start
  let end
  if (period === 'month') {
    start = new Date(current.getFullYear(), current.getMonth(), 1).getTime()
    end = new Date(current.getFullYear(), current.getMonth() + 1, 1).getTime()
  } else if (period === 'year') {
    start = new Date(current.getFullYear(), 0, 1).getTime()
    end = new Date(current.getFullYear() + 1, 0, 1).getTime()
  } else {
    end = startOfDay(current) + 24 * 60 * 60 * 1000
    start = end - 7 * 24 * 60 * 60 * 1000
  }
  const filtered = records.filter((item) => item.createdAt >= start && item.createdAt < end)
  if (period === 'year') {
    const months = new Map()
    filtered.forEach((item) => {
      const month = new Date(item.createdAt).getMonth() + 1
      const list = months.get(month) || []
      list.push(item.weight)
      months.set(month, list)
    })
    return [...months.entries()].map(([month, values]) => ({
      key: String(month), label: `${month}月`, shortLabel: `${month}月`,
      weight: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
      order: month
    }))
  }
  const days = new Map()
  filtered.forEach((item) => days.set(dayKey(item.createdAt), item))
  return [...days.values()].map((item) => {
    const date = new Date(item.createdAt)
    return { key: dayKey(item.createdAt), label: `${date.getMonth() + 1}月${date.getDate()}日`, shortLabel: `${date.getMonth() + 1}/${date.getDate()}`, weight: item.weight, order: item.createdAt }
  })
}

function chartModel(rows) {
  if (!rows.length) return { points: [], segments: [], min: '', max: '', change: '' }
  const weights = rows.map((item) => item.weight)
  const minimum = Math.min(...weights)
  const maximum = Math.max(...weights)
  const span = Math.max(maximum - minimum, 2)
  const labelStep = Math.max(1, Math.ceil(rows.length / 6))
  const points = rows.map((item, index) => ({
    ...item,
    x: rows.length === 1 ? 50 : 8 + index * 84 / (rows.length - 1),
    y: 84 - (item.weight - (minimum - (span - (maximum - minimum)) / 2)) / span * 68,
    showLabel: index === 0 || index === rows.length - 1 || index % labelStep === 0,
    showValue: rows.length <= 7 || index === 0 || index === rows.length - 1
  }))
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index]
    const dx = point.x - previous.x
    // The chart is wider than it is tall, so convert Y percentages to the
    // same physical scale as X before calculating each CSS line segment.
    const scaledDy = (point.y - previous.y) * 430 / 650
    return { x: previous.x, y: previous.y, width: Math.sqrt(dx * dx + scaledDy * scaledDy), angle: Math.atan2(scaledDy, dx) * 180 / Math.PI }
  })
  const change = rows.length > 1 ? Number((rows[rows.length - 1].weight - rows[0].weight).toFixed(2)) : 0
  return { points, segments, min: minimum.toFixed(1), max: maximum.toFixed(1), change: `${change > 0 ? '+' : ''}${change.toFixed(1)}` }
}

module.exports = { STORAGE_KEY, normalizeWeight, readRecords, saveRecord, periodRows, chartModel }
