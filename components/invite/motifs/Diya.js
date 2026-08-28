import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

// Wave 10 — Diya's two motif pieces: the rangoli (static) and the diya row
// (one flickering flame per lamp). Path/position data copied directly from
// the reviewed reference, same "don't re-derive" discipline as TornArch.js.

const FLAME_AMBER = '#E8A020';
const DIYA_BROWN = '#B5542A';
const LAMP_X = [-96, -48, 0, 48, 96]; // centred on 0, spacing matches the
// reference's 104/152/200/248/296 on a 400-wide canvas (200 = centre)

export function Rangoli({ size = 88, color }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox="-44 -44 88 88">
      <Circle cx={0} cy={0} r={44} stroke={color} strokeWidth={0.8} opacity={0.3} fill="none" />
      <Circle cx={0} cy={0} r={32} stroke={color} strokeWidth={0.8} opacity={0.3} fill="none" />
      <Path d="M0-40v104M-52 12h104M-36-24l72 72M36-24l-72 72" stroke={color} strokeWidth={0.6} opacity={0.3} fill="none" />
      <Circle cx={0} cy={0} r={9} fill={color} opacity={0.8} />
    </Svg>
  );
}

// A single flickering flame — Animated.loop, same technique as
// SparkleIcon.js. duration/delay vary per lamp (passed by DiyaRow below) so
// the five flames read as independently alive, not synchronized — the same
// principle Toran's falling petals already established.
function Flame({ duration, delay }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(pulse, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [duration, delay]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Svg width={13} height={13} viewBox="-6.5 -13 13 13">
        <Path d="M0-13c4 6 4 10 0 13-4-3-4-7 0-13z" fill={FLAME_AMBER} />
      </Svg>
    </Animated.View>
  );
}

export function DiyaRow({ width = 288 }) {
  return (
    <View style={{ width, height: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      {LAMP_X.map((x, i) => (
        <View key={x} style={{ alignItems: 'center' }}>
          <Flame duration={2400 + i * 140} delay={i * 220} />
          <Svg width={26} height={9} viewBox="-13 0 26 9" style={{ marginTop: -2 }}>
            <Path d="M-13 0q13 11 26 0q-4 9-13 9T-13 0z" fill={DIYA_BROWN} />
          </Svg>
        </View>
      ))}
    </View>
  );
}
