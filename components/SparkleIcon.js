import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// A "✦" that actually sparkles — a quick bright glint (fast attack) that
// slowly fades back down, then a short hold before it flashes again. The
// asymmetric timing is what reads as a glint rather than a smooth pulse.
export default function SparkleIcon({ style }) {
  const glint = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glint, {
          toValue: 1, duration: 220,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(glint, {
          toValue: 0, duration: 950,
          easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale = glint.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = glint.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const rotate = glint.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '18deg'] });

  return (
    <Animated.Text style={[style, { opacity, transform: [{ scale }, { rotate }] }]}>
      ✦
    </Animated.Text>
  );
}
