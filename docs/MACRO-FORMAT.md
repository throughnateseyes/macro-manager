# Macro format (2.2)

Written before any of the formatting or fill-in code, because v1 shipped Bold/Italic/Underline buttons on a field that only ever saved plain text ([AUDIT.md §4.2](AUDIT.md#4-ux-and-functionality)). Everything the editor offers has to exist here first.

## On disk

`macros.json` keeps the shape every earlier version wrote. Two optional keys are new:

```jsonc
{
  "prefix": "/",
  "snippets": [
    {
      "title": "Tour Confirmation",
      "abbr": "tour",
      "content": "Hi {field:Resident name},\n\nYour tour of **unit {field:Unit}** is on {date+2}.\n\n- Parking is on the street\n- [Directions](https://example.com/map)",
      "folder": "Leasing",          // optional, since 2.0
      "pinned": true,               // optional, since 2.1
      "format": "rich",             // optional, NEW: content is the Markdown subset below
      "fields": [                   // optional, NEW: settings for {field:…} tokens
        { "label": "Resident name" },
        { "label": "Unit", "choices": ["2A", "4B", "7C"] },
        { "label": "Agent", "default": "Nate" }
      ]
    }
  ]
}
```

- **`content` stays a string.** No HTML is ever stored. A macro without `format` is plain text and behaves exactly as it did in 2.1.
- **`format: "rich"`** is set the first time someone uses a formatting control on that macro, and can be switched back to plain in the editor. Existing macros are never converted, so a 2.1 macro that happens to contain `*` or `- ` keeps pasting those characters.
- **`fields`** only adds settings. The tokens in `content` are what make a field exist: a `{field:Unit}` typed by hand with no entry in `fields` is still asked for, with an empty box. An entry whose token was deleted is kept (so undo in the text box brings the field back whole) and simply never asked for.
- Older builds read the file fine. They ignore `format` and `fields`, and would paste `**` and `{field:Unit}` literally.

`lib/store.js` normalises both keys on every load and save: `format` is kept only when it is exactly `"rich"`; `fields` keeps entries with a valid label, trims everything, drops empty and duplicate choices, and is removed when empty.

## The formatting subset (`format: "rich"` only)

| Write | Pastes as (rich apps) | Pastes as (plain apps) |
|---|---|---|
| `**bold**` | **bold** | bold |
| `*italic*` | *italic* | italic |
| `[text](https://…)` | a link | text (https://…) |
| `- item` at the start of a line | bulleted list | - item |
| `1. item` at the start of a line | numbered list | 1. item |
| a blank line | a blank line | a blank line |
| `\*` | a literal * | * |

Links accept `http://`, `https://`, `mailto:` and `tel:` only; anything else stays as typed. Formatting doesn't cross line breaks. There is no underline (Markdown has none, and links already look underlined) and no nesting of lists.

## Fields

A field token is `{field:Label}`. Labels are 1–40 characters, no braces or line breaks, matched case-insensitively, so the same label twice in one macro is one question whose answer is used in both places.

Each `fields` entry is `{ label, default?, choices? }`:

- `default`: text pre-filled in the prompt.
- `choices`: 1–30 options. The prompt shows a menu instead of a text box, with `default` (if it's one of the choices) or else the first choice selected.

The last few answers per label are remembered on this device in `fields.json` (`{ "resident name": ["Jane Park", …] }`, newest first, five kept) and offered as suggestions in the prompt. They're never pre-filled: a remembered name in the wrong email is worse than an empty box.

## Expanding

One pure renderer, `lib/format.js` `renderExpansion(content, { format, values, clipboard, now })`, returns:

- `text`: plain text, markers stripped, links as "text (url)".
- `html`: only for `format: "rich"`. Inline `style` attributes only, no classes, no `font-family`, no colours, so the text takes the receiving app's own font. Each line is a `<div>` and a blank line is `<div><br></div>`, which is how Gmail and Outlook build their own messages; it avoids the extra paragraph spacing that `<p>` gets in Outlook.
- `cursorBack`: Left-arrow presses from the end to `{cursor}`.

Placeholders are resolved inside the parsed structure, never before it, so a `*` in your clipboard can't turn into italics and a `<` in a resident's name is escaped, not interpreted.

A plain macro writes `text/plain` only, exactly like 2.1. A rich macro writes **one** `ClipboardItem` holding both `text/plain` and `text/html`. Rich-text apps (Outlook, Zendesk, Gmail, Teams, Word, Notion) take the HTML; terminals, plain inputs and Excel take the text. The same applies to Quick Insert and the tray's Copy.

`{cursor}` is counted against what the rich app shows (list markers aren't characters there; each line is one press). When `{cursor}` sits above a list in a formatted macro, a plain-text app may land the caret two characters per list item off. Put `{cursor}` after lists, or keep that macro plain.

When a macro has fields, typing its abbreviation opens the fill-in prompt (the Quick Insert window) before anything is erased. Enter erases the abbreviation and pastes; Esc leaves what you typed alone. A macro with no fields expands exactly as before, with no prompt.
