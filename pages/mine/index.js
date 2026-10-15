const { readScoreRecord, saveScore: saveLocalScore } = require('../../utils/profile-score')
const auth = require('../../utils/auth')
const LOGIN_ENABLED = false

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

Page({
  data: { scoreOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], savedScore: null, draftScore: null, manualScore: '', savedAt: '', user: null, authLoading: false, loginLoading: false, authError: '', loginEnabled: LOGIN_ENABLED },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 2 })
    try {
      const record = readScoreRecord()
      this.setData({ savedScore: record ? record.value : null, draftScore: record && record.value <= 10 ? record.value : null, manualScore: record && record.value === 99 ? '99' : '', savedAt: record && record.updatedAt ? formatTime(record.updatedAt) : '' })
    } catch (error) { wx.showToast({ title: '读取评分失败，请重试', icon: 'none' }) }
    if (LOGIN_ENABLED) this.loadUser()
    else this.setData({ user: null, authLoading: false, loginLoading: false, authError: '' })
  },
  async loadUser() {
    const session = auth.readSession()
    if (!session) { this.setData({ user: null, authError: '', authLoading: false }); return }
    this.setData({ user: session.user || null, authError: '', authLoading: true })
    try { this.setData({ user: await auth.refreshUser() }) }
    catch (error) {
      const cachedSession = auth.readSession()
      this.setData({ user: cachedSession && cachedSession.user || null, authError: error.message })
    }
    finally { this.setData({ authLoading: false }) }
  },
  async login() {
    if (this.data.loginLoading) return
    this.setData({ loginLoading: true, authError: '' })
    try {
      const session = await auth.login()
      this.setData({ user: session.user })
      wx.showToast({ title: '登录成功', icon: 'success' })
    } catch (error) { this.setData({ authError: error.message }); wx.showToast({ title: error.message, icon: 'none', duration: 3000 }) }
    finally { this.setData({ loginLoading: false }) }
  },
  logout() {
    wx.showModal({ title: '退出登录', content: '退出后本机工具数据不会删除，确定退出吗？', success: async (result) => {
      if (!result.confirm) return
      try { await auth.logout() } catch (error) {}
      this.setData({ user: null, authError: '' })
      wx.showToast({ title: '已退出登录', icon: 'success' })
    } })
  },
  chooseScore(event) { this.setData({ draftScore: Number(event.currentTarget.dataset.score), manualScore: '' }) },
  inputManualScore(event) {
    const manualScore = String(event.detail.value || '').replace(/\D/g, '').slice(0, 2)
    this.setData({ manualScore, draftScore: manualScore ? null : this.data.draftScore })
  },
  saveScore() {
    try {
      const value = this.data.manualScore ? Number(this.data.manualScore) : this.data.draftScore
      const record = saveLocalScore(value)
      this.setData({ savedScore: record.value, draftScore: record.value <= 10 ? record.value : null, manualScore: record.value === 99 ? '99' : '', savedAt: formatTime(record.updatedAt) })
      wx.showToast({ title: '已保存到本机', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '保存失败，请检查本机空间', icon: 'none' }) }
  },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }) },
  openPrivacy() { wx.navigateTo({ url: '/pages/legal/privacy/index' }) },
  openTerms() { wx.navigateTo({ url: '/pages/legal/terms/index' }) }
})
