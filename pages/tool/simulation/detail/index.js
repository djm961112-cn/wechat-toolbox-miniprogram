const { readPlans, formatPlanForDisplay } = require('../../../../utils/simulation-plans')
const { previewEntries } = require('../../../../utils/football-simulation')
const { queryMatchPage, gradeEntry } = require('../../../../utils/football-results')

Page({
  data: { plan: null, matchPage: null, matchLoading: false, matchError: '', entryCount: 0, entryGroups: [], error: '', entryError: '' },
  onLoad(options = {}) {
    try {
      const planId = options.planId || options.id
      const plan = readPlans().find((item) => item.id === planId)
      if (!plan) { this.setData({ error: '方案不存在或已删除' }); return }
      if (options.matchId) {
        const match = plan.matches.find((item) => String(item.id) === String(options.matchId))
        if (!match) { this.setData({ error: '比赛不存在或已从方案中移除' }); return }
        this.matchSnapshot = match
        wx.setNavigationBarTitle({ title: '比赛详情' })
        this.loadMatchPage()
        return
      }
      this.setData({ plan: formatPlanForDisplay(plan) })
      // Rebuild entries from the saved snapshot only; current official odds must not alter history.
      this.matches = plan.matches.map((match) => ({ ...match, options: match.selections }))
      this.entries = []
      this.loadMoreEntries()
    } catch (error) { this.setData({ error: '读取方案失败，请返回重试' }) }
  },
  onUnload() { this.unloaded = true; if (this.liveTimer) clearTimeout(this.liveTimer) },
  async loadMatchPage() {
    if (!this.matchSnapshot || this.matchRequestRunning) return
    this.matchRequestRunning = true
    this.setData({ matchLoading: true, matchError: '' })
    try {
      const matchPage = await queryMatchPage(this.matchSnapshot)
      if (this.unloaded) return
      this.setData({ matchPage, matchLoading: false, matchError: '' })
      wx.setNavigationBarTitle({ title: matchPage.mode === 'result' ? '赛果详情' : '比分直播' })
      if (this.liveTimer) clearTimeout(this.liveTimer)
      if (matchPage.mode === 'live') this.liveTimer = setTimeout(() => this.loadMatchPage(), 30000)
    } catch (error) {
      if (!this.unloaded) this.setData({ matchLoading: false, matchError: error.message || '比赛数据查询失败' })
    } finally { this.matchRequestRunning = false }
  },
  refreshMatchPage() {
    if (this.liveTimer) clearTimeout(this.liveTimer)
    this.loadMatchPage()
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
        const verdict = this.data.plan.check && this.data.plan.check.status === 'complete' ? gradeEntry(entry.legs, this.data.plan.check.results, this.data.plan.multiplier) : {}
        group.entries.push({ id, label, choices, returnAmount, ...verdict })
      })
      this.entries = entries
      this.setData({ entryCount: entries.length, entryGroups })
    } catch (error) { this.setData({ entryError: '历史方案缺少完整组合数据，无法展开逐项明细' }) }
  }
})
