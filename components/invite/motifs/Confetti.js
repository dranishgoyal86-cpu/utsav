import Svg, { Circle, Rect } from 'react-native-svg';

// Scattered confetti shapes — Playful Pop's own motif. Plain geometric
// dots/squares in an irregular scatter, no character/brand dependency.
export default function Confetti({ width = 260, height = 70, color = '#E8A020' }) {
  const pieces = [
    { x: 12, y: 10, s: 'circle', r: 5 },
    { x: 40, y: 40, s: 'rect', r: 6 },
    { x: 70, y: 14, s: 'circle', r: 4 },
    { x: 100, y: 46, s: 'circle', r: 6 },
    { x: 130, y: 8, s: 'rect', r: 5 },
    { x: 160, y: 38, s: 'circle', r: 5 },
    { x: 190, y: 12, s: 'rect', r: 4 },
    { x: 220, y: 44, s: 'circle', r: 6 },
    { x: 245, y: 16, s: 'circle', r: 4 },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      {pieces.map((p, i) =>
        p.s === 'circle'
          ? <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={0.5 + (i % 3) * 0.15} />
          : <Rect key={i} x={p.x - p.r} y={p.y - p.r} width={p.r * 2} height={p.r * 2} rx={2} fill={color} opacity={0.5 + (i % 3) * 0.15} transform={`rotate(20 ${p.x} ${p.y})`} />
      )}
    </Svg>
  );
}
