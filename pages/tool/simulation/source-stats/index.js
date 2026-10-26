const { readPlans, simulationTools } = require('../../../../utils/simulation-plans')
const { planRows, aggregate, groupRows, filterRows, money } = require('../../../../utils/simulation-stats')
const { ensureToolLogin } = require('../../../../utils/tool-access')
const cloud = require('../../../../utils/cloud-sync')

const monthOptions = [{ label: '全部月份', value: '' }, ...Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1}月`, value: String(index + 1).padStart(2, '0') }))]

Page({
  data: { title: '', sourceId: '', toolId: 'football', year: '', month: '', yearOptions: [{ label: '全部年份', value: '' }], yearIndex: 0, monthOptions, monthIndex: 0,
    summary: null, months: [], expandedDays: {}, error: '' },
  async onLoad(options = {}) {
    if (!await ensureToolLogin('simulation')) { wx.navigateBack(); return }
    const result = await cloud.prepareTool('simulation')
    if (result.authExpired) { wx.showToast({ title: '登录已失效，请重新进入并登录', icon: 'none' }); wx.navigateBack(); return }
    const toolId = simulationTools.some((tool) => tool.id === options.toolId) ? options.toolId : 'football'
    this.setData({ toolId, sourceId: options.sourceId || '', year: options.year || '', month: options.month || '' })
    this.accessReady = true
    this.refresh()
  },
  onShow() { if (this.accessReady) this.refresh() },
  changeYear(event) {
    const selected = this.data.yearOptions[Number(event.detail.value)]
    this.setData({ year: selected ? selected.value : '', month: '' }, () => this.refresh())
  },
  changeMonth(event) {
    const selected = monthOptions[Number(event.detail.value)]
    this.setData({ month: selected ? selected.value : '' }, () => this.refresh())
  },
  toggleDay(event) {
    const id = event.currentTarget.dataset.id
    this.setData({ expandedDays: { ...this.data.expandedDays, [id]: !this.data.expandedDays[id] } }, () => this.refresh())
  },
  openPlan(event) { wx.navigateTo({ url: `/pages/tool/simulation/detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) },
  refresh() {
    try {
      const sourceRows = planRows(readPlans(), this.data.toolId).filter((row) => row.sourceId === this.data.sourceId)
      const years = [...new Set(sourceRows.map((row) => row.periodDate.slice(0, 4)))].sort().reverse()
      const year = years.includes(this.data.year) ? this.data.year : ''
      const yearOptions = [{ label: '全部年份', value: '' }, ...years.map((value) => ({ label: `${value}年`, value }))]
      const rows = filterRows(sourceRows, year, this.data.month, 'periodDate')
      const months = groupRows(rows, (row) => row.periodDate.slice(0, 7), (row) => `${row.periodDate.slice(0, 4)}年${Number(row.periodDate.slice(5, 7))}月`)
        .sort((left, right) => right.id.localeCompare(left.id))
        .map((group) => ({ id: group.id, label: group.label, summary: group.summary,
          days: groupRows(group.rows, (row) => row.periodDate, (row) => `${Number(row.periodDate.slice(5, 7))}月${Number(row.periodDate.slice(8, 10))}日`)
            .sort((left, right) => right.id.localeCompare(left.id))
            .map((day) => ({ id: day.id, label: day.label, summary: day.summary, expanded: Boolean(this.data.expandedDays[day.id]),
              plans: day.rows.map((row, index) => ({ id: row.id, label: `方案 ${index + 1}`, periodLabel: row.periodLabel, time: row.createdTime,
                cost: money(row.cost), returned: row.checked ? money(row.returned) : '—', status: row.checked ? row.won ? '命中' : row.returned > 0 ? '已返还' : '未命中' : '待核对' })) })) }))
      this.setData({ title: sourceRows[0] ? sourceRows[0].sourceName : this.data.sourceId ? '来源记录' : '未关联来源', year, yearOptions,
        yearIndex: yearOptions.findIndex((item) => item.value === year), monthIndex: monthOptions.findIndex((item) => item.value === this.data.month),
        summary: aggregate(rows), months, error: '' })
    } catch (error) { this.setData({ error: error.message || '来源统计失败', months: [], summary: null }) }
  }
})
