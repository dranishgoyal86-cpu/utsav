import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';
import StaticInviteCard from '../../components/inviteArchetypes/StaticInviteCard';
import WebInvitePreview from '../../components/inviteArchetypes/WebInvitePreview';
import { getInviteSchema, isNonFestive } from '../../lib/inviteSchemas';
import { normalizeInviteContent } from '../../lib/inviteContentAdapter';
import { listArchetypesForEventSlug, getArchetype, getVariant, getVariantsForArchetype, resolveMotionForEvent } from '../../lib/inviteDesignArchetypes';
import { resolveDesignCompatibility } from '../../lib/inviteDesignCompatibility';
import { resolveScenes } from '../../lib/inviteSceneResolver';
import { resolveUtilityNav } from '../../lib/inviteUtilityNav';
import { buildStaticLayoutModel, buildPdfPageModels } from '../../lib/staticInviteLayout';
import { resolveBrandAttribution, resolveAcquisitionCta, buildLegacyPersonalInviteUrl } from '../../lib/inviteBrandingPolicy';

// Development-only pilot screen — proves the design-archetype architecture
// (registry, density/compatibility/scene/nav resolvers, static+web
// rendering, mandatory branding) against one real event, entirely
// SEPARATE from the production invite designer (ToranInvites.js, still
// completely unchanged). No archetype/variant selection made here is ever
// written to event_invite_content — this screen holds its own local
// design-selection state and never touches the DB's template_id column
// (which still only understands the 5 legacy design ids). Reached via a
// dedicated nav route, not linked from the main "Invites" tool — see
// ToranInvites.js's own small "Preview new designs (beta)" entry point.
export default function InviteArchetypePilot({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event } = useEventContext(eventId);

  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState({});
  const [functions, setFunctions] = useState([]);
  const [hasTravelInfo, setHasTravelInfo] = useState(false);
  const [hasAccommodationInfo, setHasAccommodationInfo] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState(null);
  const [archetypeId, setArchetypeId] = useState('toran-heritage');
  const [variantId, setVariantId] = useState('marigold-garland');
  const [previewMode, setPreviewMode] = useState('static'); // 'static' | 'web'

  const eventTypeSlug = event?.event_type_slug || null;
  const schema = getInviteSchema(eventTypeSlug);
  const nonFestive = isNonFestive(eventTypeSlug);

  useEffect(() => { load(); }, [eventId]);

  async function load() {
    try {
      setLoading(true);
      const { data: contentRow } = await supabase
        .from('event_invite_content')
        .select('partner_1_name, partner_2_name, hosted_by, couple_photo_url, couple_quote, kicker_text, headline_text, schema_content')
        .eq('event_id', eventId)
        .maybeSingle();
      setValues(normalizeInviteContent(schema, contentRow));

      const { data: functionRows } = await supabase
        .from('event_functions').select('id, name, date, time').eq('event_id', eventId).order('sort_order', { ascending: true });
      setFunctions(functionRows || []);

      // Structural density signals — read-only, never duplicated locally
      // beyond this screen's own preview state.
      const { count: outstationCount } = await supabase
        .from('event_invitees').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_outstation', true);
      setHasTravelInfo((outstationCount || 0) > 0);

      const { count: accommodationCount } = await supabase
        .from('event_accommodations').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
      setHasAccommodationInfo((accommodationCount || 0) > 0);

      const { data: passRow } = await supabase
        .from('guest_passes').select('pass_code').eq('event_id', eventId).limit(1).maybeSingle();
      if (passRow?.pass_code) setQrTargetUrl(buildLegacyPersonalInviteUrl(passRow.pass_code));
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const compatibleArchetypes = listArchetypesForEventSlug(eventTypeSlug).map((a) => ({
    archetype: a,
    compatibility: resolveDesignCompatibility({
      eventTypeSlug, schema, values,
      densitySignals: { functionCount: functions.length, hasTravelInfo, hasAccommodationInfo },
      archetypeId: a.id,
    }),
  }));

  if (compatibleArchetypes.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <View style={{ padding: 24 }}>
          <Text style={s.emptyText}>
            No pilot archetype is offered for this event's type yet ({eventTypeSlug || 'unknown'}) — this wave only
            implemented the Hindu Wedding pilot (toran-heritage, royal-palace, ivory-mandala).
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const archetype = getArchetype(archetypeId) || compatibleArchetypes[0].archetype;
  const variants = getVariantsForArchetype(archetype.id);
  const activeVariant = getVariant(variantId) || variants[0];
  const motion = resolveMotionForEvent({ archetypeId: archetype.id, isNonFestive: nonFestive, preferredPreset: archetype.motionPresets[0] });

  const scenes = resolveScenes({
    archetype,
    hasInvocationContent: !!values.invocationText,
    hasCoupleOrSubjectContent: !!(values.partner1Name || values.subjectNameLine1),
    hasFamilyContent: !!(values.hostedBy || values.grandparentsNote || values.familySurname),
    functionCount: functions.length,
    hasVenue: !!event?.venue,
    hasTravelInfo, hasAccommodationInfo,
    gatePassActive: true, // pilot demonstration only — real gate-pass activation comes from lib/eventCapabilities.js's resolved entryControl, not re-derived here
    galleryPhotoCount: 0,
    wishingWallActive: false,
  });

  const navItems = resolveUtilityNav({
    hasFunctions: functions.length > 0, travelActive: archetype.supports.travel && hasTravelInfo,
    staysActive: archetype.supports.accommodation && hasAccommodationInfo, rsvpActive: true,
    mapsActive: !!event?.venue, gatePassActive: archetype.supports.gatePass,
    giftsActive: false, wishingWallActive: false, galleryActive: false,
  });

  const attribution = resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'web' });
  const acquisition = resolveAcquisitionCta({ isNonFestive: nonFestive });

  const staticLayoutModel = buildStaticLayoutModel({
    archetypeId: archetype.id, variantId: activeVariant.id, event, values, isNonFestive: nonFestive, qrTargetUrl,
  });
  const pdfModel = buildPdfPageModels({
    staticLayoutModel,
    functions,
    travelNote: hasTravelInfo ? 'Outstation guest travel details collected — see Guest List for the full list.' : null,
    stayNote: hasAccommodationInfo ? 'Accommodation blocks arranged — see Guest List for room assignments.' : null,
  });

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionLabel}>ARCHETYPE (proof-of-architecture — not saved to this event)</Text>
        <View style={s.chipRow}>
          {compatibleArchetypes.map(({ archetype: a, compatibility }) => (
            <TouchableOpacity
              key={a.id}
              style={archetypeId === a.id ? s.chipActive : s.chip}
              onPress={() => { setArchetypeId(a.id); setVariantId(a.variantIds[0]); }}
            >
              <Text style={archetypeId === a.id ? s.chipTextActive : s.chipText}>{a.name}</Text>
              {!compatibility.densityCompatible && (
                <Text style={s.chipHint}>{compatibility.overflowStrategy === 'secondary-scenes' ? 'richer than usual' : 'lighter than usual'}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionLabel}>VARIANT</Text>
        <View style={s.chipRow}>
          {variants.map((v) => (
            <TouchableOpacity key={v.id} style={variantId === v.id ? s.chipActive : s.chip} onPress={() => setVariantId(v.id)}>
              <Text style={variantId === v.id ? s.chipTextActive : s.chipText}>{v.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.metaLine}>
          Motion: {motion} · Content density signals: {functions.length} function{functions.length === 1 ? '' : 's'}
          {hasTravelInfo ? ' · travel present' : ''}{hasAccommodationInfo ? ' · accommodation present' : ''}
        </Text>

        <View style={s.previewToggleRow}>
          <TouchableOpacity style={previewMode === 'static' ? s.toggleActive : s.toggle} onPress={() => setPreviewMode('static')}>
            <Text style={previewMode === 'static' ? s.toggleTextActive : s.toggleText}>Static (WhatsApp)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={previewMode === 'web' ? s.toggleActive : s.toggle} onPress={() => setPreviewMode('web')}>
            <Text style={previewMode === 'web' ? s.toggleTextActive : s.toggleText}>Web experience</Text>
          </TouchableOpacity>
        </View>

        {previewMode === 'static' ? (
          <View style={s.staticPreviewWrap}>
            <StaticInviteCard layoutModel={staticLayoutModel} tokens={activeVariant.tokens} />
            <Text style={s.pdfNote}>PDF-ready: {pdfModel.pages.length} page{pdfModel.pages.length === 1 ? '' : 's'} ({pdfModel.pages.map((p) => p.kind).join(', ')})</Text>
          </View>
        ) : (
          <View style={s.webPreviewFrame}>
            <WebInvitePreview
              tokens={activeVariant.tokens}
              scenes={scenes}
              navItems={navItems.items}
              content={{
                kicker: values.kickerText || 'YOU ARE INVITED',
                headline: values.headlineText || event?.name,
                subline: event?.venue,
                invocationText: values.invocationText,
                partner1Name: values.partner1Name, partner2Name: values.partner2Name,
                couplePhotoUrl: values.couplePhotoUrl, coupleQuote: values.coupleQuote,
                hostedBy: values.hostedBy, grandparentsNote: values.grandparentsNote, familySurname: values.familySurname,
                functions, venue: event?.venue,
                travelNote: hasTravelInfo ? 'Outstation guest details available — see Guest List.' : null,
                stayNote: hasAccommodationInfo ? 'Accommodation arranged — see Guest List.' : null,
                guestAccessNote: archetype.supports.gatePass ? 'Show your gate pass at the entrance.' : null,
                galleryPhotoCount: 0, wishes: [],
                rsvpStatus: null, onRsvpPress: () => showAlert('RSVP', 'This preview does not submit a real RSVP — the real flow stays screens/RSVPScreen.js, unchanged.'),
                attributionLine: attribution.line, acquisition,
              }}
              onNavSelect={() => {}}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 40 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: theme.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: theme.border },
    chipActive: { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    chipTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    chipHint: { fontSize: 9.5, color: theme.textTertiary, marginTop: 2 },
    metaLine: { fontSize: 11.5, color: theme.textSecondary, marginTop: 14, lineHeight: 16 },
    previewToggleRow: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 14 },
    toggle: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    toggleActive: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent },
    toggleText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    toggleTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    staticPreviewWrap: { alignItems: 'center' },
    pdfNote: { fontSize: 11, color: theme.textSecondary, marginTop: 12, textAlign: 'center' },
    webPreviewFrame: { height: 640, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    emptyText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  });
}
