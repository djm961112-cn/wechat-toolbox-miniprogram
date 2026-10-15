const { simulationTools, readPlans, removePlan, savePlanCheck, completePlanOdds, setPlanPurchased, readSources, createSource, setPlanSource, matchPeriod, matchNumber, planPeriods, formatPlanForDisplay } = require('../../../utils/simulation-plans')
const { checkPlan, gradeOption } = require('../../../utils/football-results')
const { API_URL, normalizeFeed } = require('../../../utils/football-simulation')
const { planRows, aggregate, groupRows, filterRows } = require('../../../utils/simulation-stats')

const monthOptions = [{ label: '全部月份', value: '' }, ...Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1}月`, value: String(index + 1).padStart(2, '0') }))]

function latestFeed() {
  return new Promise((resolve, reject) => wx.request({
    url: API_URL, data: { channel: 'c', _t: Date.now() }, header: { 'Cache-Control': 'no-cache' }, timeout: 15000,
    success: (response) => {
      try {
        if (response.statusCode !== 200) throw new Error('官方赛事接口暂时不可用')
        resolve(normalizeFeed(response.data))
      } catch (error) { reject(error) }
    },
    fail: () => reject(new Error('查询最新赔率失败，请检查网络后重试'))
  }))
}

function currentMatch(feed, saved) {
  return feed.matches.find((match) => match.id === String(saved.id) && matchPeriod(match) === matchPeriod(saved) && matchNumber(match) === matchNumber(saved))
}

function selectionAvailable(match, selection) {
  const pool = match && match.pools.find((item) => item.id === selection.poolId)
  return Boolean(pool && pool.selectable && pool.options.some((option) => option.key === selection.key && !option.disabled))
}

function needsLatestOdds(plan) {
  return plan.matches.some((match) => (match.selections || []).some((option) => !(Number(option.odds) > 0)
    || option.poolId === 'hhad' && (option.goalLine == null || option.goalLine === '' || !Number.isFinite(Number(option.goalLine)))))
}

function confirmEdit(content) {
  return new Promise((resolve) => wx.showModal({
    title: '部分选择已封盘', content, confirmText: '继续编辑', cancelText: '取消',
    success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false)
  }))
}

function decoratePlanResults(plan) {
  const hasResults = Boolean(plan.check && Array.isArray(plan.check.results))
  const outcome = hasResults && (plan.check.outcome || (plan.check.status !== 'complete' ? 'pending'
    : Number(plan.check.prizeAmount) > 0 ? 'won' : Number(plan.check.refundAmount) > 0 ? 'refund' : 'lost'))
  const matches = plan.matches.map((match) => {
    const result = hasResults && plan.check.results.find((item) => item.matchId === String(match.id))
    const selectionRows = match.selectionRows.map((row) => ({ ...row, options: row.options.map((choice) => {
      const selection = (match.selections || []).find((option) => option.poolId === row.id && option.key === choice.key)
      const verdict = selection ? gradeOption(selection, result) : null
      return { ...choice, resultState: verdict && verdict.state || '' }
    }) }))
    return { ...match, selectionRows }
  })
  const previewHeight = Math.min(620, Math.max(180, matches.reduce((height, match) => height + 88
    + match.selectionRows.reduce((sum, row) => sum + Math.ceil(row.options.length / row.columns) * 66, 0)
    + Math.max(0, match.selectionRows.length - 1) * 24, 0)))
  return { ...plan, ...(hasResults ? { check: { ...plan.check, outcome } } : {}), matches, previewHeight }
}

Page({
  data: { activeTab: 'collection', selectedToolId: 'football', tools: simulationTools, planGroups: [], planCount: 0, periodQuery: '', expandedPeriods: {}, checkingId: '', checkingPeriodId: '', checkingPeriodProgress: '', editingId: '', previewPlan: null, sources: [], sourceVisible: false, editingPlanId: '', currentSourceId: '', newSourceName: '',
    statsDimension: 'period', statsYear: '', statsMonth: '', statsYearIndex: 0, statsMonthIndex: 0, statsYearOptions: [{ label: '全部年份', value: '' }], statsMonthOptions: monthOptions,
    statsGroups: [], statsSummary: null, statsError: '', expandedStats: {} },
  onLoad(options = {}) { if (options.tab === 'plans' || options.tab === 'stats') this.setData({ activeTab: options.tab }) },
  onShow() { this.refreshPlans(); this.refreshSources() },
  onUnload() { this.unloaded = true },
  refreshPlans() {
    try {
      this.plans = readPlans().filter((plan) => plan.toolId === this.data.selectedToolId)
        .map(formatPlanForDisplay).map(decoratePlanResults)
      this.rebuildGroups()
      this.refreshStats()
    } catch (error) {
      wx.showToast({ title: '读取方案失败，请重试', icon: 'none' })
    }
  },
  refreshSources() {
    try { this.setData({ sources: readSources() }) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  openSources() {
    this.refreshSources()
    this.setData({ sourceVisible: true, editingPlanId: '', newSourceName: '' })
  },
  openPlanSource(event) {
    this.refreshSources()
    const id = event.currentTarget.dataset.id
    const plan = (this.plans || []).find((item) => item.id === id)
    this.setData({ sourceVisible: true, editingPlanId: id, currentSourceId: plan ? plan.planSourceId : '', newSourceName: '' })
  },
  closeSources() { this.setData({ sourceVisible: false, editingPlanId: '', currentSourceId: '', newSourceName: '' }) },
  stopPropagation() {},
  setNewSourceName(event) { this.setData({ newSourceName: event.detail.value }) },
  addSource() {
    try {
      const source = createSource(this.data.newSourceName)
      this.refreshSources()
      if (this.data.editingPlanId) {
        setPlanSource(this.data.editingPlanId, source.id)
        this.refreshPlans()
        this.closeSources()
      } else this.setData({ newSourceName: '' })
      wx.showToast({ title: '来源已添加', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '添加失败，请重试', icon: 'none' }) }
  },
  chooseSource(event) {
    if (!this.data.editingPlanId) return
    try {
      setPlanSource(this.data.editingPlanId, event.currentTarget.dataset.id || '')
      this.refreshPlans()
      this.closeSources()
      wx.showToast({ title: '方案来源已更新', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '关联失败，请重试', icon: 'none' }) }
  },
  togglePlanPurchased(event) {
    try {
      setPlanPurchased(event.currentTarget.dataset.id, event.detail.value === true)
      this.refreshPlans()
    } catch (error) { this.refreshPlans(); wx.showToast({ title: error.message || '保存购买状态失败', icon: 'none' }) }
  },
  rebuildGroups() {
    const groups = new Map()
    for (const plan of this.plans || []) {
      const period = plan.periodIds.length ? plan.periodIds[plan.periodIds.length - 1] : 'unknown'
      const label = period === 'unknown' ? '未记录期号' : `${period}期`
      if (this.data.periodQuery.trim() && !label.includes(this.data.periodQuery.trim())) continue
      if (!groups.has(period)) groups.set(period, { id: period, label, expanded: Boolean(this.data.expandedPeriods[period]), plans: [] })
      groups.get(period).plans.push(plan)
    }
    const planGroups = [...groups.values()].sort((a, b) => a.id === 'unknown' ? 1 : b.id === 'unknown' ? -1 : b.id.localeCompare(a.id))
    this.setData({ planGroups, planCount: new Set(planGroups.reduce((all, group) => all.concat(group.plans.map((plan) => plan.id)), [])).size })
  },
  searchPeriod(event) { this.setData({ periodQuery: event.detail.value }, () => this.rebuildGroups()) },
  togglePeriod(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedPeriods: { ...this.data.expandedPeriods, [id]: !this.data.expandedPeriods[id] } }, () => this.rebuildGroups())
  },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }) },
  selectTool(event) { this.setData({ selectedToolId: event.currentTarget.dataset.id }, () => this.refreshPlans()) },
  selectStatsDimension(event) { this.setData({ statsDimension: event.currentTarget.dataset.dimension, statsYear: '', statsMonth: '' }, () => this.refreshStats()) },
  changeStatsYear(event) {
    const selected = this.data.statsYearOptions[Number(event.detail.value)]
    this.setData({ statsYear: selected ? selected.value : '', statsMonth: '' }, () => this.refreshStats())
  },
  changeStatsMonth(event) {
    const selected = this.data.statsMonthOptions[Number(event.detail.value)]
    this.setData({ statsMonth: selected ? selected.value : '' }, () => this.refreshStats())
  },
  toggleStatsGroup(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedStats: { ...this.data.expandedStats, [id]: !this.data.expandedStats[id] } }, () => this.refreshStats())
  },
  openStatsGroup(event) {
    if (this.data.statsDimension === 'period') this.toggleStatsGroup(event)
    else this.openSourceStats(event)
  },
  openSourceStats(event) {
    const sourceId = event.currentTarget.dataset.source || ''
    const query = `toolId=${encodeURIComponent(this.data.selectedToolId)}&sourceId=${encodeURIComponent(sourceId)}&year=${this.data.statsYear}&month=${this.data.statsMonth}`
    wx.navigateTo({ url: `/pages/tool/simulation/source-stats/index?${query}` })
  },
  refreshStats() {
    try {
      const rows = planRows(readPlans(), this.data.selectedToolId)
      const dateField = 'periodDate'
      const years = [...new Set(rows.map((row) => row[dateField].slice(0, 4)))].sort().reverse()
      const statsYearOptions = [{ label: '全部年份', value: '' }, ...years.map((value) => ({ label: `${value}年`, value }))]
      const statsYear = years.includes(this.data.statsYear) ? this.data.statsYear : ''
      const filtered = filterRows(rows, statsYear, this.data.statsMonth, dateField)
      let statsGroups
      if (this.data.statsDimension === 'period') {
        statsGroups = groupRows(filtered, (row) => row.periodId, (row) => row.periodGroupLabel)
          .sort((left, right) => left.id === 'unknown' ? 1 : right.id === 'unknown' ? -1 : right.id.localeCompare(left.id))
          .map((group) => ({ id: group.id, label: group.label, summary: group.summary, expanded: Boolean(this.data.expandedStats[group.id]),
            sources: groupRows(group.rows, (row) => row.sourceId || 'unlinked', (row) => row.sourceName)
              .map((source) => ({ id: source.id, label: source.label, summary: source.summary })) }))
      } else {
        statsGroups = groupRows(filtered, (row) => row.sourceId || 'unlinked', (row) => row.sourceName)
          .map((group) => ({ id: group.id, sourceId: group.id === 'unlinked' ? '' : group.id, label: group.label, summary: group.summary }))
      }
      this.setData({ statsGroups, statsSummary: aggregate(filtered), statsYearOptions, statsYear, statsYearIndex: statsYearOptions.findIndex((item) => item.value === statsYear),
        statsMonthIndex: monthOptions.findIndex((item) => item.value === this.data.statsMonth), statsError: '' })
    } catch (error) { this.setData({ statsGroups: [], statsSummary: null, statsError: error.message || '统计失败，请稍后重试' }) }
  },
  openTool(event) {
    const tool = simulationTools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: tool.url })
  },
  openDetail(event) {
    const id = event.currentTarget.dataset.id
    if (this.data.checkingPeriodId) { wx.showToast({ title: '本期方案正在核对', icon: 'none' }); return }
    if (this.data.checkingId === id) { wx.showToast({ title: '正在核对，请稍候', icon: 'none' }); return }
    wx.navigateTo({ url: `/pages/tool/simulation/detail/index?id=${encodeURIComponent(id)}` })
  },
  openPlanPreview(event) {
    const plan = (this.plans || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (plan) this.setData({ previewPlan: plan })
  },
  closePlanPreview() { this.setData({ previewPlan: null }) },
  async editPlan(event) {
    if (this.data.checkingId || this.data.checkingPeriodId || this.data.editingId) return
    const id = event.currentTarget.dataset.id
    this.setData({ editingId: id })
    try {
      const plan = readPlans().find((item) => item.id === id)
      if (!plan) throw new Error('方案已删除')
      const periods = planPeriods(plan)
      if (periods.length !== 1) throw new Error('历史跨期方案不支持修改')
      const feed = await latestFeed()
      const period = periods[0]
      const selectableMatches = feed.matches.filter((match) => matchPeriod(match) === period && match.selectable)
      if (!selectableMatches.length) {
        wx.showModal({ title: '无法修改', content: '赛事已开始或已结束，不支持修改。', showCancel: false })
        return
      }
      const unavailable = plan.matches.filter((saved) => {
        const current = currentMatch(feed, saved)
        return !current || !current.selectable || (saved.selections || []).some((selection) => !selectionAvailable(current, selection))
      })
      if (unavailable.length) {
        const labels = unavailable.map((match) => `${matchNumber(match) || '未知'}号 ${match.home || ''} vs ${match.away || ''}`)
        const accepted = await confirmEdit(`${labels.join('、')} 的赛程已经封盘，不支持编辑。继续编辑并保存会丢失对应选择！`)
        if (!accepted) return
      }
      wx.navigateTo({ url: `/pages/tool/simulation/football/index?editPlanId=${encodeURIComponent(id)}` })
    } catch (error) { wx.showToast({ title: error.message || '读取最新赛事失败', icon: 'none', duration: 3000 }) }
    finally { if (!this.unloaded) this.setData({ editingId: '' }) }
  },
  async checkSavedPlan(event) {
    if (this.data.checkingId || this.data.checkingPeriodId) return
    const id = event.currentTarget.dataset.id
    this.setData({ checkingId: id })
    try {
      const plan = readPlans().find((item) => item.id === id)
      if (!plan) throw new Error('方案已删除')
      if (needsLatestOdds(plan)) {
        completePlanOdds(id, await latestFeed())
        if (!this.unloaded) { this.refreshPlans(); wx.showToast({ title: '赔率已补全，可点击核对', icon: 'none' }) }
        return
      }
      const check = await checkPlan(plan)
      savePlanCheck(id, check)
      if (!this.unloaded) {
        this.refreshPlans()
        wx.showToast({ title: check.statusLabel, icon: 'none', duration: 3000 })
      }
    } catch (error) { if (!this.unloaded) wx.showToast({ title: error.message || '核对失败，请重试', icon: 'none', duration: 3000 }) }
    finally { if (!this.unloaded) this.setData({ checkingId: '' }) }
  },
  async checkPeriod(event) {
    if (this.data.checkingId || this.data.checkingPeriodId) return
    const periodId = event.currentTarget.dataset.id
    const group = this.data.planGroups.find((item) => item.id === periodId)
    if (!group || !group.plans.length) return
    const ids = group.plans.map((plan) => plan.id)
    let completeCount = 0, pendingCount = 0, failedCount = 0
    let oddsFeedPromise
    this.setData({ checkingPeriodId: periodId, checkingPeriodProgress: `0/${ids.length}` })
    try {
      for (let index = 0; index < ids.length; index += 1) {
        if (!this.unloaded) this.setData({ checkingPeriodProgress: `${index + 1}/${ids.length}` })
        try {
          let plan = readPlans().find((item) => item.id === ids[index])
          if (!plan) throw new Error('方案已删除')
          if (needsLatestOdds(plan)) {
            if (!oddsFeedPromise) oddsFeedPromise = latestFeed()
            completePlanOdds(plan.id, await oddsFeedPromise)
            plan = readPlans().find((item) => item.id === plan.id)
          }
          const check = await checkPlan(plan)
          savePlanCheck(plan.id, check)
          if (check.status === 'complete') completeCount += 1
          else pendingCount += 1
        } catch (error) { failedCount += 1 }
      }
      if (!this.unloaded) {
        this.refreshPlans()
        wx.showModal({ title: '本期核对完成', content: `已完成 ${completeCount} 个，比赛未结束 ${pendingCount} 个，失败 ${failedCount} 个。`, showCancel: false })
      }
    } finally {
      if (!this.unloaded) this.setData({ checkingPeriodId: '', checkingPeriodProgress: '' })
    }
  },
  deletePlan(event) {
    if (this.data.checkingPeriodId) { wx.showToast({ title: '本期方案正在核对', icon: 'none' }); return }
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除方案', content: '删除后无法恢复，确定删除这条方案吗？',
      success: (result) => {
        if (!result.confirm) return
        try { removePlan(id); this.refreshPlans() } catch (error) { wx.showToast({ title: '删除失败，请重试', icon: 'none' }) }
      }
    })
  }
})
