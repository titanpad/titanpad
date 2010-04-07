/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("email.sendEmail");
import("fastJSON");
import("funhtml.*");
import("jsutils.*");
import("sqlbase.sqlobj");
import("stringutils");
import("sync");

import("etherpad.billing.billing");
import("etherpad.billing.fields");
import("etherpad.globals");
import("etherpad.globals.*");
import("etherpad.helpers");
import("etherpad.licensing");
import("etherpad.pro.pro_utils");
import("etherpad.sessions.{getSession,getTrackingId,getSessionId}");
import("etherpad.store.checkout");
import("etherpad.store.eepnet_checkout");
import("etherpad.utils.*");

import("static.js.billing_shared.{billing=>billingJS}");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------

var STORE_URL = '/ep/store/eepnet-checkout/';

var _pageSequence = [
  ['purchase', "Number of Users", true],
  ['support-contract', "Support Contract", true],
  ['license-info', "License Information", true],
  ['billing-info', "Billing Information", true],
  ['confirmation', "Confirmation", false]
];

var _specialPages = {
  'receipt': ['receipt', "Receipt", false]
}

//----------------------------------------------------------------

function _cart() {
  return getSession().eepnetCart;
}

function _currentPageSegment() {
  return request.path.split('/')[4];
}

function _currentPageId() {
  return _applyToCurrentPageSequenceEntry(function(ps) { return ps[0]; });
}

function _applyToCurrentPageSequenceEntry(f) {
  for (var i = 0; i < _pageSequence.length; i++) {
    if (_pageSequence[i][0] == _currentPageSegment()) {
      return f(_pageSequence[i], i, true);
    }
  }
  if (_specialPages[_currentPageSegment()]) {
    return f(_specialPages[_currentPageSegment()], -1, false);
  }
  return undefined;  
}

function _currentPageIndex() {
  return _applyToCurrentPageSequenceEntry(function(ps, i) { return i; });
}

function _currentPageTitle() {
  return _applyToCurrentPageSequenceEntry(function(ps) { return ps[1]; });
}

function _currentPageShowCart() {
  return _applyToCurrentPageSequenceEntry(function(ps) { return ps[2]; });
}

function _currentPageInFlow() {
  return _applyToCurrentPageSequenceEntry(function(ps, i, isSpecial) { return isSpecial });
}

function _pageId(d) {
  return _applyToCurrentPageSequenceEntry(function(ps, i) {
    if (_pageSequence[i+d]) {
      return _pageSequence[i+d][0];
    }
  });
}

function _nextPageId() { return _pageId(+1); }
function _prevPageId() { return _pageId(-1); }

function _advancePage() {
  response.redirect(_pathTo(_nextPageId()));
}

function _pathTo(id) {
  return STORE_URL+id;
}

// anything starting with 'billing' is also ok.
function _isAutomaticallySetParam(p) {
  var _automaticallySetParams = arrayToSet([
    'numUsers', 'couponCode', 'supportContract', 
    'email', 'ownerName', 'orgName', 'licenseAgreement'
  ]);

  return _automaticallySetParams[p] || stringutils.startsWith(p, "billing");
}

function _lastSubmittedPage() {
  var cart = _cart();
  return isNaN(cart.lastSubmittedPage) ? -1 : Number(cart.lastSubmittedPage);
}

function _shallowSafeCopy(obj) {
  return billing.clearKeys(obj, [
    {name: 'billingCCNumber',
     valueTest: function(s) { return /^\d{15,16}$/.test(s) },
     valueReplace: billing.replaceWithX },
    {name: 'billingCSC',
     valueTest: function(s) { return /^\d{3,4}$/.test(s) },
     valueReplace: billing.replaceWithX }]);
}

