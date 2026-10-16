const API_ROOT = 'https://webapi.sporttery.cn/gateway/uniform/football/'
const URLS = {
  head: `${API_ROOT}getMatchHeadV1.qry`, feature: `${API_ROOT}getMatchFeatureV1.qry`,
  history: `${API_ROOT}getResultHistoryV1.qry`, table: `${API_ROOT}getMatchTablesV1.qry`,
  recent: `${API_ROOT}getMatchResultV1.qry`, future: `${API_ROOT}getFutureMatchesV1.qry`,
  scorer: `${API_ROOT}getMatchPlayerV1.qry`, injury: `${API_ROOT}getInjurySuspensionV1.qry`
}

function requestValue(url, data) {
  return new Promise((resolve, reject) => wx.request({
    url, data: { ...data, _t: Date.now() }, header: { 'Cache-Control': 'no-cache' }, timeout: 15000,
    success: (res) => {
      if (res.statusCode !== 200 || !res.data || String(res.data.errorCode) !== '0') {
        reject(new Error('官方分析接口暂时不可用，请稍后重试')); return
      }
      resolve(res.data.value || {})
    },
    fail: (error) => reject(new Error(/domain|合法域名/.test(error.errMsg || '') ? '请配置 request 合法域名 https://webapi.sporttery.cn' : '分析数据查询失败，请检查网络后重试'))
  }))
}

function optionalRequest(url, data) {
  return requestValue(url, data).then((value) => ({ value, failed: false })).catch(() => ({ value: {}, failed: true }))
}

function ratio(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0
}

function resultText(data, side) {
  return `${data[`${side}WinGoalMatchCnt`] || 0}胜/${data[`${side}DrawMatchCnt`] || 0}平/${data[`${side}LossGoalMatchCnt`] || 0}负`
}

function featureRows(feature) {
  const rows = [
    ['last', '近10场交锋'], ['sameHomeAway', '同主客交锋'], ['eachHomeAway', '近10场战况'], ['eachSameHomeAway', '同主客战况']
  ].map(([key, title]) => {
    const value = feature[key]
    return value ? { id: key, title: title.replace('10', value.totalLegCnt || 10), home: resultText(value, 'home'), away: resultText(value, 'away'), homeRatio: ratio(value.homeScoreRatio), awayRatio: ratio(value.awayScoreRatio) } : null
  }).filter(Boolean)
  const averages = [['goalAvg', '近10场场均进球', 'GoalAvgCnt'], ['lossGoalAvg', '近10场场均失球', 'LossGoalAvgCnt']]
  averages.forEach(([key, title, field]) => {
    const value = feature[key]
    if (value) rows.push({ id: key, title: title.replace('10', value.totalLegCnt || 10), home: `${value[`home${field}`] == null ? '-' : value[`home${field}`]}个`, away: `${value[`away${field}`] == null ? '-' : value[`away${field}`]}个`, homeRatio: ratio(value[`home${field}Ratio`]), awayRatio: ratio(value[`away${field}Ratio`]) })
  })
  return rows
}

function resultLabel(value) {
  return value === 'home' ? '胜' : value === 'draw' ? '平' : value === 'away' ? '负' : '-'
}

function matchRow(item) {
  return {
    id: String(item.sportteryMatchId || item.matchId || `${item.matchDate}-${item.homeTeamShortName}-${item.awayTeamShortName}`),
    date: item.matchDate || String(item.matchDateTime || '').slice(0, 10), time: String(item.matchDateTime || '').slice(11, 16),
    league: item.tournamentShortName || '', home: item.homeTeamShortName || '', away: item.awayTeamShortName || '',
    score: item.fullCourtGoal || '', half: item.halfTimeGoal || '', result: resultLabel(item.teamMatchResult),
    stage: [item.phaseName, item.groupName, item.gameweek ? `第${item.gameweek}轮` : ''].filter(Boolean).join(' · ')
  }
}

function historyData(raw) {
  const statistics = raw.statistics || {}
  return {
    summary: statistics.totalLegCnt ? `近${statistics.totalLegCnt}场 · ${statistics.winGoalMatchCnt || 0}胜 ${statistics.drawMatchCnt || 0}平 ${statistics.lossGoalMatchCnt || 0}负` : '',
    matches: Array.isArray(raw.matchList) ? raw.matchList.map(matchRow) : []
  }
}

function tableData(raw) {
  return {
    title: [raw.tournamentShortName, raw.seasonName].filter(Boolean).join(' '),
    rows: Array.isArray(raw.tables) ? raw.tables.map((item, index) => ({
      id: String(item.uniformTeamId || item.sportteryTeamId || index), rank: `${item.groupName || ''}${item.ranking || '-'}`,
      team: item.teamShortName || '', played: item.totalLegCnt == null ? '-' : item.totalLegCnt,
      form: `${item.winGoalMatchCnt || 0}/${item.drawMatchCnt || 0}/${item.lossGoalMatchCnt || 0}`,
      winRate: item.winProbability || '-', points: item.points == null ? '-' : item.points
    })) : []
  }
}

