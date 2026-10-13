const { readScoreRecord, saveScore: saveLocalScore } = require('../../utils/profile-score')

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: { scoreOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], savedScore: null, draftScore: null, savedAt: '' },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2 })
    try {
      const record = readScoreRecord()
      this.setData({ savedScore: record ? record.value : null, draftScore: record ? record.value : null, savedAt: record && record.updatedAt ? formatTime(record.updatedAt) : '' })
    } catch (error) { wx.showToast({ title: '读取评分失败，请重试', icon: 'none' }) }
  },
  chooseScore(event) { this.setData({ draftScore: Number(event.currentTarget.dataset.score) }) },
  saveScore() {
    try {
      const record = saveLocalScore(this.data.draftScore)
      this.setData({ savedScore: record.value, savedAt: formatTime(record.updatedAt) })
      wx.showToast({ title: '评分已保存', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '保存失败，请检查本机空间', icon: 'none' }) }
  },
  openPrivacy() { wx.navigateTo({ url: '/pages/legal/privacy/index' }) },
  openTerms() { wx.navigateTo({ url: '/pages/legal/terms/index' }) }
})
