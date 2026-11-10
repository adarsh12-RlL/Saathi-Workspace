import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SPECS, initialData, invoiceTotal, makeInstance, quizScore, validateData, validateInstance, validateSpec } from "./mini-app-engine.mjs";

const clone = value => structuredClone(value);
const tracker = () => clone(DEFAULT_SPECS.find(spec => spec.kind === "tracker"));
const quiz = () => clone(DEFAULT_SPECS.find(spec => spec.kind === "quiz"));
const invoice = () => clone(DEFAULT_SPECS.find(spec => spec.kind === "invoice"));
const at = "2026-10-08T10:30:00.000Z";
const trackerEntry = (id = "entry-1") => ({ id, values: { date: "2024-02-29", food: "Lunch", calories: 123.5 } });
const invoiceLine = (overrides = {}) => ({ id: "line-1", description: "Development", quantity: 2, unitPriceMinor: 12345, ...overrides });

test("every preset roundtrips through JSON with valid independent initial data", () => {
  assert.equal(DEFAULT_SPECS.length, 3);
  for (const spec of DEFAULT_SPECS) {
    assert.deepEqual(validateSpec(JSON.parse(JSON.stringify(spec))), spec);
    const instance = makeInstance(spec, `instance-${spec.kind}`, at);
    assert.deepEqual(validateInstance(JSON.parse(JSON.stringify(instance))), instance);
    assert.deepEqual(validateData(spec, initialData(spec)), initialData(spec));
  }
});

test("unsupported schema, versions, renderer kinds and executable/unknown properties are rejected", () => {
  for (const patch of [{ schema: "other" }, { version: 2 }, { version: "1" }, { kind: "script" }, { code: "alert(1)" }, { render: "<script>" }]) {
    assert.throws(() => validateSpec({ ...tracker(), ...patch }));
  }
  const definition = tracker();
  definition.config.callback = "run()";
  assert.throws(() => validateSpec(definition));
  assert.throws(() => validateSpec(JSON.parse(JSON.stringify(tracker()).replace('"config":', '"__proto__":{},"config":'))));
  const inherited = Object.assign(Object.create({ unsafe: true }), tracker());
  assert.throws(() => validateSpec(inherited));
});

test("strict validation rejects missing, non-JSON and unknown nested properties", () => {
  const missing = tracker();
  delete missing.description;
  assert.throws(() => validateSpec(missing));
  const accessor = tracker();
  Object.defineProperty(accessor, "title", { enumerable: true, get() { throw new Error("Getter executed"); } });
  assert.throws(() => validateSpec(accessor), /JSON data properties/);
  const withSymbol = tracker();
  withSymbol[Symbol("hidden")] = "secret";
  assert.throws(() => validateSpec(withSymbol));
  assert.throws(() => validateData(invoice(), { customer: "", items: [invoiceLine({ extra: true })] }));
  assert.throws(() => validateInstance({ ...makeInstance(invoice(), "one", at), extra: true }));
});

test("tracker requires bounded unique safe fields and a numeric metric", () => {
  for (const invalidId of ["constructor", "prototype", "__proto__", "bad id", "<script>", "a".repeat(49)]) {
    const spec = tracker();
    spec.config.fields[0].id = invalidId;
    assert.throws(() => validateSpec(spec));
  }
  const duplicate = tracker();
  duplicate.config.fields[1].id = duplicate.config.fields[0].id;
  assert.throws(() => validateSpec(duplicate), /unique/);
  const wrongMetric = tracker();
  wrongMetric.config.metricField = "food";
  assert.throws(() => validateSpec(wrongMetric), /number field/);
  const tooFew = tracker();
  tooFew.config.fields = [tooFew.config.fields[2]];
  assert.throws(() => validateSpec(tooFew));
  const unknownType = tracker();
  unknownType.config.fields[0].type = "html";
  assert.throws(() => validateSpec(unknownType));
});

test("tracker data requires exact fields, finite bounded numbers and real calendar dates", () => {
  assert.deepEqual(validateData(tracker(), { entries: [trackerEntry()] }).entries[0], trackerEntry());
  for (const calories of [NaN, Infinity, -1, 1e9 + 1, "120"]) {
    const entry = trackerEntry(); entry.values.calories = calories;
    assert.throws(() => validateData(tracker(), { entries: [entry] }));
  }
  for (const value of ["2023-02-29", "2024-02-30", "2026-13-01", "2026-1-01", "", "2026-10-08T00:00:00Z"]) {
    const entry = trackerEntry(); entry.values.date = value;
    assert.throws(() => validateData(tracker(), { entries: [entry] }));
  }
  const missing = trackerEntry(); delete missing.values.food;
  assert.throws(() => validateData(tracker(), { entries: [missing] }));
  const extra = trackerEntry(); extra.values.script = "run";
  assert.throws(() => validateData(tracker(), { entries: [extra] }));
  assert.throws(() => validateData(tracker(), { entries: [trackerEntry(), trackerEntry()] }), /unique/);
  const tooLong = trackerEntry(); tooLong.values.food = "x".repeat(301);
  assert.throws(() => validateData(tracker(), { entries: [tooLong] }));
  assert.throws(() => validateData(tracker(), { entries: Array.from({ length: 366 }, (_, i) => trackerEntry(String(i))) }));
  assert.throws(() => validateData(tracker(), { entries: new Array(2) }), /missing items/);
});

