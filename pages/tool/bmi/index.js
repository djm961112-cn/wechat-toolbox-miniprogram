Page({
  data: { height: '', weight: '', bmi: '', category: '', error: '' },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [field]: event.detail.value, error: '', bmi: '', category: '' })
  },

  calculate() {
    const heightCm = Number(this.data.height)
    const weightKg = Number(this.data.weight)
    if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm < 50 || heightCm > 250 || weightKg < 10 || weightKg > 500) {
      this.setData({ error: '请输入有效的身高（50–250 cm）和体重（10–500 kg）' })
      return
    }
    const bmi = weightKg / ((heightCm / 100) ** 2)
    const category = bmi < 18.5 ? '偏低' : bmi < 24 ? '正常' : bmi < 28 ? '偏高' : '较高'
    this.setData({ bmi: bmi.toFixed(1), category, error: '' })
  }
})
