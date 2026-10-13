const { POOLS, combinations, roundPrize } = require('./football-simulation')
const { matchPeriod, matchNumber } = require('./simulation-plans')

const LIST_URL = 'https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry'
const DETAIL_URL = 'https://webapi.sporttery.cn/gateway/uniform/fb/getMatchGeneral.qry'
const RESULT_POOLS = ['had', 'hhad', 'crs', 'ttg', 'hafu'].map((id) => POOLS.find((pool) => pool.id === id))
const RESULT_UNAVAILABLE_MESSAGE = '结果还未公示或未查到，请稍后再试'

function requestValue(url, data) {
  return new Promise((resolve, reject) => wx.request({
    url, data: { ...data, _t: Date.now() }, header: { 'Cache-Control': 'no-cache' }, timeout: 15000,
    success: (res) => {
      if (res.statusCode !== 200 || !res.data || String(res.data.errorCode) !== '0' || !res.data.value) {
        reject(new Error('官方赛果接口暂时不可用，请稍后重试')); return
      }
      resolve(res.data.value)
    },
    fail: (error) => reject(new Error(/domain|合法域名/.test(error.errMsg || '') ? '请配置 request 合法域名 https://webapi.sporttery.cn' : '赛果查询失败，请检查网络后重试'))
  }))
}

async function queryDate(date) {
  const matches = []
  // Date filtering is by kick-off date, not issue date. Follow the official pagination.
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const value = await requestValue(LIST_URL, { method: 'result', matchDate: date, pageSize: 100, ...(pageNo > 1 ? { pageNo, pageType: '1' } : {}) })
    const groups = value.matchInfoList || []
    if (!Array.isArray(groups)) throw new Error('官方赛果列表格式异常')
    matches.push(...groups.reduce((all, group) => all.concat((group.subMatchList || []).map((match) => ({ ...match, matchNumDate: match.matchNumDate || group.matchNumDate }))), []))
    if (String(value.nextPage || '0') === '0') return matches
  }
  throw new Error('赛果列表尚未查询完整，请稍后重试')
}

function resultKey(poolId, combination, description) {
  const value = String(combination || '').trim().toUpperCase()
  if (poolId === 'had' || poolId === 'hhad') return /^[HDA]$/.test(value) ? value.toLowerCase() : ''
  if (poolId === 'hafu') return /^[HDA]:[HDA]$/.test(value) ? value.replace(':', '').toLowerCase() : ''
  if (poolId === 'ttg') return /^[0-6]$/.test(value) ? `s${value}` : /^7\+?$/.test(value) ? 's7' : ''
  if (poolId === 'crs') {
    const other = value.match(/-([HDA])$/)
    if (other) return `s1s${other[1].toLowerCase()}`
    const score = value.match(/^(\d+):(\d+)$/)
    if (score) {
      const key = `s${score[1].padStart(2, '0')}s${score[2].padStart(2, '0')}`
      if (POOLS.find((pool) => pool.id === 'crs').options.some(([option]) => option === key)) return key
    }
    const text = String(description || '')
    if (/其[他它]/.test(text)) return text.startsWith('胜') ? 's1sh' : text.startsWith('平') ? 's1sd' : text.startsWith('负') ? 's1sa' : ''
  }
  return ''
}

function normalizeResult(snapshot, candidate, detail = {}) {
  const statusCode = String(detail.matchStatus || candidate && candidate.matchStatus || '')
  const status = statusCode === '13' ? 'cancelled' : statusCode === '12' ? 'suspended' : ['10', '11'].includes(statusCode) ? 'published' : 'pending'
  const list = Array.isArray(detail.matchResultList) ? detail.matchResultList : []
  const scoreResult = list.find((item) => String(item.poolCode).toLowerCase() === 'crs')
  const resultScore = scoreResult && /^\d+:\d+$/.test(String(scoreResult.combination)) ? scoreResult.combination : ''
  const pools = RESULT_POOLS.map((pool) => {
    const raw = list.find((item) => String(item.poolCode).toLowerCase() === pool.id) || {}
    const key = status === 'published' ? resultKey(pool.id, raw.combination, raw.combinationDesc) : ''
    const line = String(raw.combinationDesc || '').trim().match(/^[（(]([+-]?\d+(?:\.\d+)?)[）)]/)
    const goalLine = line ? line[1] : null
    const name = pool.id === 'hhad' ? `让球${goalLine !== null ? '(' + goalLine + ')' : ''}` : pool.name
    let resultText = status === 'cancelled' ? '无效场次' : status === 'suspended' ? '结果暂不可核对' : key ? String(raw.combinationDesc || raw.combination).trim().replace(/^[（(][^）)]*[）)]/, '') : '待公布'
    if (pool.id === 'hafu' && key) resultText = resultText.length === 2 ? resultText[0] + '-' + resultText[1] : resultText
    return { id: pool.id, name, key, goalLine, resultText, odds: key && Number(raw.odds) > 0 ? Number(raw.odds).toFixed(2) : '-', state: status === 'cancelled' ? 'void' : key ? 'settled' : 'pending' }
  })
  return {
    matchId: String(snapshot.id), period: matchPeriod(snapshot), number: matchNumber(snapshot),
    label: snapshot.label, league: candidate && candidate.leagueAbbName || snapshot.league,
    home: candidate && candidate.homeTeamAbbName || snapshot.home, away: candidate && candidate.awayTeamAbbName || snapshot.away,
    fullScore: candidate && candidate.sectionsNo999 || detail.sectionsNo999 || resultScore || '—',
    halfScore: candidate && candidate.sectionsNo1 || detail.sectionsNo1 || '—',
    status, statusLabel: status === 'suspended' ? '结果暂不可核对' : detail.matchStatusName || candidate && candidate.matchStatusName || '暂未查询到赛果', pools,
    fetchedAt: Date.now()
  }
}

