import { useRef } from 'react';
import { View, Animated, PanResponder, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Trash } from 'phosphor-react-native';

const DELETE_WIDTH = 76;

// Swipe-left-to-delete for list rows — built on core RN's PanResponder/
// Animated rather than react-native-gesture-handler, since that library
// isn't installed anywhere in this app and pulling it in would force a new
// native dev-client build; PanResponder needs no native module and already
// works on web (mouse drag) and the existing dev client.
//
// Two things had to be true at once, which took two rounds to get right:
//  1. A plain tap must still reach `onPress` — PanResponder only claims the
//     gesture on a real horizontal move (onMoveShouldSetPanResponder), so a
//     stationary tap never triggers any PanResponder callback at all. The
//     content still needs its own TouchableOpacity for that.
//  2. But react-native-web's TouchableOpacity fires its own click on ANY
//     mouseup inside its bounds, regardless of how far the pointer moved in
//     between — unlike native, it has no "another responder just claimed
//     this gesture" cancellation. Without a guard, releasing a real drag
//     also fired the TouchableOpacity's onPress a moment later, which
//     re-closed the row it had just opened. `justDragged` suppresses that
//     one ghost click right after a genuine drag, then clears itself.
export default function SwipeableRow({ children, onDelete, onPress, deleteLabel, actionColor, actionIcon: ActionIcon = Trash, style }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const justDragged = useRef(false);

  function animateTo(value) {
    Animated.spring(translateX, { toValue: value, useNativeDriver: false, bounciness: 0 }).start();
    openRef.current = value !== 0;
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        justDragged.current = false; // fresh gesture — don't carry a stale flag in
        return false; // never claim on touch-down; let taps/vertical scroll pass through
      },
      onMoveShouldSetPanResponder: (_, g) => {
        const claim = Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
        if (claim) justDragged.current = true;
        return claim;
      },
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -DELETE_WIDTH : 0;
        const next = Math.min(0, Math.max(base + g.dx, -DELETE_WIDTH));
        translateX.setValue(next);
      },
      // Only real drags reach here — onMoveShouldSetPanResponder is the only
      // thing that claims the gesture, and it only claims past the move
      // threshold above.
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -DELETE_WIDTH : 0;
        const finalX = Math.min(0, Math.max(base + g.dx, -DELETE_WIDTH));
        animateTo(finalX < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0);
      },
      onPanResponderTerminate: () => animateTo(openRef.current ? -DELETE_WIDTH : 0),
    })
  ).current;

  function handleContentPress() {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (openRef.current) {
      animateTo(0);
      return;
    }
    onPress?.();
  }

  function handleDelete() {
    animateTo(0);
    onDelete?.();
  }

  return (
    <View style={[s.wrap, style]}>
      <TouchableOpacity
        style={[s.deleteBtn, actionColor && { backgroundColor: actionColor }]}
        onPress={handleDelete}
      >
        <ActionIcon size={18} color="#FFF" />
        {deleteLabel ? <Text style={s.deleteLabel}>{deleteLabel}</Text> : null}
      </TouchableOpacity>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <TouchableOpacity activeOpacity={0.85} onPress={handleContentPress}>
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // userSelect prevents a mouse-drag over text from being swallowed by the
  // browser's native text-selection drag on web (RN-Web-only concern — the
  // property is simply ignored on native).
  wrap: { position: 'relative', overflow: 'hidden', userSelect: 'none' },
  deleteBtn: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: DELETE_WIDTH,
    backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  deleteLabel: { fontSize: 10.5, fontWeight: '700', color: '#FFF' },
});
