const HEAD_URL = 'https://webapi.sporttery.cn/gateway/uniform/football/getMatchHeadV1.qry'
const FEATURE_URL = 'https://webapi.sporttery.cn/gateway/uniform/football/getMatchFeatureV1.qry'
const HISTORY_URL = 'https://webapi.sporttery.cn/gateway/uniform/football/getResultHistoryV1.qry'

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

async function queryFootballAnalysis(matchId) {
  if (!/^\d+$/.test(String(matchId || ''))) throw new Error('比赛信息不完整，无法分析')
  const params = { sportteryMatchId: String(matchId) }
  const head = await requestValue(HEAD_URL, params)
  if (String(head.sportteryMatchId) !== String(matchId)) throw new Error('比赛身份不一致，已停止查询')
  const [feature, history] = await Promise.all([
    requestValue(FEATURE_URL, { ...params, termLimits: 10 }).catch(() => ({})),
    requestValue(HISTORY_URL, { ...params, termLimits: 5, tournamentFlag: 0, homeAwayFlag: 0 }).catch(() => ({}))
  ])
  return {
    sourceUrl: `https://m.sporttery.cn/zqlszl/bssj/index.html?mid=${matchId}`,
    header: { number: head.matchNum || '', league: head.tournamentCnShortName || head.tournamentCnName || '', home: head.homeTeamShortName || feature.homeTeamShortName || '', away: head.awayTeamShortName || feature.awayTeamShortName || '', time: head.matchDateTime || '' },
    featureRows: featureRows(feature),
    history: Array.isArray(history.matchList) ? history.matchList.map((item) => ({ id: String(item.sportteryMatchId || item.matchId), date: item.matchDate || '', league: item.tournamentShortName || '', home: item.homeTeamShortName || '', away: item.awayTeamShortName || '', score: item.fullCourtGoal || '-' })) : []
  }
}

module.exports = { queryFootballAnalysis }
