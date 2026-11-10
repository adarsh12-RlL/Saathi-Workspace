// A constrained data engine: definitions describe fixed renderers, never executable code.
const SCHEMA = "saathi.mini-app";
const KINDS = new Set(["tracker", "quiz", "invoice"]);
const CURRENCIES = new Set(["INR", "USD", "EUR", "GBP"]);
const FIELD_TYPES = new Set(["text", "number", "date"]);
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) {
  throw new Error(message);
}

function object(value, path, keys, required = keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${path} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${path} must be a plain object.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key)) fail(`${path} contains an unsupported property.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail(`${path} must contain JSON data properties.`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key} is required.`);
  }
  return value;
}

function text(value, path, maximum, nonempty = false) {
  if (typeof value !== "string" || value.length > maximum || (nonempty && !value.trim())) {
    fail(`${path} must be ${nonempty ? "nonempty " : ""}text of at most ${maximum} characters.`);
  }
  return value;
}

function array(value, path, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${path} must contain ${minimum} to ${maximum} items.`);
  }
  // Sparse arrays are not valid JSON arrays and must not bypass per-item validation.
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail(`${path} must not contain missing items.`);
  }
  return value;
}

function uniqueId(value, path, used, specId = false) {
  const result = text(value, path, specId ? 48 : 100, true);
  if (specId && (!/^[a-z][a-z0-9_-]{0,47}$/.test(result) || RESERVED_IDS.has(result))) {
    fail(`${path} must be a safe lowercase ID.`);
  }
  if (used.has(result)) fail(`${path} must be unique.`);
  used.add(result);
  return result;
}

function number(value, path, maximum, { integer = false, minimum = 0 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum ||
      (integer && !Number.isSafeInteger(value))) {
    fail(`${path} must be ${integer ? "a safe integer" : "a finite number"} from ${minimum} to ${maximum}.`);
  }
  return value;
}

function date(value, path) {
  text(value, path, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${path} must be a YYYY-MM-DD date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${path} must be an actual calendar date.`);
  }
  return value;
}

function timestamp(value, path) {
  text(value, path, 50, true);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
      !Number.isFinite(Date.parse(value))) fail(`${path} must be a valid ISO timestamp.`);
  date(match[1], path);
  return value;
}

export function validateSpec(raw) {
  object(raw, "Mini-app", ["schema", "version", "kind", "title", "description", "config"]);
  if (raw.schema !== SCHEMA || raw.version !== 1) fail("Choose a SAATHI mini-app definition, version 1.");
  if (!KINDS.has(raw.kind)) fail("Unsupported mini-app kind.");
  const title = text(raw.title, "Title", 80, true);
  const description = text(raw.description, "Description", 400);
  let config;

  if (raw.kind === "tracker") {
    object(raw.config, "Tracker config", ["fields", "metricField", "metricUnit"]);
    const ids = new Set();
    const fields = array(raw.config.fields, "Tracker fields", 2, 8).map((field, index) => {
      const path = `Tracker field ${index + 1}`;
      object(field, path, ["id", "label", "type"]);
      if (!FIELD_TYPES.has(field.type)) fail(`${path} has an unsupported type.`);
      return {
        id: uniqueId(field.id, `${path} ID`, ids, true),
        label: text(field.label, `${path} label`, 80, true),
        type: field.type,
      };
    });
    const metricField = text(raw.config.metricField, "Metric field", 48, true);
    if (!fields.some(field => field.id === metricField && field.type === "number")) {
      fail("Metric field must refer to a number field.");
    }
    config = { fields, metricField, metricUnit: text(raw.config.metricUnit, "Metric unit", 40) };
  } else if (raw.kind === "quiz") {
    object(raw.config, "Quiz config", ["questions"]);
    const ids = new Set();
    const questions = array(raw.config.questions, "Quiz questions", 1, 30).map((question, index) => {
      const path = `Question ${index + 1}`;
      object(question, path, ["id", "prompt", "choices", "answerIndex", "explanation"]);
      const choices = array(question.choices, `${path} choices`, 2, 6).map((choice, choiceIndex) =>
        text(choice, `${path} choice ${choiceIndex + 1}`, 300, true));
      return {
        id: uniqueId(question.id, `${path} ID`, ids, true),
        prompt: text(question.prompt, `${path} prompt`, 1000, true),
        choices,
        answerIndex: number(question.answerIndex, `${path} correct choice`, choices.length - 1, { integer: true }),
        explanation: text(question.explanation, `${path} explanation`, 2000),
      };
    });
    config = { questions };
  } else {
    object(raw.config, "Invoice config", ["currency"]);
    if (!CURRENCIES.has(raw.config.currency)) fail("Unsupported invoice currency.");
    config = { currency: raw.config.currency };
  }
  return { schema: SCHEMA, version: 1, kind: raw.kind, title, description, config };
}

export function initialData(spec) {
  const checked = validateSpec(spec);
  if (checked.kind === "tracker") return { entries: [] };
  if (checked.kind === "quiz") return { answers: {}, checked: false };
  return { customer: "", items: [] };
}

