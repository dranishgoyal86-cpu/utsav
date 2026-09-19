import { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../ThemeContext';
import { callEdgeFunction } from '../helpers';

// Type-and-pick address search, the same interaction pattern as Uber's pickup
// field. Two sources are queried side by side and merged into one dropdown:
// OpenStreetMap's free Nominatim search (no key, no billing, been live since
// this was first built) and Google's Geocoding API via the "geocode-search"
// edge function (added later once Places/Geocoding billing was enabled —
// routed server-side so the Google API key never ships in the app). Kept
// side by side deliberately, tagged by source, so real usage shows which one
// actually finds Indian addresses better before either is dropped. Nominatim
// has a strict 1 request/second usage policy for its public instance, so
// input is debounced and a descriptive User-Agent is sent, mirroring the
// Overpass fix from the seeder work.
export default function LocationAutocomplete({ value, onChangeText, onSelect, onBlur, placeholder, style }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);

  function handleChangeText(text) {
    onChangeText(text);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => search(text), 500);
  }

  async function searchNominatim(text) {
    const params = new URLSearchParams({
      q: text, format: 'json', countrycodes: 'in', limit: '5', addressdetails: '0',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { 'User-Agent': 'UtsavApp/1.0 (contact: dranishgoyal86@gmail.com)' },
    });
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((item) => ({
      address: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      source: 'OSM',
      key: `osm-${item.place_id}`,
    }));
  }

  async function searchGoogle(text) {
    const { results } = await callEdgeFunction('geocode-search', { query: text });
    return (Array.isArray(results) ? results : []).map((item, i) => ({
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      source: 'Google',
      key: `google-${i}-${item.address}`,
    }));
  }

  async function search(text) {
    setLoading(true);
    try {
      // allSettled — if one source is slow/down (e.g. the Google secret
      // isn't set yet, or Nominatim is rate-limiting), the other still
      // shows results instead of the whole search coming up empty.
      const [googleResult, osmResult] = await Promise.allSettled([
        searchGoogle(text),
        searchNominatim(text),
      ]);
      const google = googleResult.status === 'fulfilled' ? googleResult.value : [];
      const osm = osmResult.status === 'fulfilled' ? osmResult.value : [];
      if (googleResult.status === 'rejected') {
        console.log('LocationAutocomplete Google search error:', googleResult.reason?.message);
      }
      if (osmResult.status === 'rejected') {
        console.log('LocationAutocomplete OSM search error:', osmResult.reason?.message);
      }
      // Google first — generally stronger on exact business/building names.
      setSuggestions([...google, ...osm].filter((r) => r.lat != null && r.lng != null && !isNaN(r.lat) && !isNaN(r.lng)));
    } finally {
      setLoading(false);
    }
  }

  function pick(item) {
    setSuggestions([]);
    setShowDropdown(false);
    onSelect(item.address, { lat: item.lat, lng: item.lng });
  }

  return (
    <View>
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, style]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            // Delayed so a tap on a dropdown suggestion still registers —
            // blur fires before the suggestion's onPress otherwise, which
            // would hide the list out from under the tap.
            setTimeout(() => setShowDropdown(false), 150);
            onBlur?.();
          }}
        />
        {loading ? <ActivityIndicator size="small" color={theme.accent} style={s.spinner} /> : null}
      </View>
      {showDropdown && suggestions.length > 0 && (
        <View style={s.dropdown}>
          {suggestions.map((item, i) => (
            <TouchableOpacity
              key={item.key || i}
              style={[s.suggestionRow, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => pick(item)}
            >
              <Text style={s.suggestionIcon}>📍</Text>
              <Text style={s.suggestionText} numberOfLines={2}>{item.address}</Text>
              <Text style={s.sourceTag}>{item.source}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    inputRow: { position: 'relative', justifyContent: 'center' },
    input: {
      backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: theme.text, borderWidth: 0.5, borderColor: theme.border,
    },
    spinner: { position: 'absolute', right: 14 },
    dropdown: {
      backgroundColor: theme.cardBg, borderRadius: 14, marginTop: 4,
      borderWidth: 0.5, borderColor: theme.border, overflow: 'hidden',
    },
    suggestionRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    suggestionIcon: { fontSize: 13, marginTop: 1 },
    suggestionText: { flex: 1, fontSize: 13, color: theme.text, lineHeight: 18 },
    sourceTag: { fontSize: 10, fontWeight: '700', color: theme.textSecondary, marginTop: 2 },
  });
}
