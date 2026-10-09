const { tools } = require('../../utils/tool-data')
const marketCategories = [
  { name: '办公效率', icon: '/assets/icons/security-check.png' },
  { name: '个人日常', icon: '/assets/icons/password-vault.png' }
]
Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
  },
  data: { categories: marketCategories, selectedCategory: marketCategories[0].name, keyword: '', shownTools: tools.filter((tool) => tool.category === marketCategories[0].name) },
  selectCategory(event) { this.setData({ selectedCategory: event.currentTarget.dataset.category }, () => this.filterTools()) },
  onSearch(event) { this.setData({ keyword: event.detail.value }, () => this.filterTools()) },
  filterTools() {
    const keyword = this.data.keyword.trim().toLowerCase()
    this.setData({
      shownTools: tools.filter((tool) => keyword
        ? tool.name.toLowerCase().includes(keyword)
        : tool.category === this.data.selectedCategory)
    })
  },
  openTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: tool.url })
  }
})
