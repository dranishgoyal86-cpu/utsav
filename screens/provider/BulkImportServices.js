import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import AppHeader from '../../components/AppHeader';
import { showAlert, confirmAction, callEdgeFunction } from '../../helpers';
import { parseCSV } from '../../lib/csvParser';
import { parseExcel } from '../../lib/excelParser';
import { TARGET_FIELDS, guessMapping } from '../../lib/bulkImportFields';
import { matchCategory, similarityScore, DUPLICATE_THRESHOLD, POSSIBLE_DUPLICATE_THRESHOLD } from '../../lib/fuzzyMatch';
import { deriveReviewGroups } from '../../lib/bulkImportReview';
import {
  SERVICE_CATEGORIES, CATEGORY_NAMES, getParentCategory, resolveParentCategory,
  getCategoryIcon, searchCategories, EVENT_PLANNER,
} from '../../serviceTemplates';
import { notifyImportCategoryMismatch } from '../../notifications';

const TAXONOMY = { SERVICE_CATEGORIES, CATEGORY_NAMES, getParentCategory };

export default function BulkImportServices({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [mode, setMode] = useState('pick'); // pick | mapping | review | summary
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [mapping, setMapping] = useState({});
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState([]);
  const [providerId, setProviderId] = useState(null);
  const [lockedParent, setLockedParent] = useState(null);
  const [searchText, setSearchText] = useState({}); // rowIdx -> manual search query
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [upgradeRequested, setUpgradeRequested] = useState(false);
  const [requestingUpgrade, setRequestingUpgrade] = useState(false);

  // ── Step 1: pick + parse ──
  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv', 'text/comma-separated-values', 'application/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setProcessing(true);
      setFileName(asset.name || 'spreadsheet');

      const isExcel = /\.xlsx?$/i.test(asset.name || '')
        || (asset.mimeType || '').includes('spreadsheet')
        || (asset.mimeType || '').includes('ms-excel');

      const response = await fetch(asset.uri);
      const table = isExcel ? parseExcel(await response.arrayBuffer()) : parseCSV(await response.text());

      if (table.headers.length === 0 || table.rows.length === 0) {
        showAlert('Nothing to import', "That file doesn't have any readable rows.");
        return;
      }
      setParsed(table);
      setMapping(guessMapping(table.headers));
      setMode('mapping');
    } catch (err) {
      showAlert('Could not read file', err.message || 'Something went wrong opening that file.');
    } finally {
      setProcessing(false);
    }
  }

  function setFieldMapping(targetKey, headerIndex) {
    setMapping(prev => ({ ...prev, [targetKey]: prev[targetKey] === headerIndex ? null : headerIndex }));
  }

  function mappingComplete() {
    return TARGET_FIELDS.filter(f => f.required).every(f => mapping[f.key] !== null && mapping[f.key] !== undefined);
  }

  // ── Step 2: mapping confirmed -> build rows, run fuzzy category + duplicate matching ──
  async function confirmMapping() {
    if (!mappingComplete()) {
      showAlert('Map the required fields', 'Title, Category, and Starting price all need a column before continuing.');
      return;
    }
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showAlert('Error', 'Not signed in.'); return; }

      const { data: providerData } = await supabase
        .from('providers').select('id, category').eq('user_id', session.user.id).maybeSingle();
      if (!providerData) { showAlert('Error', 'Provider profile not found.'); return; }
      setProviderId(providerData.id);

      const locked = (providerData.category && providerData.category !== EVENT_PLANNER)
        ? resolveParentCategory(providerData.category) : null;
      setLockedParent(locked);

      const { data: existing } = await supabase
        .from('services').select('id, title, category').eq('provider_id', providerData.id);

      const built = parsed.rows.map((r, idx) => {
        function val(key) {
          const i = mapping[key];
          return (i === null || i === undefined) ? '' : (r[i] || '').trim();
        }

        const rawCategory = val('category');
        const categoryMatch = matchCategory(rawCategory, TAXONOMY);
        const chosenCategory = categoryMatch.confident ? categoryMatch.candidates[0].subcategory : null;

        // Duplicate check restricted to existing services in the same
        // resolved subcategory -- comparing a caterer's title against a
        // florist's existing listing is meaningless.
        let duplicate = null;
        if (chosenCategory) {
          for (const sv of (existing || []).filter(e => e.category === chosenCategory)) {
            const score = similarityScore(val('title'), sv.title || '');
            if (score >= DUPLICATE_THRESHOLD) { duplicate = { tier: 'likely', score, matchedTitle: sv.title }; break; }
            if (score >= POSSIBLE_DUPLICATE_THRESHOLD && (!duplicate || score > duplicate.score)) {
              duplicate = { tier: 'possible', score, matchedTitle: sv.title };
            }
          }
        }

        return {
          idx,
          title: val('title'),
          rawCategory,
          categoryMatch,
          chosenCategory,
          price_from: val('price_from'),
          price_to: val('price_to') || null,
          description: val('description') || null,
          event_types: val('event_types') ? val('event_types').split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
          pricing_model: val('pricing_model') || null,
          price_per_guest: val('price_per_guest') || null,
          price_per_hour: val('price_per_hour') || null,
          price_per_day: val('price_per_day') || null,
          travel_surcharge_per_km: val('travel_surcharge_per_km') || null,
          travel_free_radius_km: val('travel_free_radius_km') || null,
          discount_label: val('discount_label') || null,
          discount_percent: val('discount_percent') || null,
          rush_fee_percent: val('rush_fee_percent') || null,
          duplicate,
          includeDuplicateAnyway: false,
          skipRow: false,
        };
      });

      setRows(built);
      setMode('review');
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setProcessing(false);
    }
  }

  function pickCandidateForRow(idx, subcategory) {
    setRows(prev => prev.map(r => r.idx === idx ? { ...r, chosenCategory: subcategory } : r));
  }
  function toggleIncludeDuplicate(idx) {
    setRows(prev => prev.map(r => r.idx === idx ? { ...r, includeDuplicateAnyway: !r.includeDuplicateAnyway } : r));
  }
  function toggleSkipRow(idx) {
    setRows(prev => prev.map(r => r.idx === idx ? { ...r, skipRow: !r.skipRow } : r));
  }

  // ── Derived groupings, recomputed every render off live row state (via
  // the pure lib/bulkImportReview.js helper -- also independently unit-
  // tested in scripts/verifyBulkImportMatch.js) so review-step picks
  // (category confirmation, duplicate include/skip) are always reflected
  // immediately. ──
  const { effectiveLock, needsCategoryPick, readyRows, likelyDupRows, mismatchedRows, canImport } =
    deriveReviewGroups(rows, lockedParent, getParentCategory);

  // ── Step 3: execute import ──
  async function executeImport() {
    setImporting(true);
    try {
      let imported = 0;
      for (const r of readyRows) {
        const serviceData = {
          provider_id: providerId,
          title: r.title,
          description: r.description,
          price_from: parseInt(r.price_from) || 0,
          price_to: r.price_to ? parseInt(r.price_to) : null,
          pricing_model: r.pricing_model && r.pricing_model !== 'flat' ? r.pricing_model : null,
          price_per_guest: r.pricing_model === 'per_guest' && r.price_per_guest ? parseFloat(r.price_per_guest) : null,
          price_per_hour: r.pricing_model === 'per_hour' && r.price_per_hour ? parseFloat(r.price_per_hour) : null,
          price_per_day: r.pricing_model === 'per_day' && r.price_per_day ? parseFloat(r.price_per_day) : null,
          travel_surcharge_per_km: r.travel_surcharge_per_km ? parseFloat(r.travel_surcharge_per_km) : null,
          travel_free_radius_km: r.travel_surcharge_per_km && r.travel_free_radius_km ? parseFloat(r.travel_free_radius_km) : null,
          category: r.chosenCategory,
          event_types: r.event_types,
          is_active: true,
          photos: [],
          videos: [],
          discount_label: r.discount_label,
          discount_percent: r.discount_percent ? parseFloat(r.discount_percent) : null,
          rush_fee_percent: r.rush_fee_percent ? parseFloat(r.rush_fee_percent) : null,
        };
        const { error } = await supabase.from('services').insert(serviceData);
        if (!error) imported++;
      }

      // First-ever import establishes the account's category -- mirrors
      // AddServiceScreen.js's proceedSave() exactly (only writes
      // providers.category when it wasn't already set).
      if (!lockedParent && effectiveLock && imported > 0) {
        await supabase.from('providers').update({ category: effectiveLock }).eq('id', providerId);
      }

      if (mismatchedRows.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await notifyImportCategoryMismatch(session.user.id, mismatchedRows.length, effectiveLock || 'your account');
        }
        // Real email, on top of the in-app notification -- via the new
        // supabase/functions/send-email edge function (AWS SES). Wrapped
        // non-fatal: this account's underlying AWS IAM user currently has
        // no ses:SendEmail permission (confirmed live -- see the send-email
        // function's own comment and this feature's report), so this call
        // is expected to fail until that's granted in the AWS console. The
        // import itself has already succeeded by this point either way.
        if (session?.user?.email) {
          try {
            const rowList = mismatchedRows.slice(0, 20).map(r => `<li>${r.title} — ${r.chosenCategory}</li>`).join('');
            await callEdgeFunction('send-email', {
              to: session.user.email,
              subject: `${mismatchedRows.length} imported service${mismatchedRows.length === 1 ? '' : 's'} need a category change`,
              html: `<p>Your spreadsheet import added ${imported} service${imported === 1 ? '' : 's'}, but ${mismatchedRows.length} row${mismatchedRows.length === 1 ? '' : 's'} didn't match your account's category (${effectiveLock || 'not yet set'}):</p><ul>${rowList}</ul><p>Open the import summary in the app to apply for Event Planner status or set up a second business for these.</p>`,
            });
          } catch (emailErr) {
            console.log('send-email non-fatal error:', emailErr.message);
          }
        }
      }

      setSummary({
        imported,
        skippedDuplicate: likelyDupRows.length,
        excludedCategory: mismatchedRows,
        skippedManually: rows.filter(r => r.skipRow).length,
      });
      setMode('summary');
    } catch (err) {
      showAlert('Import failed', err.message);
    } finally {
      setImporting(false);
    }
  }

  // ── Step 4 (Step 9 of the brief): follow-up for excluded rows, from the summary screen ──
  async function applyForEventPlanner() {
    if (upgradeRequested || !summary?.excludedCategory?.length) return;
    setRequestingUpgrade(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const sample = summary.excludedCategory[0];
      const mismatchedParents = [...new Set(summary.excludedCategory.map(r => getParentCategory(r.chosenCategory)).filter(Boolean))];

      // Reuses the real, existing category_upgrade_requests table + admin
      // review screen (CategoryUpgradeRequests.js) as-is -- that table and
      // its admin UI already existed; nothing in the app ever wrote to it
      // before this screen (confirmed during investigation: read-only
      // everywhere else). Requesting Event Planner status specifically
      // (not a straight swap to one category) because a bulk import
      // commonly spans more than one mismatched parent at once, and only
      // Event Planner status removes the lock across all of them -- the
      // request can only carry one representative pending service (the
      // existing schema's shape), so the rest of the excluded rows stay
      // listed here for manual re-add via "+ Add service" once approved.
      const { error } = await supabase.from('category_upgrade_requests').insert({
        provider_id: providerId,
        requester_user_id: session?.user?.id || null,
        current_category: effectiveLock,
        requested_category: EVENT_PLANNER,
        pending_service_data: {
          title: sample.title,
          description: sample.description,
          price_from: parseInt(sample.price_from) || 0,
          price_to: sample.price_to ? parseInt(sample.price_to) : null,
          category: sample.chosenCategory,
          event_types: sample.event_types,
          is_active: true,
          photos: [],
          videos: [],
        },
        status: 'pending',
      });
      if (error) throw error;
      setUpgradeRequested(true);
      showAlert(
        'Request sent',
        `We've asked our team to review upgrading you to Event Planner status, covering ${mismatchedParents.join(', ')}. You'll be notified once it's reviewed.`
      );
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setRequestingUpgrade(false);
    }
  }

  function setupSecondBusiness() {
    confirmAction(
      'Start a second business?',
      "This opens the claim/signup flow for a separate business listing under a different category. You'll set it up as its own account.",
      'Continue',
      () => navigation.navigate('ClaimVendorFlow')
    );
  }

  // ── Render ──
  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Import from spreadsheet" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {mode === 'pick' && (
        <View style={s.pickWrap}>
          <Text style={{ fontSize: 44 }}>📄</Text>
          <Text style={s.pickTitle}>Import your existing catalog</Text>
          <Text style={s.pickHint}>
            Upload a CSV or Excel file of your services. We'll map the columns and match each row's category
            automatically -- you confirm anything we're not sure about before it goes live.
          </Text>
          <TouchableOpacity style={s.pickBtn} onPress={pickFile} disabled={processing}>
            {processing ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.pickBtnText}>Choose file →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {mode === 'mapping' && parsed && (
        <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <Text style={s.fileNote}>📄 {fileName} · {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} found</Text>
          <Text style={s.sectionTitle}>Match your columns</Text>
          <Text style={s.fieldHint}>We've guessed a few of these -- check and adjust before continuing.</Text>

          {TARGET_FIELDS.map(field => (
            <View key={field.key} style={s.fieldGroup}>
              <Text style={s.label}>{field.label}{field.required ? <Text style={s.required}> *</Text> : null}</Text>
              <View style={s.chipsWrap}>
                <TouchableOpacity
                  style={[s.chip, (mapping[field.key] === null || mapping[field.key] === undefined) && s.chipActive]}
                  onPress={() => setFieldMapping(field.key, null)}
                >
                  <Text style={[s.chipText, (mapping[field.key] === null || mapping[field.key] === undefined) && s.chipTextActive]}>Not mapped</Text>
                </TouchableOpacity>
                {parsed.headers.map((h, i) => (
                  <TouchableOpacity key={i} style={[s.chip, mapping[field.key] === i && s.chipActive]} onPress={() => setFieldMapping(field.key, i)}>
                    <Text style={[s.chipText, mapping[field.key] === i && s.chipTextActive]}>{h || `Column ${i + 1}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {mapping[field.key] !== null && mapping[field.key] !== undefined && parsed.rows[0] && (
                <Text style={s.mappingPreview}>e.g. "{parsed.rows[0][mapping[field.key]] || '(blank)'}"</Text>
              )}
            </View>
          ))}

          <TouchableOpacity style={[s.primaryBtn, (!mappingComplete() || processing) && s.btnDisabled]} onPress={confirmMapping} disabled={!mappingComplete() || processing}>
            {processing ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Continue →</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}

      {mode === 'review' && (
        <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <View style={s.statsRow}>
            <View style={s.statBox}><Text style={s.statValue}>{readyRows.length}</Text><Text style={s.statLabel}>Ready</Text></View>
            <View style={s.statBox}><Text style={s.statValue}>{needsCategoryPick.length}</Text><Text style={s.statLabel}>Need input</Text></View>
            <View style={s.statBox}><Text style={s.statValue}>{likelyDupRows.length}</Text><Text style={s.statLabel}>Possible dupes</Text></View>
            <View style={s.statBox}><Text style={s.statValue}>{mismatchedRows.length}</Text><Text style={s.statLabel}>Wrong category</Text></View>
          </View>

          {!lockedParent && effectiveLock && (
            <View style={s.infoBanner}>
              <Text style={s.infoBannerText}>
                This is your first import -- {getCategoryIcon(effectiveLock)} {effectiveLock} will become your account's category, based on most of these rows.
              </Text>
            </View>
          )}

          {needsCategoryPick.length > 0 && (
            <View style={s.fieldGroup}>
              <Text style={s.sectionTitle}>Needs your input ({needsCategoryPick.length})</Text>
              <Text style={s.fieldHint}>We couldn't confidently match these rows' category -- pick one.</Text>
              {needsCategoryPick.map(r => (
                <View key={r.idx} style={s.reviewCard}>
                  <Text style={s.reviewTitle}>{r.title || '(no title)'}</Text>
                  <Text style={s.reviewMeta}>Category text: "{r.rawCategory || '(blank)'}"</Text>
                  {r.categoryMatch.candidates.length > 0 ? (
                    <View style={s.chipsWrap}>
                      {r.categoryMatch.candidates.map(c => (
                        <TouchableOpacity key={c.subcategory} style={s.chip} onPress={() => pickCandidateForRow(r.idx, c.subcategory)}>
                          <Text style={s.chipText}>{c.subcategory} ({Math.round(c.score * 100)}%)</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.fieldHint}>No close matches found -- search all categories below.</Text>
                  )}
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search all categories…"
                    placeholderTextColor={theme.textTertiary}
                    value={searchText[r.idx] || ''}
                    onChangeText={t => setSearchText(prev => ({ ...prev, [r.idx]: t }))}
                  />
                  {(searchText[r.idx] || '').trim().length > 0 && (
                    <View style={s.chipsWrap}>
                      {searchCategories(searchText[r.idx]).slice(0, 8).map(res => (
                        <TouchableOpacity key={res.subcategory} style={s.chip} onPress={() => { pickCandidateForRow(r.idx, res.subcategory); setSearchText(prev => ({ ...prev, [r.idx]: '' })); }}>
                          <Text style={s.chipText}>{res.subcategory}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity onPress={() => toggleSkipRow(r.idx)}>
                    <Text style={s.skipLink}>Skip this row instead</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {likelyDupRows.length > 0 && (
            <View style={s.fieldGroup}>
              <Text style={s.sectionTitle}>Possible duplicates ({likelyDupRows.length})</Text>
              <Text style={s.fieldHint}>These look like services you already have -- excluded by default.</Text>
              {likelyDupRows.map(r => (
                <View key={r.idx} style={s.reviewCard}>
                  <Text style={s.reviewTitle}>{r.title}</Text>
                  <Text style={s.reviewMeta}>Looks like your existing "{r.duplicate.matchedTitle}" ({Math.round(r.duplicate.score * 100)}% match)</Text>
                  <TouchableOpacity style={s.includeBtn} onPress={() => toggleIncludeDuplicate(r.idx)}>
                    <Text style={s.includeBtnText}>Include anyway</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {mismatchedRows.length > 0 && (
            <View style={s.fieldGroup}>
              <Text style={s.sectionTitle}>Won't be imported -- different category ({mismatchedRows.length})</Text>
              <Text style={s.fieldHint}>
                Your account is {effectiveLock ? `locked to ${effectiveLock}` : 'not yet set'}. These rows are a different category and need approval to add -- you'll get options after import.
              </Text>
              {mismatchedRows.map(r => (
                <View key={r.idx} style={s.reviewCardMuted}>
                  <Text style={s.reviewTitle}>{r.title}</Text>
                  <Text style={s.reviewMeta}>{r.chosenCategory} ({getParentCategory(r.chosenCategory)})</Text>
                </View>
              ))}
            </View>
          )}

          {readyRows.length > 0 && (
            <View style={s.fieldGroup}>
              <Text style={s.sectionTitle}>Ready to import ({readyRows.length})</Text>
              {readyRows.slice(0, 5).map(r => (
                <Text key={r.idx} style={s.readyRow}>✓ {r.title} — {r.chosenCategory}</Text>
              ))}
              {readyRows.length > 5 && <Text style={s.fieldHint}>+ {readyRows.length - 5} more</Text>}
            </View>
          )}

          <TouchableOpacity style={[s.primaryBtn, (!canImport || importing) && s.btnDisabled]} onPress={executeImport} disabled={!canImport || importing}>
            {importing ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Import {readyRows.length} service{readyRows.length === 1 ? '' : 's'} →</Text>}
          </TouchableOpacity>
          {needsCategoryPick.length > 0 && <Text style={s.blockedHint}>Resolve every row above (pick a category or skip it) to continue.</Text>}
        </ScrollView>
      )}

      {mode === 'summary' && summary && (
        <ScrollView contentContainerStyle={s.form}>
          <Text style={{ fontSize: 44, textAlign: 'center' }}>{summary.imported > 0 ? '✅' : '⚠️'}</Text>
          <Text style={s.summaryTitle}>{summary.imported} service{summary.imported === 1 ? '' : 's'} imported</Text>
          <View style={s.summaryList}>
            {summary.skippedDuplicate > 0 && <Text style={s.summaryLine}>• {summary.skippedDuplicate} skipped as likely duplicates</Text>}
            {summary.excludedCategory.length > 0 && <Text style={s.summaryLine}>• {summary.excludedCategory.length} excluded for category mismatch</Text>}
            {summary.skippedManually > 0 && <Text style={s.summaryLine}>• {summary.skippedManually} skipped manually</Text>}
          </View>

          {summary.excludedCategory.length > 0 && (
            <View style={s.fieldGroup}>
              <Text style={s.sectionTitle}>About the excluded rows</Text>
              <Text style={s.fieldHint}>
                {summary.excludedCategory.length} row{summary.excludedCategory.length === 1 ? '' : 's'} didn't match your account's category.
                Pick a path to add them:
              </Text>
              <TouchableOpacity style={[s.primaryBtn, upgradeRequested && s.btnDisabled]} onPress={applyForEventPlanner} disabled={upgradeRequested || requestingUpgrade}>
                {requestingUpgrade ? <ActivityIndicator color={theme.btnPrimaryText} /> : (
                  <Text style={s.primaryBtnText}>{upgradeRequested ? 'Request sent ✓' : 'Apply for Event Planner status →'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={setupSecondBusiness}>
                <Text style={s.secondaryBtnText}>Set up a second business →</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={s.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.secondaryBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    form: { padding: 16, paddingBottom: 60 },

    pickWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    pickTitle: { fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center' },
    pickHint: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 10 },
    pickBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 28 },
    pickBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },

    fileNote: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
    fieldGroup: { marginBottom: 24 },
    label: { fontSize: 13.5, fontWeight: '700', color: theme.text, marginBottom: 8 },
    required: { color: theme.accent },
    fieldHint: { fontSize: 12, color: theme.textSecondary, marginBottom: 10, lineHeight: 17 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, backgroundColor: theme.cardBg },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    chipText: { fontSize: 12.5, color: theme.textSecondary },
    chipTextActive: { color: theme.bg, fontWeight: '600' },
    mappingPreview: { fontSize: 11.5, color: theme.textTertiary, marginTop: 6, fontStyle: 'italic' },

    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
    secondaryBtn: { backgroundColor: theme.cardBg, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 10, borderWidth: 0.5, borderColor: theme.border },
    secondaryBtnText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    btnDisabled: { opacity: 0.5 },
    blockedHint: { fontSize: 12, color: theme.textTertiary, textAlign: 'center', marginTop: 8 },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    statBox: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    statValue: { fontSize: 18, fontWeight: '800', color: theme.text },
    statLabel: { fontSize: 10.5, color: theme.textSecondary, marginTop: 2, textAlign: 'center' },

    infoBanner: { backgroundColor: theme.accent + '18', borderRadius: 14, padding: 13, borderWidth: 0.5, borderColor: theme.accent + '55', marginBottom: 20 },
    infoBannerText: { fontSize: 12.5, color: theme.text, lineHeight: 18 },

    reviewCard: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: theme.border, marginBottom: 10, gap: 8 },
    reviewCardMuted: { backgroundColor: theme.cardBg, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: theme.border, marginBottom: 8, opacity: 0.65 },
    reviewTitle: { fontSize: 13.5, fontWeight: '700', color: theme.text },
    reviewMeta: { fontSize: 12, color: theme.textSecondary },
    searchInput: { backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, borderWidth: 0.5, borderColor: theme.border, color: theme.text },
    skipLink: { fontSize: 12, color: theme.textTertiary, textDecorationLine: 'underline', marginTop: 2 },
    includeBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: theme.bg, borderWidth: 0.5, borderColor: theme.accent },
    includeBtnText: { fontSize: 12, fontWeight: '700', color: theme.accent },
    readyRow: { fontSize: 12.5, color: theme.textSecondary, marginBottom: 4 },

    summaryTitle: { fontSize: 20, fontWeight: '800', color: theme.text, textAlign: 'center', marginTop: 10, marginBottom: 14 },
    summaryList: { alignItems: 'center', gap: 4, marginBottom: 22 },
    summaryLine: { fontSize: 13, color: theme.textSecondary },
  });
}
