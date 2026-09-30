const categories = ['全部', '图片', '文档', '办公', '生活']
const tools = [
  { id: 'image-compress', name: '图片压缩', icon: '▧', color: 'blue', category: '图片' },
  { id: 'format-convert', name: '格式转换', icon: '✣', color: 'purple', category: '图片' },
  { id: 'image-crop', name: '图片裁剪', icon: '▣', color: 'green', category: '图片' },
  { id: 'image-watermark-remove', name: '图片去水印', icon: '◉', color: 'orange', category: '图片' },
  { id: 'image-watermark-add', name: '图片加水印', icon: '♙', color: 'blue', category: '图片' },
  { id: 'image-enlarge', name: '图片放大', icon: '⌕', color: 'purple', category: '图片' },
  { id: 'pdf-tools', name: 'PDF工具', icon: 'PDF', color: 'red', category: '文档' },
  { id: 'word-to-pdf', name: 'Word转PDF', icon: 'W', color: 'blue', category: '文档' },
  { id: 'pdf-to-word', name: 'PDF转Word', icon: 'W', color: 'blue', category: '文档' },
  { id: 'ocr', name: '文字识别', icon: 'OCR', color: 'purple', category: '文档' },
  { id: 'image-to-pdf', name: '图片转PDF', icon: '▧', color: 'red', category: '格式' },
  { id: 'video-to-audio', name: '视频转音频', icon: '▶', color: 'green', category: '格式' },
  { id: 'audio-to-text', name: '音频转文字', icon: '♫', color: 'orange', category: '格式' },
  { id: 'text-to-speech', name: '文本转语音', icon: '♫', color: 'purple', category: '格式' },
  { id: 'calculator', name: '计算器', icon: '÷', color: 'navy', category: '办公' },
  { id: 'qrcode', name: '二维码', icon: '▦', color: 'green', category: '办公' },
  { id: 'unit-convert', name: '单位换算', icon: '⚖', color: 'blue', category: '办公' },
  { id: 'notepad', name: '记事本', icon: '▤', color: 'green', category: '办公' },
  { id: 'more', name: '更多', icon: '•••', color: 'gray', category: '生活' }
]
module.exports = { categories, tools }
