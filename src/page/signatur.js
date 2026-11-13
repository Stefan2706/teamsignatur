/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * TeamSignatur – (c) Stefan Scherer, ts-scherer.com */
"use strict";

const t = (key, ...subs) => messenger.i18n.getMessage(key, subs.map(String)) || key;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PALETTE = ["#2f6fb5", "#0f6cbd", "#0f9d9a", "#2e9d5a", "#e08a1e", "#d9534f", "#c2185b", "#8e44ad", "#37474f", "#000000"];
const ADDON_ID = "teamsignatur@ts-scherer.com";

const state = { company: {}, person: {}, source: "local", identities: [], identityIds: [] };
const labels = () => ({
  phone: t("sigPhone"), mobile: t("sigMobile"), email: t("sigEmail"), seat: t("sigSeat"),
  court: t("sigCourt"), managers: t("sigManagers"), vatId: t("sigVatId"),
});

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

function applyI18n() {
  for (const n of $$("[data-i18n]")) n.textContent = t(n.dataset.i18n);
  for (const n of $$("[data-i18n-placeholder]")) n.placeholder = t(n.dataset.i18nPlaceholder);
  document.documentElement.lang = messenger.i18n.getUILanguage();
  $("#version").textContent = messenger.runtime.getManifest().version;
}

/* ---------- Formular <-> Zustand ---------- */
function fillForm() {
  const c = { ...TeamSig.DEFAULT_COMPANY, ...state.company };
  for (const el of $$("[data-c]")) el.value = c[el.dataset.c] ?? "";
  for (const el of $$("[data-p]")) el.value = state.person[el.dataset.p] ?? "";
  for (const r of $$('input[name="design"]')) r.checked = r.value === c.design;
  renderPalette(c.accent);
  const locked = state.source !== "local";
  for (const el of $$("#companySection input, #companySection select, #companySection textarea, #companySection button")) el.disabled = locked;
  $("#lockNote").hidden = !locked;
  $("#lockNote").textContent = locked ? t(state.source === "managed" ? "lockManaged" : "lockUrl") : "";
}

function readForm() {
  if (state.source === "local") {
    for (const el of $$("[data-c]")) {
      const v = el.value;
      state.company[el.dataset.c] = ["logoWidth", "fontSize"].includes(el.dataset.c) ? Number(v) || undefined : v;
    }
    const d = $('input[name="design"]:checked');
    if (d) state.company.design = d.value;
  }
  for (const el of $$("[data-p]")) state.person[el.dataset.p] = el.value.trim();
}

function renderPalette(current) {
  const box = $("#palette");
  box.textContent = "";
  for (const color of PALETTE) {
    const b = document.createElement("button");
    b.type = "button";
    b.style.background = color;
    b.title = color;
    b.setAttribute("aria-label", color);
    if (color.toLowerCase() === String(current).toLowerCase()) b.classList.add("current");
    b.addEventListener("click", () => { state.company.accent = color; renderPalette(color); save(); });
    box.append(b);
  }
  const hex = document.createElement("input");
  hex.value = current || "";
  hex.placeholder = "#2f6fb5";
  hex.addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value.trim())) { state.company.accent = hex.value.trim(); renderPalette(state.company.accent); save(); }
  });
  box.append(hex);
}

/* ---------- Vorschau ---------- */
function firstEmail() {
  const id = state.identities.find(i => state.identityIds.includes(i.id)) || state.identities[0];
  return id ? id.email : "name@beispiel.de";
}
function updatePreview() {
  const person = { ...state.person };
  if (!person.name) {
    const id = state.identities.find(i => state.identityIds.includes(i.id));
    person.name = (id && id.name) || t("phName");
  }
  const html = TeamSig.render(state.company, person, firstEmail(), labels());
  $("#preview").srcdoc = `<!DOCTYPE html><html><body style="margin:14px;background:#fff">` +
    `<p style="font-family:Arial;font-size:10pt;color:#999;margin:0 0 14px">…</p>${html}</body></html>`;
  updateExport();
}

function updateExport() {
  const exportObj = { company: state.company };
  $("#exportJson").value = JSON.stringify(exportObj, null, 2);
  $("#policyJson").value = JSON.stringify({ policies: { "3rdparty": { Extensions: { [ADDON_ID]: exportObj } } } }, null, 2);
}

/* ---------- Speichern ---------- */
let saveTimer;
function save() {
  readForm();
  updatePreview();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = { person: state.person, identityIds: state.identityIds };
    if (state.source === "local") data.company = state.company;
    messenger.storage.local.set(data);
  }, 400);
}

/* ---------- Konten ---------- */
function renderIdentities() {
  const list = $("#identities");
  list.textContent = "";
  for (const id of state.identities) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.identityIds.includes(id.id);
    cb.addEventListener("change", () => {
      state.identityIds = cb.checked ? [...state.identityIds, id.id] : state.identityIds.filter(x => x !== id.id);
      save();
    });
    const span = document.createElement("span");
    span.textContent = id.email;
    const small = document.createElement("small");
    small.textContent = id.name ? ` – ${id.name}` : "";
    label.append(cb, span, small);
    li.append(label);
    list.append(li);
  }
}

