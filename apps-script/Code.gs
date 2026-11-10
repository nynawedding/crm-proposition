/**
 * Portail client du CRM : réception des réponses et des fichiers des clients.
 * - Réponses : Google Sheets « CRM Portail client » (onglets Clients, Reponses, Fichiers).
 * - Fichiers : Google Drive, dossier « CRM Portail client / <client> / <catégorie> », privés (vous seul).
 *
 * Installation : voir LISEZMOI.md (exécuter installer() une fois, puis déployer en application Web).
 * Sécurité :
 * - le client n'a qu'un jeton propre à son dossier, qui lui permet seulement d'envoyer ;
 * - la lecture et l'enregistrement d'un client exigent la clé d'administration, qui reste dans votre CRM ;
 * - aucun mot de passe n'est demandé ni stocké.
 */
const PROP = PropertiesService.getScriptProperties();
const TAILLE_MAX = 25 * 1024 * 1024; // 25 Mo par fichier

function installer() {
  let cle = PROP.getProperty('ADMIN_KEY');
  if (!cle) { cle = Utilities.getUuid().replace(/-/g, ''); PROP.setProperty('ADMIN_KEY', cle); }
  if (!PROP.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('CRM Portail client');
    ss.getSheets()[0].setName('Clients').appendRow(['Date', 'Jeton', 'Client']);
    ss.insertSheet('Reponses').appendRow(['Date', 'Jeton', 'Client', 'Données (JSON)']);
    ss.insertSheet('Fichiers').appendRow(['Date', 'Jeton', 'Catégorie', 'Nom', 'ID Drive', 'Lien', 'Type', 'Taille', 'Source', 'Note']);
    PROP.setProperty('SHEET_ID', ss.getId());
  }
  if (!PROP.getProperty('FOLDER_ID')) PROP.setProperty('FOLDER_ID', DriveApp.createFolder('CRM Portail client').getId());
  Logger.log('Clé d\'administration à coller dans le CRM (Réglages) : ' + cle);
}

