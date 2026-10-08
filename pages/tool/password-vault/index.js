const STORAGE_KEY = 'password-vault-records-v1'
const EMPTY_FORM = { platforms: '', account: '', password: '', note: '' }

function splitPlatforms(value) {
  return [...new Set(String(value || '').split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean))]
}

function mergeNotes(...notes) {
  return [...new Set(notes.map((item) => String(item || '').trim()).filter(Boolean))].join('\n')
}

function toViewRecord(record) {
  const { password, ...viewRecord } = record
  return viewRecord
}

Page({
  data: {
    records: [],
    filteredRecords: [],
    keyword: '',
    formVisible: false,
    formMode: 'add',
    formTitle: '添加记录',
    editingId: '',
    formPasswordVisible: false,
    form: { ...EMPTY_FORM },
    mergeMode: false,
    selectedMergeIds: [],
    revealedRecordIds: []
  },

  onShow() {
    this.setData({ revealedRecordIds: [] }, () => this.loadRecords())
  },

  onHide() {
    this.setData({ revealedRecordIds: [] }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  loadRecords() {
    let records = []
    try {
      const stored = wx.getStorageSync(STORAGE_KEY)
      records = Array.isArray(stored) ? stored : []
    } catch (error) {
      records = []
    }
    this.records = records
    this.setData({ records: records.map(toViewRecord) }, () => this.applyFilter(records, this.data.keyword))
  },

  applyFilter(records, rawKeyword) {
    const keyword = String(rawKeyword || '').trim().toLowerCase()
    // Passwords are intentionally excluded so searching never exposes or matches secret text.
    const filteredRecords = records.filter((record) => {
      if (!keyword) return true
      return [record.account, ...(record.platforms || []), record.note]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    }).map((record) => ({
      ...toViewRecord(record),
      selected: this.data.selectedMergeIds.includes(record.id),
      passwordVisible: this.data.revealedRecordIds.includes(record.id),
      displayPassword: this.data.revealedRecordIds.includes(record.id) ? record.password : '••••••••••••'
    }))
    this.setData({ filteredRecords })
  },

  onSearch(event) {
    const keyword = event.detail.value
    this.setData({ keyword }, () => this.applyFilter(this.records || [], keyword))
  },

  openAddForm() {
    this.setData({
      formVisible: true,
      formMode: 'add',
      formTitle: '添加记录',
      editingId: '',
      formPasswordVisible: false,
      form: { ...EMPTY_FORM },
      mergeMode: false,
      selectedMergeIds: [],
      revealedRecordIds: []
    }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  openEditForm(event) {
    const record = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!record) return
    this.setData({
      formVisible: true,
      formMode: 'edit',
      formTitle: '编辑记录',
      editingId: record.id,
      formPasswordVisible: false,
      revealedRecordIds: [],
      form: {
        platforms: (record.platforms || []).join('、'),
        account: record.account,
        password: record.password,
        note: record.note || ''
      }
    }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  openCopyForm(event) {
    const record = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!record) return
    this.setData({
      formVisible: true,
      formMode: 'copy',
      formTitle: '复制记录',
      editingId: '',
      formPasswordVisible: false,
      revealedRecordIds: [],
      form: {
        platforms: (record.platforms || []).join('、'),
        account: record.account,
        password: record.password,
        note: record.note || ''
      }
    }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  closeForm() {
    this.setData({
      formVisible: false,
      formMode: 'add',
      formTitle: '添加记录',
      editingId: '',
      formPasswordVisible: false,
      form: { ...EMPTY_FORM }
    }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  stopPropagation() {},

  onFormInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  toggleFormPassword() {
    this.setData({ formPasswordVisible: !this.data.formPasswordVisible })
  },

  saveForm() {
    const platforms = splitPlatforms(this.data.form.platforms)
    const account = String(this.data.form.account || '').trim()
    const password = String(this.data.form.password || '')
    const note = String(this.data.form.note || '').trim()
    if (!platforms.length || !account || !password) {
      wx.showToast({ title: '请填写平台、账号和密码', icon: 'none' })
      return
    }

    const now = Date.now()
    let records
    if (this.data.formMode === 'edit') {
      records = (this.records || []).map((record) => record.id === this.data.editingId
        ? { ...record, platforms, account, password, note, updatedAt: now }
        : record)
    } else {
      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
      records = [{ id, platforms, account, password, note, createdAt: now, updatedAt: now }, ...(this.records || [])]
    }

    const successTitle = this.data.formMode === 'edit'
      ? '已保存修改'
      : this.data.formMode === 'copy' ? '已复制记录' : '已添加账号'
    if (this.persistRecords(records, successTitle)) {
      this.closeForm()
    }
  },

  persistRecords(records, successTitle) {
    try {
      wx.setStorageSync(STORAGE_KEY, records)
      this.records = records
      this.setData({ records: records.map(toViewRecord) }, () => this.applyFilter(records, this.data.keyword))
      if (successTitle) wx.showToast({ title: successTitle, icon: 'success' })
      return true
    } catch (error) {
      wx.showToast({ title: '保存失败，请检查本机空间', icon: 'none' })
      return false
    }
  },

  copyRecordValue(event) {
    const record = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    const field = event.currentTarget.dataset.field
    if (!record || !['account', 'password'].includes(field)) return
    wx.setClipboardData({
      data: String(record[field]),
      success: () => wx.showToast({ title: field === 'password' ? '密码已复制' : '账号已复制', icon: 'success' })
    })
  },

  toggleRecordPassword(event) {
    const id = event.currentTarget.dataset.id
    const revealedRecordIds = this.data.revealedRecordIds.includes(id) ? [] : [id]
    this.setData({ revealedRecordIds }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确定删除这条账号密码吗？',
      success: (result) => {
        if (!result.confirm) return
        const records = (this.records || []).filter((record) => record.id !== id)
        this.persistRecords(records, '已删除')
      }
    })
  },

  startMergeMode() {
    if ((this.records || []).length < 2) {
      wx.showToast({ title: '至少需要两条记录', icon: 'none' })
      return
    }
    this.setData({ mergeMode: true, selectedMergeIds: [], revealedRecordIds: [], keyword: '' }, () => {
      this.applyFilter(this.records || [], '')
    })
  },

  cancelMergeMode() {
    this.setData({ mergeMode: false, selectedMergeIds: [] }, () => {
      this.applyFilter(this.records || [], this.data.keyword)
    })
  },

  toggleMergeSelection(event) {
    if (!this.data.mergeMode) return
    const id = event.currentTarget.dataset.id
    const selectedMergeIds = this.data.selectedMergeIds.includes(id)
      ? this.data.selectedMergeIds.filter((item) => item !== id)
      : [...this.data.selectedMergeIds, id]
    this.setData({ selectedMergeIds }, () => this.applyFilter(this.records || [], this.data.keyword))
  },

  confirmMerge() {
    const selectedIdSet = new Set(this.data.selectedMergeIds)
    const selectedRecords = this.data.selectedMergeIds
      .map((id) => (this.records || []).find((record) => record.id === id))
      .filter(Boolean)
    if (selectedRecords.length < 2) {
      wx.showToast({ title: '请至少选择两条记录', icon: 'none' })
      return
    }
    const base = selectedRecords[0]
    const canMerge = selectedRecords.every((record) => record.account === base.account && record.password === base.password)
    if (!canMerge) {
      wx.showModal({ title: '无法合并', content: '只有账号和密码完全相同的记录才能合并。', showCancel: false })
      return
    }

    const merged = {
      ...base,
      platforms: [...new Set(selectedRecords.reduce((all, record) => all.concat(record.platforms || []), []))],
      note: mergeNotes(...selectedRecords.map((record) => record.note)),
      updatedAt: Date.now()
    }
    const records = (this.records || [])
      .filter((record) => !selectedIdSet.has(record.id) || record.id === base.id)
      .map((record) => record.id === base.id ? merged : record)
    if (this.persistRecords(records, '已合并平台')) this.cancelMergeMode()
  }
})
