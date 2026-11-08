# Module 2: Write an environment file

[⬅ Back to overview](README.md) · [⬅ Module 1](01-what-an-environment-is.md) · [Module 3 ➡](03-push-with-update-environment.md)

**Where you are:** Module 2 of 5

⏱️ **About 7 minutes**

Studio reads two kinds of environment file. A file that ends in `.json` is read as JSON. A file with any other extension is read as `KEY=value` lines. In this module you write one of each and learn the rules that decide whether a file is accepted.

In this module, you will:

- Write an environment as a JSON file
- Write an environment as a `KEY=value` file
- Know what makes Studio refuse a file
- Clear a value

---

## Step 1: Write a JSON environment

1. In the Explorer, right-click the `environments` folder and click **New File**.
2. Name it `Staging.json`.
3. Paste this text and save:

   ```json
   {
       "BaseUrl": "https://staging.example.com",
       "UserName": "tester",
       "Retries": "3"
   }
   ```

   ![The Staging.json file in the editor](images/02-staging-json.png)

   `TODO(screenshot)`: capture `Staging.json` open in the editor.

The rules for a `.json` file:

- It must hold **one JSON object**: names on the left, values on the right.
- The object must not be empty.
- **Write every value as text, inside quotes.** The Hub stores values as text. Studio sends the file as it is, so a bare number such as `3` or a `true` is not text. Write `"3"` and `"true"`.

---

## Step 2: Write a `KEY=value` environment

1. Create a second file in the same folder named `Qa.env`.
2. Paste this text and save:

   ```text
   # Values for the QA place
   BaseUrl=https://qa.example.com
   UserName=qa-tester
   Retries=3
   Password=
   ```

The rules for a file that does not end in `.json`:

| Rule | Example |
| --- | --- |
| One value per line, as `KEY=value` | `UserName=qa-tester` |
| The line is split at the **first** `=`, so a value may contain `=` | `Token=abc=def` stores `abc=def` |
| Space around the key and the value is removed | `UserName = qa-tester` stores `qa-tester` |
| A line that starts with `#` is a comment and is ignored | `# Values for the QA place` |
| Blank lines are ignored | |
| A line without an `=`, or with nothing before the `=`, is ignored | `just some text` |
| `KEY=` with nothing after it stores an **empty value** | `Password=` |

A leading byte-order mark, which some editors add at the start of a file, is removed.

---

## Step 3: Know what Studio refuses

When you upload (module 3), Studio checks each file first. A file it cannot use is reported by name, and the other environments you picked are still uploaded.

| Message | What it means | Fix |
| --- | --- | --- |
| `The file cannot be read: <reason>` | The file is missing or locked | Check the path and the permissions |
| `The file is not valid JSON: <reason>` | A `.json` file has a syntax error, such as a missing comma | Fix the JSON. The reason names the problem |
| `The file must hold one JSON object of parameter names and values.` | The JSON is a list, a number, or text, not an object | Wrap the values in `{ ... }` |
| `The JSON object is empty.` | The object has no names | Add at least one value |
| `The file has no KEY=value lines.` | A file that is not `.json` holds nothing Studio can read | Add `KEY=value` lines |

An empty result is refused on purpose, so a wrong file is never uploaded as an empty environment.

---

## Step 4: Clear a value

An upload **adds and replaces** values. It does not remove values that the file leaves out (module 3). To clear a value without deleting it:

- In a `KEY=value` file, write `KEY=` with nothing after the `=`.
- In a JSON file, write `"KEY": ""`.

The value is then stored as an empty text.

---

## Step 5: Keep secrets out of Git

An environment file holds real addresses and, often, passwords. If your project is in Git, add the files that hold secrets to `.gitignore`, or keep the secret values in a separate file that stays on your machine.

---

## ✔ Check your work

- [ ] `Staging.json` holds an object with text values in quotes
- [ ] `Qa.env` holds `KEY=value` lines and one comment
- [ ] You can name two things that make Studio refuse a file
- [ ] You know how to store an empty value

---

**Next up** 👉 [Module 3: Push with Update-Environment](03-push-with-update-environment.md)