function onRequest() {
  billing.log({
    'type': "billing-request",
    'date': +(new Date),
    'method': request.method,
    'path': request.path,
    'query': request.query,
    'host': request.host,
    'scheme': request.scheme,
    'params': _shallowSafeCopy(request.params),
    'cart': _shallowSafeCopy(_cart())
  });
  if (request.path == STORE_URL+"paypalnotify") {
    _handlePaypalNotification();
  }
  if (request.path == STORE_URL+"paypalredirect") {
    _handlePayPalRedirect();
  }
  var cart = _cart();
  if (!cart || request.params.clearcart) {
    getSession().eepnetCart = { 
      lastSubmittedPage: -1,
      invoiceId: billing.createInvoice()
    };
    if (request.params.clearcart) {
      response.redirect(request.path);
    }
    if (_currentPageId() != 'purchase') {
      response.redirect(_pathTo('purchase'));
    }
    cart = _cart();
  }
  if (request.params.invoice) {
    cart.billingPurchaseType = 'invoice';
  }
  if (cart.purchaseComplete && _currentPageId() != 'receipt') {
    cart.showStartOverMessage = true;
    response.redirect(_pathTo('receipt'));
  }
  // somehow user got too far?
  if (_currentPageIndex() > _lastSubmittedPage() + 1) {
    response.redirect(_pathTo(_pageSequence[_lastSubmittedPage()+1][0]));
  }
  if (request.isGet) {
    // see if this is a standard cart-page get
    if (_currentPageId()) {
      _renderCartPage();
      return true;
    }
  }
  if (request.isPost) {
    // add params to cart
    eachProperty(request.params, function(k,v) {
      if (! _isAutomaticallySetParam(k)) { return; }
      if (k == "billingCCNumber" && v.charAt(0) == 'X') { return; }
      cart[k] = stringutils.toHTML(v);
    });
    if (_currentPageId() == 'license-info' && ! request.params.licenseAgreement) {
      delete cart.licenseAgreement;
    }
    if (_currentPageIndex() > cart.lastSubmittedPage) {
      cart.lastSubmittedPage = _currentPageIndex();
    }
  }
  if (request.params.backbutton) {
    _updateCosts();
    response.redirect(_pathTo(_prevPageId()));
  }
  return false; // commence auto-dispatch
}

function _getCoupon(code) {
  return sqlobj.selectSingle('checkout_referral', {id: code});
}

function _supportCost() {
  var cart = _cart();
  return Math.max(eepnet_checkout.SUPPORT_MIN_COST, eepnet_checkout.SUPPORT_COST_PCT/100*cart.baseCost);  
}

function _discountedSupportCost() {
  var cart = _cart();
  if ('couponSupportPctDiscount' in cart) {
    return _supportCost() - 
      (cart.couponSupportPctDiscount ? 
       cart.couponSupportPctDiscount/100 * _supportCost() :
       0);
  }
}

function _updateCosts() {
  var cart = _cart();
  
  if (cart.numUsers) {
    cart.numUsers = Number(cart.numUsers);
    
    cart.baseCost = cart.numUsers * eepnet_checkout.COST_PER_USER;
    
    if (cart.supportContract == "true") {
      cart.supportCost = _supportCost();
    } else {
      delete cart.supportCost;
    }
    
    var coupon = _getCoupon(cart.couponCode);
    if (coupon) {
      for (i in coupon) {
        cart["coupon"+stringutils.makeTitle(i)] = coupon[i];
      }
      cart.coupon = coupon;
    } else {
      for (i in cart.coupon) {
        delete cart["coupon"+stringutils.makeTitle(i)];
      }
      delete cart.coupon;
    }
    
    if (cart.couponProductPctDiscount) {
      cart.productReferralDiscount = 
        cart.couponProductPctDiscount/100 * cart.baseCost;
    } else {
      delete cart.productReferralDiscount;
    }
    if (cart.couponSupportPctDiscount) {
      cart.supportReferralDiscount = 
        cart.couponSupportPctDiscount/100 * (cart.supportCost || 0);
    } else {
      delete cart.supportReferralDiscount;
    }
    cart.subTotal = 
      cart.baseCost - (cart.productReferralDiscount || 0) +
      (cart.supportCost || 0) - (cart.supportReferralDiscount || 0);

    if (cart.couponTotalPctDiscount) {
      cart.totalReferralDiscount =
        cart.couponTotalPctDiscount/100 * cart.subTotal;
    } else {
      delete cart.totalReferralDiscount;
    }
    
    if (cart.couponFreeUsersCount || cart.couponFreeUsersPct) {
      cart.freeUserCount = 
        Math.round(cart.couponFreeUsersCount + 
                   cart.couponFreeUsersPct/100 * cart.numUsers);
    } else {
      delete cart.freeUserCount;
    }
    cart.userCount = Number(cart.numUsers) + Number(cart.freeUserCount || 0);

    cart.total =
      cart.subTotal - (cart.totalReferralDiscount || 0);
  }
}

