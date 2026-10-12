// The official calculator uses channel=c; pool.single/allUp depend on this channel.
const API_URL = 'https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry'
const POOLS = [
  { id: 'had', name: '胜平负', maxLegs: 8, options: [['h', '胜'], ['d', '平'], ['a', '负']] },
  { id: 'hhad', name: '让球胜平负', maxLegs: 8, options: [['h', '让胜'], ['d', '让平'], ['a', '让负']] },
  { id: 'ttg', name: '总进球', maxLegs: 6, options: Array.from({ length: 8 }, (_, n) => [`s${n}`, n === 7 ? '7+球' : `${n}球`]) },
  { id: 'hafu', name: '半全场', maxLegs: 4, options: [['hh', '胜胜'], ['hd', '胜平'], ['ha', '胜负'], ['dh', '平胜'], ['dd', '平平'], ['da', '平负'], ['ah', '负胜'], ['ad', '负平'], ['aa', '负负']] },
  { id: 'crs', name: '比分', maxLegs: 4, options: [
    ['s01s00','1:0'], ['s02s00','2:0'], ['s02s01','2:1'], ['s03s00','3:0'], ['s03s01','3:1'], ['s03s02','3:2'], ['s04s00','4:0'], ['s04s01','4:1'], ['s04s02','4:2'], ['s05s00','5:0'], ['s05s01','5:1'], ['s05s02','5:2'], ['s1sh','胜其他'],
    ['s00s00','0:0'], ['s01s01','1:1'], ['s02s02','2:2'], ['s03s03','3:3'], ['s1sd','平其他'],
    ['s00s01','0:1'], ['s00s02','0:2'], ['s01s02','1:2'], ['s00s03','0:3'], ['s01s03','1:3'], ['s02s03','2:3'], ['s00s04','0:4'], ['s01s04','1:4'], ['s02s04','2:4'], ['s00s05','0:5'], ['s01s05','1:5'], ['s02s05','2:5'], ['s1sa','负其他']
  ] }
]
// Compound pass decomposition, matching the official calculator's optionAry.
const COMPOUND = {
  '3x3':[2], '3x4':[2,3], '4x4':[3], '4x5':[3,4], '4x6':[2], '4x11':[2,3,4],
  '5x5':[4], '5x6':[4,5], '5x10':[2], '5x16':[3,4,5], '5x20':[2,3], '5x26':[2,3,4,5],
  '6x6':[5], '6x7':[5,6], '6x15':[2], '6x20':[3], '6x22':[4,5,6], '6x35':[2,3], '6x42':[3,4,5,6], '6x50':[2,3,4], '6x57':[2,3,4,5,6],
  '7x7':[6], '7x8':[6,7], '7x21':[5], '7x35':[4], '7x120':[2,3,4,5,6,7],
  '8x8':[7], '8x9':[7,8], '8x28':[6], '8x56':[5], '8x70':[4], '8x247':[2,3,4,5,6,7,8]
}

function normalizeFeed(response) {
  if (!response || String(response.errorCode) !== '0' || !response.value || !Array.isArray(response.value.matchInfoList)) throw new Error('官方赛事数据格式异常')
  const value = response.value
  const matches = value.matchInfoList.reduce((all, group) => all.concat(group.subMatchList || []), [])
    .filter((match) => !Number(match.isHide) && match.matchStatus === 'Selling')
    .map((match) => {
      const pools = POOLS.map((definition) => {
        const flags = (match.poolList || []).find((pool) => String(pool.poolCode).toLowerCase() === definition.id)
        if (!flags || flags.poolStatus !== 'Selling') return null
        const odds = match[definition.id] || {}
        const single = Number(flags.single) === 1 && permittedSingle(definition.id, value.allUpList || {})
        const allUp = Number(flags.allUp) === 1
        if (!single && !allUp) return null
        const options = definition.options.map(([key, name]) => ({ key, name, odds: Number(odds[key]), oddsText: String(odds[key] || ''), selected: false }))
          .filter((option) => Number.isFinite(option.odds) && option.odds > 0)
        if (!options.length) return null
        return { id: definition.id, name: definition.name, maxLegs: definition.maxLegs, single, allUp, goalLine: definition.id === 'hhad' ? String(odds.goalLine || '0') : '', updatedAt: `${odds.updateDate || ''} ${odds.updateTime || ''}`.trim(), options }
      }).filter(Boolean)
      return { id: String(match.matchId), number: match.matchNumStr, businessDate: match.businessDate, date: match.matchDate, time: String(match.matchTime).slice(0,5), league: match.leagueAbbName, home: match.homeTeamAbbName, away: match.awayTeamAbbName, pools }
    }).filter((match) => match.pools.length)
  return { matches, rules: value.allUpList || {}, updatedAt: value.lastUpdateTime || '' }
}

function selectedMatches(matches, selections) {
  return matches.map((match) => {
    const options = match.pools.reduce((all, pool) => all.concat(pool.options.filter((option) => selections[`${match.id}:${pool.id}:${option.key}`]).map((option) => ({ ...option, poolId: pool.id, poolName: pool.name, goalLine: pool.goalLine, single: pool.single, allUp: pool.allUp, maxLegs: pool.maxLegs, updatedAt: pool.updatedAt }))), [])
    return { ...match, options }
  }).filter((match) => match.options.length)
}

