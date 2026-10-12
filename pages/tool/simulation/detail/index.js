const { readPlans, formatTime } = require('../../../../utils/simulation-plans')
const { previewEntries } = require('../../../../utils/football-simulation')

Page({
  data: { plan: null, entries: [], error: '', entryError: '' },
  onLoad(options = {}) {
    try {
      const plan = readPlans().find((item) => item.id === options.id)
      if (!plan) { this.setData({ error: '方案不存在或已删除' }); return }
      this.setData({ plan: { ...plan, createdTime: formatTime(plan.createdAt) } })
      // Rebuild entries from the saved snapshot only; current official odds must not alter history.
      this.matches = plan.matches.map((match) => ({ ...match, options: match.selections }))
      this.loadMoreEntries()
    } catch (error) { this.setData({ error: '读取方案失败，请返回重试' }) }
  },
  loadMoreEntries() {
    if (!this.data.plan || this.data.entryError) return
    try {
      const { passes, multiplier } = this.data.plan
      if (!Array.isArray(passes) || this.matches.some((match) => !Array.isArray(match.options))) throw new Error('missing snapshot')
      const next = previewEntries(this.matches, passes, multiplier, this.data.entries.length)
      if (!next.length && this.data.entries.length < this.data.plan.count) throw new Error('incomplete snapshot')
      this.setData({ entries: this.data.entries.concat(next) })
    } catch (error) { this.setData({ entryError: '历史方案缺少完整组合数据，无法展开逐注明细' }) }
  }
})
