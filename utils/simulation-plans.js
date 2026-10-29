const cloud = require('./cloud-sync')
const simulationTools = [
  { id: 'football', name: '足球', description: '官方赛事 · 多玩法计算 · 保存方案', symbol: '⚽', url: '/pages/tool/simulation/football/index', sourceUrl: 'https://m.sporttery.cn/mjc/jsq/zqspf/' }
]

function writePlans(plans) { const data = cloud.readToolData('simulation'); cloud.writeToolData('simulation', { ...data, plans }) }
function writeSources(sources) { const data = cloud.readToolData('simulation'); cloud.writeToolData('simulation', { ...data, sources }) }

function readPlans() {
  const records = cloud.readToolData('simulation').plans
  if (!records) return []
  if (!Array.isArray(records)) throw new Error('方案数据格式异常')
  return records.slice().sort((left, right) => right.createdAt - left.createdAt)
}

function readSources() {
  const sources = cloud.readToolData('simulation').sources
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
  writeSources([...sources, source])
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
  if (!Array.isArray(snapshot.matches) || !snapshot.matches.length) throw new Error('请选择比赛')
  if (snapshot.toolId === 'football' && (snapshot.matches.some((match) => !matchPeriod(match)) || planPeriods(snapshot).length !== 1)) throw new Error('一条足球方案只能保存同一期号的比赛')
  const now = Date.now()
  const plan = {
    ...snapshot,
    ...sourceFields(snapshot.planSourceId),
    purchased: false,
    version: 3,
    periodIds: planPeriods(snapshot),
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now
  }
  writePlans([plan, ...readPlans()])
  return plan
}

function replacePlan(id, snapshot) {
  if (!simulationTools.some((tool) => tool.id === snapshot.toolId)) throw new Error('不支持的模拟工具')
  if (!Array.isArray(snapshot.matches) || !snapshot.matches.length) throw new Error('请选择比赛')
  if (snapshot.toolId === 'football' && (snapshot.matches.some((match) => !matchPeriod(match)) || planPeriods(snapshot).length !== 1)) throw new Error('一条足球方案只能保存同一期号的比赛')
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('原方案已删除，无法更新')
  const original = plans[index]
  const updated = {
    ...original, ...snapshot, ...sourceFields(snapshot.planSourceId), version: 3, periodIds: planPeriods(snapshot),
    id: original.id, createdAt: original.createdAt, purchased: original.purchased === true, updatedAt: Date.now()
  }
  delete updated.check
  delete updated.pricingNote
  delete updated.title
  plans[index] = updated
  writePlans(plans)
  return updated
}

function setPlanSource(id, sourceId) {
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，请刷新后重试')
  plans[index] = { ...plans[index], ...sourceFields(sourceId), version: 3, updatedAt: Date.now() }
  writePlans(plans)
}

function setPlanPurchased(id, purchased) {
  if (typeof purchased !== 'boolean') throw new Error('实际购买状态无效')
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，请刷新后重试')
  plans[index] = { ...plans[index], purchased, updatedAt: Date.now() }
  writePlans(plans)
}

function updatePlanTerms(id, passes, multiplier, check) {
  if (!Array.isArray(passes) || !passes.length) throw new Error('请至少选择一种过关方式')
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9999) throw new Error('倍数应为 1 至 9999 的整数')
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，请刷新后重试')
  const plan = plans[index]
  const { calculate } = require('./football-simulation')
  const matches = plan.matches.map((match) => ({ id: String(match.id), options: match.selections || [] }))
  const summary = calculate(matches, passes, multiplier)
  const updated = {
    ...plan, ...summary, passes, multiplier,
    passLabel: passes.map((pass) => pass.label).join(' + '),
    briefPassLabel: passes.map((pass) => pass.id === 'Single' ? '单关' : `${pass.sizes[0]}关`).join('、'),
    updatedAt: Date.now()
  }
  if (check) updated.check = check
  else delete updated.check
  plans[index] = updated
  writePlans(plans)
  return updated
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
  plans[index] = { ...plans[index], check, updatedAt: Date.now() }
  try { writePlans(plans) }
  catch (error) { throw new Error('核对结果保存失败，请检查本机空间') }
}

