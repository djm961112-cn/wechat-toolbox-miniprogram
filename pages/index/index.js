const { tools, resolveToolUrl } = require('../../utils/tool-data')
const { readEnabledTools } = require('../../utils/tool-preferences')

Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
    this.refreshTools()
  },
  data: { quickTools: [], recommendationGroups: [] },
  refreshTools() {
    try {
      const enabledTools = readEnabledTools()
      const categories = [...new Set(enabledTools.map((tool) => tool.category))]
      this.setData({ quickTools: enabledTools, recommendationGroups: categories.map((title) => ({ title, tools: enabledTools.filter((tool) => tool.category === title) })) })
    } catch (error) {
      this.setData({ quickTools: [], recommendationGroups: [] })
      wx.showToast({ title: '读取工具喜好失败', icon: 'none' })
    }
  },
  openTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: resolveToolUrl(tool) })
  },
  openMarket() { wx.switchTab({ url: '/pages/market/index' }) }
})
