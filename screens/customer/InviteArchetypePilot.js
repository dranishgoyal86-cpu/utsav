import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { useEventContext } from '../../hooks/useEventContext';
import AppHeader from '../../components/AppHeader';
import StaticInviteCard from '../../components/inviteArchetypes/StaticInviteCard';
import WebInvitePreview from '../../components/inviteArchetypes/WebInvitePreview';
import { getInviteSchema, isNonFestive } from '../../lib/inviteSchemas';
import { normalizeInviteContent } from '../../lib/inviteContentAdapter';
import { getArchetype, getVariant, getVariantsForArchetype, resolveMotionForEvent } from '../../lib/inviteDesignArchetypes';
import { getSelectableArchetypes } from '../../lib/inviteDesignCompatibilityMatrix';
import { getCatalogueEntry } from '../../lib/inviteDesignArchetypes/catalogue';
import { COMPATIBILITY_LEVEL } from '../../lib/inviteDesignArchetypes/types';
import { resolveScenes } from '../../lib/inviteSceneResolver';
import { resolveUtilityNav } from '../../lib/inviteUtilityNav';
import { buildStaticLayoutModel, buildPdfPageModels, buildPdfHtml } from '../../lib/staticInviteLayout';
import { resolveBrandAttribution, resolveAcquisitionCta, buildLegacyPersonalInviteUrl } from '../../lib/inviteBrandingPolicy';
import { resolveThemePackForPartyTheme, listThemePacks } from '../../lib/inviteDesignArchetypes/themePacks';

