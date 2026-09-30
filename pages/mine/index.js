Page({
  data: { menuItems: [
    { id: 'tools', icon: '▣', title: '我的工具', subtitle: '已使用 0 个工具' },
    { id: 'feedback', icon: '▢', title: '意见反馈', subtitle: '有什么建议告诉我们' },
    { id: 'help', icon: '?', title: '帮助中心', subtitle: '常见问题与使用说明' },
    { id: 'share', icon: '↗', title: '分享应用', subtitle: '分享给好友一起使用' }
  ] },
  showDeveloping() { wx.showToast({ title: '开发中', icon: 'none' }) }
})
