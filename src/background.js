/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * TeamSignatur – (c) Stefan Scherer, ts-scherer.com */
"use strict";

const t = key => messenger.i18n.getMessage(key) || key;
const labels = () => ({
  phone: t("sigPhone"), mobile: t("sigMobile"), email: t("sigEmail"), seat: t("sigSeat"),
  court: t("sigCourt"), managers: t("sigManagers"), vatId: t("sigVatId"),
});

/* Firmenvorlage ermitteln: Richtlinie der IT > zentrale URL > lokale Eingabe */
async function effectiveCompany() {
  let managed = {};
  try { managed = (await messenger.storage.managed.get("company")) || {}; } catch (e) { managed = {}; }
  const local = await messenger.storage.local.get(["company", "remoteCompany", "configUrl"]);
  if (managed.company) return { company: managed.company, source: "managed" };
  if (local.configUrl && local.remoteCompany) return { company: local.remoteCompany, source: "url" };
  return { company: local.company || {}, source: "local" };
}

async function refreshRemote() {
  const { configUrl } = await messenger.storage.local.get("configUrl");
  if (!configUrl) return;
  try {
    const res = await fetch(configUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data && data.company) await messenger.storage.local.set({ remoteCompany: data.company, remoteFetched: Date.now() });
  } catch (e) {
    console.warn("TeamSignatur: Vorlage konnte nicht geladen werden", e);
  }
}

async function allIdentities() {
  const accounts = await messenger.accounts.list(true);
  return accounts.flatMap(a => (a.identities || []).map(i => ({ ...i, accountName: a.name })));
}

/* Signatur in die gewählten Identitäten schreiben – nur wenn sich etwas ändert */
async function applyAll() {
  const { company } = await effectiveCompany();
  const { person = {}, identityIds } = await messenger.storage.local.get(["person", "identityIds"]);
  const all = await allIdentities();
  const ids = new Set(identityIds || all.map(i => i.id));
  const results = [];
  for (const identity of all) {
    if (!ids.has(identity.id)) continue;
    const html = TeamSig.render(company, { ...person, name: person.name || identity.name }, identity.email, labels());
    if (identity.signature !== html || identity.signatureIsPlainText) {
      await messenger.identities.update(identity.id, { signature: html, signatureIsPlainText: false });
    }
    results.push(identity.email);
  }
  await messenger.storage.local.set({ appliedAt: Date.now() });
  return results;
}

messenger.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === "apply") return applyAll();
  if (msg && msg.type === "effective") return effectiveCompany();
  if (msg && msg.type === "identities") return allIdentities();
  if (msg && msg.type === "refreshRemote") return refreshRemote().then(effectiveCompany);
  return undefined;
});

/* Automatisch aktualisieren, wenn die IT-Vorlage oder die eigenen Daten sich ändern */
let applyTimer;
function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(async () => {
    // Nie ungefragt überschreiben: automatisch nur, wenn schon einmal übernommen wurde
    // oder die IT eine Vorlage per Richtlinie vorgibt.
    const { autoApply, appliedAt } = await messenger.storage.local.get(["autoApply", "appliedAt"]);
    const { source } = await effectiveCompany();
    if (autoApply !== false && (appliedAt || source === "managed")) applyAll().catch(e => console.error("TeamSignatur", e));
  }, 800);
}
messenger.storage.onChanged.addListener((changes, area) => {
  if (area === "managed") return scheduleApply();
  if (area === "local" && ["company", "remoteCompany", "person", "identityIds"].some(k => k in changes)) scheduleApply();
});

messenger.browserAction.onClicked.addListener(() => messenger.runtime.openOptionsPage());
messenger.menus.create({ id: "open-teamsignatur", title: t("actionTitle"), contexts: ["tools_menu"] });
messenger.menus.onClicked.addListener(info => {
  if (info.menuItemId === "open-teamsignatur") messenger.runtime.openOptionsPage();
});

(async () => {
  await refreshRemote();
  scheduleApply();
})();
