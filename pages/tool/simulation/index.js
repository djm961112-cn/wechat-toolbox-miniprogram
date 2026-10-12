const { simulationTools, readPlans, removePlan, formatPlanForDisplay } = require('../../../utils/simulation-plans')

Page({
  data: { activeTab: 'collection', selectedToolId: 'football', tools: simulationTools, plans: [] },
  onLoad(options = {}) { if (options.tab === 'plans') this.setData({ activeTab: 'plans' }) },
  onShow() { this.refreshPlans() },
  refreshPlans() {
    try {
      const plans = readPlans().filter((plan) => plan.toolId === this.data.selectedToolId)
        .map(formatPlanForDisplay)
      this.setData({ plans })
    } catch (error) {
      wx.showToast({ title: '读取方案失败，请重试', icon: 'none' })
    }
  },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }) },
  selectTool(event) { this.setData({ selectedToolId: event.currentTarget.dataset.id }, () => this.refreshPlans()) },
  openTool(event) {
    const tool = simulationTools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: tool.url })
  },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/tool/simulation/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` })
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
