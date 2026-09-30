const { categories, tools } = require('../../utils/tool-data')
const groupNames = { 图片: '图片工具', 文档: '文档工具', 格式: '格式转换', 办公: '办公效率', 生活: '生活服务', 其他: '其他工具' }
const categoryMap = { 全部: ['图片', '文档', '格式', '办公', '生活', '其他'], 图片: ['图片'], 文档: ['文档'], 办公: ['办公'], 生活: ['生活'], 其他: ['其他'] }

function buildGroups(category) {
  return (categoryMap[category] || categoryMap.全部).map((key) => ({
    title: groupNames[key],
    tools: tools.filter((tool) => tool.category === key).slice(0, 4)
  })).filter((group) => group.tools.length)
}

Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
  },
  data: {
    categories,
    selectedCategory: '全部',
    quickTools: tools.filter((tool) => ['image-compress', 'format-convert', 'calculator', 'mfa', 'notepad', 'pdf-tools', 'qrcode', 'unit-convert', 'more'].includes(tool.id)),
    recommendationGroups: buildGroups('全部')
  },
  selectCategory(event) {
    const selectedCategory = event.currentTarget.dataset.category
    this.setData({ selectedCategory, recommendationGroups: buildGroups(selectedCategory) })
  },
  openTool(event) {
    const id = event.currentTarget.dataset.id
    if (id === 'mfa') {
      wx.navigateTo({ url: '/pages/tool/mfa/index' })
      return
    }
    this.showDeveloping()
  },
  openMarket() { wx.switchTab({ url: '/pages/market/index' }) },
  showDeveloping() { wx.showToast({ title: '开发中', icon: 'none' }) }
})
