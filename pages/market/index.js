const { tools } = require('../../utils/tool-data')
const marketCategories = ['图片处理', '文档处理', '格式转换', '办公效率', '生活服务', '其他工具']
const categoryMap = { 图片处理: ['图片'], 文档处理: ['文档'], 格式转换: ['格式'], 办公效率: ['办公'], 生活服务: ['生活'], 其他工具: [] }
Page({
  data: { categories: marketCategories, selectedCategory: marketCategories[0], keyword: '', shownTools: tools.filter((tool) => tool.category === '图片') },
  selectCategory(event) { this.setData({ selectedCategory: event.currentTarget.dataset.category }, () => this.filterTools()) },
  onSearch(event) { this.setData({ keyword: event.detail.value }, () => this.filterTools()) },
  filterTools() {
    const allowed = categoryMap[this.data.selectedCategory] || []
    const keyword = this.data.keyword.trim().toLowerCase()
    this.setData({ shownTools: tools.filter((tool) => (keyword || allowed.includes(tool.category)) && (!keyword || tool.name.toLowerCase().includes(keyword))) })
  },
  showDeveloping() { wx.showToast({ title: '开发中', icon: 'none' }) }
})
