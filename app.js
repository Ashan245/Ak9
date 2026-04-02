/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   PrintFlow Pro — app.js  (Phase 2 — Full Feature Build)        ║
 * ║   Firebase v10 Modular SDK (ESM)                                 ║
 * ║   Multi-Tenant Printing Shop SaaS — Sri Lanka                   ║
 * ║                                                                  ║
 * ║   Phase 2 Features:                                             ║
 * ║   ✅ WhatsApp Alerts (UltraMsg placeholder → swap API key)       ║
 * ║   ✅ PDF Invoice Generator (jsPDF — no server needed)            ║
 * ║   ✅ Role-Based Access Control (Owner / Designer / Cashier)      ║
 * ║   ✅ PayHere Subscription Integration (Sri Lankan gateway)       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 0 — Firebase Imports (v10 Modular ESM)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, addDoc, updateDoc,
  collection, query, where, orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 1 — Firebase Configuration  ← REPLACE WITH YOUR CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const firebaseConfig = {
  apiKey:            "AIzaSyD1c0v1GsV1yyrZT5w_eGvd08vQk3rBvqc",
  authDomain:        "planning-with-ai-123-f72da.firebaseapp.com",
  projectId:         "planning-with-ai-123-f72da",
  storageBucket:     "planning-with-ai-123-f72da.firebasestorage.app",
  messagingSenderId: "732507401545",
  appId:             "1:732507401545:web:03f94258ea55a8bbeffe98"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 2 — App-Wide State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let currentShopId   = null;  // = owner Firebase UID (or owner of staff's shop)
let currentShopData = null;  // Firestore shop document data
let currentUserRole = null;  // "owner" | "designer" | "cashier"
let selectedFile    = null;  // File staged for upload
let calcPricedValue = 0;     // Last AI Pricing result
let modalOrderCtx   = {};    // Stores order context for modal → WhatsApp


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 3 — WHATSAPP ALERT MODULE
//
//  Provider: UltraMsg (ultramsg.com)
//  HOW TO GO LIVE:
//    1. Sign up at https://ultramsg.com
//    2. Create an instance and connect your WhatsApp number
//    3. Replace ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN below
//    4. Change provider from "mock" to "ultramsg"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WHATSAPP_CONFIG = {
  provider:   "mock",                         // Change to "ultramsg" when live
  instanceId: "YOUR_ULTRAMSG_INSTANCE_ID",    // e.g. "instance99999"
  token:      "YOUR_ULTRAMSG_TOKEN",          // from ultramsg.com dashboard
};

/**
 * sendWhatsAppAlert()
 * Sends a WhatsApp message to a customer when their order status changes.
 *
 * @param {object} p
 * @param {string} p.customerName
 * @param {string} p.phone        - e.g. "0771234567" or "+94771234567"
 * @param {string} p.orderType
 * @param {string} p.newStatus
 * @param {string} p.shopName
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendWhatsAppAlert({ customerName, phone, orderType, newStatus, shopName }) {

  // — Normalise phone to E.164 format (+94XXXXXXXXX for Sri Lanka)
  const raw      = String(phone || "").replace(/[\s\-\(\)]/g, "");
  const intlPhone = raw.startsWith("0")   ? "+94" + raw.slice(1)
                  : raw.startsWith("+")   ? raw
                  : "+" + raw;

  // — Build the WhatsApp message
  const emoji = { Pending:"⏳", Designing:"✏️", Printing:"🖨️", Completed:"✅" }[newStatus] || "📋";
  const body  =
    `${emoji} *Order Update — ${shopName}*\n\n` +
    `Hello *${customerName}*!\n` +
    `Your *${orderType}* order status has been updated to:\n\n` +
    `📌 *${newStatus}*\n\n` +
    (newStatus === "Completed"
      ? `✅ Your order is *ready for collection or delivery*!\n`
        + `Please contact us for pickup arrangements.\n\n`
      : `We will notify you as it progresses.\n\n`) +
    `Thank you for choosing *${shopName}* 🙏\n` +
    `_Powered by PrintFlow Pro_`;

  // — UltraMsg provider
  if (WHATSAPP_CONFIG.provider === "ultramsg") {
    try {
      const res = await fetch(
        `https://api.ultramsg.com/${WHATSAPP_CONFIG.instanceId}/messages/chat`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: WHATSAPP_CONFIG.token,
            to:    intlPhone,
            body
          })
        }
      );
      const data = await res.json();
      if (data.sent === "true" || data.id) {
        return { success: true, message: "WhatsApp alert sent!" };
      }
      return { success: false, message: data.error || "UltraMsg: unknown error" };
    } catch (err) {
      return { success: false, message: "UltraMsg fetch error: " + err.message };
    }
  }

  // — Mock provider (development — logs to console only)
  console.info(`%c📱 [Mock WhatsApp] To: ${intlPhone}`, "color:#2f80ed;font-weight:bold");
  console.info(body);
  return { success: true, message: "Mock mode: message logged to console." };
}

/**
 * handleStatusUpdateWithAlert()
 * Updates Firestore status AND fires the WhatsApp alert.
 * This is the single function you wire to the "Confirm" button.
 */
