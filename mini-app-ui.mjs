import { validateData, invoiceTotal, quizScore, initialData } from "./mini-app-engine.mjs";

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const button = (label, action, className = "button") => {
  const element = node("button", className, label);
  element.type = "button";
  element.addEventListener("click", action);
  return element;
};
const field = (label, input, id) => {
  input.id = id;
  const wrapper = node("label", "mini-field");
  wrapper.htmlFor = id;
  wrapper.append(node("span", "", label), input);
  return wrapper;
};
const input = (type, required = true) => {
  const element = node("input"); element.type = type; element.required = required; return element;
};
const number = value => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function renderMiniApp(instance, { onChange = () => {}, onError = () => {} } = {}) {
  const spec = instance.spec;
  let data = validateData(spec, instance.data);
  const root = node("article", "mini-app");
  const heading = node("div", "section-heading");
  heading.append(node("h3", "", spec.title), node("span", "mini-kind", spec.kind));
  root.append(heading, node("p", "mini-description", spec.description));
  const inlineError = node("p", "mini-error"); inlineError.hidden = true; inlineError.setAttribute("role", "alert"); root.append(inlineError);
  const content = node("div"); root.append(content);
  const commit = next => {
    const valid = validateData(spec, next);
    onChange(valid);
    data = valid;
    inlineError.hidden = true;
  };
  const guarded = action => {
    try { action(); } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update this mini-app.";
      inlineError.textContent = message; inlineError.hidden = false; onError(message);
    }
  };

  function renderTracker() {
    content.replaceChildren();
    const form = node("form", "mini-form");
    const fields = new Map();
    for (const definition of spec.config.fields) {
      const control = input(definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text");
      if (definition.type === "number") { control.min = "0"; control.max = "1000000000"; control.step = "any"; }
      if (definition.type === "text") control.maxLength = 300;
      if (definition.type === "date") {
        const date = new Date();
        control.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
      fields.set(definition.id, control);
      form.append(field(definition.label, control, `${instance.id}-${definition.id}`));
    }
    const submit = node("button", "button primary", "Add entry"); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", event => {
      event.preventDefault(); guarded(() => {
        const values = {};
        for (const definition of spec.config.fields) {
          const value = fields.get(definition.id).value;
          if (!value.trim()) throw new Error(`Enter ${definition.label}.`);
          values[definition.id] = definition.type === "number" ? Number(value) : value;
        }
        commit({ entries: [...data.entries, { id: newId(), values }] });
        renderTracker();
      });
    });
    content.append(form);
    if (!data.entries.length) { content.append(node("p", "empty", "Add your first entry to see the totals.")); return; }
    const metric = spec.config.fields.find(item => item.id === spec.config.metricField);
    const total = data.entries.reduce((sum, entry) => sum + entry.values[metric.id], 0);
    content.append(node("p", "mini-total", `${metric.label}: ${number(total)} ${spec.config.metricUnit}`));
    const dateField = spec.config.fields.find(item => item.type === "date");
    if (dateField) {
      const figure = node("figure", "mini-chart");
      figure.append(node("figcaption", "", `${metric.label} per ${dateField.label} (${spec.config.metricUnit || "value"})`));
      const totals = new Map();
      for (const entry of data.entries) {
        const date = entry.values[dateField.id]; totals.set(date, (totals.get(date) || 0) + entry.values[metric.id]);
      }
      const maximum = Math.max(1, ...totals.values());
      for (const [date, sum] of [...totals].sort((a, b) => a[0].localeCompare(b[0]))) {
        const row = node("div", "mini-chart-row");
        const progress = node("progress"); progress.max = maximum; progress.value = sum;
        progress.setAttribute("aria-label", `${date}: ${number(sum)} ${spec.config.metricUnit}`);
        row.append(node("span", "", date), progress, node("span", "", number(sum))); figure.append(row);
      }
      content.append(figure);
    }
    const scroller = node("div", "mini-table-scroll");
    const table = node("table", "mini-table");
    const header = node("tr");
    for (const definition of spec.config.fields) header.append(node("th", "", definition.label));
    header.append(node("th", "", "Actions")); const head = node("thead"); head.append(header); table.append(head);
    const body = node("tbody");
    for (const entry of data.entries) {
      const row = node("tr");
      for (const definition of spec.config.fields) row.append(node("td", "", definition.type === "number" ? number(entry.values[definition.id]) : entry.values[definition.id]));
      const action = node("td"); action.append(button("Remove", () => guarded(() => { commit({ entries: data.entries.filter(item => item.id !== entry.id) }); renderTracker(); }), "text-button")); row.append(action); body.append(row);
    }
    table.append(body); scroller.append(table); content.append(scroller);
  }

  function renderQuiz() {
    content.replaceChildren();
    const form = node("form", "quiz-form");
    const feedback = node("div", "quiz-feedback"); feedback.setAttribute("role", "status");
    const showFeedback = () => {
      feedback.replaceChildren();
      if (!data.checked) return;
      const score = quizScore(spec, data);
      feedback.append(node("p", "mini-total", `${score.correct} / ${score.total} correct · ${score.answered} answered`));
      for (const question of spec.config.questions) {
        const correct = data.answers[question.id] === question.answerIndex;
        feedback.append(node("p", "", `${correct ? "Correct" : "Review"}: ${question.prompt} — ${question.choices[question.answerIndex]}. ${question.explanation}`));
      }
    };
    for (const question of spec.config.questions) {
      const group = node("fieldset", "quiz-question"); group.append(node("legend", "", question.prompt));
      question.choices.forEach((choice, index) => {
        const radio = input("radio", false); radio.name = `${instance.id}-${question.id}`; radio.value = String(index); radio.checked = data.answers[question.id] === index;
        const label = field(choice, radio, `${instance.id}-${question.id}-${index}`); label.className = "quiz-choice";
        radio.addEventListener("change", () => guarded(() => { commit({ answers: { ...data.answers, [question.id]: index }, checked: false }); showFeedback(); }));
        group.append(label);
      });
      form.append(group);
    }
    const actions = node("div", "mini-actions");
    const check = node("button", "button primary", "Check answers"); check.type = "submit";
    actions.append(check, button("Reset quiz", () => guarded(() => { commit(initialData(spec)); renderQuiz(); })));
    form.append(actions);
    form.addEventListener("submit", event => { event.preventDefault(); guarded(() => { commit({ answers: data.answers, checked: true }); showFeedback(); }); });
    content.append(form, feedback); showFeedback();
  }

  function renderInvoice() {
    content.replaceChildren();
    const currency = spec.config.currency;
    const money = minor => new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(minor / 100);
    const customer = input("text", false); customer.maxLength = 200; customer.value = data.customer;
    const customerForm = node("form", "mini-form");
    const saveCustomer = node("button", "button", "Save customer"); saveCustomer.type = "submit";
    customerForm.append(field("Customer", customer, `${instance.id}-customer`), saveCustomer);
    customerForm.addEventListener("submit", event => { event.preventDefault(); guarded(() => { commit({ ...data, customer: customer.value }); customer.value = data.customer; }); });
    content.append(customerForm);
    const form = node("form", "mini-form");
    const description = input("text"); description.maxLength = 300;
    const quantity = input("number"); quantity.min = "1"; quantity.max = "1000"; quantity.step = "1"; quantity.value = "1";
    const price = input("text"); price.inputMode = "decimal"; price.placeholder = "0.00"; price.maxLength = 12;
    const add = node("button", "button primary", "Add item"); add.type = "submit";
    form.append(field("Item", description, `${instance.id}-item`), field("Quantity", quantity, `${instance.id}-quantity`), field(`Unit price (${currency})`, price, `${instance.id}-price`), add);
    form.addEventListener("submit", event => {
      event.preventDefault(); guarded(() => {
        const amount = price.value.trim();
        if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount)) throw new Error("Enter a price with at most two decimal places.");
        const [whole, fraction = ""] = amount.split(".");
        const unitPriceMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        const item = { id: newId(), description: description.value.trim(), quantity: Number(quantity.value), unitPriceMinor };
        // The invoice line owns its fields; other app/form fields are never copied.
        commit({ customer: customer.value, items: [...data.items, item] }); renderInvoice();
      });
    });
    content.append(form);
    if (!data.items.length) { content.append(node("p", "empty", "Add an item to calculate the subtotal.")); return; }
    const scroller = node("div", "mini-table-scroll"); const table = node("table", "mini-table");
    const head = node("thead"); const header = node("tr");
    for (const name of ["Item", "Qty", "Unit price", "Amount", "Actions"]) header.append(node("th", "", name)); head.append(header); table.append(head);
    const body = node("tbody");
    for (const item of data.items) {
      const row = node("tr");
      row.append(node("td", "", item.description), node("td", "", item.quantity), node("td", "", money(item.unitPriceMinor)), node("td", "", money(item.unitPriceMinor * item.quantity)));
      const action = node("td"); action.append(button("Remove", () => guarded(() => { commit({ ...data, items: data.items.filter(line => line.id !== item.id) }); renderInvoice(); }), "text-button")); row.append(action); body.append(row);
    }
    table.append(body); scroller.append(table); content.append(scroller, node("p", "mini-total", `Subtotal: ${money(invoiceTotal(data))}`));
    content.append(node("p", "mini-description", "Draft calculation. Taxes, payment collection and invoice document export are not included."));
  }

  ({ tracker: renderTracker, quiz: renderQuiz, invoice: renderInvoice })[spec.kind]();
  return root;
}
