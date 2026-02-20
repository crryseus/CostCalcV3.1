let state = {
  project: null,
  dirty: false,
  panelOpen: true
};

const $ = (id) => document.getElementById(id);

function markDirty(){
  state.dirty = true;
  $("stickySaved").textContent = "Unsaved";
  $("stickySaved").style.background = "rgba(174,32,18,0.10)";
}

let saveTimer = null;
function scheduleSave(){
  markDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if(state.project){
      upsertProject(state.project);
      state.dirty = false;
      $("stickySaved").textContent = "Saved";
      $("stickySaved").style.background = "rgba(221,184,146,0.20)";
      refreshProjectSelect();
    }
  }, 350);
}

function refreshProjectSelect(){
  const projects = getAllProjects();
  const sel = $("projectSelect");
  const active = state.project?.id || getActiveProjectId();

  sel.innerHTML = projects.map(p => {
    const name = (p.name || "Untitled").replace(/</g,"&lt;");
    return `<option value="${p.id}" ${p.id===active?"selected":""}>${name}</option>`;
  }).join("");
}

function loadProject(id){
  const p = getProjectById(id);
  if(!p) return;
  state.project = p;
  setActiveProjectId(p.id);
  state.dirty = false;

  // Fill UI controls
  $("projectName").value = p.name || "";
  $("clientName").value = p.client || "";
  $("projectLocation").value = p.location || "";

  $("laborMode").value = p.laborMode || "percent";
  $("laborPercent").value = p.laborPercent ?? 0;

  $("distanceKm").value = p.logistics?.distanceKm ?? 0;
  $("costPerKm").value = p.logistics?.costPerKm ?? 0;
  $("deliveries").value = p.logistics?.deliveries ?? 1;
  $("tollFees").value = p.logistics?.tollFees ?? 0;
  $("helperFee").value = p.logistics?.helperFee ?? 0;

  $("ohRent").value = p.overhead?.rent ?? 0;
  $("ohElectric").value = p.overhead?.electric ?? 0;
  $("ohAdmin").value = p.overhead?.admin ?? 0;
  $("ohAmort").value = p.overhead?.amort ?? 0;
  $("ohMisc").value = p.overhead?.misc ?? 0;
  $("ohHoursMonth").value = p.overhead?.hoursMonth ?? 160;
  $("projectHours").value = p.overhead?.projectHours ?? 0;

  $("contractorMode").value = p.contractor?.mode ?? "none";
  $("contractorValue").value = p.contractor?.value ?? 0;

  $("contingencyPct").value = p.contingencyPct ?? 0;
  $("markupPct").value = p.markupPct ?? 0;

  $("stickyProjectName").textContent = p.name || "—";
  $("stickySaved").textContent = "Saved";
  $("stickySaved").style.background = "rgba(221,184,146,0.20)";

  renderRows();
  recalcAndRender();
}

function newProject(){
  const p = defaultProject();
  upsertProject(p);
  setActiveProjectId(p.id);
  refreshProjectSelect();
  loadProject(p.id);
}

function duplicateProject(){
  if(!state.project) return;
  const src = state.project;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = (src.name || "Project") + " (Copy)";
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = new Date().toISOString();
  copy.rows = (copy.rows || []).map(r => ({...r, id: uid()}));
  upsertProject(copy);
  setActiveProjectId(copy.id);
  refreshProjectSelect();
  loadProject(copy.id);
}

function deleteCurrentProject(){
  if(!state.project) return;
  const ok = confirm("Delete this project? This cannot be undone.");
  if(!ok) return;
  deleteProject(state.project.id);
  const nextId = getActiveProjectId() || getAllProjects()[0]?.id;
  refreshProjectSelect();
  if(nextId) loadProject(nextId);
  else newProject();
}