async function handleStatusUpdateWithAlert(orderId, newStatus, customerName, phone, orderType) {
  if (!currentShopId) return;
  try {
    // 1 — Update Firestore
    await updateDoc(doc(db, "shops", currentShopId, "orders", orderId), {
      status: newStatus, updatedAt: serverTimestamp()
    });

    // 2 — Close modal & refresh tables
    bootstrap.Modal.getInstance(document.getElementById("statusModal"))?.hide();
    showToast(`Status updated to "${newStatus}"`, "success");
    if (document.getElementById("section-orders").classList.contains("active"))    searchOrders();
    if (document.getElementById("section-dashboard").classList.contains("active")) loadDashboardStats();

    // 3 — WhatsApp alert (fires on Printing + Completed; remove condition for all)
    if (["Printing", "Completed"].includes(newStatus)) {
      const shopName    = currentShopData?.shopName || "PrintFlow Shop";
      const alertResult = await sendWhatsAppAlert({
        customerName, phone, orderType, newStatus, shopName
      });
      showToast(
        alertResult.success
          ? `📱 WhatsApp alert sent to ${customerName}!`
          : `Order updated. WhatsApp: ${alertResult.message}`,
        alertResult.success ? "success" : "success"   // still show success; WA is non-fatal
      );
    }
  } catch (err) {
    showToast("Update failed: " + err.message, "error");
  }
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 4 — PDF INVOICE GENERATOR
//
//  Requires in index.html (already added):
//  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * generateInvoice()
 * Builds a professional branded PDF invoice and triggers a download.
 * Called from the orders table "PDF" button → window.generateInvoice(order)
 *
 * @param {object} order - Firestore order document merged with its id
 */
function generateInvoice(order) {
  if (!window.jspdf) {
    showToast("PDF library not loaded. Check jsPDF CDN in index.html.", "error");
    return;
  }

  const { jsPDF }   = window.jspdf;
  const pdf         = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const shopName    = currentShopData?.shopName  || "PrintFlow Shop";
  const shopPhone   = currentShopData?.phone     || "";
  const shopAddress = currentShopData?.address   || "Sri Lanka";
  const invoiceNo   = "INV-" + Date.now().toString().slice(-6);
  const dateStr     = new Date().toLocaleDateString("en-LK", {
    day: "2-digit", month: "long", year: "numeric"
  });

  // Palette
  const NAVY  = [13,  20,  36];
  const BLUE  = [47,  128, 237];
  const LIGHT = [232, 240, 254];
  const GRAY  = [100, 116, 139];
  const WHITE = [255, 255, 255];
  const BLACK = [15,  23,  42];
  const GREEN = [16,  185, 129];
  const RED   = [239, 68,  68];
  const W = 210, M = 16;

  // — Header bar
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 48, "F");

  // — Logo box
  pdf.setFillColor(...BLUE);
  pdf.roundedRect(M, 10, 28, 28, 4, 4, "F");
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(20); pdf.setFont("helvetica", "bold");
  pdf.text("P", M + 9, 29);

  // — Shop name
  pdf.setFontSize(16); pdf.setFont("helvetica", "bold");
  pdf.text(shopName, M + 34, 22);
  pdf.setFontSize(8); pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 200, 240);
  pdf.text(shopAddress, M + 34, 29);
  pdf.text(shopPhone,   M + 34, 35);

  // — INVOICE label
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(22); pdf.setFont("helvetica", "bold");
  pdf.text("INVOICE", W - M, 22, { align: "right" });
  pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
  pdf.setTextColor(180, 200, 240);
  pdf.text(`# ${invoiceNo}`, W - M, 30, { align: "right" });
  pdf.text(dateStr,          W - M, 37, { align: "right" });

  // — Bill To
  let y = 60;
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(M, y, 85, 36, 3, 3, "F");
  pdf.setTextColor(...GRAY); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
  pdf.text("BILL TO", M + 5, y + 8);
  pdf.setTextColor(...BLACK); pdf.setFontSize(11); pdf.setFont("helvetica","bold");
  pdf.text(order.customerName || "—", M + 5, y + 17);
  pdf.setFontSize(9); pdf.setFont("helvetica","normal"); pdf.setTextColor(...GRAY);
  pdf.text(order.phone || "—",  M + 5, y + 24);
  pdf.text("Customer",          M + 5, y + 30);

  // — Order Details
  const dX = M + 95;
  pdf.setFillColor(...LIGHT);
  pdf.roundedRect(dX, y, 85, 36, 3, 3, "F");
  pdf.setTextColor(...GRAY); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
  pdf.text("ORDER DETAILS", dX + 5, y + 8);
  pdf.setFontSize(9);
  [["Job Type:", order.orderType||"—"],
   ["Quantity:", String(order.quantity||1)],
   ["Order ID:", (order.id||"—").slice(0,14)+"…"]
  ].forEach(([lbl, val], i) => {
    pdf.setFont("helvetica","bold");   pdf.setTextColor(...BLACK);
    pdf.text(lbl, dX + 5,  y + 17 + (i*6));
    pdf.setFont("helvetica","normal"); pdf.setTextColor(...GRAY);
    pdf.text(val, dX + 35, y + 17 + (i*6));
  });

  // — Line Items Table
  y += 48;
  pdf.setFillColor(...BLUE);
  pdf.rect(M, y, W-(M*2), 10, "F");
  pdf.setTextColor(...WHITE); pdf.setFontSize(9); pdf.setFont("helvetica","bold");
  pdf.text("Description",    M + 4,     y+6.5);
  pdf.text("Type",           M + 95,    y+6.5);
  pdf.text("Qty",            M + 135,   y+6.5, {align:"right"});
  pdf.text("Amount (LKR)",   W-M-4,     y+6.5, {align:"right"});

  y += 10;
  const totalAmt = order.creditAmount || 0;
  pdf.setFillColor(245,248,254); pdf.rect(M, y, W-(M*2), 12, "F");
  pdf.setTextColor(...BLACK); pdf.setFontSize(9); pdf.setFont("helvetica","normal");
  const desc = `${order.orderType||"Print Job"} — ${order.notes||"Standard order"}`.slice(0,50);
  pdf.text(desc,                        M+4,       y+7.5);
  pdf.text(order.orderType||"—",        M+95,      y+7.5);
  pdf.text(String(order.quantity||1),   M+135,     y+7.5, {align:"right"});
  pdf.text(fmtCurrency(totalAmt),       W-M-4,     y+7.5, {align:"right"});

  y += 12;
  pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.3);
  pdf.line(M, y+2, W-M, y+2);

  // — Totals
  y += 10;
  const advance    = order.advancePaid || 0;
  const balanceDue = Math.max(0, totalAmt - advance);
  const tX         = W - M - 80;

  [["Subtotal:",     fmtCurrency(totalAmt), false],
   ["Advance Paid:", fmtCurrency(advance),  false],
   ["Balance Due:",  fmtCurrency(balanceDue), true]
  ].forEach(([lbl, val, hi], i) => {
    if (hi) {
      pdf.setFillColor(...BLUE);
      pdf.roundedRect(tX-4, y+(i*10)-4, 84, 12, 2, 2, "F");
      pdf.setTextColor(...WHITE);
    } else { pdf.setTextColor(...GRAY); }
    pdf.setFont("helvetica", hi ? "bold" : "normal");
    pdf.setFontSize(hi ? 10 : 9);
    pdf.text(lbl, tX,     y+(i*10)+3.5);
    pdf.text(val, W-M-4,  y+(i*10)+3.5, {align:"right"});
  });

  y += 42;

  // — Notes
  if (order.notes) {
    pdf.setFillColor(...LIGHT);
    pdf.roundedRect(M, y, W-(M*2), 20, 3, 3, "F");
    pdf.setTextColor(...GRAY); pdf.setFontSize(8); pdf.setFont("helvetica","bold");
    pdf.text("NOTES", M+5, y+7);
    pdf.setFont("helvetica","normal"); pdf.setTextColor(...BLACK);
    pdf.text(order.notes.slice(0, 120), M+5, y+14);
    y += 28;
  }

  // — Payment badge
  y += 6;
  pdf.setFillColor(...(balanceDue <= 0 ? GREEN : RED));
  pdf.roundedRect(M, y, 42, 12, 2, 2, "F");
  pdf.setTextColor(...WHITE); pdf.setFontSize(9); pdf.setFont("helvetica","bold");
  pdf.text(balanceDue <= 0 ? "PAID IN FULL" : "BALANCE DUE", M+4, y+8);

  // — Footer
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 272, W, 25, "F");
  pdf.setTextColor(130, 160, 200); pdf.setFontSize(8); pdf.setFont("helvetica","normal");
  pdf.text(`${shopName}  |  ${shopAddress}  |  ${shopPhone}`, W/2, 280, {align:"center"});
  pdf.setTextColor(...BLUE);
  pdf.text("Powered by PrintFlow Pro", W/2, 286, {align:"center"});

  // — Save
  const fname = `Invoice_${(order.customerName||"Customer").replace(/\s+/g,"_")}_${invoiceNo}.pdf`;
  pdf.save(fname);
  showToast(`Invoice downloaded: ${fname}`, "success");
}

