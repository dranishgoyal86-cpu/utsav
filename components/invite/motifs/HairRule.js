import Svg, { Line, Path } from 'react-native-svg';

// Thin decorative divider. Straight variant matches the reference's own
// under-names divider (M150 356h100 — a 100-wide line, stroke-width .9,
// opacity .65) at proportional scale. Curved variant reuses the reference's
// bottom-arch curve ratio (a 372-wide span with a 26-unit rise, ~7%) rather
// than the leaf-bearing top arch, which is TornArch's own shape, not a
// general-purpose divider.
export default function HairRule({ width = 200, color = '#D4A03C', curve = false }) {
  if (!curve) {
    return (
      <Svg width={width} height={2} viewBox="0 0 200 2" fill="none">
        <Line x1={0} y1={1} x2={200} y2={1} stroke={color} strokeWidth={0.9} opacity={0.65} />
      </Svg>
    );
  }
  // Same curvature ratio as the reference's bottom-arch line
  // (M14 456 Q200 430 386 456 — control point 26 units above the endpoints
  // over a 372-wide span), re-based to a 0-anchored 0..200 viewBox.
  return (
    <Svg width={width} height={16} viewBox="0 0 200 16" fill="none">
      <Path
        d="M7 15 Q100 1 193 15"
        stroke={color}
        strokeWidth={1.1}
        fill="none"
        opacity={0.5}
      />
    </Svg>
  );
}