//----------------------------------------------------------------
// template helper functions
//----------------------------------------------------------------

function _cartDebug() {
  if (globals.isProduction()) {
    return '';
  }

  var d = DIV({style: 'font-family: monospace; font-size: 1em; border: 1px solid #ccc; padding: 1em; margin: 1em;'});
  d.push(H3({style: "font-size: 1.5em; font-weight: bold;"}, "Debug Info:"));
  var t = TABLE({border: 1, cellspacing: 0, cellpadding: 4});
  keys(_cart()).sort().forEach(function(k) {
    var v = _cart()[k];
    if (typeof(v) == 'object' && v != null) {
      v = v.toSource();
    }
    t.push(TR(TD({style: 'padding: 2px 6px;', align: 'right'}, k),
        TD({style: 'padding: 2px 6px;', align: 'left'}, v)));
  });
  d.push(t);
  return d;
}

var billingButtonName = "Review Order";

function _templateContext(extra) {
  var cart = _cart();
  
  var pageId = _currentPageId();

  var ret = {
    cart: cart,
    costPerUser: eepnet_checkout.COST_PER_USER,
    supportCostPct: eepnet_checkout.SUPPORT_COST_PCT,
    supportMinCost: eepnet_checkout.SUPPORT_MIN_COST,
    errorIfInvalid: _errorIfInvalid,
    dollars: checkout.dollars,
    countryList: fields.countryList,
    usaStateList: fields.usaStateList,
    obfuscateCC: checkout.obfuscateCC,
    helpers: helpers,
    inFlow: _currentPageInFlow(),
    displayCart: _displayCart,
    displaySummary: _displaySummary,
    pathTo: _pathTo,
    billing: billingJS,
    handlePayPalRedirect: _handlePayPalRedirect,
    supportCost: _supportCost,
    discountedSupportCost: _discountedSupportCost,
    billingButtonName: billingButtonName,
    billingFinalPhrase: "<p>You will not be charged until you review"+
      " and confirm your order on the next page.</p>",
    getFullSuperdomainHost: pro_utils.getFullSuperdomainHost,
    showCouponCode: false
  };
  eachProperty(extra, function(k, v) {
    ret[k] = v;
  });
  return ret;
}

function _displayCart(cartid, editable) {
  return renderTemplateAsString('store/eepnet-checkout/cart.ejs', _templateContext({
    shoppingcartid: cartid || "shoppingcart",
    editable: editable
  }));
}

function _displaySummary(editable) {
  return renderTemplateAsString('store/eepnet-checkout/summary.ejs', _templateContext({
    editable: editable
  }));
}

function _renderCartPage() {
  var cart = _cart();

  var pageId = _currentPageId();
  var title = _currentPageTitle();

  function _getContent() {
    return renderTemplateAsString('store/eepnet-checkout/'+pageId+'.ejs', _templateContext());
  }

  renderFramed('store/eepnet-checkout/checkout-template.ejs', {
    cartDebug: _cartDebug,
    errorDiv: _errorDiv,
    pageId: pageId,
    getContent: _getContent,
    title: title,
    inFlow: _currentPageInFlow(),
    displayCart: _displayCart,
    showCart: _currentPageShowCart(),
    cart: cart,
    billingButtonName: billingButtonName
  });

  // clear errors
  delete cart.errorMsg;
  delete cart.errorId;
}

function _errorDiv() {
  var m = _cart().errorMsg;
  if (m) {
    return DIV({className: 'errormsg', id: 'errormsg'}, m);
  } else {
    return '';
  }
}

function _errorIfInvalid(id) {
  var e = _cart().errorId
  if (e && e[id]) {
    return 'error';
  } else {
    return '';
  }
}

