const STORAGE_KEY = 'bookmark-url-v1'

function normalizeUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('请输入网址')
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw) && !/^[a-z\d.-]+:\d{1,5}(?:[/?#]|$)/i.test(raw)) throw new Error('仅支持 http 或 https 网址')
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const authority = url.match(/^https?:\/\/([^/?#]+)/i)
  const host = authority && authority[1].replace(/:\d{1,5}$/, '')
  const port = authority && authority[1].match(/:(\d{1,5})$/)
  if (!authority || url.length > 2048 || /[\s\\<>"'`]/.test(url) || !/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(host) || host.includes('..') || port && Number(port[1]) > 65535) throw new Error('请输入有效的 http 或 https 网址')
  return url
}

Page({
  data: { bookmark: null, editing: false, inputUrl: '' },
  onLoad() {
    try {
      const bookmark = wx.getStorageSync(STORAGE_KEY)
      this.setData({ bookmark: bookmark && typeof bookmark.url === 'string' ? bookmark : null, editing: false, inputUrl: '' })
    } catch (error) { wx.showToast({ title: '读取收藏失败，请重试', icon: 'none' }) }
  },
  onInput(event) { this.setData({ inputUrl: event.detail.value }) },
  editBookmark() { this.setData({ editing: true, inputUrl: this.data.bookmark.url }) },
  cancelEdit() { this.setData({ editing: false, inputUrl: '' }) },
  saveBookmark() {
    try {
      const url = normalizeUrl(this.data.inputUrl)
      const now = Date.now()
      const bookmark = { id: 'personal-url', url, createdAt: this.data.bookmark ? this.data.bookmark.createdAt : now, updatedAt: now }
      wx.setStorageSync(STORAGE_KEY, bookmark)
      this.setData({ bookmark, editing: false, inputUrl: '' })
      wx.showToast({ title: '网址已保存', icon: 'success' })
    } catch (error) { wx.showToast({ title: error.message || '保存失败，请检查本机空间', icon: 'none' }) }
  },
  copyBookmark() {
    if (!this.data.bookmark) return
    wx.setClipboardData({ data: this.data.bookmark.url, success: () => wx.showToast({ title: '网址已复制', icon: 'success' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) })
  },
  deleteBookmark() {
    wx.showModal({ title: '删除网址', content: '删除后需要重新添加，确定删除吗？', success: (result) => {
      if (!result.confirm) return
      try { wx.removeStorageSync(STORAGE_KEY); this.setData({ bookmark: null, editing: false, inputUrl: '' }) }
      catch (error) { wx.showToast({ title: '删除失败，请重试', icon: 'none' }) }
    } })
  }
})
