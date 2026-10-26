const auth = require('./auth')

const PROTECTED_TOOLS = ['mfa', 'weight', 'simulation']

function confirmLogin() {
  return new Promise((resolve) => wx.showModal({
    title: '登录后使用', content: '该工具支持服务器同步，需要先完成微信登录。本机已有数据不会被清空或覆盖，首次上传需在设置页由您主动确认。',
    confirmText: '微信登录', cancelText: '取消', success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false)
  }))
}

async function ensureToolLogin(toolId) {
  if (!PROTECTED_TOOLS.includes(toolId)) return true
  if (auth.readSession()) return true
  if (!await confirmLogin()) return false
  try {
    await auth.login()
    wx.showToast({ title: '登录成功', icon: 'success' })
    return true
  } catch (error) {
    wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none', duration: 3000 })
    return false
  }
}

async function openProtectedTool(toolId, url) {
  if (await ensureToolLogin(toolId)) wx.navigateTo({ url })
}

module.exports = { PROTECTED_TOOLS, ensureToolLogin, openProtectedTool }
