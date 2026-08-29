import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Share, Alert, Platform, Image, Linking, useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabase';
import { PUBLIC_WEB_URL } from '../../config';
import { useTheme } from '../../ThemeContext';
import { useSavedProvider } from '../../hooks/useSavedProvider';
import { useBlockedProvider } from '../../hooks/useBlockedProvider';
import { packageHighlights, getCategoryIcon, getParentCategory, resolveParentCategory } from '../../serviceTemplates';
import AppHeader from '../../components/AppHeader';
import { CREAM } from '../../lib/desktopTheme';

const CAROUSEL_CARD_WIDTH = 168;
const DESKTOP_BREAKPOINT = 768;

export default function ProviderProfile({ route, navigation }) {
  const { provider: initialProvider, providerId: deepLinkId, savedPlanId } = route.params || {};
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  // Lightest-touch treatment (centered, not restyled) -- same call as
  // CreateBookingScreen.js/SearchScreen.js.
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [provider, setProvider] = useState(initialProvider || null);
  const [services, setServices] = useState([]);
  const [paymentTermsByService, setPaymentTermsByService] = useState({});
  const [expandedTermsServiceId, setExpandedTermsServiceId] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [verifiedPhotos, setVerifiedPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [activeTab, setActiveTab] = useState('services');
  const { isSaved, loading: saveLoading, toggleSave } = useSavedProvider(provider?.id);
  const { isBlocked, loading: blockLoading, toggleBlock } = useBlockedProvider(provider?.id);
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();

  const isUnclaimed = provider?.is_claimed === false;
  const displayName = provider?.users?.name || provider?.name || 'Business';

  // The exact set of payment_term_option_ids the badge showed for this
  // service at the moment of tap — passed forward so CreateBookingScreen.js
  // can flag if the vendor changed terms in the gap before the host got
  // there. Always an array (never undefined) even when the badge showed
  // nothing, so "zero options at view time, some now" is still a real,
  // detectable difference rather than silently skipped.
  function paymentTermsSnapshotFor(service) {
    return (paymentTermsByService[service.id] || []).map(o => o.id);
  }

  useEffect(() => {
    if (deepLinkId && !initialProvider) {
      fetchProviderById(deepLinkId);
    } else if (initialProvider) {
      // A stale saved link or cached search result can still hand us a
      // provider that's since been admin-suspended — search screens already
      // filter these out, but a direct/cached route param bypasses that.
      if (initialProvider.is_suspended) {
        setSuspended(true);
        setLoading(false);
      } else {
        fetchProviderDetails(initialProvider.id);
      }
    }
  }, []);

  function showAlert(title, message) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  function handleToggleBlock() {
    if (isBlocked) {
      toggleBlock();
      return;
    }
    const message = `We'll stop recommending ${displayName} when your event agent suggests vendors. You can undo this anytime from your profile.`;
    if (Platform.OS === 'web') {
      if (window.confirm(`Not interested in ${displayName}?\n\n${message}`)) toggleBlock();
    } else {
      Alert.alert(`Not interested in ${displayName}?`, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Not interested', style: 'destructive', onPress: toggleBlock },
      ]);
    }
  }

  async function fetchProviderById(id) {
    try {
      setLoading(true);
      const { data: providerData } = await supabase
        .from('providers')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!providerData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (providerData.is_suspended) {
        setSuspended(true);
        setLoading(false);
        return;
      }

      let userData = null;
      if (providerData.user_id) {
        const { data } = await supabase
          .from('users')
          .select('id, name, avatar_url')
          .eq('id', providerData.user_id)
          .maybeSingle();
        userData = data;
      }

      const fullProvider = { ...providerData, users: userData };
      setProvider(fullProvider);
      await fetchProviderDetails(id);
    } catch (err) {
      console.log('Fetch provider error:', err.message);
      setNotFound(true);
      setLoading(false);
    }
  }

  async function fetchProviderDetails(id) {
    try {
      setLoading(true);

      const [{ data: servicesData }, { data: reviewsData }] = await Promise.all([
        supabase
          .from('services')
          .select('*')
          .eq('provider_id', id)
          .eq('is_active', true),
        supabase
          .from('reviews')
          .select('*')
          .eq('provider_id', id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setServices(servicesData || []);

      // One batched pair of queries for every service's payment terms —
      // never per-card. Common case (every pre-existing service until its
      // provider actively sets terms) is zero rows, which just leaves the
      // map empty for that service and the badge renders nothing.
      const serviceIds = (servicesData || []).map(sv => sv.id);
      if (serviceIds.length > 0) {
        const { data: offeredRows } = await supabase
          .from('service_payment_options')
          .select('service_id, payment_term_option_id')
          .in('service_id', serviceIds);

        const optionIds = [...new Set((offeredRows || []).map(r => r.payment_term_option_id))];
        if (optionIds.length > 0) {
          const { data: optionRows } = await supabase
            .from('payment_term_options')
            .select('id, label')
            .in('id', optionIds);

          const optionsById = {};
          (optionRows || []).forEach(o => { optionsById[o.id] = o; });

          const bySvc = {};
          (offeredRows || []).forEach(r => {
            const opt = optionsById[r.payment_term_option_id];
            if (!opt) return;
            if (!bySvc[r.service_id]) bySvc[r.service_id] = [];
            bySvc[r.service_id].push(opt);
          });
          setPaymentTermsByService(bySvc);
        }
      }

      // logo_url lives on providers (publicly readable) and is already part
      // of `provider`/`initialProvider` via their own `select('*')` — no
      // separate fetch needed (provider_billing, where this used to live
      // before, is owner-only RLS and silently returns nothing to a customer).

      // Verified event photos — real proof from customers' completed
      // bookings, kept separate from the provider's own portfolio shots.
      const { data: verifiedData } = await supabase
        .from('verified_event_photos')
        .select('*')
        .eq('provider_id', id)
        .order('created_at', { ascending: false });

      // Manually join reviewer names and the booking each review/photo
      // traces back to (no Supabase join) — the booking is the proof
      // behind the "✓ Verified booking" badge and the photo captions.
      const bookingIds = [...new Set([
        ...(reviewsData || []).map(r => r.booking_id),
        ...(verifiedData || []).map(p => p.booking_id),
      ].filter(Boolean))];
      const { data: bookingsData } = bookingIds.length
        ? await supabase.from('bookings').select('id, event_type, event_date').in('id', bookingIds)
        : { data: [] };

      setVerifiedPhotos((verifiedData || []).map(p => ({
        ...p,
        booking: bookingsData?.find(b => b.id === p.booking_id) || null,
      })));

      if (reviewsData?.length > 0) {
        const reviewerIds = [...new Set(reviewsData.map(r => r.customer_id).filter(Boolean))];
        const { data: reviewersData } = await supabase
          .from('users').select('id, name').in('id', reviewerIds);

        setReviews(reviewsData.map(r => ({
          ...r,
          users: reviewersData?.find(u => u.id === r.customer_id) || null,
          booking: bookingsData?.find(b => b.id === r.booking_id) || null,
        })));
      } else {
        setReviews([]);
      }
    } catch (err) {
      console.log('Provider details error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    try {
      const deepLink = `utsav://provider/${provider.id}`;
      const webLink = `${PUBLIC_WEB_URL}/provider/${provider.id}`;
      const message = `Check out ${displayName} on Utsav!\n\n${displayName} is a ${provider.category} in ${provider.city}.\n\n⭐ ${provider.rating?.toFixed(1) || 'New'} rating · ${provider.total_reviews || 0} reviews${provider.is_verified ? ' · ✓ Verified' : ''}\n\nBook them on Utsav:\n${webLink}\n\nOr open directly in app:\n${deepLink}`;

      await Share.share({
        message,
        title: `${displayName} on Utsav`,
      });
    } catch (err) {
      console.log('Share error:', err.message);
    }
  }

  function goToClaim() {
    navigation.navigate('ClaimBusiness', {
      provider: { ...provider, name: displayName },
    });
  }

  function toggleExpandedTerms(serviceId) {
    setExpandedTermsServiceId(prev => prev === serviceId ? null : serviceId);
  }

  function renderStars(rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  if (loading && !provider) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={s.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (notFound) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Provider profile" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <View style={s.centerBox}>
          <Text style={s.notFoundIcon}>🔍</Text>
          <Text style={s.notFoundTitle}>Profile not found</Text>
          <Text style={s.notFoundSub}>
            This provider profile may have been removed or the link is invalid.
          </Text>
          <TouchableOpacity style={s.notFoundBtn} onPress={() => navigation.goBack()}>
            <Text style={s.notFoundBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (suspended) {
    return (
      <SafeAreaView style={s.container}>
        <AppHeader title="Provider profile" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />
        <View style={s.centerBox}>
          <Text style={s.notFoundIcon}>🚫</Text>
          <Text style={s.notFoundTitle}>Currently unavailable</Text>
          <Text style={s.notFoundSub}>
            This business is not accepting bookings right now.
          </Text>
          <TouchableOpacity style={s.notFoundBtn} onPress={() => navigation.goBack()}>
            <Text style={s.notFoundBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!provider) return null;

  return (
    <SafeAreaView style={[s.container, isDesktopWeb && { backgroundColor: CREAM }]}>
      {/* Header */}
      <AppHeader
        title="Provider profile"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          ...(!isUnclaimed ? [
            <TouchableOpacity key="save" style={s.headerBtn} onPress={toggleSave} disabled={saveLoading}>
              <Text style={[s.headerBtnIcon, isSaved && s.heartSaved]}>{isSaved ? '♥' : '♡'}</Text>
            </TouchableOpacity>,
          ] : []),
          <TouchableOpacity key="share" style={s.headerBtn} onPress={handleShare}>
            <Text style={s.headerBtnIcon}>↑</Text>
          </TouchableOpacity>,
        ]}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={isDesktopWeb && ds.centerCol}>

        {/* Hero — Instagram-style profile header */}
        <View style={s.hero}>
          <View style={s.avatarRing}>
            {provider.logo_url ? (
              <Image source={{ uri: provider.logo_url }} style={s.avatar} />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>
                  {displayName[0] || '?'}
                </Text>
              </View>
            )}
          </View>

          <View style={s.nameRow}>
            <Text style={s.providerName}>{displayName}</Text>
            {provider.is_verified && (
              <View style={s.verifiedTick}>
                <Text style={s.verifiedTickText}>✓</Text>
              </View>
            )}
          </View>
          <Text style={s.providerCategory}>
            {getCategoryIcon(resolveParentCategory(provider.category))} {provider.category}{provider.city ? ` · ${provider.city}` : ''}
          </Text>
          {provider.google_maps_url ? (
            <TouchableOpacity onPress={() => Linking.openURL(provider.google_maps_url)}>
              <Text style={s.mapsLink}>📍 View on Google Maps</Text>
            </TouchableOpacity>
          ) : null}

          {isUnclaimed && (
            <View style={s.unclaimedBadge}>
              <Text style={s.unclaimedText}>Unclaimed listing</Text>
            </View>
          )}

          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{services.length}</Text>
              <Text style={s.statLabel}>Services</Text>
            </View>
            <TouchableOpacity style={s.statBox} onPress={() => setActiveTab('reviews')}>
              <Text style={s.statValue}>{provider.total_reviews || 0}</Text>
              <Text style={s.statLabel}>Reviews</Text>
            </TouchableOpacity>
            <View style={s.statBox}>
              <Text style={s.statValue}>⭐ {provider.rating?.toFixed(1) || 'New'}</Text>
              <Text style={s.statLabel}>Rating</Text>
            </View>
          </View>

          {provider.bio ? <Text style={s.bioText}>{provider.bio}</Text> : null}

          <View style={s.heroActionRow}>
            {!isUnclaimed && (
              <TouchableOpacity
                style={s.heroPrimaryBtn}
                onPress={() => services.length > 0
                  ? navigation.navigate('Booking', { provider, service: services[0], savedPlanId, paymentTermsSnapshot: paymentTermsSnapshotFor(services[0]) })
                  : showAlert('No services yet', "This provider hasn't added any services to book.")}
              >
                <Text style={s.heroPrimaryBtnText}>Book now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.heroSecondaryBtn} onPress={handleShare}>
              <Text style={s.heroSecondaryBtnText}>↑ Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Claim banner for unclaimed listings */}
        {isUnclaimed && (
          <TouchableOpacity
            style={s.claimBanner}
            onPress={goToClaim}
            activeOpacity={0.85}
          >
            <Text style={s.claimBannerTitle}>Is this your business?</Text>
            <Text style={s.claimBannerSub}>
              Claim this listing to manage your profile, add services, and receive bookings on Utsav.
            </Text>
            <View style={s.claimBtn}>
              <Text style={s.claimBtnText}>Claim this business →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Services carousel — the visual shopfront, replaces a plain photo
            grid as the first thing a customer browses */}
        {services.length > 0 && (
          <View style={s.carouselSection}>
            <Text style={s.carouselLabel}>SERVICES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.carouselScroll}
              decelerationRate="fast"
              snapToInterval={CAROUSEL_CARD_WIDTH + 12}
            >
              {services.map((service, i) => {
                const photo = (provider.portfolio_photos || [])[i % Math.max(provider.portfolio_photos?.length || 1, 1)];
                return (
                  <TouchableOpacity
                    key={service.id}
                    style={s.carouselCard}
                    activeOpacity={0.9}
                    onPress={() => !isUnclaimed && navigation.navigate('Booking', { provider, service, savedPlanId, paymentTermsSnapshot: paymentTermsSnapshotFor(service) })}
                  >
                    {photo ? (
                      <Image source={{ uri: photo }} style={s.carouselImage} />
                    ) : (
                      <LinearGradient
                        colors={[theme.accent, theme.text]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.carouselImage}
                      >
                        <Text style={s.carouselPlaceholderIcon}>{getCategoryIcon(getParentCategory(service.category))}</Text>
                      </LinearGradient>
                    )}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.75)']}
                      style={s.carouselScrim}
                    >
                      <Text style={s.carouselTitle} numberOfLines={2}>{service.title}</Text>
                      <Text style={s.carouselPrice}>
                        ₹{service.price_from?.toLocaleString()}{service.price_to ? `–${service.price_to?.toLocaleString()}` : '+'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Not interested — keeps this vendor out of future AI recommendations */}
        <TouchableOpacity style={s.notInterestedRow} onPress={handleToggleBlock} disabled={blockLoading}>
          <Text style={[s.notInterestedText, isBlocked && s.notInterestedTextActive]}>
            {isBlocked ? '✓ Marked not interested — tap to undo' : '🚫 Not interested — stop recommending this vendor'}
          </Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, activeTab === 'services' && s.tabActive]}
            onPress={() => setActiveTab('services')}
          >
            <Text style={[s.tabText, activeTab === 'services' && s.tabTextActive]}>
              Services ({services.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'reviews' && s.tabActive]}
            onPress={() => setActiveTab('reviews')}
          >
            <Text style={[s.tabText, activeTab === 'reviews' && s.tabTextActive]}>
              Reviews ({provider.total_reviews || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === 'photos' && s.tabActive]}
            onPress={() => setActiveTab('photos')}
          >
            <Text style={[s.tabText, activeTab === 'photos' && s.tabTextActive]}>
              Photos
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : activeTab === 'services' ? (
          <View style={s.section}>
            {services.length === 0 ? (
              <View style={s.centerBox}>
                <Text style={s.emptyText}>
                  {isUnclaimed ? 'No services listed for this business yet' : 'No services listed yet'}
                </Text>
                {isUnclaimed && (
                  <Text style={s.emptySubText}>
                    Services appear once the owner claims this listing
                  </Text>
                )}
              </View>
            ) : (
              services.map(service => (
                <View key={service.id} style={s.serviceCard}>
                  <View style={s.serviceTop}>
                    <Text style={s.serviceTitle}>{service.title}</Text>
                    <Text style={s.servicePrice}>
                      ₹{service.price_from?.toLocaleString()}
                      {service.price_to
                        ? ` – ₹${service.price_to?.toLocaleString()}`
                        : '+'}
                    </Text>
                  </View>
                  {/* Compact payment-terms badge — a single option shows its
                      label directly ("Pay after event", "40% advance"); more
                      than one shows "Multiple payment options", expandable
                      to the real list. Zero rows (every pre-existing service
                      until its provider sets terms) renders nothing at all,
                      not an empty/broken badge. */}
                  {(paymentTermsByService[service.id]?.length > 0) && (
                    <TouchableOpacity
                      style={s.paymentTermsBadge}
                      onPress={() => paymentTermsByService[service.id].length > 1 && toggleExpandedTerms(service.id)}
                      activeOpacity={paymentTermsByService[service.id].length > 1 ? 0.6 : 1}
                    >
                      <Text style={s.paymentTermsBadgeText}>
                        💳 {paymentTermsByService[service.id].length === 1
                          ? paymentTermsByService[service.id][0].label
                          : `Multiple payment options ${expandedTermsServiceId === service.id ? '▲' : '▼'}`}
                      </Text>
                      {paymentTermsByService[service.id].length > 1 && expandedTermsServiceId === service.id && (
                        <View style={s.paymentTermsExpanded}>
                          {paymentTermsByService[service.id].map(opt => (
                            <Text key={opt.id} style={s.paymentTermsExpandedItem}>· {opt.label}</Text>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  {(service.discount_percent > 0 || service.rush_fee_percent > 0) && (
                    <View style={s.pricingNotesRow}>
                      {service.discount_percent > 0 && (
                        <Text style={s.discountNote}>
                          🏷️ {service.discount_label || 'Offer'} — {service.discount_percent}% off
                        </Text>
                      )}
                      {service.rush_fee_percent > 0 && (
                        <Text style={s.rushNote}>⚡ +{service.rush_fee_percent}% for short-notice bookings</Text>
                      )}
                    </View>
                  )}
                  {packageHighlights(service.category, service.package_details).length > 0 && (
                    <View style={s.eventTypesRow}>
                      {packageHighlights(service.category, service.package_details).map((chip, i) => (
                        <View key={i} style={s.packageChip}>
                          <Text style={s.packageChipText}>{chip}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {service.description ? (
                    <Text style={s.serviceDesc}>{service.description}</Text>
                  ) : null}
                  {service.event_types?.length > 0 && (
                    <View style={s.eventTypesRow}>
                      {service.event_types.slice(0, 4).map(type => (
                        <View key={type} style={s.eventTypeChip}>
                          <Text style={s.eventTypeText}>{type}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {!isUnclaimed && (
                    <TouchableOpacity
                      style={s.bookBtn}
                      onPress={() => navigation.navigate('Booking', { provider, service, savedPlanId, paymentTermsSnapshot: paymentTermsSnapshotFor(service) })}
                    >
                      <Text style={s.bookBtnText}>Book this service →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        ) : activeTab === 'reviews' ? (
          <View style={s.section}>
            {reviews.length === 0 ? (
              <View style={s.centerBox}>
                <Text style={s.emptyText}>No reviews yet</Text>
                <Text style={s.emptySubText}>
                  {isUnclaimed
                    ? 'Reviews open up after the owner claims this listing'
                    : 'Be the first to review after booking'}
                </Text>
              </View>
            ) : (
              <>
                {reviews.map(review => (
                  <View key={review.id} style={s.reviewCard}>
                    <View style={s.reviewTop}>
                      <View style={s.reviewAvatar}>
                        <Text style={s.reviewAvatarText}>
                          {review.users?.name?.[0] || '?'}
                        </Text>
                      </View>
                      <View style={s.reviewMeta}>
                        <Text style={s.reviewerName}>
                          {review.users?.name || 'Customer'}
                        </Text>
                        <Text style={s.reviewDate}>
                          {new Date(review.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'long', year: 'numeric'
                          })}
                        </Text>
                      </View>
                      <Text style={s.reviewStars}>
                        {renderStars(review.rating)}
                      </Text>
                    </View>
                    {review.booking && (
                      <Text style={s.reviewVerified}>
                        ✓ Verified booking · {review.booking.event_type}
                        {review.booking.event_date ? ` · ${new Date(review.booking.event_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}
                      </Text>
                    )}
                    {review.comment ? (
                      <Text style={s.reviewComment}>{review.comment}</Text>
                    ) : null}
                  </View>
                ))}
                {(provider.total_reviews || 0) > 5 && (
                  <TouchableOpacity
                    style={s.seeAllBtn}
                    onPress={() => navigation.navigate('ProviderReviews', {
                      providerId: provider.id,
                      providerName: displayName,
                    })}
                  >
                    <Text style={s.seeAllText}>
                      See all {provider.total_reviews} reviews →
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={s.section}>
            {verifiedPhotos.length > 0 && (
              <>
                <Text style={s.photosSectionLabel}>✓ VERIFIED EVENT PHOTOS</Text>
                <View style={s.photosGrid}>
                  {verifiedPhotos.map(photo => (
                    <View key={photo.id} style={s.photoGridCell}>
                      <Image source={{ uri: photo.photo_url }} style={s.photoGridImage} />
                      {photo.booking && (
                        <Text style={s.photoGridCaption} numberOfLines={1}>{photo.booking.event_type}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {(provider.portfolio_photos || []).length > 0 && (
              <>
                <Text style={[s.photosSectionLabel, verifiedPhotos.length > 0 && { marginTop: 20 }]}>
                  MORE PHOTOS FROM {displayName.toUpperCase()}
                </Text>
                <View style={s.photosGrid}>
                  {(provider.portfolio_photos || []).map((url, i) => (
                    <View key={i} style={s.photoGridCell}>
                      <Image source={{ uri: url }} style={s.photoGridImage} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {verifiedPhotos.length === 0 && (provider.portfolio_photos || []).length === 0 && (
              <View style={s.centerBox}>
                <Text style={s.emptyText}>No photos yet</Text>
                <Text style={s.emptySubText}>Check back after this vendor completes a few events</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar */}
      {isUnclaimed ? (
        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, isDesktopWeb && ds.bottomBarInner]}>
          <View style={s.priceHint}>
            <Text style={s.priceHintLabel}>Own this business?</Text>
            <Text style={s.priceHintValue}>It's free to claim</Text>
          </View>
          <TouchableOpacity style={s.bookNowBtn} onPress={goToClaim}>
            <Text style={s.bookNowText}>Claim now</Text>
          </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[s.bottomBar, { paddingBottom: 16 + insets.bottom }]}>
          <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, isDesktopWeb && ds.bottomBarInner]}>
          <View style={s.priceHint}>
            <Text style={s.priceHintLabel}>Starting from</Text>
            <Text style={s.priceHintValue}>
              {services.length > 0
                ? `₹${Math.min(...services.map(sv => sv.price_from || 0)).toLocaleString()}`
                : 'Contact for price'}
            </Text>
          </View>
          <TouchableOpacity
            style={s.bookNowBtn}
            onPress={() => {
              if (services.length > 0) {
                navigation.navigate('Booking', {
                  provider,
                  service: services[0],
                  savedPlanId,
                  paymentTermsSnapshot: paymentTermsSnapshotFor(services[0])
                });
              } else {
                showAlert('No services yet', 'This provider hasn\'t added any services to book.');
              }
            }}
          >
            <Text style={s.bookNowText}>Book now</Text>
          </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, flex: 1, paddingHorizontal: 32 },
    loadingText: { marginTop: 10, fontSize: 14, color: theme.textSecondary },

    notFoundIcon: { fontSize: 48, marginBottom: 16, opacity: 0.5 },
    notFoundTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 8 },
    notFoundSub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
    notFoundBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 13 },
    notFoundBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.bg, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 36 },
    backIcon: { fontSize: 22, color: theme.text },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    headerRight: { flexDirection: 'row', gap: 8 },
    headerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
    headerBtnIcon: { fontSize: 18, color: theme.textSecondary },
    heartSaved: { color: '#E85D04' },

    // Hero — Instagram-style profile header
    hero: { backgroundColor: theme.cardBg, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 30, color: '#FFF', fontWeight: '700' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    providerName: { fontSize: 21, fontWeight: '700', color: theme.text, letterSpacing: -0.3 },
    verifiedTick: { width: 18, height: 18, borderRadius: 9, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    verifiedTickText: { fontSize: 11, color: '#FFF', fontWeight: '700' },
    providerCategory: { fontSize: 13.5, color: theme.textSecondary, marginTop: 3, marginBottom: 16 },
    mapsLink: { fontSize: 12.5, fontWeight: '600', color: theme.accent, marginTop: -10, marginBottom: 16 },
    statsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 4, marginBottom: 14 },
    statBox: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 17, fontWeight: '700', color: theme.text },
    statLabel: { fontSize: 11.5, color: theme.textSecondary, marginTop: 2 },
    unclaimedBadge: { backgroundColor: '#FF980022', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 6, borderWidth: 0.5, borderColor: '#FF980066', marginBottom: 14 },
    unclaimedText: { fontSize: 12, color: '#B36B00', fontWeight: '700' },
    heroActionRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
    heroPrimaryBtn: { flex: 1, backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    heroPrimaryBtnText: { fontSize: 14, fontWeight: '700', color: theme.btnPrimaryText },
    heroSecondaryBtn: { flex: 1, backgroundColor: theme.bg, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    heroSecondaryBtnText: { fontSize: 14, fontWeight: '700', color: theme.text },

    // Services carousel
    carouselSection: { marginTop: 18, marginBottom: 4 },
    carouselLabel: { fontSize: 11, fontWeight: '700', color: theme.textTertiary, letterSpacing: 0.6, marginBottom: 10, marginHorizontal: 16 },
    carouselScroll: { paddingHorizontal: 16, gap: 12 },
    carouselCard: { width: CAROUSEL_CARD_WIDTH, height: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: theme.cardBg },
    carouselImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    carouselPlaceholderIcon: { fontSize: 44 },
    carouselScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, paddingTop: 30 },
    carouselTitle: { fontSize: 13, fontWeight: '700', color: '#FFF', marginBottom: 3 },
    carouselPrice: { fontSize: 12.5, fontWeight: '700', color: '#FFF', opacity: 0.9 },

    // Claim banner
    claimBanner: {
      marginHorizontal: 16, marginTop: 14, padding: 16,
      backgroundColor: theme.accent + '15', borderRadius: 16,
      borderWidth: 1, borderColor: theme.accent + '44',
    },
    claimBannerTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 4 },
    claimBannerSub: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 12 },
    claimBtn: {
      backgroundColor: theme.accent, borderRadius: 10,
      paddingVertical: 10, alignItems: 'center', alignSelf: 'flex-start',
      paddingHorizontal: 16,
    },
    claimBtnText: { fontSize: 13, fontWeight: '700', color: theme.bg },

    // Bio
    bioText: { fontSize: 13.5, color: theme.text, lineHeight: 20, textAlign: 'center', marginBottom: 4 },

    notInterestedRow: { marginHorizontal: 16, marginBottom: 14 },
    notInterestedText: { fontSize: 12, color: theme.textTertiary, fontWeight: '600' },
    notInterestedTextActive: { color: theme.accent },

    // Tabs
    tabRow: { flexDirection: 'row', backgroundColor: theme.cardBg, marginHorizontal: 16, borderRadius: 14, padding: 4, marginBottom: 14, borderWidth: 0.5, borderColor: theme.border },
    tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 11 },
    tabActive: { backgroundColor: theme.text },
    tabText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    tabTextActive: { color: theme.bg },

    // Section
    section: { paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: theme.textSecondary, marginBottom: 4 },
    emptySubText: { fontSize: 12, color: theme.textTertiary, textAlign: 'center' },

    photosSectionLabel: { fontSize: 11.5, fontWeight: '700', color: '#2E7D32', marginBottom: 10, letterSpacing: 0.4 },
    photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photoGridCell: { width: '31.5%' },
    photoGridImage: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: theme.cardBg },
    photoGridCaption: { fontSize: 10.5, color: theme.textSecondary, fontWeight: '600', marginTop: 4 },

    // Services
    serviceCard: { backgroundColor: theme.cardBg, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
    serviceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    serviceTitle: { fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 },
    servicePrice: { fontSize: 14, fontWeight: '700', color: theme.accent, marginLeft: 8 },
    pricingNotesRow: { gap: 3, marginBottom: 8 },
    discountNote: { fontSize: 12, fontWeight: '700', color: '#4CAF50' },
    rushNote: { fontSize: 11.5, color: theme.textSecondary },

    paymentTermsBadge: { alignSelf: 'flex-start', backgroundColor: theme.bgSecondary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
    paymentTermsBadgeText: { fontSize: 11.5, fontWeight: '600', color: theme.text },
    paymentTermsExpanded: { marginTop: 6, gap: 3 },
    paymentTermsExpandedItem: { fontSize: 11.5, color: theme.textSecondary },
    advanceNote: { fontSize: 11.5, color: theme.textSecondary },
    serviceDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, marginBottom: 10 },
    eventTypesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    eventTypeChip: { backgroundColor: theme.bg, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 0.5, borderColor: theme.border },
    eventTypeText: { fontSize: 11, color: theme.textSecondary },
    packageChip: { backgroundColor: theme.accent + '18', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    packageChipText: { fontSize: 11, color: theme.accent, fontWeight: '600' },
    bookBtn: { backgroundColor: theme.bg, borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    bookBtnText: { fontSize: 13, fontWeight: '700', color: theme.text },

    // Reviews
    reviewCard: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border },
    reviewTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
    reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
    reviewAvatarText: { fontSize: 14, color: '#FFF', fontWeight: '600' },
    reviewMeta: { flex: 1 },
    reviewerName: { fontSize: 13, fontWeight: '700', color: theme.text },
    reviewDate: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
    reviewStars: { fontSize: 14, color: theme.accent },
    reviewVerified: { fontSize: 11, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
    reviewComment: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
    seeAllBtn: { alignItems: 'center', paddingVertical: 14 },
    seeAllText: { fontSize: 14, color: theme.accent, fontWeight: '700' },

    // Bottom bar
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg, padding: 16, borderTopWidth: 0.5, borderTopColor: theme.border, gap: 12 },
    priceHint: { flex: 1 },
    priceHintLabel: { fontSize: 11, color: theme.textSecondary },
    priceHintValue: { fontSize: 18, fontWeight: '700', color: theme.text },
    bookNowBtn: { flex: 2, backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
    bookNowText: { fontSize: 15, fontWeight: '700', color: theme.btnPrimaryText },
  });
}

// Desktop: centers the exact same content, doesn't restyle it -- same
// lightest-touch call as CreateBookingScreen.js/SearchScreen.js.
const ds = StyleSheet.create({
  centerCol: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  bottomBarInner: { alignSelf: 'center', width: '100%', maxWidth: 720 },
});