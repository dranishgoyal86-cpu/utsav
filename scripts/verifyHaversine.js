// Plain Node sanity check for lib/haversine.js — run with:
//   node scripts/verifyHaversine.js
// Same shape as scripts/verifyEventContext.js: Babel-transform shim + plain
// PASS/FAIL assertions against the real function, not a reimplementation.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { haversineMeters } = loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'haversine.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}`); }
}
function within(value, min, max) {
  return value >= min && value <= max;
}

console.log('\n=== haversineMeters ===');
{
  const p = { lat: 28.6139, lng: 77.2090 };
  const d = haversineMeters(p, p);
  assert('identical point: distance is 0', d === 0);
}
{
  // 1 degree of latitude is ~111,320m at any longitude — 0.001deg (same
  // longitude, so pure north-south) should land very close to 111.32m.
  // Generous tolerance for the spherical-earth approximation itself.
  const a = { lat: 28.6139, lng: 77.2090 };
  const b = { lat: 28.6149, lng: 77.2090 };
  const d = haversineMeters(a, b);
  assert('0.001 deg latitude ~= 111m', within(d, 105, 118));
}
{
  const a = { lat: 28.6139, lng: 77.2090 };
  const b = { lat: 19.0760, lng: 72.8777 };
  assert('symmetric: a->b equals b->a', haversineMeters(a, b) === haversineMeters(b, a));
}
{
  // Delhi <-> Mumbai, well-known to be roughly 1,150-1,160km great-circle —
  // wide tolerance since this is a sanity check on order-of-magnitude
  // correctness, not a precision test.
  const delhi = { lat: 28.6139, lng: 77.2090 };
  const mumbai = { lat: 19.0760, lng: 72.8777 };
  const d = haversineMeters(delhi, mumbai);
  assert('Delhi-Mumbai roughly 1,100-1,200km', within(d, 1100000, 1200000));
}
{
  // The actual use case: is a guest within/outside a ~300m venue radius.
  const venue = { lat: 28.6139, lng: 77.2090 };
  const insideRadius = { lat: 28.6141, lng: 77.2090 }; // ~22m north
  const outsideRadius = { lat: 28.6200, lng: 77.2090 }; // ~678m north
  assert('point ~22m away is within a 300m radius', haversineMeters(venue, insideRadius) < 300);
  assert('point ~678m away is outside a 300m radius', haversineMeters(venue, outsideRadius) > 300);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);