function completePlanOdds(id, feed) {
  const plans = readPlans()
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) throw new Error('方案已删除，请刷新后重试')
  const plan = plans[index]
  const matches = plan.matches.map((saved) => {
    const current = feed.matches.find((match) => match.id === String(saved.id) && matchPeriod(match) === matchPeriod(saved) && matchNumber(match) === matchNumber(saved))
    if (!current) throw new Error(`${matchPeriod(saved)}期 ${matchNumber(saved)}场未查到同一场比赛，无法补赔率`)
    const selections = saved.selections.map((option) => {
      const pool = current.pools.find((item) => item.id === option.poolId)
      const latest = pool && pool.options.find((item) => item.key === option.key)
      const odds = Number(option.odds) > 0 ? Number(option.odds) : latest && latest.odds
      const goalLine = option.poolId === 'hhad' && (option.goalLine == null || option.goalLine === '') ? pool && pool.goalLine : option.goalLine
      if (!(Number(odds) > 0) || option.poolId === 'hhad' && (goalLine == null || goalLine === '' || !Number.isFinite(Number(goalLine)))) throw new Error(`${matchNumber(saved)}场仍有赔率或让球数未公布，请稍后重试`)
      return { ...option, odds, goalLine, updatedAt: Number(option.odds) > 0 ? option.updatedAt : pool.updatedAt }
    })
    return { ...saved, selections }
  })
  const { calculate } = require('./football-simulation')
  const summary = calculate(matches.map((match) => ({ id: String(match.id), options: match.selections })), plan.passes, Number(plan.multiplier))
  if (summary.count !== Number(plan.count) || summary.needsOdds) throw new Error('补赔率后组合数量不一致，已停止更新')
  plans[index] = { ...plan, ...summary, matches, sourceUpdatedAt: feed.updatedAt, fetchedAt: formatTime(Date.now(), true), pricingNote: '缺失赔率按后续官方查询值补全', updatedAt: Date.now() }
  writePlans(plans)
  return plans[index]
}

function removePlan(id) {
  writePlans(readPlans().filter((plan) => plan.id !== id))
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
    const handicap = option.poolId === 'hhad' ? option.goalLine != null && option.goalLine !== '' ? `[${goal > 0 ? '+' : ''}${goal}]` : '[待让球数]' : ''
    const name = option.poolId === 'hhad' ? `让球${String(option.name || option.key).replace(/^让/, '')}` : option.name || option.key
    row.options.push({ key: option.key, text: `${name}${handicap}(${Number(option.odds) > 0 ? Number(option.odds).toFixed(2) : '待赔率'})` })
  })
  // All markets of one match share the widest row, so a shorter row keeps its column alignment.
  const columns = Math.min(3, Math.max(1, ...rows.map((row) => row.options.length)))
  return rows.map((row) => ({ ...row, columns }))
}

function formatPlanForDisplay(plan) {
  // Derive the compact view from snapshot fields; do not rewrite old records or fetch new odds.
  const periodIds = planPeriods(plan)
  return { ...plan, purchased: plan.purchased === true, needsOdds: plan.matches.some((match) => (match.selections || []).some((option) => !(Number(option.odds) > 0) || option.poolId === 'hhad' && (option.goalLine == null || option.goalLine === '' || !Number.isFinite(Number(option.goalLine))))), passLabel: String(plan.passLabel || '').replace(/单场/g, '单关').replace(/(\d+)场组合/g, '$1串1'), planSourceId: plan.planSourceId || '', planSourceName: plan.planSourceName || '', periodIds, periodLabel: periodIds.join('、'), createdTime: formatTime(plan.createdAt), checkedTime: plan.check ? formatTime(plan.check.checkedAt) : '', matches: plan.matches.map((match) => {
    const selectionText = String(match.selectionText || '').replace(/\s*\[(?:仅串关|可单关)\]/g, '').replace(/(?:让球胜平负|胜平负|总进球|半全场|比分)\s*/g, '')
    const selectionRows = Array.isArray(match.selections) && match.selections.length ? formatSelectionRows(match.selections)
      : [{ id: 'legacy', columns: 1, options: [{ key: 'legacy', text: selectionText }] }]
    return { ...match, period: matchPeriod(match), numberCode: matchNumber(match), selectionText, selectionRows }
  }) }
}

module.exports = { simulationTools, readPlans, savePlan, replacePlan, removePlan, savePlanCheck, completePlanOdds, setPlanPurchased, updatePlanTerms, readSources, createSource, setPlanSource, matchPeriod, matchNumber, planPeriods, formatTime, formatSelectionRows, formatPlanForDisplay }
