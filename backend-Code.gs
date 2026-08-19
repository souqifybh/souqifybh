/**
 * SOUQIFY-BH — Free Google Sheets backend
 * -----------------------------------------------------
 * Paste this whole file into Extensions > Apps Script in your
 * Google Sheet, then Deploy > New deployment > Web app.
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Copy the deployment URL into CONFIG.API_URL in index.html and admin.html.
 *
 * IMPORTANT: every time you edit this file, you must go to
 * Deploy > Manage deployments > (pencil icon) > New version > Deploy,
 * or your live site keeps calling the OLD version of this script.
 *
 * Sheet tabs (created / auto-repaired automatically on first run):
 *   Products:  id | name | description | price | compareAtPrice | image1 | image2
 *              | image3 | image4 | image5 | category | stock | active | featured | bestseller
 *   Orders:    id | timestamp | customerName | customerEmail | phone | address | items
 *              | total | paymentMethod | paymentStatus | orderStatus | notes
 *   Customers: id | name | email | phone | passwordHash | salt | createdAt
 *   Settings:  key | value   (used for the homepage hero / "Featured Gadget" banner)
 *
 * All reads/writes below are done BY HEADER NAME, not by fixed column
 * number. That means: (1) it's safe to reorder columns in the sheet by
 * hand, and (2) if you're upgrading an older version of this script that
 * used fewer columns, any missing columns get appended automatically the
 * next time the script runs — nothing gets shifted or corrupted.
 */

const ADMIN_PASSWORD = 'change-this-password'; // <-- set your own admin password

/* ================= generic sheet helpers ================= */

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

