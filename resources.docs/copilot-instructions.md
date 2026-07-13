* **Token:** Always read G4_API_KEY from project-root .env (ask user if missing) and cache as token.
* **Open AI:** Always read OPENAI_API_KEY from project-root .env (ask user if missing) and cache as OPENAI_API_KEY.
* **Open AI:** Always read OPENAI_URI from project-root .env (ask user if missing) and cache as OPENAI_URI.
* **Open AI:** Always read OPENAI_MODEL from project-root .env (ask user if missing) and cache as OPENAI_MODEL.
* **Session:** If no driver_session, call start_g4_session with .env defaults: driver=ENV:WEB_DRIVER, driver_binaries=ENV:WEB_DRIVER_REPOSITORY, token=ENV:G4_API_KEY; save the returned session id.

* **Sequence (every call):**

  1. get_tools
  2. find_tool **must include** tool_name
  3. (get_locator|get_application_dom if needed)
  4. build inputs per schema **must ask user** for missing mandatory fields
  5. add token
  6. add driver_session (if not start_g4_session)
  7. call

* **Required params:** For all tools, inputs **must include** token.
* **Required params:** For all tools **except** start_g4_session, inputs **must include** driver_session.
* If the schema from find_tool does **not** define these fields, add them.
* **DOM discipline (page tools): For any tool that interacts with a page/UI:**:

  1. Call get_locator with { intent, action, hints, constraints, driver_session, token }.
  2. Use only the returned primary locator (or an explicit provided fallback). Never guess.
  3. **If OpenAI is available** (`OPENAI_API_KEY`, `OPENAI_URI`, `OPENAI_MODEL` exist):
     → Call `get_locator` and use **only** its returned primary locator.
     → Do **not** call `get_application_dom`.
  4. **If OpenAI is NOT available**:
     → Do **not** call `get_locator`.
     → Call `get_application_dom` `get_application_dom`** and use its returned DOM—following the **`policy`** field—to analyze the page and **deterministically derive the locator** (no guessing).
  5. **If no valid locator can be derived** (ambiguous/missing):
     → **Ask the user** to provide a locator (type in PascalCase + value) or a minimal DOM snippet.

* When calling `start_g4_rule`, if the rule definition includes `on_element`

  1. You **must also include** the `locator` field.
  2. `locator` **must explicitly declare the locator type**, not just the value.
  3. Locator type names **must be PascalCase** (e.g. `Xpath`, `CssSelector`, `Id`, `Name`, `ClassName`, `AccessibilityId`).
     * **DO NOT** `XPath`, `css`, `cssSelector`
     * **DO** `Xpath`, `CssSelector`
  4. If `locator` is missing, invalid, or ambiguously cased → **ask the user**. Do **not** guess.
  5. If the locator was produced by `get_locator` or derived from `get_application_dom`, **preserve the locator type exactly** (PascalCase).

* **Hard stop**: A `start_g4_rule` call that contains `on_element` **without** a valid `locator` is **invalid** and must **not** be executed.
* **Self-check before sending:** Verify: tool exists, inputs match schema, driver_session+token present (if required). If any check fails **fix or ask**—don’t call.
* **No guessing:** Never invent tool names, parameters, or locators. If policy/schema/DOM info is missing or ambiguous, ask the user.
