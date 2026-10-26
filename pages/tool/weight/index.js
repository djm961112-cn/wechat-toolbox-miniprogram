const { readRecords, saveRecord, periodRows, chartModel } = require('../../../utils/weight-records')
const { ensureToolLogin } = require('../../../utils/tool-access')
const cloud = require('../../../utils/cloud-sync')

const PERIOD_LABELS = { week: '近 7 天', month: '本月', year: '本年' }

Page({
  data: {
    activeTab: 'record', weight: '', latest: null,
    periods: [{ id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }],
    period: 'week', periodLabel: PERIOD_LABELS.week,
    points: [], segments: [], min: '', max: '', change: ''
  },
  async onLoad() {
    if (!await ensureToolLogin('weight')) { wx.navigateBack(); return }
    const result = await cloud.prepareTool('weight')
    if (result.authExpired) { wx.showToast({ title: '登录已失效，请重新进入并登录', icon: 'none' }); wx.navigateBack(); return }
    this.accessReady = true
    this.loadRecords()
    if (result.pendingUpload) wx.showModal({ title: '发现本地体重记录', content: '请到“我的 → 设置 → 本地数据上传”完成首次上传后启用自动同步。', showCancel: false })
  },
  onShow() { if (this.accessReady && this.data.activeTab === 'chart') this.loadRecords() },
  selectTab(event) {
    const activeTab = event.currentTarget.dataset.tab
    this.setData({ activeTab }, () => { if (activeTab === 'chart') this.refreshChart() })
  },
  onWeightInput(event) { this.setData({ weight: event.detail.value }) },
  saveWeight() {
    try {
      const latest = saveRecord(this.data.weight)
      this.records = readRecords()
      this.setData({ weight: '', latest })
      cloud.scheduleSync('weight')
      wx.showToast({ title: '体重已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' })
    }
  },
  selectPeriod(event) {
    const period = event.currentTarget.dataset.period
    if (!PERIOD_LABELS[period]) return
    this.setData({ period, periodLabel: PERIOD_LABELS[period] }, () => this.refreshChart())
  },
  loadRecords() {
    try {
      this.records = readRecords()
      this.setData({ latest: this.records.length ? this.records[this.records.length - 1] : null }, () => {
        if (this.data.activeTab === 'chart') this.refreshChart()
      })
    } catch (error) {
      this.records = []
      wx.showToast({ title: '读取体重记录失败', icon: 'none' })
    }
  },
  refreshChart() {
    const rows = periodRows(this.records || [], this.data.period)
    this.setData(chartModel(rows))
  }
})
