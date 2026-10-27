const assert = require('assert')

const logs = []
const original = { info: console.info, warn: console.warn, error: console.error }
let successCalled = false

console.info = (...args) => logs.push(['info', ...args])
console.warn = (...args) => logs.push(['warn', ...args])
console.error = (...args) => logs.push(['error', ...args])

try {
  global.wx = {
    request(options) {
      options.success({ statusCode: 400, header: { 'Set-Cookie': 'session=raw-cookie' }, data: { code: 'INVALID_CLOUD_DATA', message: '数值字段格式错误', token: 'raw-response-token' } })
      return { abort() {} }
    }
  }
  const { request } = require('../utils/request')
  const task = request({
    url: 'https://api.openotools.top/api/v1/auth/wechat-login', method: 'POST',
    header: { Authorization: 'Bearer raw-token', 'Content-Type': 'application/json' },
    data: { code: 'raw-login-code', secret: 'RAW-TOTP-SECRET', account: 'user@example.com', weight: 70.5, odds: '3.20' },
    success: () => { successCalled = true }
  })
  assert.strictEqual(typeof task.abort, 'function')
} finally {
  console.info = original.info
  console.warn = original.warn
  console.error = original.error
}

const output = JSON.stringify(logs)
assert.strictEqual(successCalled, true)
assert(output.includes('[HTTP][request]'))
assert(output.includes('[HTTP][response]'))
assert(output.includes('/api/v1/auth/wechat-login'))
assert(output.includes('INVALID_CLOUD_DATA'))
assert(output.includes('3.20'))
assert(!output.includes('raw-token'))
assert(!output.includes('raw-cookie'))
assert(!output.includes('raw-login-code'))
assert(!output.includes('RAW-TOTP-SECRET'))
assert(!output.includes('user@example.com'))
assert(!output.includes('70.5'))
console.log('PASS: unified request logging includes diagnostics and redacts sensitive values')