function availablePasses(matches, rules, mode) {
  if (!matches.length) return []
  const options = matches.reduce((all, match) => all.concat(match.options), [])
  const pools = [...new Set(options.map((option) => option.poolId))]
  const permitted = (formula, type) => pools.every((pool) => (rules[pool.toUpperCase()] || []).some((rule) => Number(rule.fValue) === 1 && rule.formula === formula && Number(rule.formulaType) === type))
  const passes = []
  // Single entries are eligible per option; a mixed record may contain both single and parlay-only choices.
  if (options.some((option) => option.single && permittedSingle(option.poolId, rules))) passes.push({ id: 'Single', label: '单关', sizes: [1] })
  const limit = Math.min(8, ...options.map((option) => option.maxLegs))
  if (options.every((option) => option.allUp)) {
    if (mode === 'compound') {
      const n = matches.length
      if (n >= 2 && n <= limit) {
        const candidates = [`${n}x1`, ...Object.keys(COMPOUND).filter((id) => id.startsWith(`${n}x`))]
        candidates.forEach((id) => { if (permitted(id, 1)) passes.push({ id, label: id.replace('x', '串'), sizes: COMPOUND[id] || [n] }) })
      }
    } else {
      for (let n = 2; n <= Math.min(matches.length, limit); n += 1) if (permitted(`${n}x1`, 2)) passes.push({ id: `${n}x1`, label: `${n}串1`, sizes: [n] })
    }
  }
  return passes
}

function permittedSingle(poolId, rules) {
  return (rules[poolId.toUpperCase()] || []).some((rule) => rule.formula === 'Single' && Number(rule.fValue) === 1)
}

function combinations(items, size) {
  const result = []
  function visit(start, group) {
    if (group.length === size) { result.push(group); return }
    for (let i = start; i <= items.length - size + group.length; i += 1) visit(i + 1, group.concat(items[i]))
  }
  visit(0, [])
  return result
}

function outcome(home, away) { return home > away ? 'h' : home === away ? 'd' : 'a' }

// Each state is a feasible result, including unavoidable wins when all outcomes are covered.
function winningStates(match) {
  const options = match.options
  const handicap = Number((options.find((option) => option.poolId === 'hhad') || {}).goalLine || 0)
  const bound = Math.max(8, Math.abs(handicap) + 7)
  const scoreKeys = new Set(POOLS.find((pool) => pool.id === 'crs').options.map(([key]) => key))
  const states = new Map()
  for (let home = 0; home <= bound; home += 1) {
    for (let away = 0; away <= bound; away += 1) {
      const full = outcome(home, away)
      const scoreKey = `s${String(home).padStart(2,'0')}s${String(away).padStart(2,'0')}`
      const crs = scoreKeys.has(scoreKey) ? scoreKey : `s1s${full}`
      const halfOutcomes = ['d', ...(home > 0 ? ['h'] : []), ...(away > 0 ? ['a'] : [])]
      halfOutcomes.forEach((half) => {
        const keys = { had: full, hhad: outcome(home + handicap, away), ttg: `s${Math.min(home + away,7)}`, crs, hafu: half + full }
        const winners = options.filter((option) => keys[option.poolId] === option.key)
        const all = winners.reduce((total, option) => total + option.odds, 0)
        const single = winners.reduce((total, option) => total + (option.single ? option.odds : 0), 0)
        states.set(`${all}:${single}`, { all, single })
      })
    }
  }
  return [...states.values()]
}

function prizeRange(matches, sizes, multiplier) {
  const states = matches.map(winningStates)
  const singleCount = sizes.filter((size) => size === 1).length
  const frequencies = new Array(matches.length + 1).fill(0)
  sizes.filter((size) => size > 1).forEach((size) => { frequencies[size] += 1 })
  const hasParlay = frequencies.some(Boolean)
  // The payout is a monotone polynomial. Keep only Pareto extrema; for the minimum,
  // retain losing and winning states separately so zero cannot erase the lowest positive payout.
  function frontier(list, maximum) {
    return list.filter((state, index) => !list.some((other, otherIndex) => {
      if (otherIndex === index) return false
      if (!maximum && ((state.all > 0) !== (other.all > 0) || (state.single > 0) !== (other.single > 0))) return false
      const a = hasParlay ? state.all : 0
      const b = singleCount ? state.single : 0
      const x = hasParlay ? other.all : 0
      const y = singleCount ? other.single : 0
      return maximum ? x >= a && y >= b && (x > a || y > b || otherIndex < index && x === a && y === b)
        : x <= a && y <= b && (x < a || y < b || otherIndex < index && x === a && y === b)
    }))
  }
  function extreme(maximum) {
    const candidates = states.map((list) => frontier(list, maximum))
    let best = maximum ? 0 : Infinity
    function visit(index, products, singleSum) {
      if (index === candidates.length) {
        const prize = singleSum * singleCount + products.reduce((sum, product, size) => sum + product * frequencies[size], 0)
        if (prize > 0) best = maximum ? Math.max(best, prize) : Math.min(best, prize)
        return
      }
      candidates[index].forEach((state) => {
        const next = products.slice()
        for (let size = index + 1; size >= 1; size -= 1) next[size] += products[size - 1] * state.all
        visit(index + 1, next, singleSum + state.single)
      })
    }
    const products = new Array(matches.length + 1).fill(0)
    products[0] = 1
    visit(0, products, 0)
    return (Number.isFinite(best) ? best : 0) * 2 * multiplier
  }
  return { minReturn: extreme(false).toFixed(2), maxReturn: extreme(true).toFixed(2) }
}

