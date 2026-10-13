const { readPlans, formatPlanForDisplay } = require('../../../../utils/simulation-plans')
const { previewEntries } = require('../../../../utils/football-simulation')
const { gradeEntry } = require('../../../../utils/football-results')

Page({
  data: { plan: null, entryCount: 0, entryGroups: [], error: '', entryError: '' },
  onLoad(options = {}) {
    try {
      const plan = readPlans().find((item) => item.id === options.id)
      if (!plan) { this.setData({ error: '方案不存在或已删除' }); return }
      this.setData({ plan: formatPlanForDisplay(plan) })
      // Rebuild entries from the saved snapshot only; current official odds must not alter history.
      this.matches = plan.matches.map((match) => ({ ...match, options: match.selections }))
      this.entries = []
      this.loadMoreEntries()
    } catch (error) { this.setData({ error: '读取方案失败，请返回重试' }) }
  },
  loadMoreEntries() {
    if (!this.data.plan || this.data.entryError) return
    try {
      const { passes, multiplier } = this.data.plan
      if (!Array.isArray(passes) || this.matches.some((match) => !Array.isArray(match.options))) throw new Error('missing snapshot')
      const next = previewEntries(this.matches, passes, multiplier, this.entries.length)
      if (!next.length && this.entries.length < this.data.plan.count) throw new Error('incomplete snapshot')
      const entries = this.entries.concat(next)
      const entryGroups = []
      entries.forEach((entry) => {
        let group = entryGroups.find((item) => item.id === entry.groupId)
        if (!group) {
          group = { id: entry.groupId, title: `组合 ${entryGroups.length + 1} · ${entry.groupLabel}`, choices: entry.groupChoices, count: entry.groupCount, entries: [] }
          entryGroups.push(group)
        }
        const { id, label, choices, returnAmount } = entry
        const verdict = this.data.plan.check ? gradeEntry(entry.legs, this.data.plan.check.results, this.data.plan.multiplier) : {}
        group.entries.push({ id, label, choices, returnAmount, ...verdict })
      })
      this.entries = entries
      this.setData({ entryCount: entries.length, entryGroups })
    } catch (error) { this.setData({ entryError: '历史方案缺少完整组合数据，无法展开逐注明细' }) }
  }
})
