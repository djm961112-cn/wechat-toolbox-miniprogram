const { API_URL, POOLS, normalizeFeed, selectedMatches, availablePasses, calculate } = require('../../../../utils/football-simulation')
const { savePlan, formatTime, formatSelectionRows } = require('../../../../utils/simulation-plans')

Page({
  data: {
    loading: true, error: '', updatedAt: '', fetchedAt: '', market: 'had',
    markets: [{ id: 'had', name: '胜平负 / 让球' }, ...POOLS.filter(({ id }) => !['had', 'hhad'].includes(id)).map(({ id, name }) => ({ id, name })), { id: 'mixed', name: '混合玩法' }],
    matches: [], selections: {}, selectedCount: 0, passes: [], chosenPassIds: [], passSelectionEdited: false,
    multiplier: '1', summary: null, calculationError: '', passVisible: false, passLabel: '', passPanelHeight: 150, previewVisible: false, preview: null,
    planTitle: '', planNote: '', saving: false, expandedMatchId: '', saved: false, saveFormVisible: false
  },
  onShow() { this.refreshFeed() },
  onUnload() { this.unloaded = true; if (this.requestTask) this.requestTask.abort() },
  onPullDownRefresh() { this.refreshFeed() },
  refreshFeed() {
    const version = (this.requestVersion || 0) + 1
    this.requestVersion = version
    if (this.requestTask) this.requestTask.abort()
    this.setData({ loading: true, error: '', passVisible: false, previewVisible: false, summary: null, passes: [], chosenPassIds: [], passSelectionEdited: false, passLabel: '' })
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
  selectMarket(event) {
    const market = event.currentTarget.dataset.id
    if (market === this.data.market) return
    // A different top-level market starts a new selection; hidden choices must not enter its preview.
    this.setData({ market, expandedMatchId: '', selections: {}, selectedCount: 0, chosenPassIds: [], passSelectionEdited: false,
      passes: [], passLabel: '', passVisible: false, saved: false, previewVisible: false, preview: null, saveFormVisible: false,
      summary: null, calculationError: '' }, () => this.updateView())
  },
  expandMatch(event) { const id = event.currentTarget.dataset.id; this.setData({ expandedMatchId: this.data.expandedMatchId === id ? '' : id }, () => this.updateView()) },
  toggleOption(event) {
    if (!this.feed || this.data.loading) return
    const { key, match } = event.currentTarget.dataset
    const game = this.feed.matches.find((item) => item.id === match)
    if (!game || !game.pools.some((item) => item.options.some((option) => `${match}:${item.id}:${option.key}` === key))) return
    const selections = { ...this.data.selections }
    if (selections[key]) delete selections[key]
    else {
      const selected = selectedMatches(this.feed.matches, selections)
      if (selected.length >= 8 && !selected.some((item) => item.id === match)) { wx.showToast({ title: '最多选择 8 场比赛', icon: 'none' }); return }
      selections[key] = true
    }
    this.setData({ selections, saved: false }, () => this.updateView())
  },
  clearSelections() {
    if (!this.data.selectedCount || this.data.loading) return
    this.setData({ selections: {}, chosenPassIds: [], passSelectionEdited: false, saved: false, previewVisible: false, preview: null, saveFormVisible: false }, () => this.updateView())
  },
  togglePass(event) {
    const id = event.currentTarget.dataset.id
    if (!this.data.passes.some((pass) => pass.id === id)) return
    let ids = this.data.chosenPassIds.slice()
    if (ids.includes(id)) ids = ids.filter((value) => value !== id)
    else ids.push(id)
    this.setData({ chosenPassIds: ids, passSelectionEdited: true, saved: false }, () => this.updateView())
  },
  setMultiplier(event) { this.setData({ multiplier: event.detail.value, saved: false }, () => this.updateView()) },
  configurePasses() { this.setData({ passVisible: !this.data.passVisible }) },
  closePasses() { this.setData({ passVisible: false }) },
  updateView() {
    if (!this.feed) return
    const selected = selectedMatches(this.feed.matches, this.data.selections)
    const available = availablePasses(selected, this.feed.rules, 'free')
    let chosenPassIds = this.data.chosenPassIds.filter((id) => available.some((pass) => pass.id === id))
    let passSelectionEdited = this.data.passSelectionEdited
    // Rebuild the default when the number of selected matches changes. Manual choices
    // survive odds/market changes while valid; intentionally deselecting all remains allowed.
    if (selected.length !== this.data.selectedCount || !passSelectionEdited || (this.data.chosenPassIds.length && !chosenPassIds.length)) {
      const defaultPass = available[available.length - 1]
      chosenPassIds = defaultPass ? [defaultPass.id] : []
      passSelectionEdited = false
    }
    const matches = this.feed.matches.map((match) => {
      const allPools = POOLS.map((definition) => {
        const pool = match.pools.find((item) => item.id === definition.id)
        if (!pool && !['had', 'hhad'].includes(definition.id)) return null
        const goalLine = definition.id === 'had' ? '0' : pool && pool.goalLine
        return { ...definition, ...pool, missing: !pool, goalLine, goalLabel: goalLine == null ? '—' : Number(goalLine) > 0 ? `+${Number(goalLine)}` : String(goalLine), options: definition.options.map(([optionKey, name]) => {
          const option = pool && pool.options.find((item) => item.key === optionKey)
          const key = `${match.id}:${definition.id}:${optionKey}`
          return { ...option, key: optionKey, name, disabled: !option, oddsText: option ? option.oddsText : '-', selectionKey: key, selected: Boolean(option && this.data.selections[key]) }
        }) }
      }).filter(Boolean)
      const allSelected = allPools.reduce((count, pool) => count + pool.options.filter((option) => option.selected).length, 0)
      const pools = allPools.filter((pool) => this.data.market === 'mixed' || (this.data.market === 'had' ? ['had', 'hhad'].includes(pool.id) : pool.id === this.data.market))
      const expanded = this.data.expandedMatchId === match.id
      return { ...match, selectedOptions: allSelected, expanded, pools: this.data.market === 'mixed' && !expanded ? pools.filter((pool) => ['had','hhad'].includes(pool.id)) : pools }
    }).filter((match) => this.data.market === 'mixed' || match.pools.some((pool) => !pool.missing))
    let summary = null
    let calculationError = ''
    if (selected.length && chosenPassIds.length) {
      try { summary = calculate(selected, available.filter((pass) => chosenPassIds.includes(pass.id)), Number(this.data.multiplier)) }
      catch (error) { calculationError = error.message }
    }
    this.setData({ matches, selectedCount: selected.length, passes: available.map((pass) => ({ ...pass, selected: chosenPassIds.includes(pass.id) })), chosenPassIds, passSelectionEdited, passLabel: available.filter((pass) => chosenPassIds.includes(pass.id)).map((pass) => pass.label).join(' + '), passPanelHeight: Math.ceil(available.length / 4) * 76 + 150, summary, calculationError })
  },
  openPreview() {
    if (!this.feed || this.data.loading || !this.data.summary) { wx.showToast({ title: this.data.calculationError || '请选择比赛及过关方式', icon: 'none' }); return }
    const selected = selectedMatches(this.feed.matches, this.data.selections)
    const matches = selected.map((match) => ({
      id: match.id, label: `${match.number} ${match.home} vs ${match.away}`, number: match.number,
      businessDate: match.businessDate, date: match.date, time: match.time, league: match.league,
      home: match.home, away: match.away,
      selections: match.options.map(({ poolId, poolName, key, name, odds, single, allUp, goalLine, updatedAt }) => ({ poolId, poolName, key, name, odds, single, allUp, goalLine, updatedAt })),
      selectionRows: formatSelectionRows(match.options),
      selectionText: match.options.map((option) => `${option.name}${option.goalLine ? `(${option.goalLine})` : ''} @${option.odds}`).join(' · ')
    }))
    const preview = {
      toolId: 'football', source: 'sporttery-live', sourceUrl: 'https://m.sporttery.cn/mjc/jsq/zqspf/',
      sourceUpdatedAt: this.data.updatedAt, fetchedAt: this.data.fetchedAt,
      matches, multiplier: Number(this.data.multiplier), passes: this.data.passes.filter((pass) => pass.selected).map(({ id, label, sizes }) => ({ id, label, sizes })),
      passMode: 'free', passLabel: this.data.passes.filter((pass) => pass.selected).map((pass) => pass.label).join(' + '),
      briefPassLabel: this.data.passes.filter((pass) => pass.selected).map((pass) => pass.id === 'Single' ? '单关' : `${pass.sizes[0]}关`).join('、'),
      briefHeight: Math.min(650, matches.reduce((height, match) => height + 90 + match.selectionRows.reduce((sum, row) => sum + Math.ceil(row.options.length / row.columns) * 66, 0) + (match.selectionRows.length - 1) * 24, 0)), ...this.data.summary
    }
    this.setData({ preview, passVisible: false, previewVisible: true, saveFormVisible: false, planTitle: `足球方案 ${formatTime(Date.now())}`, planNote: '' })
  },
  openSaveForm() { this.setData({ saveFormVisible: true }) },
  backToPreview() { if (!this.data.saving) this.setData({ saveFormVisible: false }) },
  closePreview() { if (!this.data.saving) this.setData({ previewVisible: false }) },
  stopPropagation() {},
  setTitle(event) { this.setData({ planTitle: event.detail.value }) },
  setNote(event) { this.setData({ planNote: event.detail.value }) },
  savePreview() {
    if (this.data.saving || this.data.saved || !this.data.previewVisible || !this.data.saveFormVisible || !this.data.preview) return
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
