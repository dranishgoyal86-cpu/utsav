import Svg, { Path, Line } from 'react-native-svg';

// Simple palace/jharokha arch frame — a multi-cusped (scalloped) arch top
// over a thin double-line frame, restrained rather than an ornate carved
// lattice illustration (this pilot's job is proving the composition
// system works, not final artwork polish). Colour-parameterized, same
// convention as every other motif in this directory (TornArch/HairRule/
// Diya) — no fixed palette baked in here.
export default function Jharokha({ width = 320, height = 130, color = '#D4A03C' }) {
  // 5-cusp scalloped arch, hand-built (not copied from an external
  // reference — this is a new motif for the design-archetype pilot, not a
  // "must match the reviewed prototype exactly" case like TornArch.js).
  const cusps = 5;
  const cuspWidth = width / cusps;
  let d = `M0 ${height * 0.55}`;
  for (let i = 0; i < cusps; i++) {
    const cx = i * cuspWidth + cuspWidth / 2;
    d += ` Q${cx} 0 ${(i + 1) * cuspWidth} ${height * 0.55}`;
  }
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <Path d={d} stroke={color} strokeWidth={1.4} opacity={0.85} />
      <Line x1={8} y1={height * 0.55 + 10} x2={width - 8} y2={height * 0.55 + 10} stroke={color} strokeWidth={0.8} opacity={0.5} />
    </Svg>
  );
}
