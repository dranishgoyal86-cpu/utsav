import { field } from '../types';
import { section } from '../sections';
import { FIELD_DEFS } from '../fields';
import { FIELD_STATUS, WORDING_TONE } from '../types';

// The secret-product conditional: productName is CONDITIONAL on
// productNameHidden being false — same "field hides while the boolean is
// true" shape naming-ceremony's babyName uses, applied to a corporate
// embargo instead of a family secret. This governs what the invite
// FORM/adapter surfaces; a future public-facing renderer must independently
// respect productNameHidden when it exists (out of scope this wave — no
// renderer changes to ToranCoverCard/StillnessCard).
export default {
  slug: 'product-launch',
  nonFestive: false,
  sections: [
    section('identity', [
      field(FIELD_DEFS.hostedBy, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.registrationInfo, FIELD_STATUS.REQUIRED),
      field(FIELD_DEFS.tagline, FIELD_STATUS.RECOMMENDED),
    ]),
    section('media', [
      field(FIELD_DEFS.heroPhotoUrl, FIELD_STATUS.RECOMMENDED),
      field(FIELD_DEFS.productNameHidden, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.productName, FIELD_STATUS.CONDITIONAL, {
        conditionOn: 'productNameHidden',
        condition: (values) => values.productNameHidden !== true,
      }),
    ]),
    section('programme', [
      field(FIELD_DEFS.founderName, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.scheduleNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.liveStreamUrl, FIELD_STATUS.OPTIONAL),
    ]),
    section('logistics', [
      field(FIELD_DEFS.vipAccessNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.embargoNote, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.contactInfo, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.dressCode, FIELD_STATUS.OPTIONAL),
    ]),
    section('custom', [
      field(FIELD_DEFS.customMessage, FIELD_STATUS.OPTIONAL),
      field(FIELD_DEFS.customSections, FIELD_STATUS.OPTIONAL),
    ]),
  ],
  functionVocabularyKey: null,
  staticFunctionVocabulary: [],
  supportedWordingTones: [WORDING_TONE.PROFESSIONAL, WORDING_TONE.MODERN, WORDING_TONE.ENERGETIC, WORDING_TONE.MINIMAL, WORDING_TONE.CUSTOM],
  guestResponseDefaults: { attendance: true, perFunctionRsvp: false, partySize: false, travel: false, accommodation: false, dietary: false },
};
