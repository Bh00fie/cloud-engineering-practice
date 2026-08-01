// ---------------------------------------------------------------------------
// Firebase Authentication + Cloud Firestore sync
//
// Loaded as an ES module after app.js. If firebase-config.js still contains
// placeholders, this module exits quietly and the app works in guest mode.
//
// Data model: one Firestore document per user at users/{uid}:
//   { email, updated, data }   where data = JSON string of the progress store.
// Security rules (firestore.rules) ensure users only touch their own document.
// ---------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const cfg = window.FIREBASE_CONFIG || {};
const card = document.getElementById("auth-card");
const configured = cfg.apiKey && !String(cfg.apiKey).startsWith("PASTE");
if (!configured) {
  // Firebase not set up yet — stay in guest mode, keep the account box hidden.
  console.info("Cloud sync disabled: fill in firebase-config.js to enable accounts.");
} else {
  initAuth();
}

function initAuth() {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const el = (id) => document.getElementById(id);
  const signedOutBox = el("auth-signedout");
  const signedInBox = el("auth-signedin");
  const errBox = el("auth-error");
  card.hidden = false;

  let currentUser = null;
  let pendingStore = null;
  let saveTimer = null;

  // ------------------------------------------------------------------ saving

  async function flush() {
    if (!currentUser || !pendingStore) return;
    const payload = {
      email: currentUser.email,
      updated: Date.now(),
      data: JSON.stringify(pendingStore),
    };
    pendingStore = null;
    try {
      await setDoc(doc(db, "users", currentUser.uid), payload);
    } catch (e) {
      console.error("Cloud save failed:", e);
    }
  }

  // app.js calls this (via saveStore) after every recorded answer/session.
  // Debounced so a quiz doesn't generate one write per click.
  window.cloudSync = {
    scheduleSave(store) {
      if (!currentUser) return;
      pendingStore = store;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 2500);
    },
  };

  // Don't lose the trailing debounce window when the tab closes/hides.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  // ------------------------------------------------------------------- UI

  function showError(e) {
    const friendly = {
      "auth/invalid-email": "That email address doesn't look valid.",
      "auth/email-already-in-use": "An account with this email already exists — use Sign in.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-credential": "Wrong email or password.",
      "auth/user-not-found": "No account with this email — use Create account.",
      "auth/wrong-password": "Wrong email or password.",
      "auth/too-many-requests": "Too many attempts — wait a minute and try again.",
      "auth/missing-password": "Enter a password.",
    };
    errBox.textContent = friendly[e.code] || `Sign-in error: ${e.message || e}`;
    errBox.hidden = false;
  }

  function creds() {
    return [el("auth-email-input").value.trim(), el("auth-password-input").value];
  }

  el("auth-signin-btn").onclick = async () => {
    errBox.hidden = true;
    try { await signInWithEmailAndPassword(auth, ...creds()); }
    catch (e) { showError(e); }
  };

  el("auth-signup-btn").onclick = async () => {
    errBox.hidden = true;
    try {
      await createUserWithEmailAndPassword(auth, ...creds());
      window.trackEvent?.("signup");
    }
    catch (e) { showError(e); }
  };

  el("auth-reset-btn").onclick = async () => {
    errBox.hidden = true;
    const [email] = creds();
    if (!email) { showError({ code: "auth/invalid-email" }); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      errBox.textContent = "Password reset email sent — check your inbox.";
      errBox.hidden = false;
    } catch (e) { showError(e); }
  };

  el("auth-password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el("auth-signin-btn").click();
  });

  // Inline confirm row (#signout-confirm in index.html) instead of the OS
  // confirm() dialog, which renders as a jarring native popup on mobile.
  el("auth-signout-btn").onclick = () => {
    el("signout-confirm").hidden = false;
  };
  el("signout-confirm-no").onclick = () => {
    el("signout-confirm").hidden = true;
  };
  el("signout-confirm-yes").onclick = async () => {
    el("signout-confirm").hidden = true;
    clearTimeout(saveTimer);
    await flush();
    await signOut(auth);
  };

  // -------------------------------------------------------------- auth state

  onAuthStateChanged(auth, async (user) => {
    const wasSignedIn = !!currentUser;
    currentUser = user;
    signedOutBox.hidden = !!user;
    signedInBox.hidden = !user;

    if (user) {
      el("auth-user-email").textContent = user.email;
      el("auth-email-input").value = "";
      el("auth-password-input").value = "";
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const remote = snap.exists() ? JSON.parse(snap.data().data || "{}") : null;
        // Merge cloud copy with anything done locally (e.g., as a guest),
        // then push the merged result back up.
        const merged = window.cloudBridge.applyRemote(
          remote && remote.attempts ? remote : { attempts: {}, sessions: [] }
        );
        pendingStore = merged;
        await flush();
      } catch (e) {
        console.error("Could not load cloud progress:", e);
        errBox.textContent = "Signed in, but loading cloud progress failed. Check your connection, then reload.";
        errBox.hidden = false;
      }
    } else if (wasSignedIn) {
      window.cloudBridge.clearLocal();
    }
  });
}
