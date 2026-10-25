// ---------------------------------------------------------------------------
// The fill-in form: one row per field of a macro. Shared by the Quick Insert
// window (the prompt you see when a macro with fields expands) and the
// editor's Try it box. Needs lib/fields.js loaded first.
//
//   createFillForm({ macro, memory, onChange, onSubmit, onCancel })
//     → { el, focus(), values() }
//
// Enter submits, Esc cancels, Tab moves between fields (and wraps).
// ---------------------------------------------------------------------------
function createFillForm({ macro, memory = {}, onChange = () => {}, onSubmit = () => {}, onCancel = () => {} }) {
  const fields = fieldsFor(macro);
  const values = initialValues(fields);
  const form = document.createElement('form');
  form.className = 'fill-form';
  form.autocomplete = 'off';
  const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  fields.forEach((f, n) => {
    const id = `fill-${n}`;
    const row = document.createElement('div');
    row.className = 'fill-row';
    const recent = (Array.isArray(memory[f.key]) ? memory[f.key] : []).filter((v) => v !== values[f.key]);
    row.innerHTML = f.choices
      ? `<label for="${id}">${escAttr(f.label)}</label>
         <span class="select"><select id="${id}">${f.choices.map((c) => `<option${c === values[f.key] ? ' selected' : ''}>${escAttr(c)}</option>`).join('')}</select></span>`
      : `<label for="${id}">${escAttr(f.label)}</label>
         <input id="${id}" type="text" value="${escAttr(values[f.key])}" spellcheck="true"${recent.length ? ` list="${id}-recent"` : ''} />
         ${recent.length ? `<datalist id="${id}-recent">${recent.map((v) => `<option value="${escAttr(v)}">`).join('')}</datalist>` : ''}`;
    const input = row.querySelector('input, select');
    input.dataset.key = f.key;
    input.addEventListener(f.choices ? 'change' : 'input', () => { values[f.key] = input.value; onChange({ ...values }); });
    form.append(row);
  });

  const inputs = () => [...form.querySelectorAll('input, select')];
  form.addEventListener('submit', (e) => { e.preventDefault(); onSubmit({ ...values }); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
    // Enter on a pick-list would open it on Windows; submit instead.
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); onSubmit({ ...values }); return; }
    if (e.key === 'Tab') {
      const list = inputs();
      const at = list.indexOf(document.activeElement);
      const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at + 1) % list.length;
      e.preventDefault();
      list[next].focus();
      if (list[next].select) list[next].select();
    }
  });

  return {
    el: form,
    fields,
    values: () => ({ ...values }),
    focus() {
      const first = inputs()[0];
      if (!first) return;
      first.focus();
      if (first.select) first.select();
    },
  };
}
