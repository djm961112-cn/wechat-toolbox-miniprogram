const { POOLS, combinations, roundPrize } = require('./football-simulation')
const { matchPeriod, matchNumber } = require('./simulation-plans')

const LIST_URL = 'https://webapi.sporttery.cn/gateway/uniform/fb/getMatchDataPageListV1.qry'
const DETAIL_URL = 'https://webapi.sporttery.cn/gateway/uniform/fb/getMatchGeneral.qry'
const RESULT_POOLS = ['had', 'hhad', 'crs', 'ttg', 'hafu'].map((id) => POOLS.find((pool) => pool.id === id))
const RESULT_UNAVAILABLE_MESSAGE = '比赛未结束'

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

async function queryDate(date, method = 'result') {
  const matches = []
  // Date filtering is by kick-off date, not issue date. Follow the official pagination.
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const value = await requestValue(LIST_URL, { method, matchDate: date, pageSize: 100, ...(pageNo > 1 ? { pageNo, pageType: '1' } : {}) })
    const groups = value.matchInfoList || []
    if (!Array.isArray(groups)) throw new Error('官方比赛列表格式异常')
    matches.push(...groups.reduce((all, group) => all.concat((group.subMatchList || []).map((match) => ({ ...match, matchNumDate: match.matchNumDate || group.matchNumDate }))), []))
    if (method === 'live' || String(value.nextPage || '0') === '0') return matches
  }
  throw new Error('赛果列表尚未查询完整，请稍后重试')
}

function scorePair(value) {
  const found = String(value || '').trim().match(/^(\d{1,2}):(\d{1,2})$/)
  return found ? [Number(found[1]), Number(found[2])] : null
}

function scoreOutcome(home, away) { return home > away ? 'h' : home === away ? 'd' : 'a' }

function scorePoolKey(poolId, full, half, goalLine) {
  if (!full) return ''
  const [home, away] = full
  if (poolId === 'had') return scoreOutcome(home, away)
  if (poolId === 'hhad') return goalLine === null ? '' : scoreOutcome(home + Number(goalLine), away)
  if (poolId === 'ttg') return `s${Math.min(home + away, 7)}`
  if (poolId === 'hafu') return half ? scoreOutcome(...half) + scoreOutcome(home, away) : ''
  if (poolId === 'crs') {
    const exact = `s${String(home).padStart(2, '0')}s${String(away).padStart(2, '0')}`
    return POOLS.find((pool) => pool.id === 'crs').options.some(([key]) => key === exact) ? exact : `s1s${scoreOutcome(home, away)}`
  }
  return ''
}

function resultTextFromKey(pool, key, goalLine) {
  const definition = POOLS.find((item) => item.id === pool)
  const option = definition && definition.options.find(([value]) => value === key)
  if (!option) return '待公布'
  if (pool === 'hhad') return option[1].replace(/^让/, '')
  if (pool === 'hafu') return option[1].replace(/^(.)/, '$1-')
  return option[1].replace(/球$/, '')
}

// The live list contains provisional scores. Official status 6 means live ended;
// result statuses 10/11 are also terminal. Only these statuses may produce
// winning keys, derived from the final score and saved handicap.
function normalizeLiveResult(snapshot, candidate) {
  const statusCode = String(candidate.matchStatus || '')
  const terminal = ['6', '10', '11'].includes(statusCode)
  const full = scorePair(candidate.sectionsNo999)
  const half = scorePair(candidate.sectionsNo1)
  const pools = RESULT_POOLS.map((pool) => {
    const selectedHandicap = (snapshot.selections || []).find((option) => option.poolId === 'hhad')
    const line = selectedHandicap && selectedHandicap.goalLine != null && Number.isFinite(Number(selectedHandicap.goalLine)) ? String(selectedHandicap.goalLine) : null
    const goalLine = pool.id === 'hhad' ? line : null
    const key = terminal ? scorePoolKey(pool.id, full, half, goalLine) : ''
    return { id: pool.id, name: pool.id === 'hhad' ? `让球${line === null ? '' : '(' + line + ')'}` : pool.name,
      key, goalLine, resultText: key ? resultTextFromKey(pool.id, key, goalLine) : '待公布', odds: '-', state: key ? 'settled' : 'pending' }
  })
  return { matchId: String(snapshot.id), period: matchPeriod(snapshot), number: matchNumber(snapshot), label: snapshot.label,
    league: candidate.leagueAbbName || snapshot.league, home: candidate.homeTeamAbbName || snapshot.home,
    away: candidate.awayTeamAbbName || snapshot.away, fullScore: full ? candidate.sectionsNo999 : '—',
    halfScore: half ? candidate.sectionsNo1 : '—', status: terminal && full ? 'published' : 'pending',
    statusLabel: terminal && full ? '已结束（比分直播）' : '比赛未结束', pools, source: 'live', fetchedAt: Date.now() }
}

function sameMatch(candidate, match) {
  return matchPeriod(candidate) === matchPeriod(match) && matchNumber(candidate) === matchNumber(match) && String(candidate.matchId) === String(match.id)
}