/* Rows UI */
function renderRows(){
  const tbody = $("rowsBody");
  const filter = $("filterCategory").value || "ALL";
  const rows = state.project?.rows || [];
  const view = filter === "ALL" ? rows : rows.filter(r => r.category === filter);

  tbody.innerHTML = view.map(r => rowHtml(r)).join("");

  // Stats
  $("statRows").textContent = String(rows.length);
  $("statActive").textContent = String(rows.filter(x => x.use !== false).length);

  // Bind events
  view.forEach(r => {
    bindRowEvents(r.id);
  });
}

function rowHtml(r){
  const safe = (s) => String(s ?? "").replace(/</g,"&lt;");
  const checked = (r.use !== false) ? "checked" : "";
  const sub = rowSubtotal(r);

  return `
  <tr data-id="${r.id}">
    <td><input class="cellCheck" type="checkbox" ${checked} data-field="use"/></td>

    <td>
      <select class="cellInput" data-field="category">
        ${["Materials","Accessories","Utilities","Labor"].map(c => `<option value="${c}" ${r.category===c?"selected":""}>${c}</option>`).join("")}
      </select>
    </td>

    <td><input class="cellInput" value="${safe(r.item)}" data-field="item" placeholder="Item name"/></td>
    <td><input class="cellInput" value="${safe(r.unit)}" data-field="unit" placeholder="Unit (LM, SQM, pcs)"/></td>

    <td><input class="cellInput right" type="number" step="0.01" min="0" value="${n(r.cost)}" data-field="cost"/></td>
    <td><input class="cellInput right" type="number" step="0.01" min="0" value="${n(r.qty)}" data-field="qty"/></td>
    <td><input class="cellInput right" type="number" step="0.01" min="0" value="${n(r.wastePct)}" data-field="wastePct"/></td>

    <td class="right"><strong>${money(sub)}</strong></td>

    <td class="colActions right">
      <button class="iconBtn" title="Duplicate row" data-action="dup">⧉</button>
      <button class="iconBtn danger" title="Delete row" data-action="del">✕</button>
    </td>
  </tr>`;
}

function bindRowEvents(rowId){
  const tr = document.querySelector(`tr[data-id="${rowId}"]`);
  if(!tr) return;

  tr.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("input", () => onRowChange(rowId, el));
    el.addEventListener("change", () => onRowChange(rowId, el));
  });

  tr.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if(action === "del") deleteRow(rowId);
      if(action === "dup") duplicateRow(rowId);
    });
  });
}

function onRowChange(rowId, el){
  if(!state.project) return;
  const field = el.getAttribute("data-field");
  const row = state.project.rows.find(r => r.id === rowId);
  if(!row) return;

  if(field === "use"){
    row.use = el.checked;
  } else if(field === "cost" || field === "qty" || field === "wastePct"){
    row[field] = n(el.value);
  } else {
    row[field] = el.value;
  }

  scheduleSave();
  // Re-render just totals + row subtotal by re-rendering table (simpler + safe)
  renderRows();
  recalcAndRender();
}

function addRow(prefill = null){
  if(!state.project) return;
  const r = {
    id: uid(),
    use: true,
    category: prefill?.category || "Materials",
    item: prefill?.item || "",
    unit: prefill?.unit || "",
    cost: n(prefill?.cost),
    qty: n(prefill?.qty),
    wastePct: n(prefill?.wastePct)
  };
  state.project.rows.push(r);
  scheduleSave();
  renderRows();
  recalcAndRender();
}

function duplicateRow(rowId){
  if(!state.project) return;
  const row = state.project.rows.find(r => r.id === rowId);
  if(!row) return;
  const copy = {...row, id: uid(), item: (row.item || "") + " (copy)"};
  const idx = state.project.rows.findIndex(r => r.id === rowId);
  state.project.rows.splice(idx + 1, 0, copy);
  scheduleSave();
  renderRows();
  recalcAndRender();
}

function deleteRow(rowId){
  if(!state.project) return;
  const idx = state.project.rows.findIndex(r => r.id === rowId);
  if(idx < 0) return;
  state.project.rows.splice(idx, 1);
  scheduleSave();
  renderRows();
  recalcAndRender();
}

