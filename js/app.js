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

/* ============================= */
/* ROWS                          */
/* ============================= */

function renderRows(){
  const tbody = $("rowsBody");
  const filter = $("filterCategory").value || "ALL";
  const rows = state.project?.rows || [];
  const view = filter === "ALL" ? rows : rows.filter(r => r.category === filter);

  tbody.innerHTML = view.map(r => rowHtml(r)).join("");

  $("statRows").textContent = String(rows.length);
  $("statActive").textContent = String(rows.filter(x => x.use !== false).length);

  view.forEach(r => bindRowEvents(r.id));
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

    <td><input class="cellInput" value="${safe(r.item)}" data-field="item"/></td>
    <td><input class="cellInput" value="${safe(r.unit)}" data-field="unit"/></td>

    <td><input class="cellInput right" type="number" step="0.01" value="${n(r.cost)}" data-field="cost"/></td>
    <td><input class="cellInput right" type="number" step="0.01" value="${n(r.qty)}" data-field="qty"/></td>
    <td><input class="cellInput right" type="number" step="0.01" value="${n(r.wastePct)}" data-field="wastePct"/></td>

    <td class="right"><strong>${money(sub)}</strong></td>

    <td class="colActions right">
      <button class="iconBtn" data-action="dup">⧉</button>
      <button class="iconBtn danger" data-action="del">✕</button>
    </td>
  </tr>`;
}

function bindRowEvents(rowId){
  const tr = document.querySelector(`tr[data-id="${rowId}"]`);
  if(!tr) return;

  tr.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("input", () => onRowChange(rowId, el));
  });

  tr.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if(action === "del") deleteRow(rowId);
      if(action === "dup") duplicateRow(rowId);
    });
  });
}

/* ============================= */
/* FIXED onRowChange (NO BUG)   */
/* ============================= */

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

  const tr = document.querySelector(`tr[data-id="${rowId}"]`);
  if(tr){
    const subCell = tr.children[7];
    if(subCell){
      subCell.innerHTML = "<strong>" + money(rowSubtotal(row)) + "</strong>";
    }
  }

  recalcAndRender();
}

function addRow(){
  if(!state.project) return;
  state.project.rows.push({
    id: uid(),
    use: true,
    category: "Materials",
    item: "",
    unit: "",
    cost: 0,
    qty: 0,
    wastePct: 0
  });
  scheduleSave();
  renderRows();
  recalcAndRender();
}

function duplicateRow(rowId){
  const row = state.project.rows.find(r => r.id === rowId);
  if(!row) return;

  const copy = {...row, id: uid()};
  const idx = state.project.rows.findIndex(r => r.id === rowId);
  state.project.rows.splice(idx + 1, 0, copy);

  scheduleSave();
  renderRows();
  recalcAndRender();
}

function deleteRow(rowId){
  const idx = state.project.rows.findIndex(r => r.id === rowId);
  if(idx < 0) return;

  state.project.rows.splice(idx, 1);
  scheduleSave();
  renderRows();
  recalcAndRender();
}

/* ============================= */
/* INIT                         */
/* ============================= */

function init(){
  const active = ensureAtLeastOneProject();
  refreshProjectSelect();
  bindControls();
  loadProject(active.id);
}

document.addEventListener("DOMContentLoaded", init);