test("quiz schema and answers reject invalid indexes, IDs and choice definitions", () => {
  for (const invalid of [-1, 0.5, 3, "0", NaN]) {
    const spec = quiz(); spec.config.questions[0].answerIndex = invalid;
    assert.throws(() => validateSpec(spec));
    assert.throws(() => validateData(quiz(), { answers: { variable: invalid }, checked: false }));
  }
  for (const choices of [[], ["Only"], ["", "Valid"], ["Valid", 1], Array(7).fill("Choice")]) {
    const spec = quiz(); spec.config.questions[0].choices = choices;
    assert.throws(() => validateSpec(spec));
  }
  const duplicate = quiz(); duplicate.config.questions[1].id = "variable";
  assert.throws(() => validateSpec(duplicate), /unique/);
  assert.throws(() => validateData(quiz(), { answers: { unknown: 0 }, checked: false }));
  assert.throws(() => validateData(quiz(), { answers: JSON.parse('{"__proto__":0}'), checked: false }));
  assert.throws(() => validateData(quiz(), { answers: {}, checked: "true" }));
});

test("quiz scoring distinguishes unanswered, wrong and correct answers", () => {
  assert.deepEqual(quizScore(quiz(), { answers: {}, checked: false }), { correct: 0, total: 3, answered: 0 });
  assert.deepEqual(quizScore(quiz(), { answers: { variable: 0, condition: 0 }, checked: true }), { correct: 1, total: 3, answered: 2 });
  assert.deepEqual(quizScore(quiz(), { answers: { variable: 0, condition: 1, array: 1 }, checked: true }), { correct: 3, total: 3, answered: 3 });
  assert.throws(() => quizScore(tracker(), initialData(tracker())));
});

test("invoice totals are exact minor-unit integers with no rounding of fractional input", () => {
  const data = { customer: "Example", items: [invoiceLine(), invoiceLine({ id: "line-2", quantity: 3, unitPriceMinor: 10 })] };
  assert.equal(invoiceTotal(data), 24720);
  assert.equal(invoiceTotal({ customer: "", items: [] }), 0);
  assert.equal(invoiceTotal({ customer: "", items: [invoiceLine({ quantity: 1000, unitPriceMinor: 1e9 })] }), 1e12);
  for (const quantity of [0, -1, 1.5, 1001, Infinity, "2"]) {
    assert.throws(() => invoiceTotal({ customer: "", items: [invoiceLine({ quantity })] }));
  }
  for (const unitPriceMinor of [-1, 1.1, NaN, Infinity, 1e9 + 1, Number.MAX_SAFE_INTEGER + 1, "100"]) {
    assert.throws(() => invoiceTotal({ customer: "", items: [invoiceLine({ unitPriceMinor })] }));
  }
});

test("invoice bounds prevent overflow, duplicate IDs and oversized lines", () => {
  const maximum = { customer: "", items: Array.from({ length: 100 }, (_, i) => invoiceLine({ id: String(i), quantity: 1000, unitPriceMinor: 1e9 })) };
  assert.equal(invoiceTotal(maximum), 1e14);
  assert.ok(Number.isSafeInteger(invoiceTotal(maximum)));
  assert.throws(() => invoiceTotal({ customer: "", items: [invoiceLine({ quantity: 1000, unitPriceMinor: Number.MAX_SAFE_INTEGER })] }));
  assert.throws(() => validateData(invoice(), { customer: "", items: [invoiceLine(), invoiceLine()] }), /unique/);
  assert.throws(() => invoiceTotal({ customer: "", items: [...maximum.items, invoiceLine({ id: "overflow-line" })] }));
  assert.throws(() => invoiceTotal({ customer: "x".repeat(201), items: [] }));
  assert.throws(() => invoiceTotal({ customer: "", items: [invoiceLine({ description: "x".repeat(301) })] }));
  const invalidCurrency = invoice(); invalidCurrency.config.currency = "BTC";
  assert.throws(() => validateSpec(invalidCurrency));
});

test("instances and validated copies never share mutable definition or run state", () => {
  const spec = tracker();
  const first = makeInstance(spec, "first", at);
  const second = makeInstance(spec, "second", at);
  first.spec.title = "Changed";
  first.spec.config.fields[0].label = "Changed label";
  first.data.entries.push(trackerEntry());
  assert.equal(second.spec.title, spec.title);
  assert.equal(second.spec.config.fields[0].label, spec.config.fields[0].label);
  assert.deepEqual(second.data, { entries: [] });
  const copied = validateInstance(first);
  copied.data.entries[0].values.food = "Different";
  assert.equal(first.data.entries[0].values.food, "Lunch");
  const firstQuiz = makeInstance(quiz(), "q1", at);
  const secondQuiz = makeInstance(quiz(), "q2", at);
  firstQuiz.data.answers.variable = 0;
  assert.deepEqual(secondQuiz.data.answers, {});
});

test("instance timestamps and text bounds reject malformed imports", () => {
  for (const timestamp of ["yesterday", "2026-02-30T10:30:00Z", "2026-10-08T25:00:00Z", "2026-10-08", 123]) {
    assert.throws(() => makeInstance(invoice(), "one", timestamp));
  }
  assert.doesNotThrow(() => makeInstance(invoice(), "offset", "2026-10-08T16:00:00+05:30"));
  assert.throws(() => makeInstance(invoice(), "", at));
  const longTitle = tracker(); longTitle.title = "x".repeat(81);
  assert.throws(() => validateSpec(longTitle));
  const longDescription = tracker(); longDescription.description = "x".repeat(401);
  assert.throws(() => validateSpec(longDescription));
});
