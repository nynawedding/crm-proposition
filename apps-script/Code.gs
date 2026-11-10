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
      case 'register': exiger(admin); enregistrerClient(p.token, p.client); return { ok: true };
      case 'submit': exigerJeton(p.token); feuille('Reponses').appendRow([new Date(), p.token, p.client || '', JSON.stringify(p.data || {})]); return { ok: true, date: new Date().toISOString() };
      case 'upload': return televerser(p, admin);
      case 'pull': exiger(admin); return tirer(String(p.tokens || '').split(',').filter(String), p.depuis || '');
      default: return { ok: false, erreur: 'action inconnue' };
    }
  } catch (err) { return { ok: false, erreur: String(err && err.message || err) }; }
}

function exiger(c) { if (!c) throw new Error('clé d\'administration invalide'); }
function feuille(nom) { return SpreadsheetApp.openById(PROP.getProperty('SHEET_ID')).getSheetByName(nom); }
function jetons() { return feuille('Clients').getDataRange().getValues().slice(1).reduce((m, r) => { m[r[1]] = r[2]; return m; }, {}); }
function exigerJeton(t) { if (!t || !jetons()[t]) throw new Error('lien de portail invalide ou expiré'); }
function enregistrerClient(t, client) { if (!t || t.length < 16) throw new Error('jeton invalide'); if (!jetons()[t]) feuille('Clients').appendRow([new Date(), t, client || '']); }

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
