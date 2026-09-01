import Svg, { Path, Circle } from 'react-native-svg';

// Simple botanical spray — a curved stem with a handful of leaf/petal
// marks, used by both Botanical Romance (day palette) and Night Bloom
// (dark palette) — differentiation between the two comes from the
// variant's colour tokens, not a second geometry, matching this
// registry's "reuse composition, vary tokens" discipline (same reasoning
// TornArch/Jharokha/Mandala already established).
export default function Botanical({ width = 260, height = 90, color = '#8A9A5B' }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <Path d={`M10 ${height * 0.7} Q${width / 2} ${height * 0.1} ${width - 10} ${height * 0.7}`} stroke={color} strokeWidth={1.2} opacity={0.7} />
      {[0.18, 0.36, 0.5, 0.64, 0.82].map((t, i) => {
        const x = 10 + t * (width - 20);
        const y = height * 0.7 - Math.sin(t * Math.PI) * height * 0.55;
        return <Circle key={i} cx={x} cy={y - 6} r={4} fill={color} opacity={0.55} />;
      })}
    </Svg>
  );
}
