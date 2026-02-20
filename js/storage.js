const STORAGE_KEY = "ww_v2_projects";
const ACTIVE_KEY = "ww_v2_active_project";

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function getAllProjects(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setAllProjects(projects){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function getActiveProjectId(){
  return localStorage.getItem(ACTIVE_KEY) || "";
}

function setActiveProjectId(id){
  localStorage.setItem(ACTIVE_KEY, id);
}

function defaultProject(){
  return {
    id: uid(),
    name: "New Project",
    client: "",
    location: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    rows: [
      { id: uid(), use: true, category: "Materials", item: "", unit: "sheet", cost: 0, qty: 0, wastePct: 0 }
    ],

    // Labor
    laborMode: "percent",
    laborPercent: 0,

    // Logistics
    logistics: { distanceKm: 0, costPerKm: 0, deliveries: 1, tollFees: 0, helperFee: 0 },

    // Overhead
    overhead: { rent: 0, electric: 0, admin: 0, amort: 0, misc: 0, hoursMonth: 160, projectHours: 0 },

    // Contractor
    contractor: { mode: "none", value: 0 },

    // Contingency + Markup
    contingencyPct: 0,
    markupPct: 0
  };
}

function upsertProject(project){
  const projects = getAllProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  project.updatedAt = new Date().toISOString();
  if(idx >= 0) projects[idx] = project;
  else projects.unshift(project);
  setAllProjects(projects);
}

function deleteProject(id){
  const projects = getAllProjects().filter(p => p.id !== id);
  setAllProjects(projects);
  const active = getActiveProjectId();
  if(active === id){
    setActiveProjectId(projects[0]?.id || "");
  }
}

function getProjectById(id){
  return getAllProjects().find(p => p.id === id) || null;
}

function ensureAtLeastOneProject(){
  const projects = getAllProjects();
  if(projects.length === 0){
    const p = defaultProject();
    setAllProjects([p]);
    setActiveProjectId(p.id);
    return p;
  }
  const activeId = getActiveProjectId() || projects[0].id;
  setActiveProjectId(activeId);
  return getProjectById(activeId) || projects[0];
}