function doGet(e) { return repondre(router(e.parameter || {})); }
function doPost(e) { let p = {}; try { p = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (x) {} return repondre(router(p)); }
function repondre(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function router(p) {
  try {
    const admin = p.key && p.key === PROP.getProperty('ADMIN_KEY');
    switch (p.action) {
      case 'ping': return { ok: true, admin: !!admin };
      case 'register': exiger(admin); enregistrerClient(p.token, p.client, p.vendeur, p.prerempli); return { ok: true };
      case 'infoPortail': return infoPortail(String(p.token || ''));
      case 'submit': exigerJeton(p.token); feuille('Reponses').appendRow([new Date(), p.token, p.client || '', JSON.stringify(p.data || {})]); return { ok: true, date: new Date().toISOString() };
      case 'upload': return televerser(p, admin);
      case 'pull': exiger(admin); return tirer(String(p.tokens || '').split(',').filter(String), p.depuis || '');
      case 'stocker': exiger(admin); return stocker(p);
      case 'lire': return lireDoc(String(p.id || ''));
      case 'signer': return signerDoc(String(p.id || ''), p.sig);
      case 'signatures': exiger(admin); return signatures(String(p.ids || '').split(',').filter(String));
      default: return { ok: false, erreur: 'action inconnue' };
    }
  } catch (err) { return { ok: false, erreur: String(err && err.message || err) }; }
}

function exiger(c) { if (!c) throw new Error('clé d\'administration invalide'); }
function feuille(nom) { return SpreadsheetApp.openById(PROP.getProperty('SHEET_ID')).getSheetByName(nom); }
function jetons() { return feuille('Clients').getDataRange().getValues().slice(1).reduce((m, r) => { m[r[1]] = r[2]; return m; }, {}); }
function exigerJeton(t) { if (!t || !jetons()[t]) throw new Error('lien de portail invalide ou expiré'); }
function enregistrerClient(t, client, vendeur, prerempli) {
  if (!t || t.length < 16) throw new Error('jeton invalide');
  const f = feuille('Clients'), v = f.getDataRange().getValues(), info = JSON.stringify(vendeur || {}), pre = JSON.stringify(prerempli || {});
  for (let i = 1; i < v.length; i++) if (v[i][1] === t) { f.getRange(i + 1, 3, 1, 3).setValues([[client || v[i][2], info, pre]]); return; }
  f.appendRow([new Date(), t, client || '', info, pre]);
}
// lien court de l'espace client (#p=jeton) : nom du client et coordonnées du prestataire, rien d'autre
function infoPortail(t) {
  const r = feuille('Clients').getDataRange().getValues().slice(1).find(x => x[1] === t);
  if (!r) throw new Error('lien de portail invalide ou expiré');
  let v = {}; try { v = JSON.parse(r[3] || '{}'); } catch (e) {}
  let pre = {}; try { pre = JSON.parse(r[4] || '{}'); } catch (e) {}
  return { ok: true, client: r[2], vendeur: v.nom || '', tel: v.tel || '', prerempli: pre };
}

function dossier(token, categorie) {
  const racine = DriveApp.getFolderById(PROP.getProperty('FOLDER_ID'));
  const nomClient = (jetons()[token] || 'Client') + ' (' + token.slice(0, 6) + ')';
  const sous = (parent, nom) => { const it = parent.getFoldersByName(nom); return it.hasNext() ? it.next() : parent.createFolder(nom); };
  return sous(sous(racine, nomClient), categorie || 'documents');
}

function televerser(p, admin) {
  exigerJeton(p.token);
  const octets = Utilities.base64Decode(p.base64 || '');
  if (!octets.length) throw new Error('fichier vide');
  if (octets.length > TAILLE_MAX) throw new Error('fichier trop lourd (25 Mo maximum)');
  const f = dossier(p.token, p.categorie).createFile(Utilities.newBlob(octets, p.mime || 'application/octet-stream', p.nom || 'fichier'));
  const date = new Date();
  feuille('Fichiers').appendRow([date, p.token, p.categorie || 'documents', p.nom || '', f.getId(), f.getUrl(), p.mime || '', octets.length, admin ? 'crm' : 'portail', p.note || '']);
  return { ok: true, id: f.getId(), url: f.getUrl(), date: date.toISOString() };
}

function tirer(tokens, depuis) {
  const t = new Set(tokens), d = depuis ? new Date(depuis) : new Date(0);
  const rep = feuille('Reponses').getDataRange().getValues().slice(1).filter(r => t.has(r[1]) && new Date(r[0]) > d)
    .map(r => ({ date: new Date(r[0]).toISOString(), token: r[1], data: JSON.parse(r[3] || '{}') }));
  const fic = feuille('Fichiers').getDataRange().getValues().slice(1).filter(r => t.has(r[1]))
    .map(r => ({ date: new Date(r[0]).toISOString(), token: r[1], categorie: r[2], nom: r[3], id: r[4], url: r[5], mime: r[6], taille: r[7], source: r[8], note: r[9] }));
  return { ok: true, reponses: rep, fichiers: fic, maintenant: new Date().toISOString() };
}

// ---------- devis à signer : lien court (le devis est stocké ici, le lien ne contient qu'un identifiant) ----------
function documents() {
  const ss = SpreadsheetApp.openById(PROP.getProperty('SHEET_ID'));
  return ss.getSheetByName('Documents') || (() => { const f = ss.insertSheet('Documents'); f.appendRow(['Date', 'ID', 'Type', 'Client', 'Contenu', 'Signature', 'Signé le']); return f; })();
}
function trouverDoc(id) {
  if (!/^[A-Za-z0-9]{8,24}$/.test(id)) throw new Error('lien invalide');
  const f = documents(), v = f.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][1] === id) return { f, ligne: i + 1, r: v[i] };
  throw new Error('devis introuvable');
}
function stocker(p) {
  if (!p.contenu) throw new Error('contenu vide');
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let id = ''; for (let i = 0; i < 10; i++) id += alpha[Math.floor(Math.random() * alpha.length)];
  documents().appendRow([new Date(), id, p.type || 'devis', p.client || '', p.contenu, '', '']);
  return { ok: true, id };
}
function lireDoc(id) { const d = trouverDoc(id); return { ok: true, contenu: d.r[4], sig: d.r[5] ? JSON.parse(d.r[5]) : null }; }
function signerDoc(id, sig) {
  const d = trouverDoc(id);
  if (d.r[5]) return { ok: true, deja: true }; // la première signature fait foi
  if (!sig || !sig.nom || !sig.traits) throw new Error('signature incomplète');
  d.f.getRange(d.ligne, 6, 1, 2).setValues([[JSON.stringify({ nom: String(sig.nom).slice(0, 120), traits: sig.traits, quand: sig.quand || new Date().toISOString() }), new Date()]]);
  return { ok: true };
}
function signatures(ids) {
  const t = new Set(ids);
  const v = documents().getDataRange().getValues().slice(1).filter(r => t.has(r[1]) && r[5]);
  return { ok: true, signatures: v.map(r => ({ id: r[1], contenu: r[4], sig: JSON.parse(r[5]) })) };
}
