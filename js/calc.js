function n(x){ return Number.isFinite(+x) ? +x : 0; }

function money(x){
  const v = n(x);
  return "₱ " + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clampPct(x){
  const v = n(x);
  if(v < 0) return 0;
  return v;
}

function rowSubtotal(row){
  if(!row?.use) return 0;
  const cost = n(row.cost);
  const qty = n(row.qty);
  const waste = clampPct(row.wastePct);
  const effQty = qty * (1 + waste / 100);
  return cost * effQty;
}

function sumByCategory(rows, category){
  return rows
    .filter(r => (r.use !== false))
    .filter(r => r.category === category)
    .reduce((acc, r) => acc + rowSubtotal(r), 0);
}

function computeLogistics(log){
  const distanceKm = n(log.distanceKm);
  const costPerKm = n(log.costPerKm);
  const deliveries = Math.max(1, Math.floor(n(log.deliveries) || 1));
  const tollFees = n(log.tollFees);
  const helperFee = n(log.helperFee);
  return (distanceKm * costPerKm * deliveries) + tollFees + helperFee;
}

function computeOverhead(oh){
  const rent = n(oh.rent);
  const electric = n(oh.electric);
  const admin = n(oh.admin);
  const amort = n(oh.amort);
  const misc = n(oh.misc);
  const hoursMonth = Math.max(1, n(oh.hoursMonth) || 1);
  const projectHours = Math.max(0, n(oh.projectHours));

  const monthly = rent + electric + admin + amort + misc;
  const rate = monthly / hoursMonth;
  const alloc = rate * projectHours;

  return { monthly, rate, alloc };
}

function computeLabor(project){
  const rows = project.rows || [];
  const mode = project.laborMode || "percent";
  const laborPercent = clampPct(project.laborPercent);

  // Base for labor percent: Materials + Accessories + Utilities (NOT labor rows)
  const materials = sumByCategory(rows, "Materials");
  const accessories = sumByCategory(rows, "Accessories");
  const utilities = sumByCategory(rows, "Utilities");
  const percentLabor = (materials + accessories + utilities) * (laborPercent / 100);

  // Unit labor: sum of labor rows
  const unitLabor = sumByCategory(rows, "Labor");

  return {
    mode,
    laborPercent,
    laborTotal: mode === "percent" ? percentLabor : unitLabor
  };
}

function computeTotals(project){
  const rows = project.rows || [];

  const materials = sumByCategory(rows, "Materials");
  const accessories = sumByCategory(rows, "Accessories");
  const utilities = sumByCategory(rows, "Utilities");

  const labor = computeLabor(project).laborTotal;

  const direct = materials + accessories + utilities + labor;

  const logistics = computeLogistics(project.logistics || {});
  const oh = computeOverhead(project.overhead || {});
  const overheadAlloc = oh.alloc;

  const operational = direct + logistics + overheadAlloc;

  // Contractor SOP
  const contractorMode = project.contractor?.mode || "none";
  const contractorValue = clampPct(project.contractor?.value);
  let contractorShare = 0;
  if(contractorMode === "percent"){
    contractorShare = operational * (contractorValue / 100);
  } else if(contractorMode === "fixed"){
    contractorShare = n(project.contractor?.value);
  }

  // Contingency applied on (operational + contractor)
  const contingencyPct = clampPct(project.contingencyPct);
  const contingency = (operational + contractorShare) * (contingencyPct / 100);

  const base = operational + contractorShare + contingency;

  // Markup applied after contractor share ✔
  const markupPct = clampPct(project.markupPct);
  const final = base * (1 + markupPct / 100);

  const markup = final - base;
  const profit = markup; // since base is your exposure cost including contingency
  const netMargin = final > 0 ? (profit / final) : 0;

  return {
    materials, accessories, utilities, labor,
    direct,
    logistics,
    overheadMonthly: oh.monthly,
    overheadRate: oh.rate,
    overheadAlloc,
    operational,
    contractorShare,
    contingency,
    base,
    markup,
    final,
    profit,
    netMargin
  };
}