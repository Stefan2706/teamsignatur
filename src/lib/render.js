/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * TeamSignatur – (c) Stefan Scherer, ts-scherer.com */
"use strict";
/* Erzeugt die HTML-Signatur aus Firmenvorlage und persönlichen Daten.
 * Nur Inline-Styles und Tabellen, damit die Signatur in allen Mailprogrammen gleich aussieht. */

var TeamSig = (() => {
  const DEFAULT_COMPANY = {
    name: "", street: "", zip: "", city: "", country: "", phone: "", website: "",
    seat: "", court: "", register: "", managers: "", vatId: "",
    disclaimer: "", logo: "", logoWidth: 140, accent: "#2f6fb5",
    design: "classic", logoPosition: "left", greetingPosition: "above", font: "Arial, Helvetica, sans-serif", fontSize: 10, greeting: "Mit freundlichen Grüßen",
  };
  const DEFAULT_PERSON = { name: "", title: "", department: "", phone: "", mobile: "" };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const join = (parts, sep) => parts.filter(p => p && String(p).trim()).join(sep);
  const tel = n => String(n || "").replace(/[^\d+]/g, "");
  const webHref = w => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
  const webText = w => String(w || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");

  function parts(company, person, email, labels) {
    const c = { ...DEFAULT_COMPANY, ...company };
    const p = { ...DEFAULT_PERSON, ...person };
    const L = { phone: "Tel.", mobile: "Mobil", email: "E-Mail", seat: "Sitz", court: "Registergericht",
      managers: "Geschäftsführung", vatId: "USt-IdNr.", ...labels };
    const link = (href, text) => `<a href="${esc(href)}" style="color:${esc(c.accent)};text-decoration:none">${esc(text)}</a>`;

    const roleLine = join([esc(p.title), esc(p.department)], " | ");
    const addressLine = join([esc(c.street), join([esc(c.zip), esc(c.city)], " "), esc(c.country)], " · ");
    const phoneLine = join([
      p.phone || c.phone ? `${L.phone} ${link(`tel:${tel(p.phone || c.phone)}`, p.phone || c.phone)}` : "",
      p.mobile ? `${L.mobile} ${link(`tel:${tel(p.mobile)}`, p.mobile)}` : "",
    ], " · ");
    const webLine = join([
      email ? `${L.email} ${link(`mailto:${email}`, email)}` : "",
      c.website ? link(webHref(c.website), webText(c.website)) : "",
    ], " · ");
    const legal = join([
      c.seat ? `${L.seat}: ${esc(c.seat)}` : "",
      join([c.court ? `${L.court}: ${esc(c.court)}` : "", esc(c.register)], " "),
      c.managers ? `${L.managers}: ${esc(c.managers)}` : "",
      c.vatId ? `${L.vatId}: ${esc(c.vatId)}` : "",
    ], " · ");
    const logo = c.logo
      ? `<img src="${esc(c.logo)}" alt="${esc(c.name)}" width="${Number(c.logoWidth) || 140}" style="display:block;border:0;max-width:${Number(c.logoWidth) || 140}px;height:auto">`
      : "";
    return { c, p, roleLine, addressLine, phoneLine, webLine, legal, logo };
  }

  function render(company, person, email, labels) {
    const x = parts(company, person, email, labels);
    const { c, p } = x;
    const fs = Number(c.fontSize) || 10;
    const base = `font-family:${esc(c.font)};font-size:${fs}pt;line-height:1.4;color:#333333`;
    const small = `font-size:${Math.max(7, fs - 2)}pt;color:#888888;line-height:1.35`;
    const greeting = c.greeting ? `<p style="margin:0 0 10px 0">${esc(c.greeting)}</p>` : "";
    const name = `<strong style="color:${esc(c.accent)};font-size:${fs + 1}pt">${esc(p.name)}</strong>`;
    const firm = `<strong>${esc(c.name)}</strong>`;
    const bar = c.design === "modern";

    // Textblock je Design
    const body = c.design === "compact"
      ? `${name}${x.roleLine ? ` · ${x.roleLine}` : ""} · ${firm}<br>${join([x.phoneLine, x.webLine], " · ")}`
      : `${name}<br>${x.roleLine ? `${x.roleLine}<br>` : ""}${c.design === "classic" ? "<br>" : ""}` +
        `${firm}<br>${x.addressLine ? `${x.addressLine}<br>` : ""}${x.phoneLine ? `${x.phoneLine}<br>` : ""}${x.webLine}`;
    const textBlock = bar
      ? `<div style="border-left:3px solid ${esc(c.accent)};padding-left:12px">${body}</div>`
      : body;

    // Logo links, oben oder unten
    const pos = ["left", "top", "bottom"].includes(c.logoPosition) ? c.logoPosition : "left";
    let main = textBlock;
    let top = greeting;
    if (x.logo && pos === "left") {
      // Grußformel wahlweise in der Textspalte neben dem Logo
      const inText = c.greetingPosition === "text";
      if (inText) top = "";
      main = `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>` +
        `<td style="padding:0 16px 0 0;vertical-align:middle">${x.logo}</td>` +
        `<td style="vertical-align:middle;${base};${bar ? `border-left:3px solid ${esc(c.accent)};padding-left:14px` : ""}">` +
        `${inText ? greeting : ""}${body}</td></tr></table>`;
    } else if (x.logo && pos === "top") {
      main = `<div style="margin:0 0 10px 0">${x.logo}</div>${textBlock}`;
    } else if (x.logo) {
      main = `${textBlock}<div style="margin:10px 0 0 0">${x.logo}</div>`;
    }

    const legal = join([x.legal ? `<div style="${small}">${x.legal}</div>` : "",
      c.disclaimer ? `<div style="${small};margin-top:4px">${esc(c.disclaimer)}</div>` : ""], "");
    const legalBlock = !legal ? ""
      : c.design === "classic"
        ? `<div style="border-top:1px solid #dddddd;margin-top:10px;padding-top:6px">${legal}</div>`
        : `<div style="margin-top:10px">${legal}</div>`;
    return `<div style="${base}">${top}${main}${legalBlock}</div>`;
  }

  return { DEFAULT_COMPANY, DEFAULT_PERSON, render, esc };
})();
