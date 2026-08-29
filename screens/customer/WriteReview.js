import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import AppHeader from '../../components/AppHeader';
import { CREAM } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

const QUICK_TAGS = [
  'Professional', 'Creative', 'On time', 'Great communication',
  'Exceeded expectations', 'Good value', 'Highly recommended',
  'Beautiful work', 'Friendly team', 'Will book again',
];

export default function WriteReview({ route, navigation }) {
  const { booking } = route.params;
  const { theme } = useTheme();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const ratingLabels = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent!'];

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  function toggleTag(tag) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  async function handleSubmit() {
    if (rating === 0) {
      showAlert('Rating required', 'Please select a star rating before submitting.');
      return;
    }
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const fullComment = [
        selectedTags.length > 0 ? selectedTags.join(' · ') : '',
        comment,
      ].filter(Boolean).join('\n\n');

      const { error } = await supabase
        .from('reviews')
        .insert({
          booking_id: booking.id,
          customer_id: session.user.id,
          provider_id: booking.provider_id,
          rating,
          comment: fullComment || null,
        });

      if (error) {
        if (error.code === '23505') {
          showAlert('Already reviewed', 'You have already submitted a review for this booking.');
          return;
        }
        throw error;
      }

      await supabase
        .from('bookings')
        .update({ status: 'reviewed' })
        .eq('id', booking.id);

      showAlert(
        'Review submitted! ⭐',
        'Thank you for your feedback. It helps other customers find the best providers.'
      );
      navigation.goBack();
    } catch (err) {
      console.log('Review submit error:', err.message);
      showAlert('Error', err.message || 'Could not submit review. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      <AppHeader title="Write a review" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isDesktopWeb && ds.centerCol}>

        {/* Provider info */}
        <View style={s.providerCard}>
          <View style={s.providerAvatar}>
            <Text style={s.providerAvatarText}>
              {booking.providerName?.[0] || '?'}
            </Text>
          </View>
          <View style={s.providerInfo}>
            <Text style={s.providerName}>{booking.providerName}</Text>
            <Text style={s.providerMeta}>
              {booking.event_type} · {new Date(booking.event_date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric'
              })}
            </Text>
          </View>
        </View>

        <View style={s.form}>

          {/* Star rating */}
          <Text style={s.sectionLabel}>Overall rating</Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                onPressIn={() => setHovered(star)}
                onPressOut={() => setHovered(0)}
                style={s.starBtn}
              >
                <Text style={[
                  s.star,
                  (hovered || rating) >= star && s.starActive
                ]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {(rating > 0 || hovered > 0) && (
            <Text style={s.ratingLabel}>
              {ratingLabels[hovered || rating]}
            </Text>
          )}

          {/* Quick tags */}
          <Text style={s.sectionLabel}>What stood out?</Text>
          <View style={s.tagsWrap}>
            {QUICK_TAGS.map(tag => (
              <TouchableOpacity
                key={tag}
                style={[s.tag, selectedTags.includes(tag) && s.tagActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[s.tagText, selectedTags.includes(tag) && s.tagTextActive]}>
                  {selectedTags.includes(tag) ? '✓ ' : ''}{tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Written review */}
          <Text style={s.sectionLabel}>Tell others about your experience</Text>
          <TextInput
            style={s.textInput}
            placeholder="How was the quality of work? Was the team professional and on time? Would you recommend them to others?"
            placeholderTextColor={theme.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={s.charCount}>{comment.length}/500 characters</Text>

          {/* Tips */}
          <View style={s.tipsBox}>
            <Text style={s.tipsTitle}>Tips for a helpful review</Text>
            <Text style={s.tipsText}>
              · Describe the quality of the work and final result{'\n'}
              · Mention if they were on time and professional{'\n'}
              · Share if the price matched the quality{'\n'}
              · Say if you would book them again
            </Text>
          </View>

        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }, isDesktopWeb && ds.bottomBarDesktop]}>
        <TouchableOpacity
          style={[s.submitBtn, (rating === 0 || loading) && s.submitBtnDisabled, isDesktopWeb && ds.submitBtnDesktop]}
          onPress={handleSubmit}
          disabled={rating === 0 || loading}
        >
          {loading
            ? <ActivityIndicator color={theme.btnPrimaryText} />
            : <Text style={s.submitBtnText}>Submit review →</Text>
          }
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },

    providerCard: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, backgroundColor: theme.cardBg, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, gap: 13 },
    providerAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    providerAvatarText: { fontSize: 19, color: '#FFF', fontWeight: '700' },
    providerInfo: { flex: 1 },
    providerName: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 3 },
    providerMeta: { fontSize: 12, color: theme.textSecondary },

    form: { paddingHorizontal: 16 },
    sectionLabel: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 13, marginTop: 10 },

    starsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    starBtn: { padding: 4 },
    star: { fontSize: 40, color: theme.border },
    starActive: { color: theme.accent },
    ratingLabel: { fontSize: 14, fontWeight: '700', color: theme.accent, marginBottom: 18 },

    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
    tag: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    tagActive: { backgroundColor: theme.text, borderColor: theme.text },
    tagText: { fontSize: 13, color: theme.textSecondary },
    tagTextActive: { color: theme.bg, fontWeight: '600' },

    textInput: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, fontSize: 14, borderWidth: 0.5, borderColor: theme.border, color: theme.text, minHeight: 120, lineHeight: 22 },
    charCount: { fontSize: 11, color: theme.textTertiary, textAlign: 'right', marginTop: 6, marginBottom: 18 },

    tipsBox: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 0.5, borderColor: theme.border },
    tipsTitle: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 8 },
    tipsText: { fontSize: 12, color: theme.textSecondary, lineHeight: 22 },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: theme.bg, borderTopWidth: 0.5, borderTopColor: theme.border },
    submitBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    submitBtnDisabled: { opacity: 0.4 },
    submitBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
  });
}

// Desktop: centers the exact same form, per this screen's own
// "simple/centered" classification -- doesn't restyle the content.
const ds = StyleSheet.create({
  centerCol: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingTop: 12 },
  bottomBarDesktop: { alignItems: 'center' },
  submitBtnDesktop: { maxWidth: 560, width: '100%' },
});