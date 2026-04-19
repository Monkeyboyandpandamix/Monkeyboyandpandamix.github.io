/**
 * Firestore + Auth helpers for GitHub Pages CMS.
 * Collections: config/site, site_projects, site_events, site_roles, site_experience
 */
(function () {
  const ADMIN_EMAIL = 'maghamohammadi@guilford.edu'.toLowerCase();

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
    return firebase.firestore();
  }

  async function loadAllCmsData() {
    initFirebase();
    if (!firebase.apps.length) return null;
    const d = db();
    const [configSnap, projSnap, evSnap, roleSnap, expSnap] = await Promise.all([
      d.collection('config').doc('site').get(),
      d.collection('site_projects').get(),
      d.collection('site_events').get(),
      d.collection('site_roles').get(),
      d.collection('site_experience').get(),
    ]);

    const config = configSnap.exists ? configSnap.data() : {};

    function mapDocs(snap) {
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    return {
      config,
      projects: mapDocs(projSnap),
      events: mapDocs(evSnap),
      roles: mapDocs(roleSnap),
      experience: mapDocs(expSnap),
    };
  }

  function buildPortalPayload(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    return {
      blocks: Array.isArray(cfg.achievementsBlocks) ? cfg.achievementsBlocks : undefined,
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
    };
  }

  async function saveConfigSite(payload) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    await db()
      .collection('config')
      .doc('site')
      .set(
        {
          ...payload,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  async function saveCollectionDoc(collectionName, docId, data, merge) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    const ref = db().collection(collectionName).doc(docId);
    if (merge) await ref.set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    else await ref.set({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  async function deleteDoc(collectionName, docId) {
    initFirebase();
    const u = firebase.auth().currentUser;
    if (!u || normEmail(u.email) !== ADMIN_EMAIL) throw new Error('Not authorized');
    await db().collection(collectionName).doc(docId).delete();
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
    buildPortalPayload,
    saveConfigSite,
    saveCollectionDoc,
    deleteDoc,
    watchAuth,
    signInWithGoogle,
    signOutUser,
    getCurrentUser,
    isAdminUser,
    normEmail,
  };
})();