function hasCheckableResult(results) {
  return Array.isArray(results) && results.some((result) => ['published', 'cancelled'].includes(result.status))
}

async function checkPlan(plan) {
  if (!Array.isArray(plan.matches) || !plan.matches.length || !Array.isArray(plan.passes)) throw new Error('方案缺少完整选择数据，无法核对')
  const byDate = new Map()
  for (const match of plan.matches) {
    if (!matchPeriod(match) || !matchNumber(match) || !/^\d{4}-\d{2}-\d{2}$/.test(String(match.date || ''))) throw new Error('历史方案缺少期号或比赛日期，无法准确核对')
    if (!byDate.has(match.date)) byDate.set(match.date, await queryDate(match.date))
  }
  const results = []
  for (const match of plan.matches) {
    const candidate = byDate.get(match.date).find((item) => matchPeriod(item) === matchPeriod(match) && matchNumber(item) === matchNumber(match))
    if (!candidate) {
      // An issue/number/ID binding was captured at save time. Use its stable ID for
      // rescheduled matches; the detail API echoes matchStatus, so only real winning keys establish publication.
      let detail
      try { detail = await requestValue(DETAIL_URL, { matchId: match.id, matchStatus: '11' }) }
      catch (error) {
        if (/合法域名|网络/.test(error.message || '')) throw error
        throw new Error(RESULT_UNAVAILABLE_MESSAGE)
      }
      if (String(detail.matchId) !== String(match.id)) throw new Error('历史比赛赛果身份不一致，请稍后重试')
      const published = Array.isArray(detail.matchResultList) && detail.matchResultList.some((pool) => resultKey(String(pool.poolCode).toLowerCase(), pool.combination, pool.combinationDesc))
      const previous = (plan.check && plan.check.results || []).find((item) => item.matchId === String(match.id) && item.period === matchPeriod(match) && item.number === matchNumber(match) && item.status === 'published')
      const result = normalizeResult(match, null, { ...detail, matchStatus: published ? '11' : '', matchStatusName: published ? '已公布赛果' : '赛果暂未公布' })
      results.push(!published && previous ? { ...previous, fromCache: true } : { ...result, lookupBySavedId: true })
      continue
    }
    if (String(candidate.matchId) !== String(match.id)) throw new Error(`${matchPeriod(match)}期 ${matchNumber(match)}场比赛身份不一致，已停止核对`)
    const detail = await requestValue(DETAIL_URL, { matchId: candidate.matchId, matchStatus: candidate.matchStatus })
    if (String(detail.matchId) !== String(candidate.matchId)) throw new Error('官方赛果详情身份不一致，请稍后重试')
    results.push(normalizeResult(match, candidate, detail))
  }
  if (!hasCheckableResult(results)) throw new Error(RESULT_UNAVAILABLE_MESSAGE)
  return { version: 1, checkedAt: Date.now(), results, ...settlePlan(plan, results) }
}

function gradeOption(option, result) {
  if (!result || result.status === 'suspended') return { state: 'pending', odds: 0, reason: result && result.status === 'suspended' ? '结果暂不可核对' : '未查询到完整赛果' }
  const pool = result.pools.find((item) => item.id === option.poolId)
  if (!pool || pool.state === 'pending') return { state: 'pending', odds: 0, reason: '未查询到完整赛果' }
  if (pool.state === 'void') return { state: 'void', odds: 1 }
  // A changed handicap cannot be compared with a different official market's winning key.
  if (option.poolId === 'hhad' && (pool.goalLine === null || option.goalLine == null || Number(pool.goalLine) !== Number(option.goalLine))) return { state: 'pending', odds: 0, reason: '让球数与方案不一致' }
  return { state: option.key === pool.key ? 'won' : 'lost', odds: Number(option.odds) }
}

