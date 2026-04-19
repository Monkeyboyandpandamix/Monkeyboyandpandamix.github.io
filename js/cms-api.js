/**
 * Realtime Database + Auth helpers for GitHub Pages CMS.
 * Paths: config/site, site_projects, site_events, site_roles, site_experience
 */
(function () {
  const ADMIN_EMAIL = 'maghamohammadi@guilford.edu'.toLowerCase();
  const CMS_PATHS = ['config/site', 'site_projects', 'site_events', 'site_roles', 'site_experience'];

  function normEmail(e) {
    return (e || '').trim().toLowerCase();
  }

  function firebaseConfigured() {
    return !!(window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.apiKey);
  }

  function initFirebase() {
    if (!firebaseConfigured() || typeof firebase === 'undefined') return null;
    if (!firebase.apps.length) {
      firebase.initializeApp(window.__FIREBASE_CONFIG__);
    }
    try {
      if (window.__FIREBASE_CONFIG__.measurementId && typeof firebase.analytics === 'function') {
        firebase.analytics();
      }
    } catch {
      // analytics optional (ad blockers, etc.)
    }
    return firebase.app();
  }

  function db() {
    initFirebase();
    return firebase.database();
  }

  function rootRef(path) {
    return db().ref(path);
  }

  function sortCmsItems(items) {
    return [...items].sort((a, b) => {
      const bo = Number(b.orderIndex);
      const ao = Number(a.orderIndex);
      if (Number.isFinite(bo) && Number.isFinite(ao) && bo !== ao) return bo - ao;
      const bt = Number(b.timelineSortMs);
      const at = Number(a.timelineSortMs);
      if (Number.isFinite(bt) && Number.isFinite(at) && bt !== at) return bt - at;
      return String(a.id || a.slug || '').localeCompare(String(b.id || b.slug || ''));
    });
  }

  function mapNode(value) {
    if (!value || typeof value !== 'object') return [];
    return sortCmsItems(
      Object.entries(value).map(([id, doc]) => ({
        id,
        ...(doc && typeof doc === 'object' ? doc : {}),
      }))
    );
  }

  function normalizeCmsData(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      config: src.config && typeof src.config.site === 'object' ? src.config.site : {},
      projects: mapNode(src.site_projects),
      events: mapNode(src.site_events),
      roles: mapNode(src.site_roles),
      experience: mapNode(src.site_experience),
    };
  }

  async function loadAllCmsData() {
    initFirebase();
    if (!firebase.apps.length) return null;
    const values = await Promise.all(CMS_PATHS.map((path) => rootRef(path).once('value').then((snap) => snap.val())));
    const raw = {
      config: { site: values[0] },
      site_projects: values[1],
      site_events: values[2],
      site_roles: values[3],
      site_experience: values[4],
    };
    return normalizeCmsData(raw);
  }

  function watchAllCmsData(callback) {
    initFirebase();
    if (!firebase.apps.length) return () => {};
    const ref = db().ref();
    const handler = (snap) => callback(normalizeCmsData(snap.val()));
    ref.on('value', handler, (error) => console.warn('[CMS] RTDB watch failed', error));
    return () => ref.off('value', handler);
  }

  function buildPortalPayload(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    return {
      verifyLinks: Array.isArray(cfg.verifyLinks) ? cfg.verifyLinks : undefined,
      media: Array.isArray(cfg.media) ? cfg.media : undefined,
      settings: cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : undefined,
      resumeUrl: typeof cfg.resumeUrl === 'string' ? cfg.resumeUrl : undefined,
      achievementCards: Array.isArray(cfg.achievementCards) ? cfg.achievementCards : undefined,
      homeSummaryHtml: typeof cfg.homeSummaryHtml === 'string' ? cfg.homeSummaryHtml : undefined,
      theme: cfg.theme && typeof cfg.theme === 'object' ? cfg.theme : undefined,
      homeHero: cfg.homeHero && typeof cfg.homeHero === 'object' ? cfg.homeHero : undefined,
      quickHighlights: Array.isArray(cfg.quickHighlights) ? cfg.quickHighlights : undefined,
      certifications: cfg.certifications && typeof cfg.certifications === 'object' ? cfg.certifications : undefined,
      competencies: Array.isArray(cfg.competencies) ? cfg.competencies : undefined,
      contactPage: cfg.contactPage && typeof cfg.contactPage === 'object' ? cfg.contactPage : undefined,
      courseworkPage: cfg.courseworkPage && typeof cfg.courseworkPage === 'object' ? cfg.courseworkPage : undefined,
      projectsPage: cfg.projectsPage && typeof cfg.projectsPage === 'object' ? cfg.projectsPage : undefined,
      eventsPage: cfg.eventsPage && typeof cfg.eventsPage === 'object' ? cfg.eventsPage : undefined,
      timelinePage: cfg.timelinePage && typeof cfg.timelinePage === 'object' ? cfg.timelinePage : undefined,
      achievementsPage: cfg.achievementsPage && typeof cfg.achievementsPage === 'object' ? cfg.achievementsPage : undefined,
      experiencePage: cfg.experiencePage && typeof cfg.experiencePage === 'object' ? cfg.experiencePage : undefined,
    };
  }

  async function saveConfigSite(payload) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    await rootRef('config/site').update({
      ...payload,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  async function saveCollectionDoc(collectionName, docId, data, merge) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    const ref = rootRef(`${collectionName}/${docId}`);
    const payload = { ...data, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    if (merge) await ref.update(payload);
    else await ref.set(payload);
  }

  async function deleteDoc(collectionName, docId) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    await rootRef(`${collectionName}/${docId}`).remove();
  }

  async function replaceCollection(collectionName, docs, idField) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    const payload = {};
    (Array.isArray(docs) ? docs : []).forEach((item, idx) => {
      const id = item?.[idField] || item?.slug || item?.id || `item_${idx}_${Date.now()}`;
      const cleanId = String(id).replace(/[^\w-]/g, '_').slice(0, 120);
      const copy = { ...(item || {}), updatedAt: firebase.database.ServerValue.TIMESTAMP };
      delete copy.id;
      payload[cleanId] = copy;
    });
    await rootRef(collectionName).set(payload);
  }

  function watchAuth(callback) {
    initFirebase();
    if (!firebase.apps.length) return () => {};
    return firebase.auth().onAuthStateChanged(callback);
  }

  async function signInWithGoogle() {
    initFirebase();
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await firebase.auth().signInWithPopup(provider);
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) {
      await firebase.auth().signOut();
      throw new Error('Only the site administrator Google account may sign in.');
    }
    return u;
  }

  async function signOutUser() {
    initFirebase();
    if (firebase.auth().currentUser) await firebase.auth().signOut();
  }

  function getCurrentUser() {
    initFirebase();
    return firebase.auth().currentUser || null;
  }

  function isAdminUser() {
    const u = getCurrentUser();
    return !!(u && normEmail(u.email) === ADMIN_EMAIL);
  }

  window.CMS_ADMIN_EMAIL = ADMIN_EMAIL;
  window.CmsApi = {
    ADMIN_EMAIL,
    firebaseConfigured,
    initFirebase,
    loadAllCmsData,
    watchAllCmsData,
    buildPortalPayload,
    saveConfigSite,
    saveCollectionDoc,
    deleteDoc,
    replaceCollection,
    watchAuth,
    signInWithGoogle,
    signOutUser,
    getCurrentUser,
    isAdminUser,
    normEmail,
  };
})();
