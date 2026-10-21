const { readScore } = require('./profile-score')

const tools = [
  { id: 'mfa', name: 'MFA验证器', icon: '/assets/icons/security-check.png', category: '办公效率', url: '/pages/tool/mfa/index' },
  { id: 'password-vault', name: '本地凭据本', icon: '/assets/icons/password-vault.png', category: '个人日常', url: '/pages/tool/password-vault/index' },
  { id: 'bookmark', name: '收藏夹', icon: '/assets/icons/web-tools.png', category: '个人日常', url: '/pages/tool/bookmark/index' },
  { id: 'weight', name: '体重控制', icon: '/assets/icons/notepad.png', category: '个人日常', url: '/pages/tool/weight/index' },
  { id: 'simulation', name: '模拟计算', icon: '/assets/icons/calculator.png', category: '娱乐', url: '/pages/tool/simulation/index', defaultEnabled: false }
]

function resolveToolUrl(tool) {
  if (tool.id !== 'simulation') return tool.url
  try { return readScore() === 10 ? tool.url : '/pages/tool/bookmark/index' }
  catch (error) { return '/pages/tool/bookmark/index' }
}

module.exports = { tools, resolveToolUrl }
