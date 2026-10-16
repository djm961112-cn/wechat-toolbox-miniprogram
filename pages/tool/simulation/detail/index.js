const { readPlans, formatPlanForDisplay } = require('../../../../utils/simulation-plans')
const { previewEntries } = require('../../../../utils/football-simulation')
const { queryMatchPage, gradeEntry } = require('../../../../utils/football-results')
const { queryFootballAnalysis } = require('../../../../utils/football-analysis')

Page({
  data: {
    plan: null, analysis: null, analysisLoading: false, analysisError: '', analysisTab: 'feature',
    analysisTabs: [{ id: 'feature', name: '特征分析' }, { id: 'history', name: '历史交锋' }, { id: 'table', name: '积分榜' }, { id: 'recent', name: '比赛近况' }, { id: 'future', name: '未来赛事' }, { id: 'scorer', name: '射手信息' }, { id: 'injury', name: '伤停一览' }],
    matchPage: null, matchLoading: false, matchError: '', entryCount: 0, entryGroups: [], error: '', entryError: ''
  },
  onLoad(options = {}) {
    try {
      if (options.analysisId) {
        this.analysisId = decodeURIComponent(options.analysisId)
        wx.setNavigationBarTitle({ title: '对阵分析' })
        this.loadAnalysis()
        return
      }
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
  async loadAnalysis() {
    if (!this.analysisId || this.analysisRequestRunning) return
    this.analysisRequestRunning = true
    this.setData({ analysisLoading: true, analysisError: '' })
    try {
      const analysis = await queryFootballAnalysis(this.analysisId)
      if (!this.unloaded) this.setData({ analysis, analysisLoading: false })
    } catch (error) {
      if (!this.unloaded) this.setData({ analysisLoading: false, analysisError: error.message || '分析数据查询失败' })
    } finally { this.analysisRequestRunning = false }
  },
  refreshAnalysis() { this.loadAnalysis() },
  selectAnalysisTab(event) { this.setData({ analysisTab: event.currentTarget.dataset.id }) },
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
