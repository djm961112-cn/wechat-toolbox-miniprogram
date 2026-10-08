const STORAGE_KEY = 'password-vault-records-v1'
const EMPTY_FORM = { platforms: '', account: '', password: '', note: '' }

function splitPlatforms(value) {
  return [...new Set(String(value || '').split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean))]
}

function mergeNotes(left, right) {
  return [...new Set([left, right].map((item) => String(item || '').trim()).filter(Boolean))].join('\n')
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
    editingId: '',
    formPasswordVisible: false,
    form: { ...EMPTY_FORM },
    mergeVisible: false,
    mergeSourceId: '',
    mergeCandidates: []
  },

  onShow() {
    this.loadRecords()
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
    }).map(toViewRecord)
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
      editingId: '',
      formPasswordVisible: false,
      form: { ...EMPTY_FORM }
    })
  },

  openEditForm(event) {
    const record = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!record) return
    this.setData({
      formVisible: true,
      formMode: 'edit',
      editingId: record.id,
      formPasswordVisible: false,
      form: {
        platforms: (record.platforms || []).join('，'),
        account: record.account,
        password: record.password,
        note: record.note || ''
      }
    })
  },

  closeForm() {
    this.setData({
      formVisible: false,
      formMode: 'add',
      editingId: '',
      formPasswordVisible: false,
      form: { ...EMPTY_FORM }
    })
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

    if (this.persistRecords(records, this.data.formMode === 'edit' ? '已保存修改' : '已添加账号')) {
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

  openMerge(event) {
    const source = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!source) return
    const mergeCandidates = (this.records || []).filter((record) => (
      record.id !== source.id && record.account === source.account && record.password === source.password
    ))
    if (!mergeCandidates.length) {
      wx.showToast({ title: '没有相同账号和密码的记录', icon: 'none' })
      return
    }
    this.setData({
      mergeVisible: true,
      mergeSourceId: source.id,
      mergeCandidates: mergeCandidates.map((record) => ({
        ...toViewRecord(record),
        platformSummary: (record.platforms || []).join('、')
      }))
    })
  },

  closeMerge() {
    this.setData({ mergeVisible: false, mergeSourceId: '', mergeCandidates: [] })
  },

  mergeWithRecord(event) {
    const source = (this.records || []).find((item) => item.id === this.data.mergeSourceId)
    const candidate = (this.records || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!source || !candidate || source.account !== candidate.account || source.password !== candidate.password) {
      wx.showToast({ title: '记录已变化，请重试', icon: 'none' })
      this.closeMerge()
      return
    }

    const merged = {
      ...source,
      platforms: [...new Set([...(source.platforms || []), ...(candidate.platforms || [])])],
      note: mergeNotes(source.note, candidate.note),
      updatedAt: Date.now()
    }
    const records = (this.records || [])
      .filter((record) => record.id !== candidate.id)
      .map((record) => record.id === source.id ? merged : record)
    if (this.persistRecords(records, '已合并平台')) this.closeMerge()
  }
})
