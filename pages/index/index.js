const { tools } = require('../../utils/tool-data')

Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
  },
  data: {
    quickTools: tools,
    recommendationGroups: [{ title: '办公效率', tools }]
  },
  openTool() {
    wx.navigateTo({ url: '/pages/tool/mfa/index' })
  },
  openMarket() { wx.switchTab({ url: '/pages/market/index' }) }
})
