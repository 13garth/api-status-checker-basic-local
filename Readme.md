# API Status Dashboard (File-Based)

A tiny, **serverless** status dashboard that you can run by simply opening `index.html`.  
Data is stored in a **JSON file** (`resources.json`) that you connect to and save into from the browser.

> **Important:** `resources.json` is **not included**.  
> Create it by copying `example_resources.json` → **rename the copy to** `resources.json` (same folder as `index.html`).  
> Then, in the app, click **Connect resources.json** and select that file.

No backend. No build step. Works offline.

---

## Features

- **File-based DB:** Uses `resources.json` as the “database”.
- **Add projects & environments:** Each project row can have many environments.
- **Status checks:** On load and on demand. Shows:
  - `UP` – HTTP OK (CORS allowed)
  - `DOWN` – HTTP error or network error
  - `UP? (opaque)` – Request returned but **CORS** hid the status
  - `Unknown` – Not checked yet
- **Save directly to file** (Chrome/Edge) via the **File System Access API**.
- **Import/Export** JSON fallback (Safari/Firefox).
- **Auto-backup** to `localStorage`.

---

## Project Files

| File | Purpose |
|---|---|
| `index.html` | The app UI. Open this file directly. |
| `script.js` | Logic: state, rendering, status checks, saving. |
| `resources.json` | **Your live data file. Not included by default.** Create by copying `example_resources.json`. Connect this in the UI. |
| `example_resources.json` | A sample you can copy from or import. |
| `styel.css` | Your CSS (paste a Bootswatch/Bootstrap theme). *(Name matches your file; keep it or rename and update the link.)* |
| `Readme.md` | This file. Project docs. |

> `index.html` links both `style.css` **and** `styel.css` as a convenience. You can standardize later; just keep the link consistent.

---

## Quick Start

1. **Create your data file:** Copy `example_resources.json` → rename to `resources.json` (same folder).
2. **Open** `index.html` in your browser (double-click is fine).
3. Click **“Connect resources.json”** and choose the `resources.json` you created.
4. **Add a project** (name + optional first environment).
5. Click **Save** after changes, or use **Export JSON** / **Import JSON**.
6. Use **Refresh Statuses** or per-row **Check** to re-ping.

### Browser Support

- **Chrome / Edge (desktop):** Full support, including **direct saving** to `resources.json`.
- **Safari / Firefox:** No direct writes. Use **Export/Import** to manage the JSON file.
- **Mobile:** Varies; use desktop for file operations.

---

## How Saving Works

- **Direct Save (preferred):**  
  Click **Connect resources.json** → pick your file → **Save** writes to it.  
  Uses the **File System Access API**. Grant **read/write** when asked.

- **Export / Import (fallback):**  
  Use **Export JSON** to download `resources.json`, and **Import JSON** to load one.

- **Local backup:**  
  State is mirrored to `localStorage` to survive reloads.

> Tip: If direct saving fails, you’ll see an error toast (e.g., permission denied, read-only folder).

---

## Status Checks (what the app does)

- For each environment URL, the app tries:
  1. **CORS fetch (real status):** If allowed by the API, you get the true HTTP status.
  2. **No-CORS fallback:** If CORS blocks it, a blind probe runs.  
     - If it returns, you see **“UP? (opaque)”** (reachable but status unknown).
     - If it fails, you see **DOWN**.

- **Timeouts:** Requests abort after ~10s.
- **Caching:** Disabled (`cache: "no-store"`).

> **Note:** Browsers cannot bypass **CORS**. If your API blocks cross-origin requests, enable CORS on your health endpoint, or accept the opaque result.

---

## Using the UI

- **Add project:** Use the top form. Each project renders as a table row.
- **Rename project:** Edit inline (click **Save** to write to file).
- **Add environment:** Use the “Add environment” row within a project.
- **Edit environment:** Change name/URL inline. Status resets to *Unknown* until re-checked.
- **Delete:** Use **Delete** on a project or environment row.
- **Check status:** Click **Check** at project level (all envs) or per env.

---

## Data Model (JSON)

`resources.json` has a single root object with a `projects` array:

```json
{
  "projects": [
    {
      "id": "p_xxxxxx",
      "name": "Project Name",
      "environments": [
        {
          "id": "e_xxxxxx",
          "name": "Production",
          "url": "https://api.example.com/health",
          "lastStatus": {
            "state": "unknown | up | down | opaque",
            "httpStatus": null,
            "checkedAt": null,
            "detail": null
          }
        }
      ]
    }
  ]
}
````

* IDs are generated (stable keys for UI updates).
* `lastStatus` updates after each check.

---

## Styling

* Paste any **Bootswatch** or **Bootstrap** CSS into `styel.css`.
* Uses standard Bootstrap classes (`table`, `btn`, `form-control`, etc.).
* Add your own overrides in `styel.css`.

---

## Troubleshooting

* **“Save” doesn’t write to file**

  * Use **Chrome/Edge**.
  * Click **Connect resources.json** and grant **write** permission.
  * Ensure the folder isn’t read-only (system folders, locked cloud drives).
  * If still blocked, use **Export/Import**.

* **All statuses show “UP? (opaque)”**

  * API is reachable but **CORS** blocks the response.
  * Enable CORS on the health endpoint, or accept opaque checks.

* **Opening via `file://`**

  * That’s fine. Some URLs may still show “opaque” due to CORS.

* **Renaming `style.css` / `styel.css`**

  * Keep the `<link>` in `index.html` pointing to the file you actually use.

---

## Design Notes (for devs)

* **State-driven UI:** Single `data` object → render functions rebuild rows (React-like pattern in vanilla JS).
* **Progressive enhancement:** File System Access API when available; Export/Import + `localStorage` otherwise.
* **Normalization:** Incoming JSON is sanitized to ensure required fields.
* **Abortable fetch:** `AbortController` prevents hanging calls.
* **CORS honesty:** Surfaces **opaque** instead of guessing.

---

## Extending (fast wins)

* Search & filters (by project/env/status).
* Tags/groups for projects.
* History per environment (uptime sparkline).
* Response time metrics & retries.
* Auto-refresh every N minutes.
* Auth/headers via a **CORS-enabled proxy**.
* Persist file handle (IndexedDB) so you don’t reconnect after reload.

---

## Security Notes

* 100% client-side. No data leaves your machine.
* Don’t put secrets in URLs. If auth is required, use a proxy you control and enable CORS.

---

## License

Use freely. MIT-style — do what you like.