// Development-only pilot screen — proves the design-archetype architecture
// (registry, density/compatibility/scene/nav resolvers, static+web+PDF
// rendering, mandatory branding) against one real event, entirely
// SEPARATE from the production invite designer (ToranInvites.js, still
// completely unchanged). No archetype/variant selection made here is ever
// written to event_invite_content, and switching designs never mutates
// `values` — the same fetched content is simply re-rendered through a
// different archetype/variant. Reached via a dedicated nav route, not
// linked from the main "Invites" tool — see ToranInvites.js's own small
// "Preview new designs (beta)" entry point.
//
// Production Batch 1 — the selector now goes through
// getSelectableArchetypes() (lib/inviteDesignCompatibilityMatrix.js), the
// one production-safe picker function: it only ever returns IMPLEMENTED,
// non-unsupported designs, grouped here into "Recommended" (a strong
// match) and "More styles" (still fully workable, just not the top pick)
// — a host never sees a 'planned' archetype, a density number, or any
// other resolver-internal vocabulary; only a name and a short style
// descriptor drawn from the archetype's own `tones`.
export default function InviteArchetypePilot({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { event } = useEventContext(eventId);

  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [values, setValues] = useState({});
  const [functions, setFunctions] = useState([]);
  const [hasTravelInfo, setHasTravelInfo] = useState(false);
  const [hasAccommodationInfo, setHasAccommodationInfo] = useState(false);
  const [qrTargetUrl, setQrTargetUrl] = useState(null);
  const [passCode, setPassCode] = useState(null);
  const [archetypeId, setArchetypeId] = useState(null);
  const [variantId, setVariantId] = useState(null);
  const [themePackOverrideId, setThemePackOverrideId] = useState(null);
  const [previewMode, setPreviewMode] = useState('static'); // 'static' | 'web'

  const eventTypeSlug = event?.event_type_slug || null;
  const schema = getInviteSchema(eventTypeSlug);
  const nonFestive = isNonFestive(eventTypeSlug);
  const isKidsBirthday = eventTypeSlug === 'kids-birthday';

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
      if (passRow?.pass_code) {
        setQrTargetUrl(buildLegacyPersonalInviteUrl(passRow.pass_code));
        setPassCode(passRow.pass_code);
      }
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

  const densitySignals = { functionCount: functions.length, hasTravelInfo, hasAccommodationInfo };
  const selectable = getSelectableArchetypes({ eventTypeSlug, schema, values, densitySignals, isNonFestive: nonFestive });

  if (selectable.length === 0) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <View style={{ padding: 24 }}>
          <Text style={s.emptyText}>
            No finished design is offered for this event's type yet ({eventTypeSlug || 'unknown'}) — more directions
            are still being built out.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const recommended = selectable.filter((r) => r.level === COMPATIBILITY_LEVEL.STRONG);
  const moreStyles = selectable.filter((r) => r.level !== COMPATIBILITY_LEVEL.STRONG);
  const activeArchetypeId = archetypeId && selectable.some((r) => r.archetypeId === archetypeId) ? archetypeId : selectable[0].archetypeId;
  const archetype = getArchetype(activeArchetypeId);
  const variants = getVariantsForArchetype(archetype.id);
  const activeVariant = getVariant(variantId) || variants.find((v) => v.archetypeId === archetype.id) || variants[0];
  const motion = resolveMotionForEvent({ archetypeId: archetype.id, isNonFestive: nonFestive, preferredPreset: archetype.motionPresets[0] });

  // Theme-pack resolution (kids-birthday only) — a host chip override if
  // picked in this preview, otherwise derived straight from the event's
  // own free-text partyTheme. Purely decorative: it nudges the accent
  // colour and swaps the decoration motif, never the archetype/variant
  // chosen above, and never a new field written anywhere.
  const themePack = isKidsBirthday
    ? (themePackOverrideId ? listThemePacks().find((p) => p.id === themePackOverrideId) : resolveThemePackForPartyTheme(values.partyTheme))
    : null;

  const scenes = resolveScenes({
    archetype,
    hasInvocationContent: !!values.invocationText,
    hasCoupleOrSubjectContent: !!(values.partner1Name || values.subjectNameLine1),
    hasFamilyContent: !!(values.hostedBy || values.grandparentsNote || values.familySurname),
    hasHonoureeContent: !!(values.childName || values.celebrantName),
    hasDressCodeContent: !!values.dressCode,
    functionCount: functions.length,
    hasVenue: !!event?.venue,
    hasTravelInfo, hasAccommodationInfo,
    gatePassActive: !!passCode,
    galleryPhotoCount: 0,
    wishingWallActive: false,
  });

  const navItems = resolveUtilityNav({
    hasFunctions: functions.length > 0, travelActive: archetype.supports.travel && hasTravelInfo,
    staysActive: archetype.supports.accommodation && hasAccommodationInfo, rsvpActive: true,
    mapsActive: !!event?.venue, gatePassActive: archetype.supports.gatePass && !!passCode,
    giftsActive: false, wishingWallActive: false, galleryActive: false,
  });

  const attribution = resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'web' });
  const staticAttribution = resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'static' });
  const acquisition = resolveAcquisitionCta({ isNonFestive: nonFestive });

  const heroPhotoUrl = values.couplePhotoUrl || values.honoureePhotoUrl || null;

  const staticLayoutModel = buildStaticLayoutModel({
    archetypeId: archetype.id, variantId: activeVariant.id, event, values, isNonFestive: nonFestive, qrTargetUrl, photoUrl: heroPhotoUrl,
  });
  // Theme-pack motif swap — subordinate to the selected archetype/variant,
  // applied only as a final decorative touch on top of the real layout
  // model, never a separate rendering path.
  const effectiveStaticLayoutModel = themePack
    ? { ...staticLayoutModel, slots: { ...staticLayoutModel.slots, decoration: { motif: themePack.motifId } } }
    : staticLayoutModel;
  const effectiveTokens = themePack?.accentOverride
    ? { ...activeVariant.tokens, colors: { ...activeVariant.tokens.colors, accent: themePack.accentOverride } }
    : activeVariant.tokens;

  const pdfModel = buildPdfPageModels({
    staticLayoutModel: effectiveStaticLayoutModel,
    functions,
    travelNote: hasTravelInfo ? 'Outstation guest travel details collected — see Guest List for the full list.' : null,
    stayNote: hasAccommodationInfo ? 'Accommodation blocks arranged — see Guest List for room assignments.' : null,
  });

  async function handleDownloadPdf() {
    try {
      setGeneratingPdf(true);
      const html = buildPdfHtml({ pdfPageModels: pdfModel, tokens: effectiveTokens });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Invite PDF', UTI: 'com.adobe.pdf' });
      } else {
        showAlert('Saved', 'Invite PDF created.');
      }
    } catch (err) {
      showAlert('Error', err.message || 'Could not generate the PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  function renderArchetypeGroup(label, entries) {
    if (entries.length === 0) return null;
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        <View style={s.chipRow}>
          {entries.map(({ archetypeId: id }) => {
            const a = getArchetype(id);
            const active = a.id === activeArchetypeId;
            const descriptor = (getCatalogueEntry(id)?.tones || []).slice(0, 2).join(' · ');
            return (
              <TouchableOpacity
                key={a.id}
                style={active ? s.chipActive : s.chip}
                onPress={() => { setArchetypeId(a.id); setVariantId(a.variantIds[0]); }}
              >
                <Text style={active ? s.chipTextActive : s.chipText}>{a.name}</Text>
                {descriptor ? <Text style={active ? s.chipDescriptorActive : s.chipDescriptor}>{descriptor}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Design pilot (beta)" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.introText}>Browse styles for this invite — nothing here is saved until you pick one for real.</Text>

        {renderArchetypeGroup('RECOMMENDED', recommended)}
        {renderArchetypeGroup('MORE STYLES', moreStyles)}

        {variants.length > 1 && (
          <>
            <Text style={s.sectionLabel}>VARIANT</Text>
            <View style={s.chipRow}>
              {variants.map((v) => (
                <TouchableOpacity key={v.id} style={activeVariant.id === v.id ? s.chipActive : s.chip} onPress={() => setVariantId(v.id)}>
                  <Text style={activeVariant.id === v.id ? s.chipTextActive : s.chipText}>{v.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {isKidsBirthday && (
          <>
            <Text style={s.sectionLabel}>THEME</Text>
            <View style={s.chipRow}>
              {listThemePacks().map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={themePack?.id === p.id ? s.chipActive : s.chip}
                  onPress={() => setThemePackOverrideId(p.id)}
                >
                  <Text style={themePack?.id === p.id ? s.chipTextActive : s.chipText}>{p.icons[0]} {p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

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
            <StaticInviteCard layoutModel={effectiveStaticLayoutModel} tokens={effectiveTokens} />
            <TouchableOpacity style={s.pdfBtn} onPress={handleDownloadPdf} disabled={generatingPdf}>
              {generatingPdf ? <ActivityIndicator size="small" color={theme.accentText} /> : (
                <Text style={s.pdfBtnText}>Download PDF ({pdfModel.pages.length} page{pdfModel.pages.length === 1 ? '' : 's'})</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.webPreviewFrame}>
            <WebInvitePreview
              tokens={effectiveTokens}
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
                honoureeName: values.childName || values.celebrantName || values.subjectNameLine1,
                honoureeAgeLine: values.turningAge ? `Turning ${values.turningAge}` : null,
                honoureePhotoUrl: values.couplePhotoUrl,
                dressCode: values.dressCode,
                functions, venue: event?.venue,
                travelNote: hasTravelInfo ? 'Outstation guest details available — see Guest List.' : null,
                stayNote: hasAccommodationInfo ? 'Accommodation arranged — see Guest List.' : null,
                guestAccessNote: (archetype.supports.gatePass && !passCode) ? 'Show your gate pass at the entrance.' : null,
                gatePassCode: archetype.supports.gatePass ? passCode : null,
                onGatePassPress: () => navigation.navigate('GatePass', { eventId }),
                galleryPhotoCount: 0, wishes: [],
                isNonFestive: nonFestive,
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
    introText: { fontSize: 12.5, color: theme.textSecondary, marginTop: 14, lineHeight: 18 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: theme.cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: theme.border },
    chipActive: { backgroundColor: theme.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
    chipText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    chipTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    chipDescriptor: { fontSize: 9.5, color: theme.textTertiary, marginTop: 2 },
    chipDescriptorActive: { fontSize: 9.5, color: theme.accentText, opacity: 0.85, marginTop: 2 },
    previewToggleRow: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 14 },
    toggle: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    toggleActive: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent },
    toggleText: { fontSize: 12.5, fontWeight: '700', color: theme.textSecondary },
    toggleTextActive: { fontSize: 12.5, fontWeight: '700', color: theme.accentText },
    staticPreviewWrap: { alignItems: 'center' },
    pdfBtn: { marginTop: 14, backgroundColor: theme.accent, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center' },
    pdfBtnText: { fontSize: 13, fontWeight: '700', color: theme.accentText },
    webPreviewFrame: { height: 640, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    emptyText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  });
}
