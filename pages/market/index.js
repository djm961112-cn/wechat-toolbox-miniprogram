const { tools, resolveToolUrl } = require('../../utils/tool-data')
const { readEnabledTools } = require('../../utils/tool-preferences')
Page({
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 1 })
    this.refreshTools()
  },
  data: { categories: [], selectedCategory: '', keyword: '', shownTools: [] },
  refreshTools() {
    try {
      this.enabledTools = readEnabledTools()
      const categories = []
      this.enabledTools.forEach((tool) => { if (!categories.some((item) => item.name === tool.category)) categories.push({ name: tool.category, icon: tool.icon }) })
      const selectedCategory = categories.some((item) => item.name === this.data.selectedCategory) ? this.data.selectedCategory : categories.length ? categories[0].name : ''
      this.setData({ categories, selectedCategory }, () => this.filterTools())
    } catch (error) {
      this.enabledTools = []
      this.setData({ categories: [], selectedCategory: '', shownTools: [] })
      wx.showToast({ title: '读取工具喜好失败', icon: 'none' })
    }
  },
  selectCategory(event) { this.setData({ selectedCategory: event.currentTarget.dataset.category }, () => this.filterTools()) },
  onSearch(event) { this.setData({ keyword: event.detail.value }, () => this.filterTools()) },
  filterTools() {
    const keyword = this.data.keyword.trim().toLowerCase()
    this.setData({
      shownTools: (this.enabledTools || []).filter((tool) => keyword
        ? tool.name.toLowerCase().includes(keyword)
        : tool.category === this.data.selectedCategory)
    })
  },
  openTool(event) {
    const tool = tools.find((item) => item.id === event.currentTarget.dataset.id)
    if (tool) wx.navigateTo({ url: resolveToolUrl(tool) })
  }
})