function calculate(matches, passes, multiplier) {
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9999) throw new Error('倍数应为 1 至 9999 的整数')
  if (!matches.length || !passes.length) throw new Error('请选择比赛及可用的过关方式')
  if (matches.length > 8) throw new Error('最多选择 8 场比赛')
  if (new Set(matches.map((match) => match.id)).size !== matches.length) throw new Error('同场比赛不能重复作为串关场次')
  let count = 0
  let capped = false
  passes.forEach((pass) => pass.sizes.forEach((size) => {
    if (size === 1) {
      matches.forEach((match) => { count += match.options.filter((option) => option.single).length })
      return
    }
    if (matches.some((match) => match.options.some((option) => !option.allUp || size > option.maxLegs))) throw new Error('所选玩法不支持该串关方式')
    combinations(matches, size).forEach((group) => {
      const entries = group.reduce((n, match) => n * match.options.length, 1)
      count += entries
      const estimate = group.reduce((amount, match) => amount * Math.max(...match.options.map((option) => option.odds)), 2)
      const perEntryCap = size <= 3 ? 200000 : size <= 5 ? 500000 : 1000000
      if (estimate > perEntryCap) capped = true
    })
  }))
  if (!count) throw new Error('所选记录不支持当前过关方式')
  if (!Number.isSafeInteger(count * 2 * multiplier)) throw new Error('组合金额过大，请减少选项或倍数')
  return { count, cost: (count * 2 * multiplier).toFixed(2), ...prizeRange(matches, passes.reduce((all, pass) => all.concat(pass.sizes), []), multiplier), capped }
}

function roundPrize(value) {
  // Official calculator rounding: two decimals, midpoint ties to even.
  const scaled = Number(value.toFixed(8)) * 100
  const floor = Math.floor(scaled)
  const fraction = scaled - floor
  if (Math.abs(fraction - 0.5) < 1e-6) return (floor + floor % 2) / 100
  return Math.round(scaled) / 100
}

function previewEntries(matches, passes, multiplier, offset = 0, limit = 30) {
  const rows = []
  let skipped = 0
  for (const pass of passes) {
    for (const size of pass.sizes) {
      for (const group of combinations(matches, size)) {
        const choices = group.map((match) => match.options.filter((option) => size !== 1 || option.single))
        const count = choices.reduce((value, options) => value * options.length, 1)
        if (skipped + count <= offset) { skipped += count; continue }
        for (let index = Math.max(0, offset - skipped); index < count; index += 1) {
          let cursor = index
          const selected = new Array(group.length)
          for (let i = group.length - 1; i >= 0; i -= 1) {
            selected[i] = choices[i][cursor % choices[i].length]
            cursor = Math.floor(cursor / choices[i].length)
          }
          const odds = selected.reduce((value, option) => value * option.odds, 1)
          const cap = size === 1 ? Infinity : size <= 3 ? 200000 : size <= 5 ? 500000 : 1000000
          // Alternatives for one match remain one leg. Group the detail view by the
          // chosen market on each leg, rather than combining two markets into one ticket.
          const marketChoices = choices.map((options, i) => options.filter((option) => option.poolId === selected[i].poolId))
          const formatChoice = (option) => `${option.name || option.key}${option.poolId === 'hhad' ? '[' + option.goalLine + ']' : ''}(${Number(option.odds).toFixed(2)})`
          rows.push({
            id: String(skipped + index), label: `${size === 1 ? '单关' : `${size}串1`} · 第 ${skipped + index + 1} 注`,
            choices: selected.map((option, i) => `${group[i].number || group[i].id} ${formatChoice(option)}`).join(' × '),
            groupId: JSON.stringify([pass.id, size, group.map((match, i) => [match.id, selected[i].poolId])]),
            groupLabel: size === 1 ? '单关' : `${size}串1`,
            groupChoices: marketChoices.map((options, i) => `${group[i].number || group[i].id} ${options.map(formatChoice).join('、')}`).join(' ＋ '),
            groupCount: marketChoices.reduce((value, options) => value * options.length, 1),
            returnAmount: (Math.min(roundPrize(odds * 2), cap) * multiplier).toFixed(2)
          })
          if (rows.length >= limit) return rows
        }
        skipped += count
      }
    }
  }
  return rows
}

module.exports = { API_URL, POOLS, COMPOUND, normalizeFeed, selectedMatches, availablePasses, calculate, previewEntries }