// Self-heals a sheet whose header row is missing columns this version of
// the script expects — appends any missing headers to the right rather
// than touching existing columns, so old data never shifts.
function ensureHeaders_(sheet, expectedHeaders) {
  const lastCol = sheet.getLastColumn();
  const existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const missing = expectedHeaders.filter(h => existing.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
}

// Maps header name -> 1-based column number, read fresh each call so it
// always reflects the sheet's actual current layout.
function headerMap_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { if (h) map[h] = i + 1; });
  return map;
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(row => row[0] !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isTrue_(v) {
  return v === true || v === 'TRUE' || v === 1 || v === '1';
}

/* ================= sheet schemas ================= */

const PRODUCT_HEADERS = ['id','name','description','price','compareAtPrice','image1','image2','image3','image4','image5','category','stock','active','featured','bestseller'];
const ORDER_HEADERS = ['id','timestamp','customerName','customerEmail','phone','address','items','total','paymentMethod','paymentStatus','orderStatus','notes'];
const CUSTOMER_HEADERS = ['id','name','email','phone','passwordHash','salt','createdAt'];
const SETTINGS_HEADERS = ['key','value'];

function productsSheet_()  { return getSheet_('Products', PRODUCT_HEADERS); }
function ordersSheet_()    { return getSheet_('Orders', ORDER_HEADERS); }
function customersSheet_() { return getSheet_('Customers', CUSTOMER_HEADERS); }
function settingsSheet_()  { return getSheet_('Settings', SETTINGS_HEADERS); }

// Bundles image1..image5 into an `images` array so the frontend doesn't
// need to know about the underlying column layout.
function withImagesArray_(p) {
  const images = [p.image1, p.image2, p.image3, p.image4, p.image5].filter(v => v !== '' && v != null);
  return Object.assign({}, p, { images });
}

/* ================= entry points ================= */

function doGet(e) {
  const action = (e.parameter.action || 'listProducts');
  if (action === 'listProducts') {
    const products = sheetToObjects_(productsSheet_())
      .filter(p => isTrue_(p.active))
      .map(withImagesArray_);
    return jsonOut_({ ok: true, products });
  }
  if (action === 'getSettings') {
    return jsonOut_({ ok: true, settings: readSettings_() });
  }
  return jsonOut_({ ok: false, error: 'Unknown GET action' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Bad JSON' });
  }
  const action = body.action;

  // Admin actions require the password
  const adminActions = ['addProduct','updateProduct','deleteProduct','listOrdersAdmin','updateOrderStatus','listAllProducts','updateSettings','listCustomersAdmin'];
  if (adminActions.includes(action) && body.password !== ADMIN_PASSWORD) {
    return jsonOut_({ ok: false, error: 'Invalid admin password' });
  }

  switch (action) {
    case 'placeOrder': return placeOrder_(body);
    case 'addProduct': return addProduct_(body);
    case 'updateProduct': return updateProduct_(body);
    case 'deleteProduct': return deleteProduct_(body);
    case 'listAllProducts': return jsonOut_({ ok: true, products: sheetToObjects_(productsSheet_()).map(withImagesArray_) });
    case 'listOrdersAdmin': return jsonOut_({ ok: true, orders: sheetToObjects_(ordersSheet_()) });
    case 'updateOrderStatus': return updateOrderStatus_(body);
    case 'updateSettings': return updateSettings_(body);
    case 'listCustomersAdmin': return jsonOut_({ ok: true, customers: sheetToObjects_(customersSheet_()).map(stripAuthFields_) });
    case 'registerCustomer': return registerCustomer_(body);
    case 'loginCustomer': return loginCustomer_(body);
    default: return jsonOut_({ ok: false, error: 'Unknown POST action' });
  }
}

/* ================= settings / hero banner ================= */

function readSettings_() {
  const rows = sheetToObjects_(settingsSheet_());
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}

function updateSettings_(body) {
  const sheet = settingsSheet_();
  const updates = body.settings || {};
  const values = sheet.getDataRange().getValues();
  const existingKeys = {};
  for (let i = 1; i < values.length; i++) existingKeys[values[i][0]] = i + 1;
  Object.keys(updates).forEach(key => {
    const val = updates[key];
    if (existingKeys[key]) {
      sheet.getRange(existingKeys[key], 2).setValue(val);
    } else {
      sheet.appendRow([key, val]);
    }
  });
  return jsonOut_({ ok: true, settings: readSettings_() });
}

/* ================= products ================= */

// body.images is expected to be an array of up to 5 URL strings (empty
// strings/undefined are fine — they just leave that image slot blank).
function imagesFromBody_(body) {
  const imgs = Array.isArray(body.images) ? body.images : [];
  const out = [];
  for (let i = 0; i < 5; i++) out.push(imgs[i] || '');
  return out;
}

function addProduct_(body) {
  const sheet = productsSheet_();
  const map = headerMap_(sheet);
  const numCols = sheet.getLastColumn();
  const row = new Array(numCols).fill('');
  const set = (name, val) => { if (map[name]) row[map[name] - 1] = val; };

  const id = 'P-' + new Date().getTime();
  const imgs = imagesFromBody_(body);

  set('id', id);
  set('name', body.name || '');
  set('description', body.description || '');
  set('price', Number(body.price || 0));
  set('compareAtPrice', body.compareAtPrice ? Number(body.compareAtPrice) : '');
  imgs.forEach((v, i) => set('image' + (i + 1), v));
  set('category', body.category || '');
  set('stock', Number(body.stock || 0));
  set('active', body.active !== undefined ? !!body.active : true);
  set('featured', !!body.featured);
  set('bestseller', !!body.bestseller);

  sheet.appendRow(row);
  return jsonOut_({ ok: true, id });
}

function updateProduct_(body) {
  const sheet = productsSheet_();
  const map = headerMap_(sheet);
  const idCol = (map['id'] || 1) - 1;
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      const row = i + 1;
      const setCell = (name, val) => { if (map[name]) sheet.getRange(row, map[name]).setValue(val); };

      if (body.name !== undefined) setCell('name', body.name);
      if (body.description !== undefined) setCell('description', body.description);
      if (body.price !== undefined) setCell('price', Number(body.price));
      if (body.compareAtPrice !== undefined) setCell('compareAtPrice', body.compareAtPrice ? Number(body.compareAtPrice) : '');
      if (Array.isArray(body.images)) {
        const imgs = imagesFromBody_(body);
        imgs.forEach((v, idx) => setCell('image' + (idx + 1), v));
      }
      if (body.category !== undefined) setCell('category', body.category);
      if (body.stock !== undefined) setCell('stock', Number(body.stock));
      if (body.active !== undefined) setCell('active', !!body.active);
      if (body.featured !== undefined) setCell('featured', !!body.featured);
      if (body.bestseller !== undefined) setCell('bestseller', !!body.bestseller);
      return jsonOut_({ ok: true });
    }
  }
  return jsonOut_({ ok: false, error: 'Product not found' });
}

function deleteProduct_(body) {
  const sheet = productsSheet_();
  const map = headerMap_(sheet);
  const idCol = (map['id'] || 1) - 1;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      sheet.deleteRow(i + 1);
      return jsonOut_({ ok: true });
    }
  }
  return jsonOut_({ ok: false, error: 'Product not found' });
}

/* ================= orders ================= */

