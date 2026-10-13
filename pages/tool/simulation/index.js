const { simulationTools, readPlans, removePlan, savePlanCheck, formatPlanForDisplay } = require('../../../utils/simulation-plans')
const { checkPlan } = require('../../../utils/football-results')

Page({
  data: { activeTab: 'collection', selectedToolId: 'football', tools: simulationTools, planGroups: [], planCount: 0, periodQuery: '', expandedPeriods: {}, checkingId: '' },
  onLoad(options = {}) { if (options.tab === 'plans') this.setData({ activeTab: 'plans' }) },
  onShow() { this.refreshPlans() },
  onUnload() { this.unloaded = true },
  refreshPlans() {
    try {
      this.plans = readPlans().filter((plan) => plan.toolId === this.data.selectedToolId)
        .map(formatPlanForDisplay)
      this.rebuildGroups()
    } catch (error) {
      wx.showToast({ title: '读取方案失败，请重试', icon: 'none' })
    }
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
      const check = await checkPlan(plan)
      savePlanCheck(id, check)
      if (!this.unloaded) {
        this.refreshPlans()
        wx.showToast({ title: check.status === 'complete' ? '核对完成' : '已核对，部分结果待确认', icon: 'none' })
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
