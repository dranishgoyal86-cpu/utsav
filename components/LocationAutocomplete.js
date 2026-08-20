import { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../ThemeContext';

// Type-and-pick address search, the same interaction pattern as Uber's pickup
// field — but backed by OpenStreetMap's free Nominatim search rather than
// Google Places Autocomplete, which needs billing enabled on the project's
// Google Cloud account (confirmed blocked — same wall hit by the OSM seeder
// work earlier this session) and isn't available right now. Nominatim has a
// strict 1 request/second usage policy for its public instance, so input is
// debounced and a descriptive User-Agent is sent, mirroring the Overpass
// fix from the seeder. Coverage is weaker than Google for exact business
// names, but the search-as-you-type + select flow is the same.
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

  async function search(text) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: text, format: 'json', countrycodes: 'in', limit: '5', addressdetails: '0',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { 'User-Agent': 'UtsavApp/1.0 (contact: dranishgoyal86@gmail.com)' },
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log('LocationAutocomplete search error:', err.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function pick(item) {
    setSuggestions([]);
    setShowDropdown(false);
    // Nominatim returns lat/lon as strings — parsed here so every onSelect
    // consumer gets real numbers, not text that happens to look numeric.
    onSelect(item.display_name, { lat: parseFloat(item.lat), lng: parseFloat(item.lon) });
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
              key={`${item.place_id || i}`}
              style={[s.suggestionRow, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => pick(item)}
            >
              <Text style={s.suggestionIcon}>📍</Text>
              <Text style={s.suggestionText} numberOfLines={2}>{item.display_name}</Text>
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
  });
}