window.generateInvoice = generateInvoice;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 5 — ROLE-BASED ACCESS CONTROL (RBAC)
//
//  Firestore Schema:
//  /shops/{shopId}/staff/{staffUID}   { name, email, role, shopId }
//  /staffLookup/{staffUID}            { shopId, role }
//
//  Role Permissions Matrix:
//  ┌──────────────────┬───────┬──────────┬─────────┐
//  │ Permission       │ Owner │ Designer │ Cashier │
//  ├──────────────────┼───────┼──────────┼─────────┤
//  │ Add Order        │  ✅   │    ❌    │    ❌   │
//  │ View Orders      │  ✅   │    ✅    │    ✅   │
//  │ Update → Design  │  ✅   │    ✅    │    ❌   │
//  │ Update → Print   │  ✅   │    ❌    │    ✅   │
//  │ Update → Done    │  ✅   │    ❌    │    ✅   │
//  │ Ledger & Pay     │  ✅   │    ❌    │    ✅   │
//  │ AI Pricing       │  ✅   │    ❌    │    ✅   │
//  │ Generate Invoice │  ✅   │    ❌    │    ✅   │
//  │ Add Staff        │  ✅   │    ❌    │    ❌   │
//  │ Settings         │  ✅   │    ❌    │    ❌   │
//  └──────────────────┴───────┴──────────┴─────────┘
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PERMISSIONS = {
  owner: {
    sections:        ["dashboard","new-order","orders","pricing","ledger","settings","staff"],
    canAddOrder:     true,
    canUpdateStatus: ["Pending","Designing","Printing","Completed"],
    canViewLedger:   true,
    canPaymentEdit:  true,
    canAddStaff:     true,
    canInvoice:      true
  },
  designer: {
    sections:        ["orders"],
    canAddOrder:     false,
    canUpdateStatus: ["Designing"],
    canViewLedger:   false,
    canPaymentEdit:  false,
    canAddStaff:     false,
    canInvoice:      false
  },
  cashier: {
    sections:        ["orders","pricing","ledger"],
    canAddOrder:     false,
    canUpdateStatus: ["Printing","Completed"],
    canViewLedger:   true,
    canPaymentEdit:  true,
    canAddStaff:     false,
    canInvoice:      true
  }
};

/**
 * applyRolePermissions()
 * Hides/shows sidebar links and restricts UI controls based on role.
 */
function applyRolePermissions(role) {
  const perms = PERMISSIONS[role] || PERMISSIONS.designer;

  // Hide sidebar nav items the role cannot access
  document.querySelectorAll(".nav-item[data-section]").forEach(link => {
    link.style.display = perms.sections.includes(link.dataset.section) ? "" : "none";
  });

  // Restrict status buttons (grey out ones this role cannot use)
  document.querySelectorAll(".status-select-btn").forEach(btn => {
    const allowed        = perms.canUpdateStatus.includes(btn.dataset.status);
    btn.disabled         = !allowed;
    btn.style.opacity    = allowed ? "1" : "0.3";
    btn.style.cursor     = allowed ? "pointer" : "not-allowed";
  });

  // Role label in sidebar footer
  const roleEl = document.getElementById("user-role");
  if (roleEl) roleEl.textContent =
    { owner:"Shop Owner", designer:"Designer", cashier:"Cashier" }[role] || role;

  // Switch to first allowed section
  if (perms.sections.length) switchSection(perms.sections[0]);
}

/**
 * resolveUserRoleAndShop()
 * Determines if the signed-in user is an Owner or a Staff member.
 */
async function resolveUserRoleAndShop(user) {
  // Check for an owner shop doc (shopId === uid)
  const shopSnap = await getDoc(doc(db, "shops", user.uid));
  if (shopSnap.exists()) {
    return { shopId: user.uid, role: "owner", shopData: shopSnap.data(), staffData: null };
  }

  // Not an owner — look up their staff record
  const lookupSnap = await getDoc(doc(db, "staffLookup", user.uid));
  if (!lookupSnap.exists())
    throw new Error("Account not found. Please contact your shop owner.");

  const { shopId, role } = lookupSnap.data();
  const ownerShopSnap    = await getDoc(doc(db, "shops", shopId));
  if (!ownerShopSnap.exists()) throw new Error("Associated shop not found.");

  const staffSnap = await getDoc(doc(db, "shops", shopId, "staff", user.uid));
  return {
    shopId,
    role,
    shopData:  ownerShopSnap.data(),
    staffData: staffSnap.exists() ? staffSnap.data() : null
  };
}

/**
 * addStaffMember()
 * Owner creates a new staff account without being logged out.
 * Uses Firebase Auth REST API to create the user, then saves role in Firestore.
 */
async function addStaffMember({ name, email, password, role }) {
  if (currentUserRole !== "owner") throw new Error("Only shop owners can add staff.");

  // Create the Firebase Auth account via REST (keeps owner session alive)
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const staffUID = data.localId;

  // Save staff doc under this shop's "staff" sub-collection
  await setDoc(doc(db, "shops", currentShopId, "staff", staffUID), {
    name, email, role, shopId: currentShopId, createdAt: serverTimestamp()
  });

  // Save lookup doc so staff login can find their shop
  await setDoc(doc(db, "staffLookup", staffUID), {
    shopId: currentShopId, role
  });

  return { uid: staffUID, name, email, role };
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 6 — PAYHERE SUBSCRIPTION MODULE
//
//  PayHere is Sri Lanka's leading payment gateway (payhere.lk).
//
//  FLOW:
//  1. Owner clicks "Upgrade to Pro" → initiatePayHereSubscription()
//  2. Your Cloud Function generates a signed MD5 hash
//  3. PayHere popup opens → customer pays via card/bank/eZCash
//  4. PayHere calls notify_url (your Cloud Function) on success
//  5. Cloud Function verifies hash → updates subscriptionTier in Firestore
//
//  SECURITY NOTE: merchant_secret stays in your Cloud Function ONLY.
//  Never put it in frontend JavaScript.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PAYHERE_CONFIG = {
  merchantId:  "YOUR_PAYHERE_MERCHANT_ID",
  mode:        "sandbox",    // Change to "live" for production
  currency:    "LKR",
  // These Cloud Function URLs are where PayHere notifies you:
  notifyUrl:   "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/payhereNotify",
  returnUrl:   window.location.origin + "?payment=success",
  cancelUrl:   window.location.origin + "?payment=cancel",
  // Your Cloud Function that generates the secure MD5 hash:
  hashGenUrl:  "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/generatePayHereHash"
};

