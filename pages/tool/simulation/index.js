const { simulationTools, readPlans, removePlan, savePlanCheck, completePlanOdds, readSources, createSource, setPlanSource, formatPlanForDisplay } = require('../../../utils/simulation-plans')
const { checkPlan } = require('../../../utils/football-results')
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

Page({
  data: { activeTab: 'collection', selectedToolId: 'football', tools: simulationTools, planGroups: [], planCount: 0, periodQuery: '', expandedPeriods: {}, checkingId: '', sources: [], sourceVisible: false, editingPlanId: '', currentSourceId: '', newSourceName: '',
    statsDimension: 'period', statsYear: '', statsMonth: '', statsYearIndex: 0, statsMonthIndex: 0, statsYearOptions: [{ label: '全部年份', value: '' }], statsMonthOptions: monthOptions,
    statsGroups: [], statsSummary: null, statsError: '', expandedStats: {} },
  onLoad(options = {}) { if (options.tab === 'plans' || options.tab === 'stats') this.setData({ activeTab: options.tab }) },
  onShow() { this.refreshPlans(); this.refreshSources() },
  onUnload() { this.unloaded = true },
  refreshPlans() {
    try {
      this.plans = readPlans().filter((plan) => plan.toolId === this.data.selectedToolId)
        .map(formatPlanForDisplay)
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
  rebuildGroups() {
    const groups = new Map()
    for (const plan of this.plans || []) {
      for (const period of plan.periodIds.length ? plan.periodIds : ['unknown']) {
        const label = period === 'unknown' ? '未记录期号' : `${period}期`
        if (this.data.periodQuery.trim() && !label.includes(this.data.periodQuery.trim())) continue
        if (!groups.has(period)) groups.set(period, { id: period, label, expanded: Boolean(this.data.expandedPeriods[period]), plans: [] })
        groups.get(period).plans.push(plan)
      }
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
      const dateField = this.data.statsDimension === 'period' ? 'periodDate' : 'createdDate'
      const years = [...new Set(rows.map((row) => row[dateField].slice(0, 4)))].sort().reverse()
      const statsYearOptions = [{ label: '全部年份', value: '' }, ...years.map((value) => ({ label: `${value}年`, value }))]
      const statsYear = years.includes(this.data.statsYear) ? this.data.statsYear : ''
      const filtered = filterRows(rows, statsYear, this.data.statsMonth, dateField)
      let statsGroups
      if (this.data.statsDimension === 'period') {
        statsGroups = groupRows(filtered, (row) => row.periodId, (row) => row.periodLabel)
          .sort((left, right) => {
            const rank = (id) => id === 'unknown' ? 2 : id.startsWith('multi:') ? 1 : 0
            return rank(left.id) - rank(right.id) || right.id.localeCompare(left.id)
          })
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
    if (this.data.checkingId === id) { wx.showToast({ title: '正在核对，请稍候', icon: 'none' }); return }
    wx.navigateTo({ url: `/pages/tool/simulation/detail/index?id=${encodeURIComponent(id)}` })
  },
  async checkSavedPlan(event) {
    if (this.data.checkingId) return
    const id = event.currentTarget.dataset.id
    this.setData({ checkingId: id })
    try {
      const plan = readPlans().find((item) => item.id === id)
      if (!plan) throw new Error('方案已删除')
      if (plan.matches.some((match) => (match.selections || []).some((option) => !(Number(option.odds) > 0) || option.poolId === 'hhad' && (option.goalLine == null || option.goalLine === '' || !Number.isFinite(Number(option.goalLine)))))) {
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
  deletePlan(event) {
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