function _validationError(id, msg, pageId) {
  var cart = _cart();
  cart.errorMsg = msg;
  cart.errorId = {};
  if (id instanceof Array) {
    id.forEach(function(k) {
      cart.errorId[k] = true;
    });
  } else {
    cart.errorId[id] = true;
  }
  if (pageId) {
    response.redirect(_pathTo(pageId));
  }
  response.redirect(request.path);
}

//--------------------------------------------------------------------------------
// main
//--------------------------------------------------------------------------------

function render_main() {
  response.redirect(STORE_URL+'purchase');
}

//--------------------------------------------------------------------------------
// cart
//--------------------------------------------------------------------------------

function render_purchase_post() {
  var cart = _cart();

  // validate numUsers and couponCode
  if (! checkout.isOnlyDigits(cart.numUsers)) {
    _validationError("numUsers", "Please enter a valid number of users.");
  }
  if (Number(cart.numUsers) < 1) {
    _validationError("numUsers", "Please specify at least one user.");
  }

  if (cart.couponCode && (cart.couponCode.length != 8 || ! _getCoupon(cart.couponCode))) {
    _validationError("couponCode", "That coupon code does not appear to be valid.");
  }

  _updateCosts();
  _advancePage();
}

//--------------------------------------------------------------------------------
// support-contract
//--------------------------------------------------------------------------------

function render_support_contract_post() {
  var cart = _cart();

  if (cart.supportContract != "true" && cart.supportContract != "false") {
    _validationError("supportContract", "Please select one of the options.");
  }

  _updateCosts();
  _advancePage();
}

//--------------------------------------------------------------------------------
// license-info
//--------------------------------------------------------------------------------

function render_license_info_post() {
  var cart = _cart();

  if (!isValidEmail(cart.email)) {
    _validationError("email", "That email address does not look valid.");
  }
  if (!cart.ownerName) {
    _validationError("ownerName", "Please enter a license owner name.");
  }
  if (!cart.orgName) {
    _validationError("orgName", "Please enter an organization name.");
  }  
  if (!cart.licenseAgreement) {
    _validationError("licenseAgreement", "You must agree to the terms of the license to purchase EtherPad PNE.");
  }

  if ((! cart.billingFirstName) && ! (cart.billingLastName)) {
    var nameParts = cart.ownerName.split(/\s+/);
    if (nameParts.length == 1) {
      cart.billingFirstName = nameParts[0];
    } else {
      cart.billingLastName = nameParts[nameParts.length-1];
      cart.billingFirstName = nameParts.slice(0, nameParts.length-1).join(' ');
    }
  }

  _updateCosts();
  _advancePage();
}

//--------------------------------------------------------------------------------
// billing-info
//--------------------------------------------------------------------------------

function render_billing_info_post() {
  var cart = _cart();

  checkout.validateBillingCart(_validationError, cart);
  if (cart.billingPurchaseType == 'paypal') {
    _beginPaypalPurchase();
  }

  _updateCosts();
  _advancePage();
}

function _absoluteUrl(id) {
  return request.scheme+"://"+request.host+_pathTo(id);
}

function _beginPaypalPurchase() {
  _updateCosts();
  
  var cart = _cart();
  
  var purchase = _generatePurchaseRecord();
  var result = 
    billing.beginExpressPurchase(cart.invoiceId, cart.customerId, 
                                 "EEPNET", cart.total || 0.01, cart.couponCode || "",
                                 _absoluteUrl('paypalredirect?status=ok'),
                                 _absoluteUrl('paypalredirect?status=fail'),
                                 _absoluteUrl('paypalnotify'));
  if (result.status != 'success') {
    _validationError("billingPurchaseType",
                     "PayPal purchase not available at the moment. "+
                     "Please try again later, or try using a different payment option.");
  }
  cart.paypalPurchaseInfo = result.purchaseInfo;
  response.redirect(billing.paypalPurchaseUrl(result.purchaseInfo.token));
}

//--------------------------------------------------------------------------------
// confirmation
//--------------------------------------------------------------------------------