/**
 * initiatePayHereSubscription()
 * Opens the PayHere recurring payment window for the PRO plan.
 *
 * Requires in index.html:
 * <script src="https://www.payhere.lk/lib/payhere.js"></script>
 *
 * @param {object} shopOwner - { name, email, phone, shopId }
 */
async function initiatePayHereSubscription(shopOwner) {
  const orderId = "PF-" + (shopOwner.shopId || "").slice(0, 8).toUpperCase();
  const amount  = "2990.00";   // PRO plan: LKR 2,990/month

  // Step 1: Get a signed hash from your Cloud Function
  let hash;
  try {
    const hashRes  = await fetch(PAYHERE_CONFIG.hashGenUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId: PAYHERE_CONFIG.merchantId,
        orderId, amount, currency: PAYHERE_CONFIG.currency
      })
    });
    const hashData = await hashRes.json();
    hash           = hashData.hash;
  } catch (err) {
    showToast("Could not start payment. Please try again.", "error");
    return;
  }

  // Step 2: Build the PayHere payment object
  const nameParts  = (shopOwner.name || "Shop Owner").split(" ");
  const payment = {
    sandbox:      PAYHERE_CONFIG.mode === "sandbox",
    merchant_id:  PAYHERE_CONFIG.merchantId,
    return_url:   PAYHERE_CONFIG.returnUrl,
    cancel_url:   PAYHERE_CONFIG.cancelUrl,
    notify_url:   PAYHERE_CONFIG.notifyUrl,
    order_id:     orderId,
    items:        "PrintFlow Pro — Monthly Subscription",
    amount,
    currency:     PAYHERE_CONFIG.currency,
    hash,

    // Recurring billing (monthly, forever)
    recurrence:   "1 Month",
    duration:     "Forever",

    // Customer details
    first_name:   nameParts[0] || "Shop",
    last_name:    nameParts.slice(1).join(" ") || "Owner",
    email:        shopOwner.email || "",
    phone:        shopOwner.phone || "",
    address:      currentShopData?.address || "Sri Lanka",
    city:         "Colombo",
    country:      "Sri Lanka",

    // Passed back in notify_url so your Cloud Function knows which shop
    custom_1:     shopOwner.shopId,
    custom_2:     "pro_monthly"
  };

  // Step 3: Register PayHere event callbacks
  if (!window.payhere) {
    showToast("PayHere library not loaded. Check index.html.", "error");
    return;
  }

  window.payhere.onCompleted = async (ordId) => {
    showToast("🎉 Payment successful! Upgrading your plan…", "success");
    await updateDoc(doc(db, "shops", currentShopId), {
      subscriptionTier: "pro", updatedAt: serverTimestamp()
    });
    document.getElementById("sidebar-tier").textContent = "PRO";
  };

  window.payhere.onDismissed = () =>
    showToast("Payment cancelled. Upgrade anytime!", "error");

  window.payhere.onError = (error) => {
    showToast("Payment error. Please try again.", "error");
    console.error("PayHere error:", error);
  };

  // Step 4: Open PayHere checkout
  window.payhere.startPayment(payment);
}

window.initiatePayHereSubscription = initiatePayHereSubscription;


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 7 — SECTION NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SECTION_TITLES = {
  dashboard: "Dashboard", "new-order": "New Order", orders: "Orders",
  pricing: "AI Pricing Calculator", ledger: "Customer Ledger",
  settings: "Settings", staff: "Staff Management"
};

