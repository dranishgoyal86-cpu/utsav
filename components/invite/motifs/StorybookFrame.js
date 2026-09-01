import Svg, { Rect, Path } from 'react-native-svg';

// A simple rounded storybook-page frame + a small curl at each top corner,
// suggesting an open picture-book without illustrating any specific
// character or scene (no copyright dependency) — Illustrated Story's own
// motif.
export default function StorybookFrame({ width = 260, height = 90, color = '#C2703C' }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <Rect x={6} y={6} width={width - 12} height={height - 12} rx={14} stroke={color} strokeWidth={1.4} opacity={0.7} />
      <Path d={`M6 20 Q16 10 26 20`} stroke={color} strokeWidth={1.2} opacity={0.6} />
      <Path d={`M${width - 26} 20 Q${width - 16} 10 ${width - 6} 20`} stroke={color} strokeWidth={1.2} opacity={0.6} />
    </Svg>
  );
}
