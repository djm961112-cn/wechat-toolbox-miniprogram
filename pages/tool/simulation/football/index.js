const { API_URL, POOLS, normalizeFeed, selectedMatches, availablePasses, calculate, previewEntries } = require('../../../../utils/football-simulation')
const { savePlan, formatTime } = require('../../../../utils/simulation-plans')

Page({
  data: {
    loading: true, error: '', updatedAt: '', fetchedAt: '', market: 'had',
    markets: [{ id: 'mixed', name: '混合玩法' }, ...POOLS.map(({ id, name }) => ({ id, name }))],
    matches: [], selections: {}, selectedCount: 0, passMode: 'free', passes: [], chosenPassIds: [],
    multiplier: '1', summary: null, calculationError: '', previewVisible: false, preview: null,
    planTitle: '', planNote: '', saving: false, expandedMatchId: '', saved: false, previewEntries: []
  },
  onShow() { this.refreshFeed() },
  onUnload() { this.unloaded = true; if (this.requestTask) this.requestTask.abort() },
  onPullDownRefresh() { this.refreshFeed() },
  refreshFeed() {
    const version = (this.requestVersion || 0) + 1
    this.requestVersion = version
    if (this.requestTask) this.requestTask.abort()
    this.setData({ loading: true, error: '', previewVisible: false, summary: null })
    this.requestTask = wx.request({
      url: API_URL, data: { channel: 'c' }, timeout: 15000,
      success: (res) => {
        if (this.unloaded || version !== this.requestVersion) return
        try {
          if (res.statusCode !== 200) throw new Error('官方接口暂时不可用')
          const feed = normalizeFeed(res.data)
          this.feed = feed
          // Re-entering the page always refreshes data and clears old selections to prevent mixing historical odds.
          this.setData({ loading: false, updatedAt: feed.updatedAt, fetchedAt: formatTime(Date.now()), selections: {}, chosenPassIds: [], saved: false }, () => this.updateView())
        } catch (error) { this.showFeedError(error.message) }
      },
      fail: (error) => {
        if (this.unloaded || version !== this.requestVersion || /abort/.test(error.errMsg || '')) return
        this.showFeedError(/domain|合法域名/.test(error.errMsg || '') ? '请在微信后台配置 request 合法域名 https://webapi.sporttery.cn' : '赛事加载失败，请检查网络后重试')
      },
      complete: () => { wx.stopPullDownRefresh() }
    })
  },
  showFeedError(error) { this.feed = null; this.setData({ loading: false, error, matches: [], summary: null, selectedCount: 0, selections: {}, passes: [], chosenPassIds: [] }) },
  selectMarket(event) { this.setData({ market: event.currentTarget.dataset.id, expandedMatchId: '' }, () => this.updateView()) },
  expandMatch(event) { const id = event.currentTarget.dataset.id; this.setData({ expandedMatchId: this.data.expandedMatchId === id ? '' : id }, () => this.updateView()) },
  toggleOption(event) {
    if (!this.feed || this.data.loading) return
    const { key, match } = event.currentTarget.dataset
    const selections = { ...this.data.selections }
    if (selections[key]) delete selections[key]
    else {
      const selected = selectedMatches(this.feed.matches, selections)
      if (selected.length >= 8 && !selected.some((item) => item.id === match)) { wx.showToast({ title: '最多选择 8 场比赛', icon: 'none' }); return }
      selections[key] = true
    }
    this.setData({ selections, saved: false }, () => this.updateView())
  },
  clearSelections() { this.setData({ selections: {}, chosenPassIds: [], saved: false }, () => this.updateView()) },
  setPassMode(event) { this.setData({ passMode: event.currentTarget.dataset.id, chosenPassIds: [], saved: false }, () => this.updateView()) },
  togglePass(event) {
    const id = event.currentTarget.dataset.id
    let ids = this.data.chosenPassIds.slice()
    if (ids.includes(id)) ids = ids.filter((value) => value !== id)
    else if (this.data.passMode === 'compound' && id !== 'Single') ids = [...ids.filter((value) => value === 'Single'), id]
    else ids.push(id)
    this.setData({ chosenPassIds: ids, saved: false }, () => this.updateView())
  },
  setMultiplier(event) { this.setData({ multiplier: event.detail.value, saved: false }, () => this.updateView()) },
  configurePasses() { wx.pageScrollTo({ selector: '#pass-settings', duration: 200 }) },
  updateView() {
    if (!this.feed) return
    const selected = selectedMatches(this.feed.matches, this.data.selections)
    const available = availablePasses(selected, this.feed.rules, this.data.passMode)
    const chosenPassIds = this.data.chosenPassIds.filter((id) => available.some((pass) => pass.id === id))
    const matches = this.feed.matches.map((match) => {
      const allPools = match.pools.map((pool) => ({ ...pool, options: pool.options.map((option) => {
        const key = `${match.id}:${pool.id}:${option.key}`
        return { ...option, selectionKey: key, selected: Boolean(this.data.selections[key]) }
      }) }))
      const allSelected = allPools.reduce((count, pool) => count + pool.options.filter((option) => option.selected).length, 0)
      const pools = allPools.filter((pool) => this.data.market === 'mixed' || pool.id === this.data.market)
      const expanded = this.data.expandedMatchId === match.id
      return { ...match, selectedOptions: allSelected, expanded, pools: this.data.market === 'mixed' && !expanded ? pools.filter((pool) => ['had','hhad'].includes(pool.id)) : pools }
    }).filter((match) => this.data.market === 'mixed' || match.pools.length)
    let summary = null
    let calculationError = ''
    if (selected.length && chosenPassIds.length) {
      try { summary = calculate(selected, available.filter((pass) => chosenPassIds.includes(pass.id)), Number(this.data.multiplier)) }
      catch (error) { calculationError = error.message }
    }
    this.setData({ matches, selectedCount: selected.length, passes: available.map((pass) => ({ ...pass, selected: chosenPassIds.includes(pass.id) })), chosenPassIds, summary, calculationError })
  },
  openPreview() {
    if (!this.feed || this.data.loading || !this.data.summary) { wx.showToast({ title: this.data.calculationError || '请选择比赛及过关方式', icon: 'none' }); return }
    const selected = selectedMatches(this.feed.matches, this.data.selections)
    const matches = selected.map((match) => ({
      id: match.id, label: `${match.number} ${match.home} vs ${match.away}`, number: match.number,
      businessDate: match.businessDate, date: match.date, time: match.time, league: match.league,
      home: match.home, away: match.away,
      selections: match.options.map(({ poolId, poolName, key, name, odds, single, allUp, goalLine, updatedAt }) => ({ poolId, poolName, key, name, odds, single, allUp, goalLine, updatedAt })),
      selectionText: match.options.map((option) => `${option.poolName}${option.goalLine ? `(${option.goalLine})` : ''} ${option.name} @${option.odds}${option.single ? ' [可单关]' : ' [仅串关]'}`).join(' · ')
    }))
    const preview = {
      toolId: 'football', source: 'sporttery-live', sourceUrl: 'https://m.sporttery.cn/mjc/jsq/zqspf/',
      sourceUpdatedAt: this.data.updatedAt, fetchedAt: this.data.fetchedAt,
      matches, multiplier: Number(this.data.multiplier), passes: this.data.passes.filter((pass) => pass.selected).map(({ id, label, sizes }) => ({ id, label, sizes })),
      passMode: this.data.passMode, passLabel: this.data.passes.filter((pass) => pass.selected).map((pass) => pass.label).join(' + '), ...this.data.summary
    }
    this.previewMatches = selected
    this.setData({ preview, previewEntries: previewEntries(selected, preview.passes, preview.multiplier), previewVisible: true, planTitle: `足球方案 ${formatTime(Date.now())}`, planNote: '' })
  },
  loadMoreEntries() {
    const next = previewEntries(this.previewMatches, this.data.preview.passes, this.data.preview.multiplier, this.data.previewEntries.length)
    this.setData({ previewEntries: this.data.previewEntries.concat(next) })
  },
  closePreview() { if (!this.data.saving) this.setData({ previewVisible: false }) },
  stopPropagation() {},
  setTitle(event) { this.setData({ planTitle: event.detail.value }) },
  setNote(event) { this.setData({ planNote: event.detail.value }) },
  savePreview() {
    if (this.data.saving || this.data.saved || !this.data.previewVisible || !this.data.preview) return
    const title = this.data.planTitle.trim()
    if (!title) { wx.showToast({ title: '请输入方案名称', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      savePlan({ ...this.data.preview, title, note: this.data.planNote.trim() })
      this.setData({ saved: true, saving: false, previewVisible: false })
      wx.showToast({ title: '已保存到我的方案', icon: 'success' })
    } catch (error) { this.setData({ saving: false }); wx.showToast({ title: '保存失败，请检查本机空间', icon: 'none' }) }
  },
  viewPlans() {
    const pages = getCurrentPages()
    const parent = pages[pages.length - 2]
    if (parent && parent.route === 'pages/tool/simulation/index') {
      parent.setData({ activeTab: 'plans', selectedToolId: 'football' })
      wx.navigateBack()
    } else wx.redirectTo({ url: '/pages/tool/simulation/index?tab=plans' })
  }
})
