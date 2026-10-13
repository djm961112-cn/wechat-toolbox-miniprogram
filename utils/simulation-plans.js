const STORAGE_KEY = 'simulation-plans-v1'
const SOURCE_STORAGE_KEY = 'simulation-plan-sources-v1'
const simulationTools = [
  { id: 'football', name: '足球', description: '官方赛事 · 多玩法计算 · 保存方案', symbol: '⚽', url: '/pages/tool/simulation/football/index', sourceUrl: 'https://m.sporttery.cn/mjc/jsq/zqspf/' }
]

function readPlans() {
  const records = wx.getStorageSync(STORAGE_KEY)
  if (!records) return []
  if (!Array.isArray(records)) throw new Error('方案数据格式异常')
  return records.slice().sort((left, right) => right.createdAt - left.createdAt)
}

function readSources() {
  const sources = wx.getStorageSync(SOURCE_STORAGE_KEY)
  if (!sources) return []
  if (!Array.isArray(sources)) throw new Error('方案来源数据格式异常')
  return sources.slice()
}

function createSource(name) {
  const value = String(name || '').trim()
  if (!value || value.length > 40) throw new Error('来源名称需为 1 至 40 个字')
  const sources = readSources()
  if (sources.some((source) => source.name === value)) throw new Error('该来源名称已存在')
  let id
  do { id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}` }
  while (sources.some((source) => source.id === id))
  const source = { id, name: value, createdAt: Date.now() }
  wx.setStorageSync(SOURCE_STORAGE_KEY, [...sources, source])
  return source
}

function sourceFields(sourceId) {
  if (!sourceId) return { planSourceId: '', planSourceName: '' }
  const source = readSources().find((item) => item.id === sourceId)
  if (!source) throw new Error('方案来源不存在，请重新选择')
  return { planSourceId: source.id, planSourceName: source.name }
}

function savePlan(snapshot) {
  if (!simulationTools.some((tool) => tool.id === snapshot.toolId)) throw new Error('不支持的模拟工具')
  if (!snapshot.title || !Array.isArray(snapshot.matches) || !snapshot.matches.length) throw new Error('请填写方案名称和比赛选择')
  const now = Date.now()
  const plan = {
    ...snapshot,
    ...sourceFields(snapshot.planSourceId),
    version: 3,
    periodIds: planPeriods(snapshot),
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now
  }
  wx.setStorageSync(STORAGE_KEY, [plan, ...readPlans()])
  return plan
}

function setPlanSource(id, sourceId) {
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，请刷新后重试')
  plans[index] = { ...plans[index], ...sourceFields(sourceId), version: 3 }
  wx.setStorageSync(STORAGE_KEY, plans)
}

function matchPeriod(match) {
  const explicit = String(match.period || match.matchNumDate || '')
  if (/^\d{6}$/.test(explicit)) return explicit
  const date = String(match.businessDate || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(2).replace(/-/g, '') : ''
}

function matchNumber(match) {
  const number = String(match.numberCode || match.number || match.matchNumStr || '')
  const found = number.match(/(\d{3})$/)
  return found ? found[1] : ''
}

function planPeriods(plan) {
  return [...new Set(plan.matches.map(matchPeriod).filter(Boolean))].sort().reverse()
}

function savePlanCheck(id, check) {
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，核对结果未保存')
  plans[index] = { ...plans[index], check }
  try { wx.setStorageSync(STORAGE_KEY, plans) }
  catch (error) { throw new Error('核对结果保存失败，请检查本机空间') }
}

function removePlan(id) {
  wx.setStorageSync(STORAGE_KEY, readPlans().filter((plan) => plan.id !== id))
}

function formatTime(timestamp, includeSeconds = false) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}${includeSeconds ? ':' + pad(date.getSeconds()) : ''}`
}

function formatSelectionRows(selections) {
  const rows = []
  selections.forEach((option) => {
    let row = rows.find((item) => item.id === option.poolId)
    if (!row) { row = { id: option.poolId, options: [] }; rows.push(row) }
    const goal = Number(option.goalLine)
    const handicap = option.poolId === 'hhad' && option.goalLine != null ? `[${goal > 0 ? '+' : ''}${goal}]` : ''
    row.options.push({ key: option.key, text: `${option.name || option.key}${handicap}(${Number(option.odds).toFixed(2)})` })
  })
  // All markets of one match share the widest row, so a shorter row keeps its column alignment.
  const columns = Math.min(3, Math.max(1, ...rows.map((row) => row.options.length)))
  return rows.map((row) => ({ ...row, columns }))
}

function formatPlanForDisplay(plan) {
  // Derive the compact view from snapshot fields; do not rewrite old records or fetch new odds.
  const periodIds = planPeriods(plan)
  return { ...plan, planSourceId: plan.planSourceId || '', planSourceName: plan.planSourceName || '', periodIds, periodLabel: periodIds.join('、'), createdTime: formatTime(plan.createdAt), checkedTime: plan.check ? formatTime(plan.check.checkedAt) : '', matches: plan.matches.map((match) => {
    const selectionText = String(match.selectionText || '').replace(/\s*\[(?:仅串关|可单关)\]/g, '').replace(/(?:让球胜平负|胜平负|总进球|半全场|比分)\s*/g, '')
    const selectionRows = Array.isArray(match.selections) && match.selections.length ? formatSelectionRows(match.selections)
      : [{ id: 'legacy', columns: 1, options: [{ key: 'legacy', text: selectionText }] }]
    return { ...match, period: matchPeriod(match), numberCode: matchNumber(match), selectionText, selectionRows }
  }) }
}

module.exports = { simulationTools, readPlans, savePlan, removePlan, savePlanCheck, readSources, createSource, setPlanSource, matchPeriod, matchNumber, planPeriods, formatTime, formatSelectionRows, formatPlanForDisplay }
