const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function concatenate(left, right) {
  const result = new Uint8Array(left.length + right.length)
  result.set(left)
  result.set(right, left.length)
  return result
}

function decodeBase32(value) {
  const secret = String(value || '').toUpperCase().replace(/[\s=-]/g, '')
  if (!secret) throw new Error('二维码中没有密钥')

  const bytes = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < secret.length; i += 1) {
    const digit = BASE32_ALPHABET.indexOf(secret[i])
    if (digit < 0) throw new Error('二维码中的密钥格式无效')
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 0xff)
      buffer &= (1 << bits) - 1
    }
  }
  if (bytes.length === 0) throw new Error('二维码中的密钥为空')
  return new Uint8Array(bytes)
}

function rotateLeft(value, amount) {
  return (value << amount) | (value >>> (32 - amount))
}

function sha1(message) {
  const bitLength = message.length * 8
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(message)
  padded[message.length] = 0x80
  const highBits = Math.floor(bitLength / 0x100000000)
  const lowBits = bitLength >>> 0
  const lengthOffset = paddedLength - 8
  padded[lengthOffset] = (highBits >>> 24) & 0xff
  padded[lengthOffset + 1] = (highBits >>> 16) & 0xff
  padded[lengthOffset + 2] = (highBits >>> 8) & 0xff
  padded[lengthOffset + 3] = highBits & 0xff
  padded[lengthOffset + 4] = (lowBits >>> 24) & 0xff
  padded[lengthOffset + 5] = (lowBits >>> 16) & 0xff
  padded[lengthOffset + 6] = (lowBits >>> 8) & 0xff
  padded[lengthOffset + 7] = lowBits & 0xff

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0
  const words = new Uint32Array(80)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const index = offset + i * 4
      words[i] = ((padded[index] << 24) | (padded[index + 1] << 16) | (padded[index + 2] << 8) | padded[index + 3]) >>> 0
    }
    for (let i = 16; i < 80; i += 1) {
      words[i] = rotateLeft(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i += 1) {
      let f
      let k
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[i]) >>> 0
      e = d
      d = c
      c = rotateLeft(b, 30) >>> 0
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const digest = new Uint8Array(20)
  const hash = [h0, h1, h2, h3, h4]
  for (let i = 0; i < hash.length; i += 1) {
    digest[i * 4] = hash[i] >>> 24
    digest[i * 4 + 1] = (hash[i] >>> 16) & 0xff
    digest[i * 4 + 2] = (hash[i] >>> 8) & 0xff
    digest[i * 4 + 3] = hash[i] & 0xff
  }
  return digest
}

function hmacSha1(key, message) {
  let normalizedKey = key
  if (normalizedKey.length > 64) normalizedKey = sha1(normalizedKey)

  const innerPad = new Uint8Array(64)
  const outerPad = new Uint8Array(64)
  for (let i = 0; i < 64; i += 1) {
    const keyByte = normalizedKey[i] || 0
    innerPad[i] = keyByte ^ 0x36
    outerPad[i] = keyByte ^ 0x5c
  }
  return sha1(concatenate(outerPad, sha1(concatenate(innerPad, message))))
}

function generateTotp(secret, timestampSeconds, period, digits) {
  const counter = Math.floor(timestampSeconds / period)
  const message = new Uint8Array(8)
  const high = Math.floor(counter / 0x100000000)
  const low = counter >>> 0
  message[0] = (high >>> 24) & 0xff
  message[1] = (high >>> 16) & 0xff
  message[2] = (high >>> 8) & 0xff
  message[3] = high & 0xff
  message[4] = (low >>> 24) & 0xff
  message[5] = (low >>> 16) & 0xff
  message[6] = (low >>> 8) & 0xff
  message[7] = low & 0xff

  const digest = hmacSha1(decodeBase32(secret), message)
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff)) >>> 0
  return String(binary % Math.pow(10, digits)).padStart(digits, '0')
}

function decodeQueryPart(value) {
  return decodeURIComponent(value.replace(/\+/g, ' '))
}

function parseOtpAuthUri(rawValue) {
  const uri = String(rawValue || '').trim()
  if (!/^otpauth:\/\/totp\//i.test(uri)) {
    throw new Error('请扫描服务提供的 TOTP 验证器二维码')
  }

  const queryStart = uri.indexOf('?')
  if (queryStart < 0) throw new Error('二维码缺少账户密钥信息')
  const rawLabel = uri.slice('otpauth://totp/'.length, queryStart)
  const label = decodeQueryPart(rawLabel)
  const query = {}
  uri.slice(queryStart + 1).split('&').forEach((pair) => {
    if (!pair) return
    const separator = pair.indexOf('=')
    const key = decodeQueryPart(separator < 0 ? pair : pair.slice(0, separator)).toLowerCase()
    const value = decodeQueryPart(separator < 0 ? '' : pair.slice(separator + 1))
    query[key] = value
  })

  const secret = String(query.secret || '').toUpperCase().replace(/[\s=-]/g, '')
  decodeBase32(secret)
  const algorithm = String(query.algorithm || 'SHA1').toUpperCase()
  if (algorithm !== 'SHA1') throw new Error('当前仅支持 SHA1 动态验证码')

  const digits = Number(query.digits || 6)
  const period = Number(query.period || 30)
  if (digits !== 6 && digits !== 8) throw new Error('二维码使用了不支持的验证码位数')
  if (!Number.isInteger(period) || period < 15 || period > 120) throw new Error('二维码使用了不支持的更新周期')

  let issuer = String(query.issuer || '').trim()
  let account = label.trim()
  const separator = account.indexOf(':')
  if (separator >= 0) {
    if (!issuer) issuer = account.slice(0, separator).trim()
    account = account.slice(separator + 1).trim()
  }
  if (!account) account = issuer || '未命名账户'

  return { account, issuer, secret, digits, period, algorithm }
}

module.exports = { generateTotp, parseOtpAuthUri }
