// US-06 extraction contract.
// null = not mentioned in the transcript. Never guessed.
// uncertain_fields = mentioned but unclear; reviewer must check. A null field is never uncertain.
const FIELDS = ['equipment', 'symptom', 'operating_condition', 'observation'];

const text = (description) => ({ type: ['string', 'null'], minLength: 1, maxLength: 300, description });

const schema = {
  type: 'object',
  additionalProperties: false,
  required: [...FIELDS, 'uncertain_fields'],
  properties: {
    equipment:           text('Machine or component being discussed'),
    symptom:             text('The problem or abnormal behaviour'),
    operating_condition: text('Load, speed, temperature, mode or situation when it occurs'),
    observation:         text('What the technician saw, heard, measured or did'),
    uncertain_fields: {
      type: 'array',
      uniqueItems: true,
      items: { enum: FIELDS },
      description: 'Mentioned fields that are unclear or ambiguous'
    }
  }
};

const EMPTY_WORDS = ['n/a', 'na', 'none', 'unknown', 'not mentioned', 'null'];

// Trim strings; turn "", "N/A", "unknown" etc. into null.
function normalize(data) {
  const out = { ...data };
  for (const f of FIELDS) {
    if (typeof out[f] === 'string') {
      const v = out[f].trim();
      out[f] = v === '' || EMPTY_WORDS.includes(v.toLowerCase()) ? null : v;
    }
  }
  return out;
}

// Rules a JSON Schema can't express. Returns an error string or null.
function checkRules(data) {
  const bad = data.uncertain_fields.filter((f) => data[f] === null);
  return bad.length ? `uncertain_fields lists null fields: ${bad.join(', ')}` : null;
}

module.exports = { FIELDS, schema, normalize, checkRules };