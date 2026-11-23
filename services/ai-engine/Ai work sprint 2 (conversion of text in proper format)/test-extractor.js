const Extractor = require('./extractor');

// Fake LLM: returns the scripted replies one by one. No API call, no quota used.
function fakeLLM(replies) {
  let calls = 0;
  const fn = async () => {
    const reply = replies[calls++];
    if (reply instanceof Error) throw reply;
    return reply;
  };
  fn.count = () => calls;
  return fn;
}

const answer = (o) => JSON.stringify({
  equipment: 'pump', symptom: 'tripping', operating_condition: null,
  observation: null, uncertain_fields: [], ...o
});

const tests = [
  { name: 'good reply', transcript: 'Pump keeps tripping.',
    replies: [answer({})], ok: true, calls: 1 },
  { name: 'broken JSON, then good', transcript: 'Pump keeps tripping.',
    replies: ['this is not json', answer({})], ok: true, calls: 2 },
  { name: 'N/A becomes null', transcript: 'Pump keeps tripping.',
    replies: [answer({ symptom: 'N/A' })], ok: true, calls: 1,
    extra: (r) => r.data.symptom === null },
  { name: 'uncertain lists a null field, twice', transcript: 'Pump keeps tripping.',
    replies: [answer({ uncertain_fields: ['observation'] }), answer({ uncertain_fields: ['observation'] })],
    ok: false, calls: 2 },
  { name: 'empty transcript', transcript: '   ',
    replies: [], ok: false, calls: 0 },
  { name: 'LLM call throws', transcript: 'Pump keeps tripping.',
    replies: [Object.assign(new Error('boom'), { status: 429 })], ok: false, calls: 1 }
];

(async () => {
  let failed = 0;
  for (const t of tests) {
    const llm = fakeLLM(t.replies);
    const r = await new Extractor(llm).extract(t.transcript);
    const pass = r.ok === t.ok && llm.count() === t.calls && (!t.extra || t.extra(r));
    if (!pass) failed++;
    console.log(pass ? 'PASS' : 'FAIL', '-', t.name, '| calls:', llm.count(), '|', JSON.stringify(r));
  }
  console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
})();