/* Controls binding */
function bindControls(){
  // Project select
  $("projectSelect").addEventListener("change", (e) => loadProject(e.target.value));

  $("btnNew").addEventListener("click", newProject);
  $("btnDuplicate").addEventListener("click", duplicateProject);
  $("btnDelete").addEventListener("click", deleteCurrentProject);

  $("btnAddRow").addEventListener("click", () => addRow());
  $("btnAddFromLibrary").addEventListener("click", () => openLibraryPicker());

  $("filterCategory").addEventListener("change", () => renderRows());

  // Project info
  $("projectName").addEventListener("input", (e) => {
    state.project.name = e.target.value || "Untitled";
    $("stickyProjectName").textContent = state.project.name || "—";
    scheduleSave();
    refreshProjectSelect();
    recalcAndRender();
  });
  $("clientName").addEventListener("input", (e) => { state.project.client = e.target.value; scheduleSave(); });
  $("projectLocation").addEventListener("input", (e) => { state.project.location = e.target.value; scheduleSave(); });

  // Labor
  $("laborMode").addEventListener("change", (e) => { state.project.laborMode = e.target.value; scheduleSave(); recalcAndRender(); });
  $("laborPercent").addEventListener("input", (e) => { state.project.laborPercent = n(e.target.value); scheduleSave(); recalcAndRender(); });

  // Logistics
  ["distanceKm","costPerKm","deliveries","tollFees","helperFee"].forEach(id => {
    $(id).addEventListener("input", (e) => {
      state.project.logistics[id] = n(e.target.value);
      scheduleSave();
      recalcAndRender();
    });
  });

  // Overhead
  const ohMap = {
    ohRent: "rent",
    ohElectric: "electric",
    ohAdmin: "admin",
    ohAmort: "amort",
    ohMisc: "misc",
    ohHoursMonth: "hoursMonth",
    projectHours: "projectHours"
  };
  Object.keys(ohMap).forEach(id => {
    $(id).addEventListener("input", (e) => {
      state.project.overhead[ohMap[id]] = n(e.target.value);
      scheduleSave();
      recalcAndRender();
    });
  });

  // Contractor
  $("contractorMode").addEventListener("change", (e) => {
    state.project.contractor.mode = e.target.value;
    // adjust placeholder
    $("contractorValue").placeholder = (e.target.value === "percent") ? "%" : "₱ amount";
    scheduleSave();
    recalcAndRender();
  });
  $("contractorValue").addEventListener("input", (e) => {
    state.project.contractor.value = n(e.target.value);
    scheduleSave();
    recalcAndRender();
  });

  // Contingency + Markup
  $("contingencyPct").addEventListener("input", (e) => { state.project.contingencyPct = n(e.target.value); scheduleSave(); recalcAndRender(); });
  $("markupPct").addEventListener("input", (e) => { state.project.markupPct = n(e.target.value); scheduleSave(); recalcAndRender(); });

  // Panel toggle (mobile)
  $("btnTogglePanel").addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    $("panelBody").style.display = state.panelOpen ? "block" : "none";
  });

  // Print
  $("btnPrint").addEventListener("click", () => {
    buildPrintBOQ();
    window.print();
  });
}

