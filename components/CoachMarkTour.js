import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { useTheme } from '../ThemeContext';
import { getTourTarget } from '../lib/tourTargets';

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_MARGIN = 12;
const MEASURE_RETRY_MS = 100;
const MEASURE_MAX_ATTEMPTS = 5;

function measureTarget(key) {
  return new Promise(resolve => {
    const ref = getTourTarget(key);
    const node = ref?.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }

    let attempt = 0;
    function tryMeasure() {
      node.measureInWindow((x, y, width, height) => {
        // A freshly-mounted node can report 0x0 for a beat before its first
        // real layout pass commits — not a genuine absence, just too early.
        // Retry a few times before treating it as unmeasurable.
        if ((width === 0 || height === 0) && attempt < MEASURE_MAX_ATTEMPTS) {
          attempt += 1;
          setTimeout(tryMeasure, MEASURE_RETRY_MS);
          return;
        }
        if (width === 0 || height === 0) {
          resolve(null);
          return;
        }
        resolve({ x, y, width, height });
      });
    }
    tryMeasure();
  });
}

// Full-screen spotlight-tooltip tour engine. Given an ordered `steps` array
// of { key, target, title, description }, where `target` is a string key
// into lib/tourTargets.js's registry (uniform for every step — same-screen
// elements and cross-tree elements like the tab bar register into the same
// registry, so this component never needs to branch on "what kind of ref is
// this"), it measures each target's real on-screen position and renders a
// darkened cutout + pointing tooltip around it.
//
// A target that isn't mounted/measurable (wrong screen, not rendered yet,
// removed from a later app version) is skipped automatically — advances to
// the next step rather than crashing or showing a blank spotlight. If every
// remaining step turns out unmeasurable, the tour ends quietly via onSkip.
//
// Scroll support is deliberately simple, not a generic "compute where the
// target is inside any ScrollView and scroll to it" system (that needs to
// walk the native scroll responder chain — real added complexity a v1
// engine doesn't need yet). A step MAY carry `scrollTo: { ref, y }` — the
// tour calls `ref.current.scrollTo({ y, animated: true })` before
// measuring, then waits briefly for layout to settle. The caller (whoever
// authors a given tour's steps) is expected to know where their own content
// sits, same as they already know which elements to target.
export default function CoachMarkTour({ visible, steps, onComplete, onSkip }) {
  const { theme } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const s = makeStyles(theme);

  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [measuring, setMeasuring] = useState(true);
  // Guards against a stale async resolveStep (mid scrollTo-delay or
  // measureTarget retry) continuing after Skip was tapped or the tour was
  // dismissed some other way — incrementing this invalidates any in-flight
  // resolution instead of needing a cleanup-driven cancellation flag per call.
  const runIdRef = useRef(0);

  // Single explicit entry point on becoming visible — steps are resolved by
  // direct calls (here and from handleNext/handleSkip), not by watching
  // stepIndex itself change, so there's exactly one place driving
  // progression and no risk of the effect double-firing off its own writes.
  useEffect(() => {
    if (!visible || !steps || steps.length === 0) return;
    const myRun = ++runIdRef.current;
    resolveStep(0, myRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, steps]);

  // Advances through steps, skipping any that don't resolve to a real
  // on-screen element, until it finds one to show or runs out entirely.
  async function resolveStep(index, runId) {
    if (runId !== runIdRef.current) return; // superseded by a newer call
    if (index >= steps.length) {
      finish(onSkip || onComplete);
      return;
    }
    setMeasuring(true);
    const step = steps[index];
    if (step.scrollTo?.ref?.current) {
      try {
        step.scrollTo.ref.current.scrollTo({ y: step.scrollTo.y ?? 0, animated: true });
        await new Promise(res => setTimeout(res, 350));
      } catch (err) {
        console.log('CoachMarkTour scrollTo error:', err.message);
      }
    }
    const measured = await measureTarget(step.target);
    if (runId !== runIdRef.current) return;
    if (!measured) {
      // Unmeasurable — try the next step instead of showing nothing.
      resolveStep(index + 1, runId);
      return;
    }
    setStepIndex(index);
    setRect(measured);
    setMeasuring(false);
  }

  function finish(cb) {
    runIdRef.current += 1; // invalidate anything still in flight
    setRect(null);
    if (cb) cb();
  }

  function handleNext() {
    if (stepIndex >= steps.length - 1) {
      finish(onComplete);
      return;
    }
    const myRun = ++runIdRef.current;
    resolveStep(stepIndex + 1, myRun);
  }

  function handleSkip() {
    finish(onSkip || onComplete);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {measuring || !rect ? null : (
          <>
            {/* ── Darkened overlay with a cut-out "spotlight" — four plain
                Views around the highlighted rect rather than an SVG mask, so
                this needs no new dependency (no react-native-svg in this
                project today). ── */}
            <Overlay rect={rect} screenWidth={screenWidth} screenHeight={screenHeight} />

            {/* Highlight ring, purely visual, never intercepts touches. */}
            <View
              pointerEvents="none"
              style={[
                s.spotlightRing,
                {
                  left: rect.x - SPOTLIGHT_PADDING,
                  top: rect.y - SPOTLIGHT_PADDING,
                  width: rect.width + SPOTLIGHT_PADDING * 2,
                  height: rect.height + SPOTLIGHT_PADDING * 2,
                },
              ]}
            />

            <Tooltip
              rect={rect}
              screenWidth={screenWidth}
              screenHeight={screenHeight}
              step={steps[stepIndex]}
              stepNumber={stepIndex + 1}
              totalSteps={steps.length}
              isLast={stepIndex >= steps.length - 1}
              onNext={handleNext}
              onSkip={handleSkip}
              theme={theme}
              s={s}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

// Four opaque strips around the spotlight rect — top band (full width),
// bottom band (full width), left band (between top/bottom bands, spotlight's
// height only), right band (same). Leaves the rect itself, plus its padding,
// genuinely transparent — not just visually dark-on-dark.
function Overlay({ rect, screenWidth, screenHeight }) {
  const top = Math.max(0, rect.y - SPOTLIGHT_PADDING);
  const bottom = Math.max(0, rect.y + rect.height + SPOTLIGHT_PADDING);
  const left = Math.max(0, rect.x - SPOTLIGHT_PADDING);
  const right = Math.max(0, rect.x + rect.width + SPOTLIGHT_PADDING);
  const dim = { backgroundColor: '#000000B3' }; // ~70% black, same overlay darkness convention as this project's other Modal overlays

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <View style={[dim, { position: 'absolute', top: 0, left: 0, right: 0, height: top }]} />
      <View style={[dim, { position: 'absolute', top: bottom, left: 0, right: 0, bottom: 0 }]} />
      <View style={[dim, { position: 'absolute', top, left: 0, width: left, height: bottom - top }]} />
      <View style={[dim, { position: 'absolute', top, left: right, right: 0, height: bottom - top }]} />
    </View>
  );
}

function Tooltip({ rect, screenWidth, screenHeight, step, stepNumber, totalSteps, isLast, onNext, onSkip, theme, s }) {
  const spaceBelow = screenHeight - (rect.y + rect.height + SPOTLIGHT_PADDING);
  const spaceAbove = rect.y - SPOTLIGHT_PADDING;
  // Prefer below the target; flip above only when there's genuinely more
  // room there (handles a target near the very bottom of the screen, e.g.
  // the bottom tab bar itself).
  const placeBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;

  const idealLeft = rect.x + rect.width / 2 - TOOLTIP_WIDTH / 2;
  const clampedLeft = Math.min(Math.max(idealLeft, TOOLTIP_MARGIN), screenWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN);

  const top = placeBelow
    ? rect.y + rect.height + SPOTLIGHT_PADDING + 14
    : Math.max(TOOLTIP_MARGIN, rect.y - SPOTLIGHT_PADDING - 14 - 150);

  return (
    <View style={[s.tooltip, { left: clampedLeft, top, width: TOOLTIP_WIDTH }]}>
      <Text style={s.tooltipStep}>{stepNumber} of {totalSteps}</Text>
      <Text style={s.tooltipTitle}>{step.title}</Text>
      <Text style={s.tooltipDesc}>{step.description}</Text>
      <View style={s.tooltipActions}>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.tooltipSkip}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.tooltipNextBtn} onPress={onNext}>
          <Text style={s.tooltipNextText}>{isLast ? 'Done' : 'Next →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    spotlightRing: {
      position: 'absolute',
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.accent,
    },
    tooltip: {
      position: 'absolute',
      backgroundColor: theme.cardBg,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    tooltipStep: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, marginBottom: 4, letterSpacing: 0.3 },
    tooltipTitle: { fontSize: 15.5, fontWeight: '700', color: theme.text, marginBottom: 6 },
    tooltipDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
    tooltipActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
    tooltipSkip: { fontSize: 13, fontWeight: '600', color: theme.textTertiary },
    tooltipNextBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
    tooltipNextText: { fontSize: 13, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
