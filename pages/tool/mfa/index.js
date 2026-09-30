const { generateTotp, parseOtpAuthUri } = require('../../../utils/totp')

const STORAGE_KEY = 'mfa-totp-accounts-v1'

Page({
  data: {
    activeTab: 'list',
    accounts: [],
    codes: []
  },

  onShow() {
    this.loadAccounts()
    this.updateCodes()
    this.startTicker()
  },

  onHide() {
    this.stopTicker()
  },

  onUnload() {
    this.stopTicker()
  },

  loadAccounts() {
    let accounts = []
    try {
      accounts = wx.getStorageSync(STORAGE_KEY) || []
    } catch (error) {
      accounts = []
    }
    this.setData({ accounts })
  },

  startTicker() {
    this.stopTicker()
    this.ticker = setInterval(() => this.updateCodes(), 1000)
  },

  stopTicker() {
    if (this.ticker) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  },

  updateCodes() {
    const now = Math.floor(Date.now() / 1000)
    const codes = this.data.accounts.map((account) => {
      const elapsed = now % account.period
      const countdown = account.period - elapsed
      return {
        id: account.id,
        code: generateTotp(account.secret, now, account.period, account.digits),
        countdown,
        progress: Math.round((countdown / account.period) * 100)
      }
    })
    this.setData({ codes })
  },

  selectTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab })
  },

  scanAndBind() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (result) => this.bindScannedCode(result.result),
      fail: (error) => {
        if (!error || !/cancel/i.test(error.errMsg || '')) {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none' })
        }
      }
    })
  },

  bindScannedCode(value) {
    let account
    try {
      account = parseOtpAuthUri(value)
    } catch (error) {
      wx.showModal({ title: '无法绑定', content: error.message, showCancel: false })
      return
    }

    const accounts = this.data.accounts.slice()
    if (accounts.some((item) => item.secret === account.secret && item.account === account.account && item.issuer === account.issuer)) {
      this.setData({ activeTab: 'list' })
      wx.showToast({ title: '这个账户已经绑定', icon: 'none' })
      return
    }

    accounts.push({ id: String(Date.now()), ...account })
    try {
      wx.setStorageSync(STORAGE_KEY, accounts)
    } catch (error) {
      wx.showToast({ title: '保存失败，请检查本机空间', icon: 'none' })
      return
    }
    this.setData({ accounts, activeTab: 'list' }, () => this.updateCodes())
    wx.showToast({ title: '绑定成功', icon: 'success' })
  },

  removeAccount(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '解除绑定',
      content: '删除后将无法再用这个验证器生成动态码，确定删除吗？',
      success: (result) => {
        if (!result.confirm) return
        const accounts = this.data.accounts.filter((account) => account.id !== id)
        try {
          wx.setStorageSync(STORAGE_KEY, accounts)
          this.setData({ accounts }, () => this.updateCodes())
        } catch (error) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      }
    })
  }
})