/* Recalc + render outputs */
function recalcAndRender(){
  if(!state.project) return;
  const t = computeTotals(state.project);

  // KPI
  $("kpiDirect").textContent = money(t.direct);
  $("kpiOverhead").textContent = money(t.overheadAlloc);
  $("kpiLogistics").textContent = money(t.logistics);
  $("kpiContractor").textContent = money(t.contractorShare);
  $("kpiContingency").textContent = money(t.contingency);
  $("kpiFinal").textContent = money(t.final);

  const pct = Math.round(t.netMargin * 1000) / 10; // 1 decimal
  $("kpiMargin").textContent = `${pct}%`;

  // Health
  const healthCard = $("kpiHealthCard");
  healthCard.classList.remove("good","mid","bad");
  let healthText = "—";
  if(t.final > 0){
    if(t.netMargin >= 0.30){ healthText = "🟢 Healthy"; healthCard.classList.add("good"); }
    else if(t.netMargin >= 0.20){ healthText = "🟡 Moderate"; healthCard.classList.add("mid"); }
    else { healthText = "🔴 Risky"; healthCard.classList.add("bad"); }
  }
  $("kpiHealth").textContent = healthText;

  // Overhead mini
  $("ohRate").textContent = money(t.overheadRate);
  $("ohAlloc").textContent = money(t.overheadAlloc);

  // Breakdown
  $("bdMaterials").textContent = money(t.materials);
  $("bdAccessories").textContent = money(t.accessories);
  $("bdUtilities").textContent = money(t.utilities);
  $("bdLabor").textContent = money(t.labor);
  $("bdLogistics").textContent = money(t.logistics);
  $("bdOverhead").textContent = money(t.overheadAlloc);
  $("bdOperational").textContent = money(t.operational);
  $("bdContractor").textContent = money(t.contractorShare);
  $("bdContingency").textContent = money(t.contingency);
  $("bdBase").textContent = money(t.base);
  $("bdMarkup").textContent = money(t.markup);
  $("bdFinal").textContent = money(t.final);

  // Sticky
  $("stickyFinal").textContent = money(t.final);
}

function openLibraryPicker(){
  const lib = window.WW_LIBRARY?.rows || [];
  if(lib.length === 0){
    alert("Library is empty. Edit js/library.js to add presets.");
    return;
  }

  // Very simple picker: prompt by number
  const list = lib.map((r, i) => `${i+1}. [${r.category}] ${r.item} (${r.unit}) ₱${n(r.cost)}`).join("\n");
  const pick = prompt("Select an item number from the library:\n\n" + list);
  const idx = (parseInt(pick, 10) - 1);
  if(Number.isInteger(idx) && idx >= 0 && idx < lib.length){
    addRow(lib[idx]);
  }
}

