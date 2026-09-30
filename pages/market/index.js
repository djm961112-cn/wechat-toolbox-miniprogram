const { tools } = require('../../utils/tool-data')
const marketCategories = [
  { name: '图片处理', icon: '/assets/icons/image-compress.png' },
  { name: '文档处理', icon: '/assets/icons/document-processing.png' },
  { name: '格式转换', icon: '/assets/icons/format-convert.png' },
  { name: '办公效率', icon: '/assets/icons/calculator.png' },
  { name: '生活服务', icon: '/assets/icons/bus-query.png' },
  { name: '其他工具', icon: '/assets/icons/web-tools.png' }
]
const categoryMap = { 图片处理: ['图片'], 文档处理: ['文档'], 格式转换: ['格式'], 办公效率: ['办公'], 生活服务: ['生活'], 其他工具: ['其他'] }
Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
  },
  data: { categories: marketCategories, selectedCategory: marketCategories[0].name, keyword: '', shownTools: tools.filter((tool) => tool.category === '图片') },
  selectCategory(event) { this.setData({ selectedCategory: event.currentTarget.dataset.category }, () => this.filterTools()) },
  onSearch(event) { this.setData({ keyword: event.detail.value }, () => this.filterTools()) },
  filterTools() {
    const allowed = categoryMap[this.data.selectedCategory] || []
    const keyword = this.data.keyword.trim().toLowerCase()
    this.setData({ shownTools: tools.filter((tool) => (keyword || allowed.includes(tool.category)) && (!keyword || tool.name.toLowerCase().includes(keyword))) })
  },
  openTool(event) {
    if (event.currentTarget.dataset.id === 'mfa') {
      wx.navigateTo({ url: '/pages/tool/mfa/index' })
      return
    }
    this.showDeveloping()
  },
  showDeveloping() { wx.showToast({ title: '开发中', icon: 'none' }) }
})
