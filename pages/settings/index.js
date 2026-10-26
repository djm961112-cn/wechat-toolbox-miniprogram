const { readToolPreferences, setToolEnabled } = require('../../utils/tool-preferences')
const auth = require('../../utils/auth')
const { ensureToolLogin } = require('../../utils/tool-access')
const cloud = require('../../utils/cloud-sync')

const CLOUD_NAMES = { mfa: 'MFA 验证器', weight: '体重控制', simulation: '模拟计算' }
function confirmUpload() {
  return new Promise((resolve) => wx.showModal({ title: '上传本地数据', content: '将把本机 MFA 密钥、体重记录和模拟方案上传到 OpenOTools 服务器，并由服务端加密保存。云端已有数据会先合并，不会直接覆盖。是否继续？',
    confirmText: '确认上传', cancelText: '取消', success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false) }))
}

Page({
  data: { preferences: [], error: '', cloudLoggedIn: false, cloudLoading: false, cloudItems: [], cloudMessage: '', cloudError: '' },
  onShow() { this.refreshPreferences(); this.refreshCloudStatus() },
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
  },
  async refreshCloudStatus() {
    const cloudLoggedIn = Boolean(auth.readSession())
    this.setData({ cloudLoggedIn, cloudItems: [], cloudError: '', cloudMessage: cloudLoggedIn ? '正在读取云端摘要…' : '登录后可上传已有本地数据并启用自动同步。' })
    if (!cloudLoggedIn) return
    try {
      const summary = await cloud.getSummary()
      const list = Array.isArray(summary) ? summary : []
      this.setData({ cloudItems: list.map((item) => ({ ...item, name: CLOUD_NAMES[item.tool] || item.tool })), cloudMessage: list.length ? '云端已有以下加密快照。' : '云端暂无工具数据，可上传本机已有记录。' })
    } catch (error) { this.setData({ cloudError: error.message || '云端摘要读取失败', cloudMessage: '本地数据未受影响，可稍后重试。' }) }
  },
  async uploadLocalData() {
    if (this.data.cloudLoading || !await confirmUpload()) return
    if (!await ensureToolLogin('mfa')) return
    this.setData({ cloudLoading: true, cloudError: '', cloudMessage: '正在合并并上传本地数据…' })
    try {
      await cloud.importLocalData()
      this.setData({ cloudMessage: 'MFA、体重和模拟方案已完成加密上传，并启用自动同步。' })
      await this.refreshCloudStatus()
      wx.showToast({ title: '本地数据已上传', icon: 'success' })
    } catch (error) {
      this.setData({ cloudError: error.message || '上传失败，请稍后重试', cloudMessage: '上传失败不会删除或回滚本地数据。' })
      wx.showToast({ title: '上传失败，本地数据已保留', icon: 'none', duration: 3000 })
    } finally { this.setData({ cloudLoading: false }) }
  }
})
