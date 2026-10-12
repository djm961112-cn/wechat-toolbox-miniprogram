const STORAGE_KEY = 'simulation-plans-v1'
const simulationTools = [
  { id: 'football', name: '足球', description: '官方赛事 · 多玩法计算 · 保存方案', symbol: '⚽', url: '/pages/tool/simulation/football/index', sourceUrl: 'https://m.sporttery.cn/mjc/jsq/zqspf/' }
]

function readPlans() {
  const records = wx.getStorageSync(STORAGE_KEY)
  if (!records) return []
  if (!Array.isArray(records)) throw new Error('方案数据格式异常')
  return records.slice().sort((left, right) => right.createdAt - left.createdAt)
}

function savePlan(snapshot) {
  if (!simulationTools.some((tool) => tool.id === snapshot.toolId)) throw new Error('不支持的模拟工具')
  if (!snapshot.title || !Array.isArray(snapshot.matches) || !snapshot.matches.length) throw new Error('请填写方案名称和比赛选择')
  const now = Date.now()
  const plan = {
    ...snapshot,
    version: 1,
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now
  }
  wx.setStorageSync(STORAGE_KEY, [plan, ...readPlans()])
  return plan
}

function removePlan(id) {
  wx.setStorageSync(STORAGE_KEY, readPlans().filter((plan) => plan.id !== id))
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = { simulationTools, readPlans, savePlan, removePlan, formatTime }
