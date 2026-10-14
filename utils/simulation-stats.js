const { planPeriods, formatTime } = require('./simulation-plans')

function cents(value, field) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value))) throw new Error(`历史方案${field}格式异常，无法统计`)
  const amount = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(amount)) throw new Error(`历史方案${field}超出统计范围`)
  return amount
}

function money(value) { return (value / 100).toFixed(2) }

function periodDate(period) {
  const value = String(period)
  const date = `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`
  const parsed = new Date(`${date}T12:00:00`)
  return /^\d{6}$/.test(value) && !Number.isNaN(parsed.getTime()) && formatTime(parsed.getTime()).slice(0, 10) === date ? date : ''
}

function planRows(plans, toolId) {
  return plans.filter((plan) => plan.toolId === toolId && plan.purchased === true).map((plan) => {
    const cost = cents(plan.cost, '投入金额')
    const createdAt = Number(plan.createdAt)
    if (!Number.isFinite(createdAt) || createdAt <= 0 || Number.isNaN(new Date(createdAt).getTime())) throw new Error('历史方案保存时间异常，无法统计')
    const createdDate = formatTime(createdAt).slice(0, 10)
    const periods = planPeriods(plan)
    const periodId = periods.length ? periods[periods.length - 1] : 'unknown'
    const periodGroupLabel = periodId === 'unknown' ? '未记录期号' : `${periodId}期`
    const periodLabel = periods.length > 1 ? `${periodGroupLabel}（跨期含 ${periods.slice().reverse().join('、')}）` : periodGroupLabel
    const checked = plan.check && plan.check.status === 'complete'
    const returned = checked ? cents(plan.check.returnAmount, '核对回报金额') : 0
    const prize = checked ? cents(plan.check.prizeAmount, '中奖金额') : 0
    return { id: plan.id, toolId, sourceId: plan.planSourceId || '', sourceName: plan.planSourceName || '未关联来源',
      periodId, periodGroupLabel, periodLabel, createdDate, createdTime: formatTime(createdAt), periodDate: periodId === 'unknown' ? createdDate : periodDate(periodId) || createdDate,
      cost, returned, checked: Boolean(checked), won: Boolean(checked && prize > 0), profit: checked ? Math.max(returned - cost, 0) : 0,
      loss: checked ? Math.max(cost - returned, 0) : 0 }
  })
}

function aggregate(rows) {
  const value = rows.reduce((total, row) => {
    total.planCount += 1
    total.cost += row.cost
    if (row.checked) {
      total.checkedCount += 1
      total.checkedCost += row.cost
      total.returned += row.returned
      total.profit += row.profit
      total.loss += row.loss
      if (row.won) total.wonCount += 1
    } else total.pendingCost += row.cost
    return total
  }, { planCount: 0, checkedCount: 0, wonCount: 0, cost: 0, checkedCost: 0, pendingCost: 0, returned: 0, profit: 0, loss: 0 })
  if (![value.cost, value.checkedCost, value.pendingCost, value.returned, value.profit, value.loss].every(Number.isSafeInteger)) throw new Error('统计金额超出安全范围')
  return { planCount: value.planCount, checkedCount: value.checkedCount, pendingCount: value.planCount - value.checkedCount, wonCount: value.wonCount,
    cost: money(value.cost), checkedCost: money(value.checkedCost), pendingCost: money(value.pendingCost), returned: money(value.returned),
    profit: money(value.profit), loss: money(value.loss), net: money(value.returned - value.checkedCost), netPositive: value.returned >= value.checkedCost }
}

function groupRows(rows, keyOf, labelOf) {
  const groups = new Map()
  rows.forEach((row) => {
    const id = keyOf(row)
    if (!groups.has(id)) groups.set(id, { id, label: labelOf(row), rows: [] })
    groups.get(id).rows.push(row)
  })
  return [...groups.values()].map((group) => ({ ...group, summary: aggregate(group.rows) }))
}

function filterRows(rows, year, month, dateField) {
  return rows.filter((row) => {
    const date = row[dateField]
    return (!year || date.slice(0, 4) === year) && (!month || date.slice(5, 7) === month)
  })
}

module.exports = { planRows, aggregate, groupRows, filterRows, money }
