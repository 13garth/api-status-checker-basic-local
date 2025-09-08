/* ============================================================
   API Status Dashboard — Pure client-side, file-based “DB”
   (Improved saving with explicit permissions + visible errors)
   ============================================================ */

(function () {
  "use strict";

  /*** ---------- State ---------- ***/
  /** @type {{projects: Array}} */
  let data = { projects: [] };

  /** @type {FileSystemFileHandle|null} */
  let fileHandle = null;

  let saveTimer = null;

  /*** ---------- Elements ---------- ***/
  const el = {
    warnings: document.getElementById("supportWarnings"),
    tbody: document.getElementById("projectsTbody"),
    addProjectForm: document.getElementById("addProjectForm"),
    projectName: document.getElementById("projectName"),
    firstEnvName: document.getElementById("firstEnvName"),
    firstEnvUrl: document.getElementById("firstEnvUrl"),
    btnConnectFile: document.getElementById("btnConnectFile"),
    btnSave: document.getElementById("btnSave"),
    btnExport: document.getElementById("btnExport"),
    btnImport: document.getElementById("btnImport"),
    fileImportInput: document.getElementById("fileImportInput"),
    btnRefreshStatuses: document.getElementById("btnRefreshStatuses"),
    envRowTemplate: document.getElementById("envRowTemplate")
  };

  /*** ---------- Utilities ---------- ***/
  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sanitizeUrl(s) {
    try {
      const u = new URL(s);
      return u.toString();
    } catch {
      return s.trim();
    }
  }

  function infoBadge(text, color) {
    const cls = {
      green: "bg-success",
      red: "bg-danger",
      yellow: "bg-warning text-dark",
      gray: "bg-secondary",
      blue: "bg-primary"
    }[color] || "bg-secondary";
    return `<span class="badge ${cls}">${text}</span>`;
  }

  function minutesAgo(iso) {
    if (!iso) return "";
    const delta = (Date.now() - new Date(iso).getTime()) / 60000;
    return `${Math.round(delta)}m ago`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(msg, type = "info") {
    // Minimal, non-intrusive messages using the warnings area.
    const cls = {
      info: "alert-secondary",
      success: "alert-success",
      warn: "alert-warning",
      error: "alert-danger"
    }[type] || "alert-secondary";
    const box = document.createElement("div");
    box.className = `alert ${cls} py-2 my-2`;
    box.innerHTML = msg;
    el.warnings.prepend(box);
    setTimeout(() => box.remove(), 4000);
    console.log(`[${type}] ${msg.replace(/<[^>]+>/g, "")}`);
  }

  /*** ---------- Persistence ---------- ***/
  async function tryLoadResourcesJson() {
    try {
      const res = await fetch(`resources.json?ts=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object") {
          data = normalizeData(json);
          return true;
        }
      }
    } catch {}
    return false;
  }

  function tryLoadFromLocalStorage() {
    try {
      const raw = localStorage.getItem("status_dashboard_data");
      if (!raw) return false;
      const json = JSON.parse(raw);
      data = normalizeData(json);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeData(json) {
    const d = { projects: Array.isArray(json.projects) ? json.projects : [] };
    d.projects.forEach(p => {
      p.id = p.id || uid("p");
      p.name = p.name || "Untitled Project";
      p.environments = Array.isArray(p.environments) ? p.environments : [];
      p.environments.forEach(e => {
        e.id = e.id || uid("e");
        e.name = e.name || "Environment";
        e.url = e.url || "";
        e.lastStatus = e.lastStatus || {
          state: "unknown",
          httpStatus: null,
          checkedAt: null,
          detail: null
        };
      });
    });
    return d;
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (fileHandle) {
        try {
          await saveToConnectedFile();
          // fall through to local backup
        } catch (e) {
          // If direct save fails, at least keep local backup
          toast(`Auto-save failed: ${escapeHtml(e.message || e.name || String(e))}`, "error");
        }
      }
      try {
        localStorage.setItem("status_dashboard_data", JSON.stringify(data));
      } catch {}
    }, 500);
  }

  async function ensureWritePermission() {
    if (!fileHandle) return false;
    try {
      const cur = await fileHandle.queryPermission({ mode: "readwrite" });
      if (cur === "granted") return true;
      const res = await fileHandle.requestPermission({ mode: "readwrite" });
      return res === "granted";
    } catch {
      // Some implementations throw; try to proceed and catch on write
      return true;
    }
  }

  async function saveToConnectedFile() {
    if (!fileHandle) {
      alert("Connect resources.json first (top-left button).");
      return;
    }
    const ok = await ensureWritePermission();
    if (!ok) {
      throw new Error("Write permission denied. Please allow write access when prompted.");
    }
    try {
      const writable = await fileHandle.createWritable();
      // Ensure overwrite in place
      await writable.truncate(0);
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      toast("Saved to connected file.", "success");
    } catch (e) {
      // Common: NotAllowedError (denied), NoModificationAllowedError (read-only folder)
      throw e;
    }
  }

  function exportJsonDownload() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resources.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function connectResourcesFile() {
    if (!window.showOpenFilePicker) {
      alert("Your browser does not support direct file saving. Use Export/Import instead (Chrome/Edge recommended).");
      return;
    }
    try {
      const [handle] = await showOpenFilePicker({
        multiple: false,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
      });
      fileHandle = handle;

      // Read existing data from chosen file
      const file = await fileHandle.getFile();
      const text = await file.text();
      const json = JSON.parse(text);
      data = normalizeData(json);
      render();
      updateConnectedUi();
      toast(`Connected to <code>${escapeHtml(file.name)}</code>`, "success");

      // Warm up permissions
      await ensureWritePermission();
    } catch (e) {
      if (e && e.name !== "AbortError") {
        toast(`Failed to connect file: ${escapeHtml(e.message || e.name)}`, "error");
        console.error(e);
      }
    }
  }

  function updateConnectedUi() {
    if (fileHandle) {
      el.btnConnectFile.classList.remove("btn-primary");
      el.btnConnectFile.classList.add("btn-outline-primary");
      el.btnConnectFile.textContent = `Connected: ${fileHandle.name || "resources.json"}`;
    } else {
      el.btnConnectFile.classList.add("btn-primary");
      el.btnConnectFile.classList.remove("btn-outline-primary");
      el.btnConnectFile.textContent = "Connect resources.json";
    }
  }

  /*** ---------- Status checks ---------- ***/
  async function checkAllStatuses() {
    const promises = [];
    data.projects.forEach(p => {
      p.environments.forEach(env => {
        promises.push(checkOneEnvStatus(env).then(() => {
          renderProjectRow(p.id);
          queueSave();
        }));
      });
    });
    // Let them run; errors are handled per-env
    Promise.allSettled(promises);
  }

  async function checkOneEnvStatus(env) {
    const url = sanitizeUrl(env.url || "");
    if (!url) {
      env.lastStatus = { state: "unknown", httpStatus: null, checkedAt: nowIso(), detail: "No URL" };
      return;
    }
    const timeoutMs = 10000;
    try {
      const res = await fetchWithTimeout(url, { method: "GET", mode: "cors", cache: "no-store" }, timeoutMs);
      env.lastStatus = {
        state: res.ok ? "up" : "down",
        httpStatus: res.status,
        checkedAt: nowIso(),
        detail: res.ok ? "CORS OK" : `HTTP ${res.status}`
      };
      return;
    } catch {
      // Fall back to opaque probe
      try {
        await fetchWithTimeout(url, { method: "GET", mode: "no-cors", cache: "no-store" }, Math.min(timeoutMs, 6000));
        env.lastStatus = {
          state: "opaque",
          httpStatus: null,
          checkedAt: nowIso(),
          detail: "CORS blocked (opaque). Consider enabling CORS or using a proxy."
        };
      } catch {
        env.lastStatus = {
          state: "down",
          httpStatus: null,
          checkedAt: nowIso(),
          detail: "Network error or blocked"
        };
      }
    }
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
    return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
  }

  /*** ---------- Rendering ---------- ***/
  function render() {
    const rows = data.projects.map(p => renderProjectRowHtml(p)).join("");
    el.tbody.innerHTML = rows;
    bindProjectRowEvents();
  }

  function renderProjectRow(projectId) {
    const idx = data.projects.findIndex(p => p.id === projectId);
    if (idx < 0) return;
    const p = data.projects[idx];
    const tr = el.tbody.querySelector(`tr[data-pid="${projectId}"]`);
    if (!tr) return;
    const html = renderProjectRowHtml(p);
    const tmp = document.createElement("tbody");
    tmp.innerHTML = html;
    const fresh = tmp.firstElementChild;
    tr.replaceWith(fresh);
    bindProjectRowEventsFor(projectId);
  }

  function renderProjectRowHtml(p) {
    const envTable = `
      <table class="table table-sm mb-2">
        <thead>
          <tr>
            <th style="width: 10rem;">Env</th>
            <th>URL</th>
            <th style="width: 10rem;">Status</th>
            <th style="width: 8rem;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${p.environments.map(e => renderEnvRowHtml(e)).join("")}
          ${renderAddEnvRowHtml(p.id)}
        </tbody>
      </table>
    `;
    return `
      <tr data-pid="${p.id}">
        <td>
          <input class="form-control form-control-sm project-name-input" value="${escapeHtml(p.name)}" />
        </td>
        <td>${envTable}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary btn-check-project">Check</button>
          <button class="btn btn-sm btn-outline-danger btn-delete-project">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderEnvRowHtml(e) {
    const st = e.lastStatus || { state: "unknown" };
    let badge = infoBadge("Unknown", "gray");
    if (st.state === "up") badge = infoBadge(`UP ${st.httpStatus ?? ""}`, "green");
    if (st.state === "down") badge = infoBadge("DOWN", "red");
    if (st.state === "opaque") badge = infoBadge("UP? (opaque)", "yellow");

    return `
      <tr data-eid="${e.id}">
        <td><input class="form-control form-control-sm env-name-input" value="${escapeHtml(e.name || "")}"></td>
        <td><input class="form-control form-control-sm env-url-input" value="${escapeHtml(e.url || "")}"></td>
        <td>
          ${badge}
          <div class="small text-muted">${st.checkedAt ? minutesAgo(st.checkedAt) : ""}</div>
        </td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary btn-check-env">Check</button>
          <button class="btn btn-sm btn-outline-danger btn-delete-env">Delete</button>
        </td>
      </tr>
    `;
  }

  function renderAddEnvRowHtml(projectId) {
    return `
      <tr class="table-light">
        <td><input class="form-control form-control-sm new-env-name" placeholder="Add environment e.g. Staging"></td>
        <td><input class="form-control form-control-sm new-env-url" placeholder="https://staging.example.com/health"></td>
        <td></td>
        <td><button class="btn btn-sm btn-primary btn-add-env" data-pid="${projectId}">Add</button></td>
      </tr>
    `;
  }

  function bindProjectRowEvents() {
    data.projects.forEach(p => bindProjectRowEventsFor(p.id));
  }

  function bindProjectRowEventsFor(projectId) {
    const row = el.tbody.querySelector(`tr[data-pid="${projectId}"]`);
    if (!row) return;

    // Project name change
    const nameInput = row.querySelector(".project-name-input");
    nameInput.addEventListener("change", () => {
      const p = data.projects.find(pp => pp.id === projectId);
      p.name = nameInput.value.trim() || "Untitled Project";
      queueSave();
    });

    // Project: delete
    const delBtn = row.querySelector(".btn-delete-project");
    delBtn.addEventListener("click", () => {
      if (!confirm("Delete this project and all its environments?")) return;
      data.projects = data.projects.filter(pp => pp.id !== projectId);
      render();
      queueSave();
    });

    // Project: check all envs
    const checkBtn = row.querySelector(".btn-check-project");
    checkBtn.addEventListener("click", async () => {
      const p = data.projects.find(pp => pp.id === projectId);
      for (const env of p.environments) {
        await checkOneEnvStatus(env);
        renderProjectRow(projectId);
        queueSave();
      }
    });

    // Environments within the project row
    row.querySelectorAll("tr[data-eid]").forEach(envTr => {
      const eid = envTr.getAttribute("data-eid");
      const p = data.projects.find(pp => pp.id === projectId);
      const env = p.environments.find(ee => ee.id === eid);

      const nameInput = envTr.querySelector(".env-name-input");
      nameInput.addEventListener("change", () => {
        env.name = nameInput.value.trim() || "Environment";
        queueSave();
      });

      const urlInput = envTr.querySelector(".env-url-input");
      urlInput.addEventListener("change", () => {
        env.url = sanitizeUrl(urlInput.value);
        env.lastStatus = { state: "unknown", httpStatus: null, checkedAt: null, detail: null };
        queueSave();
      });

      envTr.querySelector(".btn-delete-env").addEventListener("click", () => {
        if (!confirm("Remove this environment?")) return;
        p.environments = p.environments.filter(ee => ee.id !== eid);
        renderProjectRow(projectId);
        queueSave();
      });

      envTr.querySelector(".btn-check-env").addEventListener("click", async () => {
        await checkOneEnvStatus(env);
        renderProjectRow(projectId);
        queueSave();
      });
    });

    // Add environment row
    const addBtn = row.querySelector(".btn-add-env");
    const newName = row.querySelector(".new-env-name");
    const newUrl = row.querySelector(".new-env-url");
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const p = data.projects.find(pp => pp.id === projectId);
      const env = {
        id: uid("e"),
        name: (newName.value || "Environment").trim(),
        url: sanitizeUrl(newUrl.value || ""),
        lastStatus: { state: "unknown", httpStatus: null, checkedAt: null, detail: null }
      };
      p.environments.push(env);
      newName.value = "";
      newUrl.value = "";
      renderProjectRow(projectId);
      queueSave();
    });
  }

  /*** ---------- Events (global controls) ---------- ***/
  function bindGlobalEvents() {
    el.addProjectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = (el.projectName.value || "").trim() || "Untitled Project";
      const p = {
        id: uid("p"),
        name,
        environments: []
      };
      const envName = (el.firstEnvName.value || "").trim();
      const envUrl = (el.firstEnvUrl.value || "").trim();
      if (envName || envUrl) {
        p.environments.push({
          id: uid("e"),
          name: envName || "Environment",
          url: sanitizeUrl(envUrl),
          lastStatus: { state: "unknown", httpStatus: null, checkedAt: null, detail: null }
        });
      }
      data.projects.push(p);
      el.projectName.value = "";
      el.firstEnvName.value = "";
      el.firstEnvUrl.value = "";
      render();
      queueSave();
    });

    el.btnExport.addEventListener("click", exportJsonDownload);

    el.btnSave.addEventListener("click", async () => {
      try {
        await saveToConnectedFile();
      } catch (e) {
        toast(`Save failed: <code>${escapeHtml(e.message || e.name || String(e))}</code>`, "error");
        console.error(e);
      }
    });

    el.btnConnectFile.addEventListener("click", () => connectResourcesFile().catch(console.error));

    el.btnImport.addEventListener("click", () => el.fileImportInput.click());
    el.fileImportInput.addEventListener("change", async () => {
      const file = el.fileImportInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        data = normalizeData(json);
        render();
        queueSave();
        toast("Imported JSON", "success");
      } catch (e) {
        alert("Failed to import JSON. See console for details.");
        console.error(e);
      } finally {
        el.fileImportInput.value = "";
      }
    });

    el.btnRefreshStatuses.addEventListener("click", checkAllStatuses);
  }

  /*** ---------- Init ---------- ***/
  async function init() {
    const supportsFSA = !!window.showOpenFilePicker;
    const hints = [];
    if (!supportsFSA) hints.push("Direct saving to <code>resources.json</code> is unavailable in this browser. Use Export/Import (Chrome/Edge recommended).");
    if (location.protocol === "file:") hints.push("Running from <code>file://</code>. Some URLs may show “opaque” due to CORS.");
    el.warnings.innerHTML = hints.length ? `<div class="alert alert-warning mt-2">${hints.join("<br/>")}</div>` : "";

    let loaded = await tryLoadResourcesJson();
    if (!loaded) loaded = tryLoadFromLocalStorage();
    if (!loaded) data = normalizeData({ projects: [] });

    render();
    bindGlobalEvents();
    updateConnectedUi();
    checkAllStatuses();
  }

  // Start
  init();
})();