/* Print BOQ */
function buildPrintBOQ(){
  const t = computeTotals(state.project);
  const p = state.project;

  // Prepare rows for BOQ:
  // - Include active rows
  // - If laborMode percent: add synthetic labor line item
  const activeRows = (p.rows || []).filter(r => r.use !== false);

  const groups = {
    Materials: [],
    Accessories: [],
    Utilities: [],
    Labor: []
  };

  activeRows.forEach(r => {
    if(groups[r.category]){
      const cost = n(r.cost);
      const qty = n(r.qty);
      const waste = clampPct(r.wastePct);
      const effQty = qty * (1 + waste/100);
      const subtotal = cost * effQty;
      groups[r.category].push({
        item: r.item || "(Unnamed)",
        unit: r.unit || "",
        qty: effQty,
        unitCost: cost,
        total: subtotal,
        note: waste > 0 ? `waste ${waste}%` : ""
      });
    }
  });

  if((p.laborMode || "percent") === "percent"){
    const lp = clampPct(p.laborPercent);
    if(lp > 0 && t.labor > 0){
      groups.Labor.push({
        item: `Labor (${lp}%)`,
        unit: "lot",
        qty: 1,
        unitCost: t.labor,
        total: t.labor,
        note: "percent mode"
      });
    }
  }

  const dateStr = new Date().toLocaleString("en-PH");
  const safe = (s) => String(s ?? "").replace(/</g,"&lt;");

  const section = (title, rows) => {
    if(rows.length === 0) return "";
    const body = rows.map(r => `
      <tr>
        <td>${safe(r.item)} <span class="printNote">${safe(r.note)}</span></td>
        <td>${safe(r.unit)}</td>
        <td class="right">${n(r.qty).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
        <td class="right">${money(r.unitCost)}</td>
        <td class="right"><strong>${money(r.total)}</strong></td>
      </tr>
    `).join("");

    const sum = rows.reduce((a,b)=>a+n(b.total),0);

    return `
      <div class="printSection">
        <div class="printSectionTitle">${title.toUpperCase()}</div>
        <table class="printTable">
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th class="right">Qty</th>
              <th class="right">Unit Cost</th>
              <th class="right">Line Total</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="right"><strong>${title} Subtotal</strong></td>
              <td class="right"><strong>${money(sum)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  };

  const logisticsRow = `
    <div class="printSection">
      <div class="printSectionTitle">LOGISTICS</div>
      <table class="printTable">
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Logistics Total</td><td class="right"><strong>${money(t.logistics)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;

  const overheadRow = `
    <div class="printSection">
      <div class="printSectionTitle">OVERHEAD</div>
      <table class="printTable">
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Overhead Allocation</td><td class="right"><strong>${money(t.overheadAlloc)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  `;

  const summary = `
    <div class="printSection">
      <div class="printSectionTitle">SUMMARY</div>
      <table class="printTable">
        <tbody>
          <tr><td>Operational Cost (Direct + Logistics + Overhead)</td><td class="right"><strong>${money(t.operational)}</strong></td></tr>
          <tr><td>Contractor Share</td><td class="right"><strong>${money(t.contractorShare)}</strong></td></tr>
          <tr><td>Contingency</td><td class="right"><strong>${money(t.contingency)}</strong></td></tr>
          <tr><td>Cost Before Markup</td><td class="right"><strong>${money(t.base)}</strong></td></tr>
          <tr><td>Markup</td><td class="right"><strong>${money(t.markup)}</strong></td></tr>
          <tr class="printGrand"><td>FINAL SELLING PRICE</td><td class="right">${money(t.final)}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  $("printArea").innerHTML = `
    <style>
      .printHeader{ display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
      .printTitle{ font-size:20px; font-weight:900; letter-spacing:0.4px; }
      .printMeta{ font-size:12px; color:#333; margin-top:6px; line-height:1.35; }
      .printBadge{ display:inline-block; padding:6px 10px; border:1px solid #c7b6a6; border-radius:999px; font-size:12px; }
      .printHr{ margin:12px 0; border-top:2px solid #7f5539; opacity:0.35; }
      .printSection{ margin-top:12px; }
      .printSectionTitle{ font-weight:900; font-size:12px; letter-spacing:1px; color:#2b2119; margin:10px 0 6px; }
      .printTable{ width:100%; border-collapse:collapse; }
      .printTable th, .printTable td{ border:1px solid #d9cbbd; padding:8px; font-size:12px; }
      .printTable th{ background:#fff4e8; text-align:left; }
      .printTable .right{ text-align:right; }
      .printNote{ font-size:10px; color:#6b6b6b; margin-left:6px; }
      .printGrand td{ font-size:14px; font-weight:900; background:#fff0df; }
      .printFooter{ margin-top:16px; font-size:11px; color:#555; display:flex; justify-content:space-between; gap:10px; }
    </style>

    <div class="printHeader">
      <div>
        <div class="printTitle">WOODWORKING BOQ (WITH PRICES)</div>
        <div class="printMeta">
          <div><strong>Project:</strong> ${safe(p.name || "Untitled")}</div>
          <div><strong>Client:</strong> ${safe(p.client || "-")}</div>
          <div><strong>Location:</strong> ${safe(p.location || "-")}</div>
          <div><strong>Generated:</strong> ${safe(dateStr)}</div>
        </div>
      </div>
      <div class="printBadge">Net Margin: ${(Math.round(t.netMargin*1000)/10)}%</div>
    </div>

    <div class="printHr"></div>

    ${section("Materials", groups.Materials)}
    ${section("Accessories", groups.Accessories)}
    ${section("Utilities", groups.Utilities)}
    ${section("Labor", groups.Labor)}
    ${logisticsRow}
    ${overheadRow}
    ${summary}

    <div class="printFooter">
      <div>Prepared for purchasing reference.</div>
      <div>—</div>
    </div>
  `;
}

/* Init */
function init(){
  const active = ensureAtLeastOneProject();
  refreshProjectSelect();
  bindControls();
  loadProject(active.id);

  // Set placeholder for contractor value
  $("contractorValue").placeholder = $("contractorMode").value === "percent" ? "%" : "₱ amount";
}

document.addEventListener("DOMContentLoaded", init);