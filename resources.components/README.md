# G4 webview components

The webview pages of the extension (the flow publisher, the template publisher, the settings editor, and the report) are
built from reusable components. Each component is a complete unit in its own folder: its markup,
styles, icons, and behavior.

## Folder layout

| Folder | What it is |
| --- | --- |
| `automation-flow-publisher/` | The flow publisher page. |
| `automation-template-publisher/` | The template publisher page. |
| `automation-settings/` | The settings editor page. |
| `automation-report/` | The report page. |
| `g4-*/` | Reusable components, used by the pages and by each other. |

Every component folder holds six files named after the component:

| File | Holds |
| --- | --- |
| `g4-name.html` | One or more `<template>` elements with the markup and the embedded SVG icons. |
| `g4-name.js` | The custom element `<g4-name>`, in an IIFE so nothing leaks into the page. |
| `g4-name.css` | Imports the three files below, in this order. |
| `g4-name.parameters.css` | `--g4-name-*` custom properties, mapped to VS Code theme variables. |
| `g4-name.layout.css` | Display, box model, sizing, spacing, and border width and style. |
| `g4-name.visual.css` | Colors, fonts, border colors, radius, shadows, and visual states. |

## Components

| Component | Purpose | Builds on |
| --- | --- | --- |
| `g4-page-header` | Page title, details line, and optional items on the right. | |
| `g4-action-bar` | Sticky bottom bar: action buttons and a note that fades out. | |
| `g4-section` | Foldable page section with a description, warning, and status line. | |
| `g4-card` | Foldable item card with move up, move down, and trash buttons. | |
| `g4-card-list` | Stack of cards with an add button; reports moves and removals. | `g4-card` |
| `g4-notice-list` | Banners, or warning lines that can be pressed. | |
| `g4-field` | Label, required `*`, hint, and error line around one control. | |
| `g4-text-input` | Text or URL box; a URL box is checked while typing. | |
| `g4-number-input` | Number box with themed steppers. | |
| `g4-secret-input` | Masked box with a show/hide button. | |
| `g4-path-input` | Folder path box with Browse and an optional detect button. | |
| `g4-select` | Themed dropdown, optionally followed by buttons. | |
| `g4-toggle` | On/off switch with a label and hint. | |
| `g4-busy-button` | Button that shows a spinning icon while its work runs. | |
| `g4-list-editor` | Text entries with add, trash, and optional move buttons. | |
| `g4-key-value-editor` | Key/value entries with add and trash buttons. | |
| `g4-json-textarea` | Numbered JSON box with Format and Expand. | `g4-line-numbers`, `g4-expand-editor` |
| `g4-markdown-textarea` | Numbered Markdown box with a Markdown reference and Expand. | `g4-line-numbers`, `g4-expand-editor`, `g4-modal` |
| `g4-code-textarea` | Numbered plain text box (scripts) with Expand. | `g4-line-numbers`, `g4-expand-editor` |
| `g4-expand-editor` | Large text editor in a modal. | `g4-modal`, `g4-line-numbers` |
| `g4-line-numbers` | Line-number gutter beside a text box. | |
| `g4-modal` | Centered dialog with a round Close button; Escape closes the top one. | |

The header comment of every `g4-*.js` file lists the component's attributes, properties, methods,
and events.

## How a page uses components

A page lists the components it uses in a meta tag and holds three placeholders:

```html
<head>
    <meta name="g4-components" content="g4-section g4-field g4-text-input">
    {{$ components.styles }}
    <link rel="stylesheet" href="{{$ component.style.uri }}">
</head>
<body>
    ...
    {{$ components.templates }}
    {{$ components.scripts }}
    <script src="{{$ component.script.uri }}"></script>
</body>
```

The extension fills the placeholders with `WebviewComponents.setComponentHtml`
(`src/extensions/webview-components.ts`). It adds the components the page lists and every component
those build on (from the `data-dependencies` attribute of the component's first template), each
once, after the components it depends on. Fill the component placeholders before injecting page
data, so the data is never searched for placeholders.

The page then writes component tags into its markup:

```html
<g4-field hint="The computer running G4." label="Engine Address">
    <g4-text-input data-path="g4Server.host" test-id="engine-address" value="localhost"></g4-text-input>
</g4-field>
```

## Component rules

- **Behavior:** a component renders once, in `connectedCallback`, into the light DOM (no shadow DOM),
  so the page's font and VS Code theme variables apply and tests can find every part. A component
  that is moved in the page keeps what it rendered.
- **Data in:** attributes, the element's children or text content, and properties (`value`,
  `open`, `error`, and so on).
- **Data out:** bubbling custom events, such as `g4-input` and `g4-change` with `{ value }`,
  `g4-error` with `{ message }`, and `g4-action` with `{ id }`. Pages listen once, on a container,
  and read `data-*` attributes they put on the component (for example `data-path`) to know what
  changed.
- **Errors:** controls report their own checks through `g4-error`, and `<g4-field>` shows them. A page
  sets its own errors (required fields, server messages) through the field's `error` property.
- **Test ids:** every part's `data-test-id` is the component's `test-id` attribute followed by the
  part name, for example `summary-markdown-textarea-expand-button`.
- **Icons:** every component embeds the SVG icons it shows; icons are not shared between components.
- **Styles:** a component's layout and visual files read only its own `--g4-name-*` parameters.

## Adding a component

1. Create `resources.components/g4-name/` with the six files above.
2. List the components it builds on in `data-dependencies` on its first `<template>`.
3. Register the element with `customElements.define('g4-name', ...)`, guarded by
   `customElements.get`.
4. Document its contract in the header comment of `g4-name.js`.
5. Add `g4-name` to the `g4-components` meta tag of every page that uses it.