function prizeAmount(odds, validLegs, multiplier) {
  const cap = validLegs <= 1 ? Infinity : validLegs <= 3 ? 200000 : validLegs <= 5 ? 500000 : 1000000
  return Math.min(roundPrize(odds * 2), cap) * multiplier
}

function gradeEntry(legs, results, multiplier) {
  const grades = legs.map((option) => gradeOption(option, results.find((result) => result.matchId === String(option.matchId))))
  if (grades.some((grade) => grade.state === 'lost')) return { status: 'lost', statusLabel: '与赛果不匹配', prize: '0.00' }
  if (grades.some((grade) => grade.state === 'pending')) return { status: 'pending', statusLabel: grades.find((grade) => grade.state === 'pending').reason || '待确认赛果', prize: null }
  const validLegs = grades.filter((grade) => grade.state !== 'void').length
  const prize = prizeAmount(grades.reduce((value, grade) => value * grade.odds, 1), validLegs, multiplier)
  return { status: validLegs ? 'won' : 'void', statusLabel: validLegs ? '与赛果匹配' : '无效组合模拟返还', prize: prize.toFixed(2) }
}

function settlePlan(plan, results) {
  const multiplier = Number(plan.multiplier)
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9999) throw new Error('方案倍数异常，无法核对')
  let totalCount = 0, wonCount = 0, pendingCount = 0, refundCount = 0, prizeCents = 0, refundCents = 0
  let allPublished = true
  const pendingReasons = new Set()
  const matches = plan.matches.map((match) => {
    if (!Array.isArray(match.selections) || !match.selections.length || match.selections.some((option) => !Number.isFinite(Number(option.odds)) || Number(option.odds) <= 0)) throw new Error('方案赔率快照不完整，无法核对')
    const result = results.find((item) => item.matchId === String(match.id))
    const options = match.selections.map((option) => ({ ...option, ...gradeOption(option, result) }))
    options.filter((option) => option.state === 'pending').forEach((option) => { allPublished = false; pendingReasons.add(option.reason) })
    return { ...match, options }
  })
  for (const pass of plan.passes) {
    if (!Array.isArray(pass.sizes) || pass.sizes.some((size) => !Number.isInteger(size) || size < 1 || size > matches.length)) throw new Error('方案组合方式异常，无法核对')
    for (const size of pass.sizes) {
      for (const group of combinations(matches, size)) {
        const choices = group.map((match) => match.options.filter((option) => size !== 1 || option.single))
        const total = choices.reduce((value, options) => value * options.length, 1)
        const confirmed = choices.reduce((value, options) => value * options.filter((option) => ['won', 'void'].includes(option.state)).length, 1)
        const possible = choices.reduce((value, options) => value * options.filter((option) => option.state !== 'lost').length, 1)
        const refunds = choices.reduce((value, options) => value * options.filter((option) => option.state === 'void').length, 1)
        totalCount += total; wonCount += confirmed - refunds; pendingCount += possible - confirmed; refundCount += refunds
        refundCents += refunds * 200 * multiplier
        // Collapse equal winning odds, especially cancelled matches, to avoid enumerating millions of losing tickets.
        const winning = choices.map((options) => {
          const values = new Map()
          options.filter((option) => ['won', 'void'].includes(option.state)).forEach((option) => {
            const key = `${option.odds}:${option.state === 'void'}`
            const item = values.get(key) || { odds: option.odds, valid: option.state === 'void' ? 0 : 1, count: 0 }
            item.count += 1; values.set(key, item)
          })
          return [...values.values()]
        })
        function sum(index, odds, validLegs, count) {
          if (index === winning.length) {
            if (validLegs) prizeCents += Math.round(prizeAmount(odds, validLegs, multiplier) * 100) * count
            return
          }
          winning[index].forEach((option) => sum(index + 1, odds * option.odds, validLegs + option.valid, count * option.count))
        }
        sum(0, 1, 0, 1)
      }
    }
  }
  if (totalCount !== Number(plan.count)) throw new Error('方案组合数与选择快照不一致，无法核对')
  if (!Number.isSafeInteger(prizeCents) || !Number.isSafeInteger(refundCents) || !Number.isSafeInteger(prizeCents + refundCents)) throw new Error('核对金额过大，无法准确计算')
  return { status: allPublished ? 'complete' : 'partial', statusLabel: allPublished ? '核对完成' : '部分结果待确认', pendingReason: [...pendingReasons].join('、'), totalCount, wonCount, pendingCount, refundCount,
    lostCount: totalCount - wonCount - pendingCount - refundCount, prizeAmount: (prizeCents / 100).toFixed(2), refundAmount: (refundCents / 100).toFixed(2), returnAmount: ((prizeCents + refundCents) / 100).toFixed(2) }
}

module.exports = { checkPlan, gradeEntry, hasCheckableResult, RESULT_UNAVAILABLE_MESSAGE }