function switchSection(name) {
  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item[data-section]").forEach(n => n.classList.remove("active"));
  document.getElementById(`section-${name}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add("active");
  const titleEl = document.getElementById("topbar-title");
  if (titleEl) titleEl.textContent = SECTION_TITLES[name] || "—";
  document.getElementById("sidebar")?.classList.remove("open");
}

document.querySelectorAll(".nav-item[data-section]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const sec = link.dataset.section;
    switchSection(sec);
    ({ dashboard: loadDashboardStats, orders: loadAllOrders, ledger: loadLedger,
       settings: loadSettings, pricing: buildRateCards, staff: loadStaffList })[sec]?.();
  });
});

document.getElementById("sidebar-toggle")?.addEventListener("click", () =>
  document.getElementById("sidebar")?.classList.toggle("open"));

const dateEl = document.getElementById("topbar-date");
if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-LK",
  { weekday:"short", day:"numeric", month:"short", year:"numeric" });


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 8 — AUTH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById("go-register")?.addEventListener("click", e => {
  e.preventDefault();
  document.getElementById("login-panel").classList.add("d-none");
  document.getElementById("register-panel").classList.remove("d-none");
});
document.getElementById("go-login")?.addEventListener("click", e => {
  e.preventDefault();
  document.getElementById("register-panel").classList.add("d-none");
  document.getElementById("login-panel").classList.remove("d-none");
});

document.getElementById("btn-register")?.addEventListener("click", async () => {
  const shopName = document.getElementById("reg-shopname").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const errEl    = document.getElementById("reg-error");
  if (!shopName || !email || !password)
    return showError(errEl, "Please fill in all fields.");
  if (password.length < 6)
    return showError(errEl, "Password must be at least 6 characters.");

  const btn = document.getElementById("btn-register");
  setLoadingState(btn, true, "Creating Account…");
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "shops", user.uid), {
      shopName, ownerEmail: email, ownerUID: user.uid,
      subscriptionTier: "free", phone: "", address: "",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  } catch (err) {
    showError(errEl, friendlyError(err.code));
    setLoadingState(btn, false, "<i class='fa-solid fa-shop me-2'></i>Create Shop Account");
  }
});

document.getElementById("btn-login")?.addEventListener("click", async () => {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl    = document.getElementById("auth-error");
  if (!email || !password) return showError(errEl, "Enter your email and password.");

  const btn = document.getElementById("btn-login");
  setLoadingState(btn, true, "Signing In…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showError(errEl, friendlyError(err.code));
    setLoadingState(btn, false, "<i class='fa-solid fa-arrow-right-to-bracket me-2'></i>Sign In");
  }
});

document.getElementById("login-password")?.addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btn-login")?.click();
});
document.getElementById("btn-logout")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (user) {
    document.getElementById("auth-overlay").classList.add("d-none");
    document.getElementById("app").classList.remove("d-none");
    try {
      const resolved  = await resolveUserRoleAndShop(user);
      currentShopId   = resolved.shopId;
      currentShopData = resolved.shopData;
      currentUserRole = resolved.role;

      const shopName = resolved.shopData?.shopName || "My Shop";
      const tier     = (resolved.shopData?.subscriptionTier || "free").toUpperCase();
      const email    = resolved.staffData?.email || user.email || "";
      const initials = shopName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);

      document.getElementById("sidebar-shop-name").textContent    = shopName;
      document.getElementById("sidebar-tier").textContent         = tier;
      document.getElementById("user-email-label").textContent     = email;
      document.getElementById("user-avatar-initials").textContent = initials;

      applyRolePermissions(currentUserRole);
      loadDashboardStats();
      calculatePrice();
      buildRateCards();
    } catch (err) {
      showToast("Login error: " + err.message, "error");
      await signOut(auth);
    }
  } else {
    currentShopId = currentShopData = currentUserRole = null;
    document.getElementById("auth-overlay").classList.remove("d-none");
    document.getElementById("app").classList.add("d-none");
    setLoadingState(document.getElementById("btn-login"), false,
      "<i class='fa-solid fa-arrow-right-to-bracket me-2'></i>Sign In");
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 9 — FILE UPLOAD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const dropZone  = document.getElementById("file-drop-zone");
const fileInput = document.getElementById("ord-file");

dropZone?.addEventListener("click",    () => fileInput?.click());
dropZone?.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone?.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});
fileInput?.addEventListener("change", () => { if (fileInput.files[0]) selectFile(fileInput.files[0]); });
document.getElementById("btn-clear-file")?.addEventListener("click", () => {
  selectedFile = null; if (fileInput) fileInput.value = "";
  document.getElementById("file-info")?.classList.add("d-none");
  dropZone?.classList.remove("d-none");
});

function selectFile(file) {
  if (file.size > 50 * 1024 * 1024) { showToast("Max file size is 50MB.", "error"); return; }
  selectedFile = file;
  const lbl = document.getElementById("file-name-label");
  if (lbl) lbl.textContent = file.name;
  document.getElementById("file-info")?.classList.remove("d-none");
  dropZone?.classList.add("d-none");
}

function uploadFileToStorage(file, shopId) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(
      ref(storage, `shops/${shopId}/designs/${Date.now()}_${file.name}`), file
    );
    const pw = document.getElementById("upload-progress-wrap");
    const pb = document.getElementById("upload-bar");
    const pp = document.getElementById("upload-pct");
    pw?.classList.remove("d-none");
    task.on("state_changed",
      s => { const p = Math.round(s.bytesTransferred/s.totalBytes*100);
             if (pb) pb.style.width = p+"%"; if (pp) pp.textContent = p+"%"; },
      err => { pw?.classList.add("d-none"); reject(err); },
      async () => { pw?.classList.add("d-none");
                    try { resolve(await getDownloadURL(task.snapshot.ref)); }
                    catch(e) { reject(e); } }
    );
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 10 — NEW ORDER FORM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById("btn-clear-form")?.addEventListener("click", () => {
  ["ord-customer","ord-phone","ord-qty","ord-notes","ord-credit","ord-advance"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  const typeEl = document.getElementById("ord-type"); if (typeEl) typeEl.value = "";
  selectedFile = null; if (fileInput) fileInput.value = "";
  document.getElementById("file-info")?.classList.add("d-none");
  dropZone?.classList.remove("d-none");
  ["order-success","order-error"].forEach(id => document.getElementById(id)?.classList.add("d-none"));
});

document.getElementById("btn-submit-order")?.addEventListener("click", async () => {
  if (!currentShopId) return showToast("Not signed in.", "error");
  const customerName = document.getElementById("ord-customer").value.trim();
  const phone        = document.getElementById("ord-phone").value.trim();
  const orderType    = document.getElementById("ord-type").value;
  const qty          = parseInt(document.getElementById("ord-qty").value) || 1;
  const notes        = document.getElementById("ord-notes").value.trim();
  const creditAmount = parseFloat(document.getElementById("ord-credit").value) || 0;
  const advancePaid  = parseFloat(document.getElementById("ord-advance").value) || 0;
  const errEl = document.getElementById("order-error");
  const sucEl = document.getElementById("order-success");
  errEl?.classList.add("d-none"); sucEl?.classList.add("d-none");

  if (!customerName) return showInlineError(errEl, "Customer name is required.");
  if (!phone)        return showInlineError(errEl, "Phone number is required.");
  if (!orderType)    return showInlineError(errEl, "Please select an order type.");

  const btn = document.getElementById("btn-submit-order");
  setLoadingState(btn, true, "Saving…");

  let fileURL = null, fileName = null;
  if (selectedFile) {
    try { fileURL = await uploadFileToStorage(selectedFile, currentShopId); fileName = selectedFile.name; }
    catch (e) {
      setLoadingState(btn, false, "<i class='fa-solid fa-paper-plane me-2'></i>Submit Order");
      return showInlineError(errEl, "Upload failed: " + e.message);
    }
  }

  try {
    await addDoc(collection(db, "shops", currentShopId, "orders"), {
      customerName, phone, orderType, quantity: qty, notes,
      creditAmount, advancePaid, balanceDue: Math.max(0, creditAmount - advancePaid),
      fileURL: fileURL||null, fileName: fileName||null,
      status: "Pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    document.getElementById("btn-clear-form").click();
    sucEl?.classList.remove("d-none");
    showToast(`Order for ${customerName} saved!`, "success");
  } catch (err) {
    showInlineError(errEl, "Failed to save: " + err.message);
  } finally {
    setLoadingState(btn, false, "<i class='fa-solid fa-paper-plane me-2'></i>Submit Order");
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 11 — ORDERS SEARCH & TABLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById("btn-search")?.addEventListener("click", searchOrders);
document.getElementById("search-query")?.addEventListener("keydown", e => {
  if (e.key === "Enter") searchOrders();
});

async function searchOrders() {
  if (!currentShopId) return;
  const rawQ   = document.getElementById("search-query")?.value.trim().toLowerCase() || "";
  const fType  = document.getElementById("filter-type")?.value || "";
  const fStat  = document.getElementById("filter-status")?.value || "";
  const tbody  = document.getElementById("orders-tbody");
  const cntEl  = document.getElementById("results-count");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">
    <span class="spinner-border spinner-border-sm text-accent me-2"></span> Searching…
  </td></tr>`;

  try {
    const ordRef = collection(db, "shops", currentShopId, "orders");
    let q = fStat  ? query(ordRef, where("status","==",fStat), orderBy("createdAt","desc"), limit(100))
          : fType  ? query(ordRef, where("orderType","==",fType), orderBy("createdAt","desc"), limit(100))
          :           query(ordRef, orderBy("createdAt","desc"), limit(200));

    let orders = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
    if (rawQ)  orders = orders.filter(o =>
      (o.customerName||"").toLowerCase().includes(rawQ) ||
      (o.phone||"").toLowerCase().includes(rawQ));
    if (fType && !fStat) orders = orders.filter(o => o.orderType === fType);

    if (cntEl) cntEl.textContent = `${orders.length} result${orders.length !== 1 ? "s":""}`;
    renderOrdersTable(orders, tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-danger py-3 ps-3">Error: ${err.message}</td></tr>`;
  }
}

function loadAllOrders() {
  ["search-query","filter-type","filter-status"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  searchOrders();
}

function renderOrdersTable(orders, tbody) {
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-5">
      <i class="fa-solid fa-inbox fa-2x mb-3 d-block opacity-25"></i>No orders found.
    </td></tr>`;
    return;
  }
  const perms = PERMISSIONS[currentUserRole] || PERMISSIONS.designer;
  tbody.innerHTML = orders.map((o, i) => {
    // Safely encode order for onclick (avoid XSS via JSON embedding)
    const safeId   = escHtml(o.id);
    const safeName = escHtml(o.customerName);
    const safeStat = escHtml(o.status || "Pending");
    const safePh   = escHtml(o.phone);
    const safeType = escHtml(o.orderType);
    return `
    <tr>
      <td class="text-muted" style="font-family:var(--font-mono);font-size:11px">${i+1}</td>
      <td><strong>${safeName||"—"}</strong></td>
      <td style="font-family:var(--font-mono);font-size:12px">${safePh||"—"}</td>
      <td>${safeType||"—"}</td>
      <td>${o.quantity||1}</td>
      <td class="${o.balanceDue>0?"credit-amount":"credit-cleared"}">
        ${o.balanceDue>0?"LKR "+fmtCurrency(o.balanceDue):"✓ Cleared"}</td>
      <td><span class="status-badge status-${safeStat}">
        ${statusIcon(o.status)} ${safeStat}</span></td>
      <td>${o.fileURL
        ? `<a href="${o.fileURL}" target="_blank" class="btn btn-sm btn-download">
             <i class="fa-solid fa-download me-1"></i>${fileExt(o.fileName)}</a>`
        : `<button class="btn btn-sm btn-download no-file" disabled>No File</button>`}</td>
      <td>${perms.canUpdateStatus.length
        ? `<button class="btn btn-sm btn-update-status"
             onclick="openStatusModal('${safeId}','${safeName}','${safeStat}','${safePh}','${safeType}')">
             <i class="fa-solid fa-rotate me-1"></i>Status</button>` : ""}</td>
      <td>${perms.canInvoice
        ? `<button class="btn btn-sm pf-btn-outline py-1 px-2"
             onclick="downloadInvoiceById('${safeId}')">
             <i class="fa-solid fa-file-invoice me-1"></i>PDF</button>` : ""}</td>
    </tr>`;
  }).join("");
}

// Safe invoice download — fetches order from Firestore first (no inline JSON)
window.downloadInvoiceById = async function(orderId) {
  if (!currentShopId) return;
  try {
    const snap = await getDoc(doc(db, "shops", currentShopId, "orders", orderId));
    if (snap.exists()) generateInvoice({ id: snap.id, ...snap.data() });
    else showToast("Order not found.", "error");
  } catch (err) { showToast("Could not load order: " + err.message, "error"); }
};

function statusIcon(s) {
  return { Pending:"⏳", Designing:"✏️", Printing:"🖨️", Completed:"✅" }[s] || "●";
}
function fileExt(name) {
  return name ? name.split(".").pop().toUpperCase() : "File";
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 12 — STATUS MODAL (wired to WhatsApp alert)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.openStatusModal = function(orderId, customerName, currentStatus, phone, orderType) {
  // Store full context for the WhatsApp alert
  modalOrderCtx = { orderId, customerName, phone, orderType };
  document.getElementById("modal-order-id").value            = orderId;
  document.getElementById("modal-customer-name").textContent = customerName;
  document.getElementById("selected-status").value           = currentStatus;

  // Apply role restrictions to status buttons
  const perms = PERMISSIONS[currentUserRole] || PERMISSIONS.designer;
  document.querySelectorAll(".status-select-btn").forEach(btn => {
    const s             = btn.dataset.status;
    const allowed       = perms.canUpdateStatus.includes(s);
    btn.classList.toggle("active", s === currentStatus);
    btn.disabled        = !allowed;
    btn.style.opacity   = allowed ? "1" : "0.3";
    btn.style.cursor    = allowed ? "pointer" : "not-allowed";
  });

  new bootstrap.Modal(document.getElementById("statusModal")).show();
};

document.querySelectorAll(".status-select-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".status-select-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const selEl = document.getElementById("selected-status");
    if (selEl) selEl.value = btn.dataset.status;
  });
});

// This button now triggers both Firestore update AND WhatsApp alert
document.getElementById("btn-confirm-status")?.addEventListener("click", async () => {
  const newStatus = document.getElementById("selected-status")?.value;
  const { orderId, customerName, phone, orderType } = modalOrderCtx;
  if (!orderId || !newStatus) return;
  await handleStatusUpdateWithAlert(orderId, newStatus, customerName, phone, orderType);
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 13 — DASHBOARD STATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadDashboardStats() {
  if (!currentShopId) return;
  try {
    const all = (await getDocs(
      query(collection(db,"shops",currentShopId,"orders"),orderBy("createdAt","desc"),limit(200))
    )).docs.map(d => ({ id:d.id, ...d.data() }));

    const set = (id,v) => { const el=document.getElementById(id); if(el)el.textContent=v; };
    set("stat-total",     all.length);
    set("stat-pending",   all.filter(o=>o.status==="Pending"||o.status==="Designing").length);
    set("stat-printing",  all.filter(o=>o.status==="Printing").length);
    set("stat-completed", all.filter(o=>o.status==="Completed").length);
    renderRecentOrders(all.slice(0, 8));
  } catch (err) { console.error("Dashboard error:", err); }
}

function renderRecentOrders(orders) {
  const tbody = document.getElementById("recent-orders-tbody");
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
      No orders yet. Add your first order!
    </td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const safeId=escHtml(o.id), safeName=escHtml(o.customerName),
          safeStat=escHtml(o.status||"Pending"), safePh=escHtml(o.phone),
          safeType=escHtml(o.orderType);
    return `<tr>
      <td><strong>${safeName||"—"}</strong>
        <div class="text-muted" style="font-size:11px">${safePh||""}</div></td>
      <td>${safeType||"—"}</td>
      <td><span class="status-badge status-${safeStat}">${statusIcon(o.status)} ${safeStat}</span></td>
      <td class="${o.balanceDue>0?"credit-amount":"credit-cleared"}">
        ${o.balanceDue>0?"LKR "+fmtCurrency(o.balanceDue):"✓"}</td>
      <td><button class="btn btn-sm btn-update-status"
        onclick="openStatusModal('${safeId}','${safeName}','${safeStat}','${safePh}','${safeType}')">
        <i class="fa-solid fa-rotate"></i></button></td>
    </tr>`;
  }).join("");
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 14 — CUSTOMER LEDGER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById("btn-refresh-ledger")?.addEventListener("click", loadLedger);

async function loadLedger() {
  if (!currentShopId) return;
  const tbody = document.getElementById("ledger-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">
    <span class="spinner-border spinner-border-sm text-accent me-2"></span> Loading…
  </td></tr>`;
  try {
    const orders = (await getDocs(
      query(collection(db,"shops",currentShopId,"orders"),orderBy("customerName"))
    )).docs.map(d=>({id:d.id,...d.data()}));

    const map = {};
    orders.forEach(o => {
      const k = (o.customerName||"Unknown").toLowerCase();
      if (!map[k]) map[k]={ customerName:o.customerName||"Unknown", phone:o.phone||"—", orders:[], totalCredit:0 };
      map[k].orders.push(o); map[k].totalCredit += (o.balanceDue||0);
    });
    const customers  = Object.values(map).sort((a,b)=>b.totalCredit-a.totalCredit);
    const withCredit = customers.filter(c=>c.totalCredit>0);
    const cleared    = customers.filter(c=>c.totalCredit<=0);
    const total      = customers.reduce((s,c)=>s+c.totalCredit,0);

    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    set("ledger-total-credit","LKR "+fmtCurrency(total));
    set("ledger-customers",withCredit.length);
    set("ledger-cleared",cleared.length);

    tbody.innerHTML = customers.map(c=>`
      <tr>
        <td><strong>${escHtml(c.customerName)}</strong></td>
        <td style="font-family:var(--font-mono);font-size:12px">${escHtml(c.phone)}</td>
        <td>${c.orders.length}</td>
        <td class="${c.totalCredit>0?"credit-amount":"credit-cleared"}">
          ${c.totalCredit>0?"LKR "+fmtCurrency(c.totalCredit):"✓ Cleared"}</td>
        <td>${c.totalCredit>0
          ?`<span class="status-badge status-Pending">Outstanding</span>`
          :`<span class="status-badge status-Completed">Cleared</span>`}</td>
        <td>${c.totalCredit>0
          ?`<button class="btn btn-sm pf-btn-primary py-1 px-3"
               onclick="openPaymentModal('${escHtml(c.customerName)}',${c.totalCredit})">
               <i class="fa-solid fa-hand-holding-dollar me-1"></i>Pay</button>`:"—"}</td>
      </tr>`).join("");
  } catch(err){
    tbody.innerHTML=`<tr><td colspan="6" class="text-danger py-3">Error: ${err.message}</td></tr>`;
  }
}

window.openPaymentModal = function(customerName, outstanding) {
  document.getElementById("payment-customer-name").textContent = customerName;
  document.getElementById("payment-outstanding").textContent   = "LKR "+fmtCurrency(outstanding);
  const amtEl = document.getElementById("payment-amount");
  if (amtEl) amtEl.value = outstanding;
  new bootstrap.Modal(document.getElementById("paymentModal")).show();
};

document.getElementById("btn-confirm-payment")?.addEventListener("click", async () => {
  const amount   = parseFloat(document.getElementById("payment-amount")?.value) || 0;
  const custName = document.getElementById("payment-customer-name")?.textContent;
  if (!amount || !currentShopId) return;
  try {
    const snap = await getDocs(
      query(collection(db,"shops",currentShopId,"orders"),where("customerName","==",custName))
    );
    let rem = amount;
    for (const d of snap.docs) {
      if (rem<=0) break;
      const o = d.data();
      if ((o.balanceDue||0)>0) {
        const ded=Math.min(rem,o.balanceDue); rem-=ded;
        await updateDoc(doc(db,"shops",currentShopId,"orders",d.id),{
          balanceDue:o.balanceDue-ded, creditAmount:o.balanceDue-ded, updatedAt:serverTimestamp()
        });
      }
    }
    bootstrap.Modal.getInstance(document.getElementById("paymentModal"))?.hide();
    showToast(`Payment of LKR ${fmtCurrency(amount)} recorded.`, "success");
    loadLedger();
  } catch(err){ showToast("Payment failed: "+err.message,"error"); }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 15 — STAFF MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function loadStaffList() {
  if (!currentShopId || currentUserRole !== "owner") return;
  const tbody = document.getElementById("staff-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3">
    <span class="spinner-border spinner-border-sm text-accent me-2"></span> Loading…
  </td></tr>`;
  try {
    const staff = (await getDocs(collection(db,"shops",currentShopId,"staff")))
      .docs.map(d=>({id:d.id,...d.data()}));
    if (!staff.length) {
      tbody.innerHTML=`<tr><td colspan="5" class="text-center text-muted py-4">
        No staff added yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = staff.map(s=>`
      <tr>
        <td><strong>${escHtml(s.name||"—")}</strong></td>
        <td style="font-size:12px">${escHtml(s.email||"—")}</td>
        <td><span class="status-badge ${
          s.role==="designer"?"status-Designing":s.role==="cashier"?"status-Printing":"status-Completed"
        }">${escHtml(s.role||"—")}</span></td>
        <td><span class="status-badge status-Completed">Active</span></td>
        <td><button class="btn btn-sm" style="background:rgba(239,68,68,.12);
          border:1px solid rgba(239,68,68,.3);color:#fca5a5;border-radius:6px;
          font-size:11px;padding:4px 10px"
          onclick="removeStaff('${s.id}','${escHtml(s.name)}')">
          <i class="fa-solid fa-trash me-1"></i>Remove</button></td>
      </tr>`).join("");
  } catch(err){
    tbody.innerHTML=`<tr><td colspan="5" class="text-danger py-3">Error: ${err.message}</td></tr>`;
  }
}

window.removeStaff = async function(staffId, staffName) {
  if (!confirm(`Remove "${staffName}" from your shop?`)) return;
  try {
    await updateDoc(doc(db,"shops",currentShopId,"staff",staffId),{ role:"removed" });
    showToast(`${staffName} removed.`,"success"); loadStaffList();
  } catch(err){ showToast("Failed: "+err.message,"error"); }
};

document.getElementById("btn-add-staff")?.addEventListener("click", async () => {
  const name     = document.getElementById("staff-name")?.value.trim();
  const email    = document.getElementById("staff-email")?.value.trim();
  const password = document.getElementById("staff-password")?.value;
  const role     = document.getElementById("staff-role")?.value;
  const errEl    = document.getElementById("staff-error");

  if (!name||!email||!password||!role) {
    if(errEl){errEl.textContent="All fields are required.";errEl.classList.remove("d-none");}
    return;
  }
  const btn = document.getElementById("btn-add-staff");
  setLoadingState(btn, true, "Creating…");
  try {
    const r = await addStaffMember({ name, email, password, role });
    showToast(`"${r.name}" added as ${r.role}!`, "success");
    ["staff-name","staff-email","staff-password"].forEach(id=>{
      const el=document.getElementById(id); if(el)el.value="";
    });
    if(errEl)errEl.classList.add("d-none");
    loadStaffList();
  } catch(err) {
    if(errEl){errEl.textContent=err.message;errEl.classList.remove("d-none");}
  } finally {
    setLoadingState(btn, false, "<i class='fa-solid fa-user-plus me-2'></i>Add Staff");
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 16 — SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function loadSettings() {
  if (!currentShopData) return;
  [["settings-shopname","shopName"],["settings-phone","phone"],["settings-address","address"]]
    .forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.value=currentShopData[key]||"";});
  const em=document.getElementById("settings-email");
  if(em)em.value=currentShopData.ownerEmail||"";
}

document.getElementById("btn-save-settings")?.addEventListener("click", async () => {
  if (!currentShopId) return;
  const shopName = document.getElementById("settings-shopname")?.value.trim();
  const phone    = document.getElementById("settings-phone")?.value.trim();
  const address  = document.getElementById("settings-address")?.value.trim();
  if (!shopName) return showToast("Shop name cannot be empty.", "error");
  const btn = document.getElementById("btn-save-settings");
  setLoadingState(btn, true, "Saving…");
  try {
    await updateDoc(doc(db,"shops",currentShopId),{shopName,phone,address,updatedAt:serverTimestamp()});
    currentShopData = {...currentShopData,shopName,phone,address};
    const sn=document.getElementById("sidebar-shop-name"); if(sn)sn.textContent=shopName;
    showToast("Settings saved!", "success");
  } catch(err){ showToast("Save failed: "+err.message,"error"); }
  finally {
    setLoadingState(btn,false,"<i class='fa-solid fa-floppy-disk me-2'></i>Save Changes");
  }
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 17 — AI PRICING CALCULATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BASE_RATES = {
  sticker:       {label:"Stickers",       unit:"per sqft",    rate:350},
  flex:          {label:"Flex Banner",    unit:"per sqft",    rate:220},
  badge:         {label:"Badges",         unit:"per unit",    rate:85},
  photocopy:     {label:"Photocopy",      unit:"per page",    rate:8},
  business_card: {label:"Business Cards", unit:"per 100 pcs", rate:1800},
  tshirt:        {label:"T-Shirt Print",  unit:"per unit",    rate:650}
};

window.updatePricingUI = function() {
  const type = document.getElementById("calc-type")?.value;
  const need = ["sticker","flex"].includes(type);
  ["dim-width-wrap","dim-height-wrap"].forEach(id=>{
    const el=document.getElementById(id); if(el)el.style.display=need?"":"none";
  });
  calculatePrice();
};

window.calculatePrice = function() {
  const type=document.getElementById("calc-type")?.value||"sticker";
  const mat =parseFloat(document.getElementById("calc-material")?.value)||1.3;
  const qty =parseInt(document.getElementById("calc-qty")?.value)||1;
  const lam =document.getElementById("calc-lamination")?.checked;
  const rush=document.getElementById("calc-rush")?.checked;
  const disc=parseFloat(document.getElementById("calc-discount")?.value)||0;
  const info=BASE_RATES[type]||BASE_RATES.sticker;

  let base = ["sticker","flex"].includes(type)
    ? (parseFloat(document.getElementById("calc-width")?.value)||1) *
      (parseFloat(document.getElementById("calc-height")?.value)||1) * info.rate * qty
    : info.rate * qty;

  let price=base*mat;
  const lc=lam?price*.15:0; price+=lc;
  const rc=rush?price*.25:0; price+=rc;
  const dc=price*(disc/100);  price-=dc;
  calcPricedValue=price;

  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set("calc-result-price",fmtCurrency(price));
  set("det-base","LKR "+fmtCurrency(base));
  set("det-material",mat+"x "+materialLabel(mat));
  set("det-lam",lam?"LKR "+fmtCurrency(lc):"—");
  set("det-rush",rush?"LKR "+fmtCurrency(rc):"—");
  set("det-disc",disc>0?"−LKR "+fmtCurrency(dc):"—");
  set("det-total","LKR "+fmtCurrency(price));
  set("calc-breakdown",`${info.label} × ${qty} @ LKR ${info.rate} ${info.unit}`);
};

function materialLabel(v){
  return {1:"Economy","1.3":"Standard","1.7":"Premium","2.2":"Ultra Premium"}[String(v)]||"Standard";
}

window.copyPriceToOrder = function() {
  switchSection("new-order");
  const el=document.getElementById("ord-credit"); if(el)el.value=Math.round(calcPricedValue);
  showToast("Price copied to New Order form!", "success");
};

function buildRateCards() {
  const p=document.getElementById("rate-cards")?.parentElement;
  if(!p)return;
  p.innerHTML=`<div class="rate-cards-wrap">${
    Object.entries(BASE_RATES).map(([,v])=>`
      <div class="rate-card">
        <div class="rate-card-label">${v.label}</div>
        <div class="rate-card-val">LKR ${v.rate}</div>
        <div style="font-size:11px;color:var(--text-muted)">${v.unit}</div>
      </div>`).join("")
  }</div>`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SECTION 18 — UTILITY HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function escHtml(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function fmtCurrency(n) {
  return parseFloat(n||0).toLocaleString("en-LK",
    { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function setLoadingState(btn, loading, html) {
  if(!btn) return;
  btn.disabled=loading;
  btn.innerHTML=loading?`<span class="spinner-border spinner-border-sm me-2"></span>${html}`:html;
}
function showError(el, msg) {
  if(!el) return; el.textContent=msg; el.classList.remove("d-none");
}
function showInlineError(el, msg) {
  if(!el) return;
  el.innerHTML=`<i class="fa-solid fa-circle-exclamation me-2"></i>${msg}`;
  el.classList.remove("d-none");
}
function showToast(msg, type="success") {
  const toast=document.getElementById("pf-toast");
  const msgEl=document.getElementById("toast-msg");
  const iconEl=document.getElementById("toast-icon");
  if(!toast||!msgEl) return;
  toast.classList.remove("toast-success","toast-error");
  toast.classList.add(type==="success"?"toast-success":"toast-error");
  if(iconEl) iconEl.className=type==="success"
    ?"fa-solid fa-circle-check":"fa-solid fa-circle-exclamation";
  msgEl.textContent=msg;
  bootstrap.Toast.getOrCreateInstance(toast,{delay:3800}).show();
}
function friendlyError(code) {
  return ({
    "auth/invalid-email":         "Invalid email address.",
    "auth/user-not-found":        "No account found with this email.",
    "auth/wrong-password":        "Incorrect password.",
    "auth/invalid-credential":    "Invalid email or password.",
    "auth/email-already-in-use":  "This email is already registered.",
    "auth/weak-password":         "Password must be at least 6 characters.",
    "auth/too-many-requests":     "Too many attempts. Please wait.",
    "auth/network-request-failed":"Network error. Check your connection."
  })[code] || `An error occurred (${code}).`;
}

// Boot
setTimeout(calculatePrice, 300);
