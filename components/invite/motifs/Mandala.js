import Svg, { Circle, Path } from 'react-native-svg';

// Understated sacred-geometry mark for Ivory Mandala — concentric rings +
// 8 simple petal strokes, deliberately spare (fine gold line work on a
// pale canvas, not a dense ornate illustration) to match this archetype's
// "light ivory canvas, spacious typography" brief. No deity/religious
// figure is drawn — a neutral geometric motif only, consistent with this
// registry's "never auto-insert religious symbolism" rule (that rule is
// about SCHEMA CONTENT — invocation text/deity names a host writes — this
// decorative geometric mark is a design element, not host content, same
// distinction the existing Diya.js Rangoli motif already draws).
export default function Mandala({ size = 96, color = '#B8862F' }) {
  const r = size / 2;
  const petals = 8;
  return (
    <Svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`}>
      <Circle cx={0} cy={0} r={r - 2} stroke={color} strokeWidth={0.7} opacity={0.35} fill="none" />
      <Circle cx={0} cy={0} r={r * 0.62} stroke={color} strokeWidth={0.7} opacity={0.35} fill="none" />
      {Array.from({ length: petals }).map((_, i) => {
        const angle = (i / petals) * Math.PI * 2;
        const x1 = Math.cos(angle) * r * 0.3;
        const y1 = Math.sin(angle) * r * 0.3;
        const x2 = Math.cos(angle) * (r - 6);
        const y2 = Math.sin(angle) * (r - 6);
        return <Path key={i} d={`M${x1} ${y1} L${x2} ${y2}`} stroke={color} strokeWidth={0.7} opacity={0.4} />;
      })}
      <Circle cx={0} cy={0} r={4} fill={color} opacity={0.7} />
    </Svg>
  );
}
