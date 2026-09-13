import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { FOOD_TYPES, CUISINES, MENU_CATEGORIES, getDishesForCategory, isMenuLibraryApplicable } from '../lib/menuLibrary';

// Birthday Event Improvement plan — menu planner rebuild.
// This used to be a collapsed-by-default section inline on PlanView.js
// (course-size based). It's now the full body of its own screen,
// screens/customer/MenuPlanner.js, reached via a header icon next to
// Guests — the request was explicit that this needed to be a real
// destination, not another collapsible.
//
// Flow, per spec: Select Food Type -> Select Cuisine -> Select Category ->
// Add Dish -> Add Price/Quantity/Notes.
//
// "menu list is very confusing. host can select only one option in food
// type and multiple in cuisine types" — Food Type is a SINGLE choice
// (tapping a different one swaps the selection, it doesn't add to it).
// Cuisine stays multi-select — a host can pick North Indian + Chinese
// together — plus a "Multicuisine" chip that means "show every dish in
// every category regardless of cuisine" (handled as a bypass inside
// getDishesForCategory). Every category also has a free-text "add your
// own dish" row, since the catalog can't cover every real menu (explicitly
// asked for), and every category is guaranteed at least a handful of
// dishes under any realistic filter combination so the list is never
// empty.
//
// All mutations are presentational callbacks, same split as every other
// planner section in this app — MenuPlanner.js owns the actual Supabase
// writes:
//   onSetMenuType(type)              'customized' | 'caterer_provided'
//   onSaveProviderNote(text)
//   onAddDish({ name, category, cuisine, foodType, isCustom })
//   onRemoveDish(selectionId)
//   onUpdateDetails(selectionId, { price, quantity, notes })   (autosave on blur)
export default function MenuLibrary({ event, selections, providerNote, onSetMenuType, onAddDish, onRemoveDish, onUpdateDetails, onSaveProviderNote, theme }) {
  const [foodType, setFoodType] = useState(null);
  const [cuisineFilters, setCuisineFilters] = useState([]);
  const [openCategory, setOpenCategory] = useState(null);
  const [customText, setCustomText] = useState({});
  const [noteText, setNoteText] = useState(providerNote || '');
  const s = makeStyles(theme);

  if (!isMenuLibraryApplicable(event.event_type_slug)) return null;

  const menuType = event.menu_type || null;

  function toggleFilter(list, setList, slug) {
    setList(list.includes(slug) ? list.filter(v => v !== slug) : [...list, slug]);
  }

  function findExisting(category, dishName) {
    return (selections || []).find(sel => sel.course_category === category && sel.dish_name === dishName);
  }

  if (menuType !== 'customized' && menuType !== 'caterer_provided') {
    return (
      <View style={s.container}>
        <Text style={s.label}>Who's putting the menu together?</Text>
        <View style={s.chipsWrap}>
          <TouchableOpacity style={s.typeChip} onPress={() => onSetMenuType('customized')}>
            <Text style={s.typeChipText}>I'll build the menu here</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.typeChip} onPress={() => onSetMenuType('caterer_provided')}>
            <Text style={s.typeChipText}>My caterer provides the menu</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Text style={s.label}>Who's putting the menu together?</Text>
      <View style={s.chipsWrap}>
        <TouchableOpacity style={[s.typeChip, menuType === 'customized' && s.typeChipActive]} onPress={() => onSetMenuType('customized')}>
          <Text style={[s.typeChipText, menuType === 'customized' && s.typeChipTextActive]}>I'll build the menu here</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.typeChip, menuType === 'caterer_provided' && s.typeChipActive]} onPress={() => onSetMenuType('caterer_provided')}>
          <Text style={[s.typeChipText, menuType === 'caterer_provided' && s.typeChipTextActive]}>My caterer provides the menu</Text>
        </TouchableOpacity>
      </View>

      {menuType === 'caterer_provided' && (
        <View style={{ marginTop: 12 }}>
          <Text style={s.label}>Notes for yourself (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Caterer confirmed a North Indian veg menu"
            placeholderTextColor={theme.textTertiary}
            value={noteText}
            onChangeText={setNoteText}
            onBlur={() => onSaveProviderNote(noteText)}
            multiline
          />
        </View>
      )}

      {menuType === 'customized' && (
        <>
          <Text style={[s.label, { marginTop: 16 }]}>Food type <Text style={s.itemHintInline}>(pick one)</Text></Text>
          <View style={s.chipsWrap}>
            {FOOD_TYPES.map(ft => (
              <TouchableOpacity key={ft.slug} style={[s.filterChip, foodType === ft.slug && s.filterChipActive]} onPress={() => setFoodType(foodType === ft.slug ? null : ft.slug)}>
                <Text style={[s.filterChipText, foodType === ft.slug && s.filterChipTextActive]}>{ft.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.label, { marginTop: 16 }]}>Cuisine <Text style={s.itemHintInline}>(pick as many as you like)</Text></Text>
          <View style={s.chipsWrap}>
            {CUISINES.map(c => (
              <TouchableOpacity key={c.slug} style={[s.filterChip, cuisineFilters.includes(c.slug) && s.filterChipActive]} onPress={() => toggleFilter(cuisineFilters, setCuisineFilters, c.slug)}>
                <Text style={[s.filterChipText, cuisineFilters.includes(c.slug) && s.filterChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.itemHint}>Leave food type unselected, or choose Multicuisine, to browse everything in a category.</Text>

          {MENU_CATEGORIES.map(cat => {
            const dishes = getDishesForCategory(cat.slug, { foodType, cuisines: cuisineFilters });
            const pickedInCategory = (selections || []).filter(sel => sel.course_category === cat.slug);
            const isOpen = openCategory === cat.slug;
            return (
              <View key={cat.slug} style={s.categoryBlock}>
                <TouchableOpacity onPress={() => setOpenCategory(isOpen ? null : cat.slug)} style={s.categoryHeaderRow}>
                  <Text style={s.categoryTitle}>{cat.label}{pickedInCategory.length > 0 ? ` (${pickedInCategory.length})` : ''}</Text>
                  <Text style={s.collapseText}>{isOpen ? '−' : '+'}</Text>
                </TouchableOpacity>

                {isOpen && (
                  <>
                    {pickedInCategory.length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        {pickedInCategory.map(sel => (
                          <PickedDishRow key={sel.id} sel={sel} theme={theme} s={s} onRemove={() => onRemoveDish(sel.id)} onUpdate={patch => onUpdateDetails(sel.id, patch)} />
                        ))}
                      </View>
                    )}

                    <View style={[s.chipsWrap, { marginTop: 10 }]}>
                      {dishes.map(dish => {
                        const already = !!findExisting(cat.slug, dish.name);
                        return (
                          <TouchableOpacity
                            key={dish.name}
                            style={[s.dishChip, already && s.dishChipActive]}
                            disabled={already}
                            onPress={() => onAddDish({ name: dish.name, category: cat.slug, cuisine: dish.cuisine || '', foodType: foodType || dish.foodTypes[0], isCustom: false })}
                          >
                            <Text style={[s.dishChipText, already && s.dishChipTextActive]}>{already ? '✓ ' : '+ '}{dish.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={s.customRow}>
                      <TextInput
                        style={s.customInput}
                        placeholder="Add your own dish or drink…"
                        placeholderTextColor={theme.textTertiary}
                        value={customText[cat.slug] || ''}
                        onChangeText={t => setCustomText(prev => ({ ...prev, [cat.slug]: t }))}
                      />
                      <TouchableOpacity
                        style={s.customAddBtn}
                        onPress={() => {
                          const name = (customText[cat.slug] || '').trim();
                          if (!name) return;
                          onAddDish({ name, category: cat.slug, cuisine: '', foodType: foodType || null, isCustom: true });
                          setCustomText(prev => ({ ...prev, [cat.slug]: '' }));
                        }}
                      >
                        <Text style={s.customAddBtnText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function PickedDishRow({ sel, theme, s, onRemove, onUpdate }) {
  const [price, setPrice] = useState(sel.price != null ? String(sel.price) : '');
  const [quantity, setQuantity] = useState(sel.quantity || '');
  const [notes, setNotes] = useState(sel.notes || '');

  return (
    <View style={s.pickedRow}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.pickedName}>{sel.is_custom ? '✎ ' : ''}{sel.dish_name}</Text>
        <TouchableOpacity onPress={onRemove}>
          <Text style={s.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>
      <View style={s.pickedFieldsRow}>
        <TextInput
          style={[s.pickedInput, { flex: 1 }]}
          placeholder="Price"
          placeholderTextColor={theme.textTertiary}
          value={price}
          onChangeText={setPrice}
          onBlur={() => onUpdate({ price: price.trim() ? Number(price) : null })}
          keyboardType="numeric"
        />
        <TextInput
          style={[s.pickedInput, { flex: 1 }]}
          placeholder="Quantity"
          placeholderTextColor={theme.textTertiary}
          value={quantity}
          onChangeText={setQuantity}
          onBlur={() => onUpdate({ quantity: quantity.trim() || null })}
        />
      </View>
      <TextInput
        style={s.pickedNotesInput}
        placeholder="Notes (spice level, dietary notes, etc.)"
        placeholderTextColor={theme.textTertiary}
        value={notes}
        onChangeText={setNotes}
        onBlur={() => onUpdate({ notes: notes.trim() || null })}
      />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { paddingBottom: 40 },
    label: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 8 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    typeChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    typeChipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    typeChipTextActive: { color: theme.bg },
    filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    filterChipActive: { backgroundColor: theme.btnPrimary, borderColor: theme.btnPrimary },
    filterChipText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
    filterChipTextActive: { color: theme.btnPrimaryText },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: theme.text, minHeight: 60, textAlignVertical: 'top' },
    itemHint: { fontSize: 11.5, color: theme.textSecondary, marginTop: 6 },
    itemHintInline: { fontSize: 11.5, fontWeight: '400', color: theme.textSecondary },
    categoryBlock: { marginTop: 16, borderTopWidth: 0.5, borderTopColor: theme.border, paddingTop: 12 },
    categoryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    categoryTitle: { fontSize: 14.5, fontWeight: '700', color: theme.text },
    collapseText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
    dishChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    dishChipActive: { backgroundColor: theme.btnPrimary, borderColor: theme.btnPrimary },
    dishChipText: { fontSize: 12.5, fontWeight: '600', color: theme.text },
    dishChipTextActive: { color: theme.btnPrimaryText },
    customRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    customInput: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.text },
    customAddBtn: { paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.text, alignItems: 'center', justifyContent: 'center' },
    customAddBtnText: { fontSize: 13, fontWeight: '700', color: theme.bg },
    pickedRow: { backgroundColor: theme.cardBg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, padding: 12, marginBottom: 8 },
    pickedName: { fontSize: 13.5, fontWeight: '700', color: theme.text, flexShrink: 1 },
    removeText: { fontSize: 12, fontWeight: '600', color: theme.danger || '#C0392B' },
    pickedFieldsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    pickedInput: { backgroundColor: theme.bg, borderRadius: 10, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: theme.text },
    pickedNotesInput: { backgroundColor: theme.bg, borderRadius: 10, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: theme.text, marginTop: 8 },
  });
}
