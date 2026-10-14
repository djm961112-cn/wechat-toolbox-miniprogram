const { readToolPreferences, setToolEnabled } = require('../../utils/tool-preferences')

Page({
  data: { preferences: [], error: '' },
  onShow() { this.refreshPreferences() },
  refreshPreferences() {
    try {
      const preferences = readToolPreferences()
      this.setData({ preferences, error: '' })
    } catch (error) { this.setData({ preferences: [], error: error.message || '读取工具喜好失败' }) }
  },
  toggleTool(event) {
    try {
      setToolEnabled(event.currentTarget.dataset.id, event.detail.value === true)
      this.refreshPreferences()
    } catch (error) {
      this.refreshPreferences()
      wx.showToast({ title: error.message || '保存工具喜好失败', icon: 'none' })
    }
  }
})