function invoiceData(raw) {
  object(raw, "Invoice data", ["customer", "items"]);
  const ids = new Set();
  const items = array(raw.items, "Invoice lines", 0, 100).map((item, index) => {
    const path = `Invoice line ${index + 1}`;
    object(item, path, ["id", "description", "quantity", "unitPriceMinor"]);
    return {
      id: uniqueId(item.id, `${path} ID`, ids),
      description: text(item.description, `${path} description`, 300),
      quantity: number(item.quantity, `${path} quantity`, 1000, { integer: true, minimum: 1 }),
      unitPriceMinor: number(item.unitPriceMinor, `${path} unit price`, 1e9, { integer: true }),
    };
  });
  return { customer: text(raw.customer, "Customer", 200), items };
}

export function validateData(spec, raw) {
  const checked = validateSpec(spec);
  if (checked.kind === "tracker") {
    object(raw, "Tracker data", ["entries"]);
    const ids = new Set();
    const fieldIds = checked.config.fields.map(field => field.id);
    const entries = array(raw.entries, "Tracker entries", 0, 365).map((entry, index) => {
      const path = `Tracker entry ${index + 1}`;
      object(entry, path, ["id", "values"]);
      object(entry.values, `${path} values`, fieldIds);
      const values = {};
      for (const field of checked.config.fields) {
        const valuePath = `${path} ${field.label}`;
        values[field.id] = field.type === "number" ? number(entry.values[field.id], valuePath, 1e9)
          : field.type === "date" ? date(entry.values[field.id], valuePath)
            : text(entry.values[field.id], valuePath, 300);
      }
      return { id: uniqueId(entry.id, `${path} ID`, ids), values };
    });
    return { entries };
  }
  if (checked.kind === "quiz") {
    object(raw, "Quiz data", ["answers", "checked"]);
    if (typeof raw.checked !== "boolean") fail("Quiz checked state must be boolean.");
    const ids = checked.config.questions.map(question => question.id);
    object(raw.answers, "Quiz answers", ids, []);
    const answers = {};
    for (const question of checked.config.questions) {
      if (Object.hasOwn(raw.answers, question.id)) {
        answers[question.id] = number(raw.answers[question.id], `${question.id} answer`, question.choices.length - 1, { integer: true });
      }
    }
    return { answers, checked: raw.checked };
  }
  return invoiceData(raw);
}

export function validateInstance(raw) {
  object(raw, "Mini-app instance", ["id", "spec", "data", "createdAt", "updatedAt"]);
  const spec = validateSpec(raw.spec);
  return {
    id: text(raw.id, "Instance ID", 100, true),
    spec,
    data: validateData(spec, raw.data),
    createdAt: timestamp(raw.createdAt, "Creation time"),
    updatedAt: timestamp(raw.updatedAt, "Update time"),
  };
}

export function makeInstance(spec, id, at) {
  return validateInstance({ id, spec, data: initialData(spec), createdAt: at, updatedAt: at });
}

export function invoiceTotal(data) {
  const checked = invoiceData(data);
  let total = 0;
  for (const item of checked.items) {
    const lineTotal = item.quantity * item.unitPriceMinor;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) {
      fail("Invoice total exceeds safe integer precision.");
    }
    total += lineTotal;
  }
  return total;
}

export function quizScore(spec, data) {
  const checked = validateSpec(spec);
  if (checked.kind !== "quiz") fail("Quiz scoring requires a quiz definition.");
  const answers = validateData(checked, data).answers;
  let correct = 0;
  let answered = 0;
  for (const question of checked.config.questions) {
    if (Object.hasOwn(answers, question.id)) {
      answered += 1;
      if (answers[question.id] === question.answerIndex) correct += 1;
    }
  }
  return { correct, total: checked.config.questions.length, answered };
}

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") freeze(child);
  }
  return Object.freeze(value);
}

export const DEFAULT_SPECS = freeze([
  {
    schema: SCHEMA, version: 1, kind: "tracker", title: "Food & calorie tracker",
    description: "Record meals and their calorie values. Values are entered by you; this tool does not estimate nutrition.",
    config: {
      fields: [{ id: "date", label: "Date", type: "date" }, { id: "food", label: "Food", type: "text" }, { id: "calories", label: "Calories", type: "number" }],
      metricField: "calories", metricUnit: "kcal",
    },
  },
  {
    schema: SCHEMA, version: 1, kind: "quiz", title: "JavaScript basics quiz",
    description: "Practice three beginner questions. Choose answers, then check your result.",
    config: { questions: [
      { id: "variable", prompt: "Which keyword declares a variable you can reassign?", choices: ["let", "const", "return"], answerIndex: 0, explanation: "let permits reassignment; const prevents reassignment of its binding." },
      { id: "condition", prompt: "What does an if statement do?", choices: ["Always repeats code", "Runs code when its condition is true", "Creates a file"], answerIndex: 1, explanation: "An if statement conditionally runs its block." },
      { id: "array", prompt: "Which expression creates an array?", choices: ["{}", "[]", "null"], answerIndex: 1, explanation: "Square brackets create an array, which holds an ordered collection of values." },
    ] },
  },
  {
    schema: SCHEMA, version: 1, kind: "invoice", title: "Simple invoice calculator",
    description: "Enter a customer and line items to calculate a total. Tax, payment collection and invoice numbering are outside this tool.",
    config: { currency: "INR" },
  },
]);
