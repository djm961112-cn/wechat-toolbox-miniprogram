Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '⌂' },
      { pagePath: '/pages/market/index', text: '工具市场', icon: '▣' },
      { pagePath: '/pages/mine/index', text: '我的', icon: '♙' }
    ]
  },
  attached() { this.updateSelected() },
  pageLifetimes: {
    show() { this.updateSelected() }
  },
  methods: {
    updateSelected() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (!current) return
      const path = `/${current.route}`
      const selected = this.data.list.findIndex((item) => item.pagePath === path)
      if (selected >= 0) this.setData({ selected })
    },
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (item && index !== this.data.selected) wx.switchTab({ url: item.pagePath })
    }
  }
})
