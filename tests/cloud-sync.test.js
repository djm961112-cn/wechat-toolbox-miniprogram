const assert = require('assert')

function freshCloud(storage, request, showModal) {
  global.wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: (key) => storage.delete(key),
    request,
    showModal: showModal || (({ success, complete }) => { if (success) success({ confirm: true }); if (complete) complete() })
  }
  delete require.cache[require.resolve('../utils/auth')]
  delete require.cache[require.resolve('../utils/cloud-sync')]
  return require('../utils/cloud-sync')
}

function response(options, statusCode, data) { options.success({ statusCode, data }) }
function session(storage) { storage.set('openotools-auth-v1', { token: 'token', user: { id: 7 } }) }

async function main() {
  {
    const storage = new Map()
    session(storage)
    const cloud = freshCloud(storage, () => {})
    const local = { plans: [{ id: 'p1', createdAt: 1000, cost: '4.00', minReturn: null, matches: [] }], sources: [{ id: 's1', name: '自选', createdAt: 1000 }] }
    const remote = { sources: [{ createdAt: '1000', name: '自选', id: 's1' }], plans: [{ matches: [], cost: 4, createdAt: '1000', id: 'p1' }] }
    assert.strictEqual(cloud.mergeToolData('simulation', local, remote).conflicts.length, 0, '字段顺序、数字类型和空字段差异不应触发冲突')
    const changed = { ...remote, plans: [{ ...remote.plans[0], cost: 6 }] }
    assert.strictEqual(cloud.mergeToolData('simulation', local, changed).conflicts.length, 1, '真实业务数据差异仍应触发冲突')
  }

  {
    const storage = new Map()
    session(storage)
    const cloud = freshCloud(storage, () => {})
    const normalized = cloud.normalizeToolData('simulation', { sources: [], plans: [{ id: 'p1', matches: [], check: { results: [{ pools: [{ id: 'had', odds: '-' }] }] } }] })
    assert.strictEqual(normalized.plans[0].check.results[0].pools[0].odds, null, '历史赛果的半角占位符应转为空值')
    assert.strictEqual(cloud.normalizeToolData('simulation', { sources: [], plans: [{ id: 'p2', cost: ' 4.00 ', matches: [] }] }).plans[0].cost, '4.00')
    assert.throws(() => cloud.normalizeToolData('simulation', { sources: [], plans: [{ id: 'p2', cost: '异常金额', matches: [] }] }), /模拟方案\[1\]\.cost/)
    assert.throws(() => cloud.normalizeToolData('simulation', { sources: [], plans: [{ id: 'p3', cost: '0x10', matches: [] }] }), /模拟方案\[1\]\.cost/)
  }

  {
    const storage = new Map()
    session(storage)
    const local = [{ id: 'local', secret: 'SECRET', account: 'a', issuer: 'i' }]
    storage.set('mfa-totp-accounts-v1', local)
    const cloud = freshCloud(storage, (options) => response(options, 404, { code: 'CLOUD_DATA_NOT_FOUND', message: '暂无数据' }))
    const result = await cloud.restoreTool('mfa')
    assert.strictEqual(result.pendingUpload, true)
    assert.deepStrictEqual(storage.get('mfa-totp-accounts-v1'), local, '空云端不能覆盖老本地数据')
  }

  {
    const storage = new Map()
    session(storage)
    const requests = []
    const cloud = freshCloud(storage, (options) => {
      requests.push({ url: options.url, method: options.method, data: options.data })
      if (options.method === 'PUT') response(options, 200, { tool: 'weight', revision: 1 })
      else response(options, 404, { code: 'CLOUD_DATA_NOT_FOUND', message: '暂无数据' })
    })
    await cloud.restoreTool('weight')
    cloud.writeToolData('weight', [{ id: 'w1', weight: 70, createdAt: 1 }])
    await cloud.syncNow('weight')
    const put = requests.find((item) => item.method === 'PUT')
    assert.strictEqual(put.data.expectedRevision, 0, '首次保存必须使用 revision 0')
    assert.strictEqual(storage.has('weight-records-v1'), false, '上传成功后应清理本地完整快照')
  }

  {
    const storage = new Map()
    session(storage)
    const a = { id: 'a', weight: 70, createdAt: 1 }
    const b = { id: 'b', weight: 71, createdAt: 2 }
    const c = { id: 'c', weight: 72, createdAt: 3 }
    storage.set('weight-records-v1', [a])
    let putCount = 0
    const cloud = freshCloud(storage, (options) => {
      if (options.method === 'GET') {
        const data = putCount ? [a, c] : [a]
        response(options, 200, { tool: 'weight', revision: putCount ? 2 : 1, data })
      } else if (++putCount === 1) response(options, 409, { code: 'CLOUD_DATA_REVISION_CONFLICT', message: '冲突' })
      else {
        assert.strictEqual(options.data.expectedRevision, 2)
        response(options, 200, { tool: 'weight', revision: 3 })
      }
    })
    await cloud.restoreTool('weight')
    cloud.writeToolData('weight', [a, b])
    await cloud.syncNow('weight')
    assert.deepStrictEqual(cloud.readToolData('weight').map((item) => item.id).sort(), ['a', 'b', 'c'])
    assert.strictEqual(storage.has('weight-records-v1'), false, '冲突合并上传成功后应清理本地快照')
    assert.strictEqual(putCount, 2, '409 后应重新读取并重试一次')
  }

  {
    const storage = new Map()
    session(storage)
    const a = { id: 'a', weight: 70, createdAt: 1 }
    const b = { id: 'b', weight: 71, createdAt: 2 }
    storage.set('weight-records-v1', [a])
    const cloud = freshCloud(storage, (options) => {
      if (options.method === 'GET') response(options, 200, { tool: 'weight', revision: 1, data: [a] })
      else options.fail({ errMsg: 'network error' })
    })
    await cloud.restoreTool('weight')
    cloud.writeToolData('weight', [a, b])
    await assert.rejects(() => cloud.syncNow('weight'))
    assert.deepStrictEqual(storage.get('weight-records-v1'), [a, b], '网络失败时必须保留本地最新数据')
  }

  {
    const storage = new Map()
    session(storage)
    const cloud = freshCloud(storage, (options) => options.fail({ errMsg: 'offline' }))
    const result = await cloud.prepareTool('mfa')
    assert(result.error)
    assert.throws(() => cloud.readToolData('mfa'), /服务器数据尚未加载/)
    assert.throws(() => cloud.writeToolData('mfa', []), /服务器数据尚未加载/)
  }

  {
    const storage = new Map()
    session(storage)
    const record = { id: 'done', weight: 70, createdAt: 1 }
    storage.set('weight-records-v1', [record])
    storage.set('openotools-cloud-sync-v1', { weight: { userId: '7', revision: 1, enabled: true, pendingChanges: true } })
    let modalCount = 0
    const cloud = freshCloud(storage, (options) => response(options, 200, { tool: 'weight', revision: 2, data: [record] }), () => { modalCount += 1 })
    await cloud.restoreTool('weight')
    assert.strictEqual(modalCount, 0, '服务器已收到相同待上传数据时不应再弹冲突')
    assert.strictEqual(storage.has('weight-records-v1'), false)
    assert.strictEqual(storage.get('openotools-cloud-sync-v1').weight.pendingChanges, false)
  }
  console.log('PASS: cloud restore, revision, conflict merge and local-first failure handling')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