function teamResults(raw) {
  return ['home', 'away'].map((side) => {
    const block = raw[side] || {}
    const statistics = block.statistics || {}
    return {
      id: side, team: statistics.teamShortName || block.teamShortName || '',
      summary: statistics.totalLegCnt ? `近${statistics.totalLegCnt}场 · ${statistics.winGoalMatchCnt || 0}胜 ${statistics.drawMatchCnt || 0}平 ${statistics.lossGoalMatchCnt || 0}负` : '',
      goals: statistics.totalLegCnt ? `进${statistics.goalCnt || 0}球 · 失${statistics.lossGoalCnt || 0}球 · 净胜${statistics.netGoal || 0}球` : '',
      matches: Array.isArray(block.matchList) ? block.matchList.map(matchRow) : []
    }
  })
}

function futureData(raw) {
  return ['home', 'away'].map((side) => {
    const block = raw[side] || {}
    return { id: side, team: block.teamShortName || '', matches: Array.isArray(block.matchList) ? block.matchList.map(matchRow) : [] }
  })
}

function playerData(raw) {
  return {
    title: [raw.tournamentShortName, raw.seasonName].filter(Boolean).join(' '),
    teams: ['home', 'away'].map((side) => {
      const block = raw[side] || {}
      return { id: side, team: block.teamShortName || '', players: Array.isArray(block.playerList) ? block.playerList.map((item, index) => ({
        id: String(item.personId || `${side}-${index}`), no: item.uniformNo || '-', name: item.personName || '-', position: item.playerPositionDesc || '',
        appearances: item.appearanceCnt || 0, starts: item.startedMatchCnt || 0, substitutes: item.substituteMatchCnt || 0,
        goals: item.goalCnt || 0, goalRate: item.goalProbability || '0%', assists: item.assistCnt || 0, assistRate: item.assistProbability || '0%',
        goalAvg: item.goalAvgCnt || '0', assistAvg: item.assistAvgCnt || '0', injured: Number(item.injuryFlag) === 1, suspended: Number(item.suspensionFlag) === 1
      })) : [] }
    })
  }
}

function injuryData(raw) {
  return ['home', 'away'].map((side) => {
    const block = raw[side] || {}
    return { id: side, team: block.teamShortName || '', players: Array.isArray(block.injuriesAndSuspensionsList) ? block.injuriesAndSuspensionsList.map((item, index) => ({
      id: String(item.personId || `${side}-${index}`), no: item.uniformNo || '-', name: item.personName || '-', position: item.playerPositionDesc || '',
      appearances: item.appearanceCnt || 0, starts: item.startedMatchCnt || 0, substitutes: item.substituteMatchCnt || 0,
      status: Number(item.injuryFlag) === 1 && Number(item.suspensionFlag) === 1 ? '伤停' : Number(item.suspensionFlag) === 1 ? '停赛' : '伤病'
    })) : [] }
  })
}

async function queryFootballAnalysis(matchId) {
  if (!/^\d+$/.test(String(matchId || ''))) throw new Error('比赛信息不完整，无法分析')
  const params = { sportteryMatchId: String(matchId) }
  const head = await requestValue(URLS.head, params)
  if (String(head.sportteryMatchId) !== String(matchId)) throw new Error('比赛身份不一致，已停止查询')
  const requests = [
    optionalRequest(URLS.feature, { ...params, termLimits: 10 }),
    optionalRequest(URLS.history, { ...params, termLimits: 10, tournamentFlag: 0, homeAwayFlag: 0 }),
    optionalRequest(URLS.table, params),
    optionalRequest(URLS.recent, { ...params, termLimits: 10, tournamentFlag: 0, homeAwayFlag: 0 }),
    optionalRequest(URLS.future, { ...params, termLimits: 4 }),
    optionalRequest(URLS.scorer, { ...params, termLimits: 3 }),
    optionalRequest(URLS.injury, params)
  ]
  const [feature, history, table, recent, future, scorer, injury] = await Promise.all(requests)
  return {
    sourceUrl: `https://m.sporttery.cn/zqlszl/bssj/index.html?mid=${matchId}`,
    partialError: [feature, history, table, recent, future, scorer, injury].some((item) => item.failed),
    header: { number: head.matchNum || '', league: head.tournamentCnShortName || head.tournamentCnName || '', home: head.homeTeamShortName || feature.value.homeTeamShortName || '', away: head.awayTeamShortName || feature.value.awayTeamShortName || '', time: head.matchDateTime || '' },
    featureRows: featureRows(feature.value), history: historyData(history.value), table: tableData(table.value),
    recent: teamResults(recent.value), future: futureData(future.value), scorer: playerData(scorer.value), injury: injuryData(injury.value)
  }
}

module.exports = { queryFootballAnalysis }