/* ---------- Adressbuch ---------- */
function parseVCard(vcard) {
  const out = {};
  for (const raw of String(vcard || "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    const m = raw.match(/^([^:;]+)((?:;[^:]*)*):(.*)$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    const params = m[2].toLowerCase();
    const value = m[3].replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
    if (key === "FN") out.name = value;
    if (key === "TITLE") out.title = value;
    if (key === "ORG") out.department = value.split(";")[1] || out.department;
    if (key === "TEL") {
      const num = value.replace(/^tel:/i, "");
      if (/cell|mobile/.test(params)) out.mobile = out.mobile || num;
      else if (/work/.test(params) || !out.phone) out.phone = out.phone || num;
    }
  }
  return out;
}
async function fromContacts() {
  const email = firstEmail();
  try {
    const hits = await messenger.contacts.quickSearch(email);
    const contact = hits.find(c => {
      const p = c.properties || {};
      return [p.PrimaryEmail, p.SecondEmail].some(e => e && e.toLowerCase() === email.toLowerCase())
        || String(p.vCard || "").toLowerCase().includes(email.toLowerCase());
    }) || hits[0];
    if (!contact) { toast(t("contactNotFound", email)); return; }
    const p = contact.properties || {};
    const v = parseVCard(p.vCard);
    const data = {
      name: v.name || p.DisplayName || "",
      title: v.title || p.JobTitle || "",
      department: v.department || p.Department || "",
      phone: v.phone || p.WorkPhone || "",
      mobile: v.mobile || p.CellularNumber || "",
    };
    for (const [k, val] of Object.entries(data)) if (val) state.person[k] = val;
    fillForm();
    save();
    toast(t("contactLoaded"));
  } catch (e) {
    toast(t("contactError", String(e.message || e)));
  }
}

/* ---------- Logo ---------- */
function loadLogo(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // auf doppelte Anzeigebreite verkleinern (scharf auf hochauflösenden Bildschirmen, klein in der Mail)
      const maxW = Math.min(img.width, (Number(state.company.logoWidth) || 140) * 2);
      const scale = maxW / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
      state.company.logo = canvas.toDataURL(type, 0.9);
      if (state.company.logo.length > 120000) toast(t("logoLarge"));
      save();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Übernehmen ---------- */
async function apply() {
  readForm();
  await messenger.storage.local.set({ person: state.person, identityIds: state.identityIds,
    ...(state.source === "local" ? { company: state.company } : {}) });
  if (!state.identityIds.length) { toast(t("noIdentity")); return; }
  try {
    const done = await messenger.runtime.sendMessage({ type: "apply" });
    $("#status").textContent = t("appliedTo", done.join(", "));
    toast(t("applied"));
  } catch (e) {
    toast(t("applyError", String(e.message || e)));
  }
}

/* ---------- Zentrale Vorlage ---------- */
async function loadUrl() {
  const url = $("#configUrl").value.trim();
  if (!url) {
    await messenger.storage.local.set({ configUrl: "", remoteCompany: null });
    return init();
  }
  let origin;
  try { origin = new URL(url).origin + "/*"; } catch (e) { toast(t("urlInvalid")); return; }
  const ok = await messenger.permissions.request({ origins: [origin] });
  if (!ok) { toast(t("urlDenied")); return; }
  await messenger.storage.local.set({ configUrl: url });
  const eff = await messenger.runtime.sendMessage({ type: "refreshRemote" });
  if (eff.source === "url") toast(t("urlLoaded")); else toast(t("urlFailed"));
  init();
}

async function importJson() {
  try {
    const data = JSON.parse($("#importJson").value);
    if (!data.company) throw new Error("company");
    state.company = data.company;
    fillForm();
    save();
    toast(t("imported"));
  } catch (e) {
    toast(t("importError"));
  }
}

/* ---------- Start ---------- */
async function init() {
  const eff = await messenger.runtime.sendMessage({ type: "effective" });
  const local = await messenger.storage.local.get(["person", "identityIds", "autoApply", "configUrl"]);
  state.identities = await messenger.runtime.sendMessage({ type: "identities" });
  state.company = { ...TeamSig.DEFAULT_COMPANY, ...(eff.company || {}) };
  state.source = eff.source;
  state.person = local.person || {};
  state.identityIds = local.identityIds || state.identities.map(i => i.id);
  $("#autoApply").checked = local.autoApply !== false;
  $("#configUrl").value = local.configUrl || "";
  fillForm();
  renderIdentities();
  updatePreview();
}

function bind() {
  $("#form").addEventListener("input", e => { if (e.target.matches("[data-c],[data-p],input[name=design]")) save(); });
  $("#form").addEventListener("change", e => { if (e.target.matches("select,[data-c],input[name=design]")) save(); });
  $("#fromContacts").addEventListener("click", fromContacts);
  $("#logoFile").addEventListener("change", e => { if (e.target.files[0]) loadLogo(e.target.files[0]); });
  $("#logoRemove").addEventListener("click", () => { state.company.logo = ""; $("#logoFile").value = ""; save(); });
  $("#apply").addEventListener("click", apply);
  $("#autoApply").addEventListener("change", e => messenger.storage.local.set({ autoApply: e.target.checked }));
  $("#loadUrl").addEventListener("click", loadUrl);
  $("#importBtn").addEventListener("click", importJson);
  messenger.storage.onChanged.addListener((changes, area) => {
    if (area === "managed" || (area === "local" && "remoteCompany" in changes)) init();
  });
}

applyI18n();
bind();
init();
