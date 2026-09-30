const tools = [
  { id: 'bmi', title: 'BMI 计算器', description: '根据身高和体重估算 BMI', icon: '⚖️', path: '/pages/tool/bmi/index' }
]

Page({
  data: { tools },

  openTool(event) {
    const path = event.currentTarget.dataset.path
    if (path) wx.navigateTo({ url: path })
  }
})
