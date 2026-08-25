import Svg, { Path, Circle, G } from 'react-native-svg';

// Kalamkari's block-print botanical unit. Path data and the two-petal +
// centre-dot composition copied directly from the reviewed Kalamkari
// reference (utsav-invite-design-system.html), not re-derived. The petals
// are two hand-placed curves crossing at the centre, not a radial repeat —
// deliberately imperfect, "printed" not "generated." Don't symmetrize this.
export default function Bloom({ x = 0, y = 0, size = 1, petalColor = '#1B3A6B', dotColor = '#A8324A' }) {
  return (
    <G x={x} y={y} scale={size}>
      <Path d="M0-14C5-7 5 7 0 14-5 7-5-7 0-14z" fill={petalColor} opacity={0.7} />
      <Path d="M-14 0C-7-5 7-5 14 0 7 5-7 5-14 0z" fill={petalColor} opacity={0.7} />
      <Circle r={6} fill={dotColor} />
    </G>
  );
}

// Composed unit: outer/inner double-border rect frame + the asymmetric
// row-of-5-top / row-of-3-bottom bloom placement + underscore rules.
// Coordinates copied directly from the reference (400x500 viewBox), not
// re-derived — bottom row genuinely has 3, not 5; that's intentional.
const TOP_Y = 70;
const BOTTOM_Y = 446;
const TOP_XS = [64, 132, 200, 268, 336];
const BOTTOM_XS = [64, 200, 336];

export function KalamkariFrame({ width = 400, height = 500, lineColor = '#1B3A6B', accentColor = '#A8324A' }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 500" fill="none">
      <Path
        d="M20 20h360v460h-360z"
        stroke={lineColor}
        strokeWidth={1.3}
        opacity={0.9}
        fill="none"
      />
      <Path
        d="M27 27h346v446h-346z"
        stroke={lineColor}
        strokeWidth={0.7}
        opacity={0.55}
        fill="none"
      />
      <Path d={`M40 ${TOP_Y}h320`} stroke={lineColor} strokeWidth={0.8} opacity={0.35} />
      <Path d={`M40 ${BOTTOM_Y}h320`} stroke={lineColor} strokeWidth={0.8} opacity={0.35} />
      {TOP_XS.map((bx, i) => (
        <Bloom key={`t${i}`} x={bx} y={TOP_Y} petalColor={lineColor} dotColor={accentColor} />
      ))}
      {BOTTOM_XS.map((bx, i) => (
        <Bloom key={`b${i}`} x={bx} y={BOTTOM_Y} petalColor={lineColor} dotColor={accentColor} />
      ))}
    </Svg>
  );
}
