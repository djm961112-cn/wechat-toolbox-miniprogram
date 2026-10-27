const API_BASE = 'https://api.openotools.top'
const STORAGE_KEY = 'openotools-auth-v1'
const { request } = require('./request')

function readSession() {
  const session = wx.getStorageSync(STORAGE_KEY)
  if (!session || typeof session.token !== 'string') return null
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    clearSession()
    return null
  }
  return session
}

function saveSession(session) {
  wx.setStorageSync(STORAGE_KEY, session)
  return session
}

function clearSession() {
  wx.removeStorageSync(STORAGE_KEY)
}

function apiRequest({ path, method = 'GET', data, token }) {
  return new Promise((resolve, reject) => request({
    url: `${API_BASE}${path}`,
    method,
    data,
    timeout: 12000,
    header: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    success: (response) => {
      if (response.statusCode >= 200 && response.statusCode < 300) { resolve(response.data); return }
      const error = new Error(response.data && response.data.message || '服务请求失败，请稍后重试')
      error.statusCode = response.statusCode
      error.code = response.data && response.data.code || ''
      reject(error)
    },
    fail: () => reject(new Error('暂时无法连接登录服务，请检查网络或服务器配置'))
  }))
}

function wxLoginCode() {
  return new Promise((resolve, reject) => wx.login({
    timeout: 10000,
    success: (result) => result.code ? resolve(result.code) : reject(new Error('未取得微信登录凭证，请重试')),
    fail: () => reject(new Error('微信登录失败，请稍后重试'))
  }))
}

async function login() {
  const code = await wxLoginCode()
  const response = await apiRequest({ path: '/api/v1/auth/wechat-login', method: 'POST', data: { code } })
  if (!response || !response.token || !response.user) throw new Error('登录服务返回异常，请稍后重试')
  return saveSession({ token: response.token, expiresAt: response.expiresAt, user: response.user })
}

async function refreshUser() {
  const session = readSession()
  if (!session) return null
  try {
    const user = await apiRequest({ path: '/api/v1/auth/me', token: session.token })
    return saveSession({ ...session, user }).user
  } catch (error) {
    if (error.statusCode === 401) clearSession()
    throw error
  }
}

async function logout() {
  const session = readSession()
  try {
    if (session) await apiRequest({ path: '/api/v1/auth/logout', method: 'POST', token: session.token })
  } finally {
    clearSession()
  }
}

async function authenticatedRequest({ path, method = 'GET', data }) {
  const session = readSession()
  if (!session) {
    const error = new Error('请先登录')
    error.statusCode = 401
    throw error
  }
  try { return await apiRequest({ path, method, data, token: session.token }) }
  catch (error) {
    if (error.statusCode === 401) clearSession()
    throw error
  }
}

module.exports = { API_BASE, readSession, clearSession, login, refreshUser, logout, authenticatedRequest }
