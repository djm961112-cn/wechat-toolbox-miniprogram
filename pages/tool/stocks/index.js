const { stockRequest, rulePayload, normalizeCode } = require('../../../utils/stocks')
const { ensureToolLogin } = require('../../../utils/tool-access')

const emptyForm = () => ({ requestId: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`, symbol: '', metric: 'PRICE', comparison: 'GTE', threshold: '', repeatMode: 'ONCE', enabled: true, matchCurrent: false })
function displayTime(input) {
  const date = new Date(input)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

Page({
  data: { tab: 'watch', providerState: '连接中', error: '', watchlist: [], rules: [], events: [], devices: [],
    keyword: '', searchResults: [], form: emptyForm(), editingId: null, pairCode: '', barkKey: '', barkConfigured: false, busy: false },
  async onShow() {
    this.visible = true
    const generation = this.showGeneration = (this.showGeneration || 0) + 1
    clearInterval(this.timer)
    if (!await ensureToolLogin('stocks') || !this.visible || generation !== this.showGeneration) return
    await this.refreshAll()
    if (!this.visible || generation !== this.showGeneration) return
    this.timer = setInterval(() => this.refreshDashboard(), 3000)
  },
  onHide() { this.visible = false; clearInterval(this.timer) },
  onUnload() { this.visible = false; clearInterval(this.timer) },
  async onPullDownRefresh() { try { await this.refreshAll() } finally { wx.stopPullDownRefresh() } },
  selectTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); if (e.currentTarget.dataset.tab !== 'watch') this.refreshAll() },
  async refreshDashboard() {
    if (this.refreshing || !this.visible) return
    this.refreshing = true
    try {
      const result = await stockRequest('stocks/dashboard')
      if (!this.visible) return
      this.setData({ providerState: result.providerState, barkConfigured: result.barkConfigured, error: '',
        watchlist: result.watchlist.map(item => ({ ...item, priceText: item.price == null ? '待更新' : Number(item.price).toFixed(2),
          changeText: item.changePercent == null ? '—' : `${Number(item.changePercent).toFixed(2)}%`,
          sourceText: item.sourceTime ? displayTime(item.sourceTime) : '等待有效行情', stale: item.fresh !== true })),
        gaps: (result.gaps || []).map(item => ({ ...item, text: `${displayTime(item.startedAt)} · ${item.reason} · 区间行情未确认` })) })
    } catch (error) { if (this.visible) this.setData({ error: error.message }) }
    finally { this.refreshing = false }
  },
  async refreshAll() {
    await this.refreshDashboard()
    try {
      const [rules, events, devices] = await Promise.all([stockRequest('stocks/rules'), stockRequest('stocks/events'), stockRequest('stock-devices')])
      if (this.visible) this.setData({ rules: rules.map(r => ({ ...r, label: `${r.metric === 'PRICE' ? '价格' : '日涨跌幅'} ${r.comparison === 'GTE' ? '≥' : '≤'} ${r.threshold}${r.metric === 'PRICE' ? '元' : '%'}`, modeText: r.repeatMode === 'ONCE' ? '一次' : '每日一次' })),
        events: events.map(e => ({ ...e, timeText: displayTime(e.sourceTime) })), devices })
    } catch (error) { if (this.visible) this.setData({ error: error.message }) }
  },
  inputKeyword(e) { this.setData({ keyword: e.detail.value }) },
  async search() {
    try { this.setData({ searchResults: await stockRequest(`stocks/search?q=${encodeURIComponent(this.data.keyword.trim())}`) }) }
    catch (error) { this.alert(error) }
  },
  async addResult(e) {
    const item = this.data.searchResults[e.currentTarget.dataset.index]
    await this.perform(async () => { await stockRequest('stocks/watchlist', 'POST', item); this.setData({ keyword: '', searchResults: [] }); await this.refreshAll() })
  },
  async addCode() {
    await this.perform(async () => { const symbol = normalizeCode(this.data.keyword); await stockRequest('stocks/watchlist', 'POST', { symbol }); this.setData({ keyword: '' }); await this.refreshAll() })
  },
  async removeStock(e) {
    const symbol = e.currentTarget.dataset.symbol
    wx.showModal({ title: '移除自选', content: `移除 ${symbol} 并删除它的监控规则？历史告警会保留。`, success: async r => {
      if (r.confirm) await this.perform(async () => { await stockRequest(`stocks/watchlist/${symbol}`, 'DELETE'); await this.refreshAll() })
    } })
  },
  newRule(e) { this.setData({ form: { ...emptyForm(), symbol: e.currentTarget.dataset.symbol }, editingId: null, tab: 'rules' }) },
  editRule(e) {
    const rule = this.data.rules.find(r => String(r.id) === String(e.currentTarget.dataset.id))
    if (!rule) return
    this.editingRule = rule
    this.setData({ form: { ...rule, threshold: String(rule.threshold), matchCurrent: false }, editingId: rule.id })
  },
  inputThreshold(e) { this.setData({ 'form.threshold': e.detail.value }) },
  metric(e) { this.setData({ 'form.metric': Number(e.detail.value) === 0 ? 'PRICE' : 'DAY_CHANGE_PCT' }) },
  comparison(e) { this.setData({ 'form.comparison': Number(e.detail.value) === 0 ? 'GTE' : 'LTE' }) },
  repeat(e) { this.setData({ 'form.repeatMode': Number(e.detail.value) === 0 ? 'ONCE' : 'DAILY_ONCE' }) },
  enabled(e) { this.setData({ 'form.enabled': e.detail.value }) },
  matchCurrent(e) { this.setData({ 'form.matchCurrent': e.detail.value }) },
  async saveRule() {
    await this.perform(async () => {
      const body = rulePayload(this.data.form, this.data.editingId ? this.editingRule : null)
      await stockRequest(this.data.editingId ? `stocks/rules/${this.data.editingId}` : 'stocks/rules', this.data.editingId ? 'PUT' : 'POST', body)
      this.setData({ form: emptyForm(), editingId: null }); await this.refreshAll()
    })
  },
  async deleteRule(e) { await this.perform(async () => { await stockRequest(`stocks/rules/${e.currentTarget.dataset.id}`, 'DELETE'); await this.refreshAll() }) },
  inputPair(e) { this.setData({ pairCode: e.detail.value }) },
  async approvePair() {
    const code = this.data.pairCode.trim()
    if (!/^\d{8}$/.test(code)) { this.alert(new Error('请输入 Mac 上显示的8位配对码')); return }
    let device
    try { device = await stockRequest(`stock-devices/pair-info?code=${code}`) } catch (error) { this.alert(error); return }
    wx.showModal({ title: '确认 Mac 配对', content: `允许设备“${device.name}”（配对码 ${code}）访问股票监控？`, success: async r => {
      if (r.confirm) await this.perform(async () => { await stockRequest('stock-devices/approve', 'POST', { code }); this.setData({ pairCode: '' }); await this.refreshAll() })
    } })
  },
  async revoke(e) { await this.perform(async () => { await stockRequest(`stock-devices/${e.currentTarget.dataset.id}`, 'DELETE'); await this.refreshAll() }) },
  inputBark(e) { this.setData({ barkKey: e.detail.value.trim() }) },
  async saveBark() { await this.perform(async () => { await stockRequest('stocks/notifications/bark', 'PUT', { key: this.data.barkKey }); this.setData({ barkKey: '' }); await this.refreshDashboard() }) },
  async testNotification() { await this.perform(async () => { await stockRequest('stocks/notifications/test', 'POST'); wx.showToast({ title: '已创建测试通知', icon: 'none' }); await this.refreshAll() }) },
  async authorize() { await this.perform(async () => { const result = await stockRequest('stocks/provider/authorization', 'POST'); wx.setClipboardData({ data: result.url, success: () => wx.showModal({ title: '链接已复制', content: '请在浏览器打开链接，登录富途并只授权行情读取。完成后回到这里刷新。', showCancel: false }) }) }) },
  async perform(action) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await action() } catch (error) { this.alert(error) } finally { this.setData({ busy: false }) }
  },
  alert(error) { wx.showToast({ title: error.message || '操作失败', icon: 'none', duration: 3000 }) }
})