function _handlePaypalNotification() {
  var ret = billing.handlePaypalNotification();
  if (ret.status == 'completion') {
    var purchaseInfo = ret.purchaseInfo;
    var eepnetPurchase = eepnet_checkout.getPurchaseByInvoiceId(purchaseInfo.invoiceId);
    var fakeCart = {
      ownerName: eepnetPurchase.owner,
      orgName: eepnetPurchase.organization,
      email: eepnetPurchase.emails,
      customerId: eepnetPurchase.id,
      userCount: eepnetPurchase.numUsers,
      receiptEmail: eepnetPurchase.receiptEmail,
    }
    eepnet_checkout.generateLicenseKey(fakeCart);
    eepnet_checkout.sendReceiptEmail(fakeCart);
    eepnet_checkout.sendLicenseEmail(fakeCart);
    billing.log({type: 'purchase-complete', dollars: purchaseInfo.cost});
  }
}

function _handlePayPalRedirect() {
  var cart = _cart();
  
  if (request.params.status == 'ok' && cart.paypalPurchaseInfo) {
    var result = billing.continueExpressPurchase(cart.paypalPurchaseInfo);
    if (result.status == 'success') {
      cart.paypalPayerInfo = result.payerInfo;
      response.redirect(_pathTo('confirmation'));
    } else {
      _validationError("billingPurchaseType",
                       "There was an error processing your payment through PayPal. "+
                       "Please try again later, or use a different payment option.",
                       'billing-info');
    }
  } else {
    _validationError("billingPurchaseType",
                     "PayPal payment didn't go through. "+
                     "Please try again later, or use a different payment option.",
                     'billing-info');
  }
}

function _recordPurchase(p) {
  return sqlobj.insert("checkout_purchase", p);
}

function _generatePurchaseRecord() {
  var cart = _cart();

  if (! cart.invoiceId) {
    throw Error("No invoice id!");
  }

  var purchase = {
    invoiceId: cart.invoiceId,
    email: cart.email,
    firstName: cart.billingFirstName,
    lastName: cart.billingLastName,
    owner: cart.ownerName || "",
    organization: cart.orgName || "",
    addressLine1: cart.billingAddressLine1 || "",
    addressLine2: cart.billingAddressLine2 || "",
    city: cart.billingCity || "",
    state: cart.billingState || "",
    zip: cart.billingZipCode || "",
    referral: cart.couponCode,
    cents: cart.total*100, // cents here.
    numUsers: cart.userCount,
    purchaseType: cart.billingPurchaseType,
  }
  cart.customerId = _recordPurchase(purchase);
  return purchase;
}

