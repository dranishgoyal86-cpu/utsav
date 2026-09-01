import Svg, { Path, Circle } from 'react-native-svg';

// Playful, child-friendly star scatter for Celestial (kids-birthday) —
// deliberately simple geometric stars, not a licensed/branded character
// (no copyright risk). A crescent moon plus 4 stars, colour-parameterized
// same as every other motif in this directory.
function Star({ cx, cy, r, color }) {
  return <Path d={`M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3} Z`} fill={color} opacity={0.85} />;
}

export default function Stars({ width = 240, height = 90, color = '#7C6BC4' }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <Circle cx={width * 0.5} cy={height * 0.4} r={18} fill={color} opacity={0.25} />
      <Star cx={width * 0.2} cy={height * 0.3} r={9} color={color} />
      <Star cx={width * 0.38} cy={height * 0.65} r={6} color={color} />
      <Star cx={width * 0.62} cy={height * 0.2} r={7} color={color} />
      <Star cx={width * 0.8} cy={height * 0.55} r={10} color={color} />
    </Svg>
  );
}
