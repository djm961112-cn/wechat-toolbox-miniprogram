const { API_URL, POOLS, normalizeFeed, selectedMatches, availablePasses, calculate } = require('../../../../utils/football-simulation')
const { savePlan, replacePlan, readPlans, readSources, formatTime, formatSelectionRows, matchPeriod, matchNumber, planPeriods } = require('../../../../utils/simulation-plans')
const DRAFT_KEY = 'simulation-football-draft-v1'
const FEED_KEY = 'simulation-football-feed-v1'

Page({
  data: {
    loading: true, error: '', updatedAt: '', fetchedAt: '', draftRecovered: false, market: 'had',
    markets: [{ id: 'had', name: '胜平负 / 让球' }, ...POOLS.filter(({ id }) => !['had', 'hhad'].includes(id)).map(({ id, name }) => ({ id, name })), { id: 'mixed', name: '混合玩法' }],
    matches: [], selections: {}, selectedCount: 0, passes: [], chosenPassIds: [], passSelectionEdited: false,
    multiplier: '1', multiplierVisible: false, multiplierDraft: '', quickMultipliers: [10, 20, 50, 100, 500], multiplierKeys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'confirm'],
    summary: null, calculationError: '', passVisible: false, passLabel: '', passPanelHeight: 150, previewVisible: false, preview: null,
    planNote: '', planSourceId: '', sources: [], saving: false, expandedMatchId: '', saved: false, saveFormVisible: false, editMode: false
  },
  onLoad(options = {}) {
    this.editPlanId = options.editPlanId ? decodeURIComponent(options.editPlanId) : ''
    if (!this.editPlanId) this.restoreDraft()
  },
  onShow() {
    if (!this.feed && !this.initialFetchStarted) { this.initialFetchStarted = true; this.refreshFeed() }
  },
  onHide() { this.persistDraft() },
  onUnload() { this.persistDraft(); this.unloaded = true; if (this.requestTask) this.requestTask.abort() },
  onPullDownRefresh() { this.refreshFeed() },
  restoreDraft() {
    try {
      const draft = wx.getStorageSync(DRAFT_KEY)
      const cached = wx.getStorageSync(FEED_KEY)
      if (!draft || draft.version !== 1 || !cached || cached.version !== 1 || draft.feedToken !== cached.token || !cached.feed || !Array.isArray(cached.feed.matches)) return
      let sources = []
      try { sources = readSources() } catch (error) {}
      const multiplier = Number(draft.multiplier)
      const selections = draft.selections && typeof draft.selections === 'object' && !Array.isArray(draft.selections) ? draft.selections : {}
      const selectedCount = selectedMatches(cached.feed.matches, selections).length
      this.feed = cached.feed
      this.feedToken = cached.token
      this.setData({
        loading: false, updatedAt: cached.updatedAt || '', fetchedAt: cached.fetchedAt || '', draftRecovered: true,
        market: this.data.markets.some((item) => item.id === draft.market) ? draft.market : 'had',
        selections, selectedCount,
        chosenPassIds: Array.isArray(draft.chosenPassIds) ? draft.chosenPassIds : [],
        passSelectionEdited: Boolean(draft.passSelectionEdited), multiplier: Number.isInteger(multiplier) && multiplier >= 1 && multiplier <= 9999 ? String(multiplier) : '1',
        expandedMatchId: draft.expandedMatchId || '', preview: draft.preview || null,
        previewVisible: Boolean(draft.previewVisible && draft.preview), saveFormVisible: Boolean(draft.saveFormVisible && draft.previewVisible && draft.preview),
        planNote: draft.planNote || '', planSourceId: draft.planSourceId || '', sources
      }, () => this.updateView())
    } catch (error) { wx.showToast({ title: '读取草稿失败，请重新选择', icon: 'none' }) }
  },
  persistDraft() {
    if (!this.feed || this.editPlanId) return
    try {
      const data = this.data
      const hasDraft = Object.keys(data.selections || {}).length || data.preview || data.multiplier !== '1'
      if (data.saved || !hasDraft) { wx.removeStorageSync(DRAFT_KEY); return }
      wx.setStorageSync(DRAFT_KEY, {
        version: 1, feedToken: this.feedToken, market: data.market, selections: data.selections, chosenPassIds: data.chosenPassIds,
        passSelectionEdited: data.passSelectionEdited, multiplier: data.multiplier, expandedMatchId: data.expandedMatchId,
        preview: data.preview, previewVisible: data.previewVisible, saveFormVisible: data.saveFormVisible,
        planNote: data.planNote, planSourceId: data.planSourceId
      })
    } catch (error) {
      if (!this.draftSaveFailed) { this.draftSaveFailed = true; wx.showToast({ title: '草稿自动保存失败，请检查空间', icon: 'none' }) }
    }
  },
  cacheFeed(feed, fetchedAt, token) {
    try { wx.setStorageSync(FEED_KEY, { version: 1, feed, updatedAt: feed.updatedAt, fetchedAt, token }) }
    catch (error) {
      if (!this.draftSaveFailed) { this.draftSaveFailed = true; wx.showToast({ title: '草稿自动保存失败，请检查空间', icon: 'none' }) }
    }
  },
  refreshFeed() {
    const version = (this.requestVersion || 0) + 1
    this.requestVersion = version
    if (this.requestTask) this.requestTask.abort()
    this.setData({ loading: true, error: '' })
    this.requestTask = wx.request({
      url: API_URL, data: { channel: 'c', _t: Date.now() }, header: { 'Cache-Control': 'no-cache' }, timeout: 15000,
      success: (res) => {
        if (this.unloaded || version !== this.requestVersion) return
        try {
          if (res.statusCode !== 200) throw new Error('官方接口暂时不可用')
          const feed = normalizeFeed(res.data)
          const fetchedAtMs = Date.now()
          const fetchedAt = formatTime(fetchedAtMs, true)
          if (this.editPlanId) {
            this.initializeEditFeed(feed, fetchedAt)
            return
          }
          this.feedToken = String(fetchedAtMs)
          this.cacheFeed(feed, fetchedAt, this.feedToken)
          this.feed = feed
          // Explicit refresh starts a fresh calculation; returning from the background never reaches this path.
          this.setData({ loading: false, updatedAt: feed.updatedAt, fetchedAt, draftRecovered: false, selections: {}, chosenPassIds: [], passSelectionEdited: false, preview: null, previewVisible: false, saveFormVisible: false, planNote: '', planSourceId: '', saved: false }, () => this.updateView())
        } catch (error) { this.showFeedError(error.message) }
      },
      fail: (error) => {
        if (this.unloaded || version !== this.requestVersion || /abort/.test(error.errMsg || '')) return
        this.showFeedError(/domain|合法域名/.test(error.errMsg || '') ? '请在微信后台配置 request 合法域名 https://webapi.sporttery.cn' : '赛事加载失败，请检查网络后重试')
      },
      complete: () => { wx.stopPullDownRefresh() }
    })
  },
  showFeedError(error) {
    if (this.editPlanId) {
      this.feed = null
      this.setData({ loading: false, error, updatedAt: '', fetchedAt: '', matches: [], summary: null, selectedCount: 0, selections: {}, passes: [], chosenPassIds: [] })
      return
    }
    if (this.feed) { this.setData({ loading: false }); wx.showToast({ title: error, icon: 'none' }); return }
    this.setData({ loading: false, error, updatedAt: '', fetchedAt: '', matches: [], summary: null, selectedCount: 0, selections: {}, passes: [], chosenPassIds: [] })
  },
  initializeEditFeed(feed, fetchedAt) {
    const plan = readPlans().find((item) => item.id === this.editPlanId)
    if (!plan) throw new Error('原方案已删除，无法修改')
    const periods = planPeriods(plan)
    if (periods.length !== 1) throw new Error('历史跨期方案不支持修改')
    const period = periods[0]
    const matches = feed.matches.filter((match) => matchPeriod(match) === period && match.selectable)
    if (!matches.length) throw new Error('赛事已开始或已结束，不支持修改')
    const editFeed = { ...feed, matches }
    const selections = {}
    plan.matches.forEach((saved) => {
      const current = matches.find((match) => match.id === String(saved.id) && matchNumber(match) === matchNumber(saved))
      const savedSelections = saved.selections || []
      savedSelections.forEach((selection) => {
        const pool = current && current.pools.find((item) => item.id === selection.poolId)
        const option = pool && pool.options.find((item) => item.key === selection.key && !item.disabled)
        if (pool && pool.selectable && option) selections[`${current.id}:${pool.id}:${option.key}`] = true
      })
    })
    const selected = selectedMatches(matches, selections)
    const selectedPools = [...new Set(selected.reduce((all, match) => all.concat(match.options.map((option) => option.poolId)), []))]
    const market = !selectedPools.length || selectedPools.every((id) => ['had', 'hhad'].includes(id)) ? 'had' : selectedPools.length === 1 ? selectedPools[0] : 'mixed'
    let sources = []
    try { sources = readSources() } catch (error) {}
    this.editingPlan = plan
    this.feed = editFeed
    this.setData({
      editMode: true, loading: false, error: '', updatedAt: feed.updatedAt, fetchedAt, draftRecovered: false,
      market, selections, selectedCount: selected.length, chosenPassIds: (plan.passes || []).map((pass) => pass.id), passSelectionEdited: true,
      multiplier: String(plan.multiplier || 1), multiplierDraft: '', expandedMatchId: market === 'mixed' && selected.length ? selected[0].id : '',
      preview: null, previewVisible: false, saveFormVisible: false, planNote: plan.note || '',
      planSourceId: plan.planSourceId || '', sources, saved: false
    }, () => this.updateView())
  },
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
    if (!game || !game.pools.some((item) => item.selectable && item.options.some((option) => !option.disabled && `${match}:${item.id}:${option.key}` === key))) return
    const selections = { ...this.data.selections }
    if (selections[key]) delete selections[key]
    else {
      const selected = selectedMatches(this.feed.matches, selections)
      const period = matchPeriod(game)
      if (!period) { wx.showToast({ title: '该比赛缺少期号，暂不能保存方案', icon: 'none' }); return }
      if (selected.some((item) => matchPeriod(item) !== period)) { wx.showToast({ title: '同一方案只能选择同一期号的比赛', icon: 'none' }); return }
      if (selected.length >= 8 && !selected.some((item) => item.id === match)) { wx.showToast({ title: '最多选择 8 场比赛', icon: 'none' }); return }
      selections[key] = true
    }
    this.setData({ selections, saved: false, preview: null, previewVisible: false, saveFormVisible: false }, () => this.updateView())
  },
  clearSelections() {
    if ((!this.data.selectedCount && this.data.multiplier === '1') || this.data.loading) return
    this.setData({ selections: {}, chosenPassIds: [], passSelectionEdited: false, multiplier: '1', multiplierDraft: '', multiplierVisible: false, saved: false, previewVisible: false, preview: null, saveFormVisible: false }, () => this.updateView())
  },
  togglePass(event) {
    const id = event.currentTarget.dataset.id
    if (!this.data.passes.some((pass) => pass.id === id)) return
    let ids = this.data.chosenPassIds.slice()
    if (ids.includes(id)) ids = ids.filter((value) => value !== id)
    else ids.push(id)
    this.setData({ chosenPassIds: ids, passSelectionEdited: true, saved: false, preview: null, previewVisible: false, saveFormVisible: false }, () => this.updateView())
  },
  openMultiplier() { this.setData({ multiplierVisible: true, multiplierDraft: '', passVisible: false }) },
  closeMultiplier() { this.setData({ multiplierVisible: false }) },
  chooseQuickMultiplier(event) {
    this.setData({ multiplier: String(event.currentTarget.dataset.value), multiplierVisible: false, saved: false, preview: null, previewVisible: false, saveFormVisible: false }, () => this.updateView())
  },
  tapMultiplierKey(event) {
    const key = event.currentTarget.dataset.key
    if (key === 'confirm') {
      const multiplier = Number(this.data.multiplierDraft)
      if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > 9999) { wx.showToast({ title: '倍率需为 1 至 9999', icon: 'none' }); return }
      this.setData({ multiplier: String(multiplier), multiplierVisible: false, saved: false, preview: null, previewVisible: false, saveFormVisible: false }, () => this.updateView())
      return
    }
    if (key === 'delete') { this.setData({ multiplierDraft: this.data.multiplierDraft.slice(0, -1) }); return }
    const draft = this.data.multiplierDraft === '0' ? key : this.data.multiplierDraft + key
    if (draft.length <= 4) this.setData({ multiplierDraft: draft })
  },
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
        return { ...definition, ...pool, missing: !pool || pool.missing, goalLine, goalLabel: goalLine == null ? '—' : Number(goalLine) > 0 ? `+${Number(goalLine)}` : String(goalLine), options: definition.options.map(([optionKey, name]) => {
          const option = pool && pool.options.find((item) => item.key === optionKey)
          const key = `${match.id}:${definition.id}:${optionKey}`
          const disabled = !option || option.disabled || pool.selectable === false
          return { ...option, key: optionKey, name, disabled, oddsText: option ? option.oddsText : '-', selectionKey: key, selected: Boolean(!disabled && this.data.selections[key]) }
        }) }
      }).filter(Boolean)
      const allSelected = allPools.reduce((count, pool) => count + pool.options.filter((option) => option.selected).length, 0)
      const pools = allPools.filter((pool) => this.data.market === 'mixed' || (this.data.market === 'had' ? ['had', 'hhad'].includes(pool.id) : pool.id === this.data.market))
      const expanded = this.data.expandedMatchId === match.id
      return { ...match, selectedOptions: allSelected, expanded, pools: this.data.market === 'mixed' && !expanded ? pools.filter((pool) => ['had','hhad'].includes(pool.id)) : pools }
    }).filter((match) => this.data.market === 'mixed' || match.pools.length)
    let summary = null
    let calculationError = ''
    if (selected.length && chosenPassIds.length) {
      try { summary = calculate(selected, available.filter((pass) => chosenPassIds.includes(pass.id)), Number(this.data.multiplier)) }
      catch (error) { calculationError = error.message }
    }
    this.setData({ matches, selectedCount: selected.length, passes: available.map((pass) => ({ ...pass, selected: chosenPassIds.includes(pass.id) })), chosenPassIds, passSelectionEdited, passLabel: available.filter((pass) => chosenPassIds.includes(pass.id)).map((pass) => pass.label).join(' + '), passPanelHeight: Math.ceil(available.length / 4) * 76 + 150, summary, calculationError }, () => this.persistDraft())
  },
  openPreview() {
    if (!this.feed || this.data.loading || !this.data.summary) { wx.showToast({ title: this.data.calculationError || '请选择比赛及组合方式', icon: 'none' }); return }
    const selected = selectedMatches(this.feed.matches, this.data.selections)
    if (new Set(selected.map(matchPeriod)).size !== 1 || selected.some((match) => !matchPeriod(match))) { wx.showToast({ title: '同一方案只能保存同一期号的比赛', icon: 'none' }); return }
    const matches = selected.map((match) => ({
      id: match.id, label: `${match.number} ${match.home} vs ${match.away}`, number: match.number, period: match.period, numberCode: matchNumber(match),
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
    this.setData({ preview, passVisible: false, previewVisible: true, saveFormVisible: false,
      planNote: this.editingPlan ? this.editingPlan.note || '' : '', planSourceId: this.editingPlan ? this.editingPlan.planSourceId || '' : '' }, () => this.persistDraft())
  },
  openSaveForm() {
    try { this.setData({ sources: readSources(), saveFormVisible: true }, () => this.persistDraft()) }
    catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
  },
  backToPreview() { if (!this.data.saving) this.setData({ saveFormVisible: false }, () => this.persistDraft()) },
  closePreview() { if (!this.data.saving) this.setData({ previewVisible: false }, () => this.persistDraft()) },
  stopPropagation() {},
  setNote(event) { this.setData({ planNote: event.detail.value }, () => this.persistDraft()) },
  selectPlanSource(event) { this.setData({ planSourceId: event.currentTarget.dataset.id || '' }, () => this.persistDraft()) },
  savePreview() {
    if (this.data.saving || this.data.saved || !this.data.previewVisible || !this.data.saveFormVisible || !this.data.preview) return
    this.setData({ saving: true })
    if (this.editPlanId) {
      wx.showActionSheet({
        itemList: ['新增方案', '当前方案'],
        success: (result) => this.commitPreview(result.tapIndex === 1),
        fail: () => this.setData({ saving: false })
      })
      return
    }
    this.commitPreview(false)
  },
  commitPreview(replaceCurrent) {
    try {
      const snapshot = { ...this.data.preview, note: this.data.planNote.trim(), planSourceId: this.data.planSourceId }
      if (replaceCurrent) replacePlan(this.editPlanId, snapshot)
      else savePlan(snapshot)
      try { wx.removeStorageSync(DRAFT_KEY) } catch (error) {}
      this.setData({ saved: true, saving: false, previewVisible: false })
      wx.showToast({ title: replaceCurrent ? '当前方案已更新' : '已新增方案', icon: 'success' })
      if (this.editPlanId) setTimeout(() => { if (!this.unloaded) this.viewPlans() }, 300)
    } catch (error) { this.setData({ saving: false }); wx.showToast({ title: error.message || '保存失败，请检查本机空间', icon: 'none' }) }
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