function _performCreditCardPurchase() {
  var cart = _cart();
  var purchase = _generatePurchaseRecord();
  var payInfo = checkout.generatePayInfo(cart);

  // log everything but the CVV, which we're not allowed to store
  // any longer than it takes to process this transaction.
  var savedCvv = payInfo.cardCvv;
  delete payInfo.cardCvv;
  checkout.writeToEncryptedLog(fastJSON.stringify({date: String(new Date()), purchase: purchase, customerId: cart.customerId, payInfo: payInfo}));
  payInfo.cardCvv = savedCvv;

  var result = 
    billing.directPurchase(cart.invoiceId, cart.customerId, 
                           "EEPNET", cart.total || 0.01, 
                           cart.couponCode || "", 
                           payInfo, _absoluteUrl('paypalnotify'));

  if (result.status == 'success') {
    cart.status = 'success';
    cart.purchaseComplete = true;
    eepnet_checkout.generateLicenseKey(cart);
    eepnet_checkout.sendReceiptEmail(cart);
    eepnet_checkout.sendLicenseEmail(cart);
    billing.log({type: 'purchase-complete', dollars: cart.total, 
                 email: cart.email, user: cart.ownerName,
                 org: cart.organization});
    // TODO: generate key and include in receipt page, and add to purchase table.
  } else if (result.status == 'pending') {
    cart.status = 'pending';
    cart.purchaseComplete = true;
    eepnet_checkout.sendReceiptEmail(cart);
    // save the receipt email text to resend later.
    eepnet_checkout.updatePurchaseWithReceipt(cart.customerId, 
      eepnet_checkout.receiptEmailText(cart));
  } else if (result.status == 'failure') {
    var paypalResult = result.debug;
    billing.log({'type': 'FATAL', value: "Direct purchase failed on paypal.", cart: cart, paypal: paypalResult});
    if (result.errorField.permanentErrors[0] == 'invoiceId') {
      // repeat invoice id. damnit, this is bad.
      sendEmail('support@etherpad.com', 'urgent@etherpad.com', 'DUPLICATE INVOICE WARNING!', {}, 
                "Hey,\n\nThis is a billing system error. The EEPNET checkout tried to make a "+
                "purchase with PayPal and got a duplicate invoice error on invoice ID "+cart.invoiceId+
                ".\n\nUnless you're expecting this (or recently ran a selenium test, or have reason to "+
                "believe this isn't an exceptional condition, please look into this "+
                "and get back to the user ASAP!\n\n"+fastJSON.stringify(cart));
      _validationError('', "Your payment was processed, but we cannot proceed. "+
                           "You will hear from us shortly via email. (If you don't hear from us "+
                           "within 24 hours, please email <a href='mailto:sales@etherpad.com'>"+
                           "sales@etherpad.com</a>.)");
    }
    checkout.validateErrorFields(function(x, y) { _validationError(x, y, 'billing-info') }, "There seems to be an error in your billing information."+
                         " Please verify and correct your ",
                         result.errorField.userErrors);
    checkout.validateErrorFields(function(x, y) { _validationError(x, y, 'billing-info') }, "The bank declined your billing information. Please try a different ",
                         result.errorField.permanentErrors);
    _validationError('', "A temporary error has prevented processing of your payment. Please try again later.");
  } else {
    billing.log({'type': 'FATAL', value: "Unknown error: "+result.status+" - debug: "+result.debug});
    sendEmail('support@etherpad.com', 'urgent@etherpad.com', 'UNKNOWN ERROR WARNING!', {}, 
              "Hey,\n\nThis is a billing system error. Some unknown error occurred. "+
              "This shouldn't ever happen. Probably good to let J.D. know. <grin>\n\n"+
              fastJSON.stringify(cart));
    _validationError('', "An unknown error occurred. We're looking into it!")
  }
}

function _completePaypalPurchase() {
  var cart = _cart();
  var purchaseInfo = cart.paypalPurchaseInfo;
  var payerInfo = cart.paypalPayerInfo;
  
  var result = billing.completeExpressPurchase(purchaseInfo, payerInfo, _absoluteUrl('paypalnotify'));
  if (result.status == 'success') {
    cart.status = 'success';
    cart.purchaseComplete = true;
    eepnet_checkout.generateLicenseKey(cart);
    eepnet_checkout.sendReceiptEmail(cart);
    eepnet_checkout.sendLicenseEmail(cart);
    billing.log({type: 'purchase-complete', dollars: cart.total, 
                 email: cart.email, user: cart.ownerName,
                 org: cart.organization});

  } else if (result.status == 'pending') {
    cart.status = 'pending';
    cart.purchaseComplete = true;
    eepnet_checkout.sendReceiptEmail(cart);
    // save the receipt email text to resend later.
    eepnet_checkout.updatePurchaseWithReceipt(cart.customerId, 
      eepnet_checkout.receiptEmailText(cart));
  } else {
    billing.log({'type': 'FATAL', value: "Paypal failed.", cart: cart, paypal: paypalResult});
    _validationError("billingPurchaseType",
                     "There was an error processing your payment through PayPal. "+
                     "Please try again later, or use a different payment option.",
                     'billing-info');
  }
}

function _showReceipt() {
  response.redirect(_pathTo('receipt'));
}

function render_confirmation_post() {
  var cart = _cart();

  _updateCosts(); // no fishy business, please.

  if (cart.billingPurchaseType == 'creditcard') {
    _performCreditCardPurchase();
    _showReceipt();
  } else if (cart.billingPurchaseType == 'paypal') {
    _completePaypalPurchase();
    _showReceipt();
  }
}

//--------------------------------------------------------------------------------
// receipt
//--------------------------------------------------------------------------------

function render_receipt_post() {
  response.redirect(request.path);
}
