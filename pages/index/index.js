const { tools, resolveToolUrl } = require('../../utils/tool-data')

Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
  },
  data: {
    quickTools: tools,
    recommendationGroups: [
      { title: '办公效率', tools: tools.filter((tool) => tool.category === '办公效率') },
      { title: '个人日常', tools: tools.filter((tool) => tool.category === '个人日常') },
      { title: '娱乐', tools: tools.filter((tool) => tool.category === '娱乐') }
    ]
  },
  openTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: resolveToolUrl(tool) })
  },
  openMarket() { wx.switchTab({ url: '/pages/market/index' }) }
})
