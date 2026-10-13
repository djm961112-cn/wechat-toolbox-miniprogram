const assert = require('assert')
const { POOLS, COMPOUND, normalizeFeed, selectedMatches, availablePasses, calculate, previewEntries } = require('../utils/football-simulation')
const { readPlans, savePlan, removePlan } = require('../utils/simulation-plans')

function option(poolId, key, odds, single = true, allUp = true) {
  return { poolId, key, odds, single, allUp, maxLegs: POOLS.find((pool) => pool.id === poolId).maxLegs, goalLine: '+1' }
}
function match(id, options) { return { id, options } }
const parlay = { id: '2x1', sizes: [2] }
const first = match('a', [option('had','h',2), option('had','d',3)])
const second = match('b', [option('had','h',4), option('had','a',5)])
const result = calculate([first,second], [parlay], 2)
assert.strictEqual(result.count, 4)
assert.strictEqual(result.cost, '16.00')
assert.strictEqual(result.maxReturn, '60.00')
const entries = previewEntries([first,second],[parlay],2,0,2).concat(previewEntries([first,second],[parlay],2,2,2))
assert.strictEqual(entries.length,4)
assert.deepStrictEqual(entries.map(entry=>entry.returnAmount),['32.00','40.00','48.00','60.00'])
assert.strictEqual(new Set(entries.map(entry=>entry.id)).size,4)
assert.throws(() => calculate([first,second], [parlay], 1.5))
assert.throws(() => calculate([first, first], [parlay], 1))

// Verify the decompositions through binomial counts, independently of pricing.
for (const [id, sizes] of Object.entries(COMPOUND)) {
  const [n, expected] = id.split('x').map(Number)
  const games = Array.from({ length:n }, (_, i) => match(String(i), [option('had','h',2)]))
  assert.strictEqual(calculate(games,[{id,sizes}],1).count,expected,id)
}

const mixed = match('m', [option('had','h',2), option('hhad','a',4)])
// Host win and handicap +1 host loss cannot both win: highest return is 8, not 12.
assert.strictEqual(calculate([mixed],[{id:'Single',sizes:[1]}],1).maxReturn,'8.00')
const compatible = match('m', [option('had','h',2), option('ttg','s2',3), option('crs','s02s00',4)])
assert.strictEqual(calculate([compatible],[{id:'Single',sizes:[1]}],1).maxReturn,'18.00')
const impossibleHalf = match('m', [option('crs','s00s00',4), option('hafu','hd',7)])
assert.strictEqual(calculate([impossibleHalf],[{id:'Single',sizes:[1]}],1).maxReturn,'14.00')
const partiallySingle = match('m', [option('had','h',2,false),option('ttg','s2',3)])
assert.strictEqual(calculate([partiallySingle],[{id:'Single',sizes:[1]}],1).count,1)
assert.strictEqual(calculate([partiallySingle],[{id:'Single',sizes:[1]}],1).maxReturn,'6.00')
assert.throws(()=>calculate([match('m',[option('ttg','s2',3,true,false)]),second],[parlay],1))

const rules = { HAD:[{formula:'Single',fValue:1},{formula:'2x1',formulaType:2,fValue:1}], TTG:[{formula:'Single',fValue:1},{formula:'2x1',formulaType:2,fValue:1}] }
const response = {errorCode:'0',value:{allUpList:rules,matchInfoList:[{subMatchList:[
  {matchId:1,matchStatus:'Selling',matchNumStr:'测试001',homeTeamAbbName:'主队',awayTeamAbbName:'客队',matchDate:'2026-10-12',matchTime:'21:00:00',poolList:[{poolCode:'HAD',poolStatus:'Selling',single:0,allUp:1},{poolCode:'TTG',poolStatus:'Selling',single:1,allUp:1}],had:{h:'2',d:'',a:'0'},ttg:{s2:'3'}},
  {matchId:2,matchStatus:'Closed',poolList:[]}
] }]}}
const feed = normalizeFeed(response)
assert.strictEqual(feed.matches.length,2)
assert.strictEqual(feed.matches[0].pools[0].single,false)
assert.strictEqual(feed.matches[0].pools.find(pool=>pool.id==='ttg').single,true)
assert.strictEqual(feed.matches[0].pools[0].options.length,1)
const selected = selectedMatches(feed.matches,{'1:had:h':true,'1:ttg:s2':true})
assert.strictEqual(selected.length,1) // Different pools are one match.
assert.deepStrictEqual(availablePasses(selected,rules,'free').map(p=>p.id),['Single'])
assert.throws(()=>normalizeFeed({errorCode:1}))

const memory = new Map()
global.wx = {getStorageSync:key=>memory.get(key),setStorageSync:(key,value)=>memory.set(key,JSON.parse(JSON.stringify(value)))}
const originalNow = Date.now
Date.now=()=>1000
const saved = savePlan({toolId:'football',title:'方案一',matches:[{id:'1',selections:[{odds:2}]}]})
Date.now=()=>2000
const newer = savePlan({toolId:'football',title:'方案二',matches:[{id:'2',selections:[{odds:3}]}]})
assert.deepStrictEqual(readPlans().map(p=>p.id),[newer.id,saved.id])
saved.matches[0].selections[0].odds=9
assert.strictEqual(readPlans()[1].matches[0].selections[0].odds,2)
assert.throws(()=>savePlan({toolId:'football',title:'空方案',matches:[]}))
global.wx.setStorageSync=()=>{throw new Error('storage full')}
assert.throws(()=>savePlan({toolId:'football',title:'保存失败',matches:[{id:'x'}]}))
assert.strictEqual(readPlans().length,2)
global.wx.setStorageSync=(key,value)=>memory.set(key,value)
removePlan(saved.id)
assert.strictEqual(readPlans().length,1)
Date.now=originalNow
console.log('PASS: all compound pass counts, live feed contract, single eligibility, mixed result compatibility, immutable snapshots and storage failures')
