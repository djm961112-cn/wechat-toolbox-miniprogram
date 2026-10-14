const { readToolPreferences, setToolEnabled } = require('../../utils/tool-preferences')

Page({
  data: { preferences: [], simulationUnlocked: false, error: '' },
  onShow() { this.refreshPreferences() },
  refreshPreferences() {
    try {
      const preferences = readToolPreferences()
      this.setData({ preferences, simulationUnlocked: preferences.some((tool) => tool.id === 'simulation'), error: '' })
    } catch (error) { this.setData({ preferences: [], simulationUnlocked: false, error: error.message || '读取工具喜好失败' }) }
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