function pendingResult(match) {
  return normalizeResult(match, null, { matchStatusName: '比赛未结束' })
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
  const liveByDate = new Map()
  for (const match of plan.matches) {
    const candidate = byDate.get(match.date).find((item) => matchPeriod(item) === matchPeriod(match) && matchNumber(item) === matchNumber(match))
    if (candidate && String(candidate.matchId) !== String(match.id)) throw new Error(`${matchPeriod(match)}期 ${matchNumber(match)}场比赛身份不一致，已停止核对`)
    let result
    if (!candidate) {
      // An issue/number/ID binding was captured at save time. Use its stable ID for
      // rescheduled matches; the detail API echoes matchStatus, so only real winning keys establish publication.
      let detail
      try { detail = await requestValue(DETAIL_URL, { matchId: match.id, matchStatus: '11' }) }
      catch (error) {
        if (/合法域名|网络/.test(error.message || '')) throw error
      }
      if (detail && String(detail.matchId) !== String(match.id)) throw new Error('历史比赛赛果身份不一致，请稍后重试')
      const published = detail && Array.isArray(detail.matchResultList) && detail.matchResultList.some((pool) => resultKey(String(pool.poolCode).toLowerCase(), pool.combination, pool.combinationDesc))
      const previous = (plan.check && plan.check.results || []).find((item) => item.matchId === String(match.id) && item.period === matchPeriod(match) && item.number === matchNumber(match) && item.status === 'published')
      result = !published && previous ? { ...previous, fromCache: true } : published ? { ...normalizeResult(match, null, { ...detail, matchStatus: '11', matchStatusName: '已公布赛果' }), lookupBySavedId: true } : pendingResult(match)
    } else {
      let detail
      try { detail = await requestValue(DETAIL_URL, { matchId: candidate.matchId, matchStatus: candidate.matchStatus }) }
      catch (error) {
        if (/合法域名|网络/.test(error.message || '')) throw error
      }
      if (detail && String(detail.matchId) !== String(candidate.matchId)) throw new Error('官方赛果详情身份不一致，请稍后重试')
      result = normalizeResult(match, candidate, detail || {})
    }
    const selectedPools = [...new Set((match.selections || []).map((option) => option.poolId))]
    const needsLive = result.status === 'pending' || result.status === 'published' && selectedPools.some((id) => !result.pools.some((pool) => pool.id === id && pool.key))
    if (needsLive) {
      if (!liveByDate.has(match.date)) {
        try { liveByDate.set(match.date, await queryDate(match.date, 'live')) }
        catch (error) { if (/合法域名/.test(error.message || '')) throw error; liveByDate.set(match.date, []) }
      }
      const liveCandidates = liveByDate.get(match.date)
      const sameNumber = liveCandidates.find((item) => matchPeriod(item) === matchPeriod(match) && matchNumber(item) === matchNumber(match))
      if (sameNumber && String(sameNumber.matchId) !== String(match.id)) throw new Error(`${matchPeriod(match)}期 ${matchNumber(match)}场直播比赛身份不一致，已停止核对`)
      if (sameNumber && sameMatch(sameNumber, match)) {
        let liveDetail
        try { liveDetail = await requestValue(DETAIL_URL, { matchId: sameNumber.matchId, matchStatus: sameNumber.matchStatus }) }
        catch (error) { if (/合法域名/.test(error.message || '')) throw error }
        if (liveDetail && String(liveDetail.matchId) !== String(match.id)) throw new Error('比分直播详情身份不一致，已停止核对')
        const liveResult = normalizeLiveResult(match, { ...sameNumber,
          sectionsNo999: liveDetail && liveDetail.sectionsNo999 || sameNumber.sectionsNo999,
          sectionsNo1: liveDetail && liveDetail.sectionsNo1 || sameNumber.sectionsNo1 })
        if (liveResult.status === 'published' && result.status === 'published') {
          result = { ...result, pools: result.pools.map((pool) => pool.key ? pool : liveResult.pools.find((item) => item.id === pool.id && item.key) || pool),
            fullScore: result.fullScore === '—' ? liveResult.fullScore : result.fullScore,
            halfScore: result.halfScore === '—' ? liveResult.halfScore : result.halfScore }
        } else if (liveResult.status === 'published') result = liveResult
        else if (result.status === 'pending') result = liveResult
      }
    }
    results.push(result)
  }
  return { version: 1, checkedAt: Date.now(), results, ...settlePlan(plan, results) }
}

function gradeOption(option, result) {
  if (!result || !['published', 'cancelled'].includes(result.status)) return { state: 'pending', odds: 0, reason: RESULT_UNAVAILABLE_MESSAGE }
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
    if (!result || !['published', 'cancelled'].includes(result.status)) { allPublished = false; pendingReasons.add(RESULT_UNAVAILABLE_MESSAGE) }
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
  const pendingScores = results.filter((result) => result.status === 'pending' && scorePair(result.fullScore)).map((result) => `${result.period}期 ${result.number} 当前比分：${result.fullScore}`)
  const outcome = !allPublished ? 'pending' : prizeCents > 0 ? 'won' : refundCents > 0 ? 'refund' : 'lost'
  return { status: allPublished ? 'complete' : 'partial', outcome, statusLabel: outcome === 'pending' ? '比赛未结束' : outcome === 'won' ? '已中奖' : outcome === 'refund' ? '场次无效' : '未中奖', pendingReason: [...pendingReasons].join('、'), pendingScores, totalCount, wonCount, pendingCount, refundCount,
    lostCount: totalCount - wonCount - pendingCount - refundCount, prizeAmount: (prizeCents / 100).toFixed(2), refundAmount: (refundCents / 100).toFixed(2), returnAmount: ((prizeCents + refundCents) / 100).toFixed(2) }
}

module.exports = { checkPlan, gradeOption, gradeEntry, hasCheckableResult, RESULT_UNAVAILABLE_MESSAGE }