function placeOrder_(body) {
  if (!body.customerEmail) {
    return jsonOut_({ ok: false, error: 'Please log in before placing an order.' });
  }
  const sheet = ordersSheet_();
  const map = headerMap_(sheet);
  const numCols = sheet.getLastColumn();
  const row = new Array(numCols).fill('');
  const set = (name, val) => { if (map[name]) row[map[name] - 1] = val; };

  const id = 'ORD-' + Utilities.formatDate(new Date(), 'GMT+3', 'yyMMdd-HHmmss');

  set('id', id);
  set('timestamp', new Date());
  set('customerName', body.customerName || '');
  set('customerEmail', (body.customerEmail || '').toLowerCase());
  set('phone', body.phone || '');
  set('address', body.address || '');
  set('items', JSON.stringify(body.items || []));
  set('total', body.total || 0);
  set('paymentMethod', body.paymentMethod || '');
  set('paymentStatus', 'pending');
  set('orderStatus', 'new');
  set('notes', body.notes || '');

  sheet.appendRow(row);
  return jsonOut_({ ok: true, orderId: id });
}

function updateOrderStatus_(body) {
  const sheet = ordersSheet_();
  const map = headerMap_(sheet);
  const idCol = (map['id'] || 1) - 1;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][idCol] === body.id) {
      const row = i + 1;
      const setCell = (name, val) => { if (map[name]) sheet.getRange(row, map[name]).setValue(val); };
      if (body.paymentStatus !== undefined) setCell('paymentStatus', body.paymentStatus);
      if (body.orderStatus !== undefined) setCell('orderStatus', body.orderStatus);
      if (body.notes !== undefined) setCell('notes', body.notes);
      return jsonOut_({ ok: true });
    }
  }
  return jsonOut_({ ok: false, error: 'Order not found' });
}

/* ================= customers (simple email + password auth) =================
 * NOTE: this is a lightweight auth scheme suitable for a small store
 * (salted SHA-256 hash, no plaintext passwords stored). It is NOT the same
 * level of security as a dedicated auth provider — don't reuse this sheet
 * for anything beyond "recognize a returning customer at checkout".
 */

function randomSalt_() {
  return Utilities.getUuid();
}
function hashPassword_(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}
function stripAuthFields_(c) {
  const clean = Object.assign({}, c);
  delete clean.passwordHash;
  delete clean.salt;
  return clean;
}

function findCustomerByEmail_(sheet, map, email) {
  const emailCol = (map['email'] || 3) - 1;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if ((values[i][emailCol] || '').toString().toLowerCase() === email.toLowerCase()) {
      const obj = {};
      Object.keys(map).forEach(h => obj[h] = values[i][map[h] - 1]);
      return { row: i + 1, data: obj };
    }
  }
  return null;
}

function registerCustomer_(body) {
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const name = (body.name || '').trim();
  if (!email || !password || !name) {
    return jsonOut_({ ok: false, error: 'Name, email and password are all required.' });
  }
  if (password.length < 6) {
    return jsonOut_({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  const sheet = customersSheet_();
  const map = headerMap_(sheet);
  if (findCustomerByEmail_(sheet, map, email)) {
    return jsonOut_({ ok: false, error: 'An account with this email already exists — please log in instead.' });
  }
  const salt = randomSalt_();
  const passwordHash = hashPassword_(password, salt);
  const id = 'C-' + new Date().getTime();

  const numCols = sheet.getLastColumn();
  const row = new Array(numCols).fill('');
  const set = (name_, val) => { if (map[name_]) row[map[name_] - 1] = val; };
  set('id', id);
  set('name', name);
  set('email', email);
  set('phone', body.phone || '');
  set('passwordHash', passwordHash);
  set('salt', salt);
  set('createdAt', new Date());
  sheet.appendRow(row);

  return jsonOut_({ ok: true, customer: { id, name, email, phone: body.phone || '' } });
}

function loginCustomer_(body) {
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) {
    return jsonOut_({ ok: false, error: 'Email and password are required.' });
  }
  const sheet = customersSheet_();
  const map = headerMap_(sheet);
  const found = findCustomerByEmail_(sheet, map, email);
  if (!found) {
    return jsonOut_({ ok: false, error: 'No account found with this email. Please register first.' });
  }
  const computed = hashPassword_(password, found.data.salt);
  if (computed !== found.data.passwordHash) {
    return jsonOut_({ ok: false, error: 'Incorrect password.' });
  }
  return jsonOut_({ ok: true, customer: { id: found.data.id, name: found.data.name, email: found.data.email, phone: found.data.phone } });
}
