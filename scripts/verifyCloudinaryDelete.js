// Verifies the hand-rolled SHA-1 in lib/cloudinaryDelete.js against known
// test vectors before it's trusted to sign a real Cloudinary delete request.
// Run with: node scripts/verifyCloudinaryDelete.js
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

const { sha1Hex } = loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'cloudinaryDelete.js'));

let pass = 0, fail = 0;
function assert(label, actual, expected) {
  if (actual === expected) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n    expected: ${expected}\n    actual:   ${actual}`); }
}

// Reference values generated with Node's own crypto.createHash('sha1') —
// not typed from memory, to rule out the exact class of transcription
// error this project has repeatedly hit with hand-typed reference data.
assert('SHA1("abc")', sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
assert('SHA1("")', sha1Hex(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
assert(
  'SHA1(long 56-char message, "abcdbcde...")',
  sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
  '84983e441c3bd26ebaae4aa1f95129e5e54670f1'
);
assert('SHA1("The quick brown fox jumps over the lazy dog")', sha1Hex('The quick brown fox jumps over the lazy dog'), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
