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

import("dateutils");
import("email.sendEmail");
import("fastJSON");
import("funhtml.*");
import("jsutils.*");
import("sqlbase.sqlcommon.inTransaction");
import("stringutils.*");

import("etherpad.billing.billing");
import("etherpad.billing.fields");
import("etherpad.billing.team_billing");
import("etherpad.control.pro.admin.pro_admin_control");
import("etherpad.globals");
import("etherpad.helpers");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_utils");
import("etherpad.sessions");
import("etherpad.store.checkout");
import("etherpad.utils.*");

import("static.js.billing_shared.{billing=>billingJS}");

var billingButtonName = "Confirm"

function _cart() {
  var s = sessions.getSession();
  if (! s.proBillingCart) {
    s.proBillingCart = {};
  }
  return s.proBillingCart;
}

function _billingForm() {
  return renderTemplateAsString('store/eepnet-checkout/billing-info.ejs', {
    cart: _cart(),
    billingButtonName: billingButtonName,
    billingFinalPhrase: "",
    helpers: helpers,
    errorIfInvalid: _errorIfInvalid,
    billing: billingJS,
    obfuscateCC: checkout.obfuscateCC,
    dollars: checkout.dollars,
    countryList: fields.countryList,
    usaStateList: fields.usaStateList,
    getFullSuperdomainHost: pro_utils.getFullSuperdomainHost,
    showCouponCode: true,
  });
}

function _plural(num) {
  return (num == 1 ? "" : "s");
}

function _billingSummary(domainId, subscription) {
  var paymentInfo = team_billing.getRecurringBillingInfo(domainId);
  if (! paymentInfo) {
    return;
  }
  var latestInvoice = team_billing.getLatestPaidInvoice(subscription.id);
  var usersSoFar = team_billing.getMaxUsers(domainId);
  var costSoFar = team_billing.calculateSubscriptionCost(usersSoFar, subscription.coupon);
  
  var lastPaymentString = 
    (latestInvoice ? 
     "US $"+checkout.dollars(billing.centsToDollars(latestInvoice.amt))+
     " ("+latestInvoice.users+" account"+_plural(latestInvoice.users)+")"+
     ", on "+checkout.formatDate(latestInvoice.time) : 
     "None");
  
  var coupon = false;
  if (subscription.coupon) {
    println("has a coupon: "+subscription.coupon);
    var cval = team_billing.getCouponValue(subscription.coupon);
    coupon = [];
    if (cval.freeUsers) {
      coupon.push(cval.freeUsers+" free user"+(cval.freeUsers == 1 ? "" : "s"));
    }
    if (cval.pctDiscount) {
      coupon.push(cval.pctDiscount+"% savings");
    }
    coupon = coupon.join(", ");
  }
  
  return {
    fullName: paymentInfo.fullname,
    paymentSummary: 
      paymentInfo.paymentsummary + 
      (paymentInfo.expiration ? 
       ", expires "+checkout.formatExpiration(paymentInfo.expiration) :
       ""),
    lastPayment: lastPaymentString,
    nextPayment: checkout.formatDate(subscription.paidThrough),
    maxUsers: usersSoFar,
    estimatedPayment: "US $"+checkout.dollars(costSoFar),
    coupon: coupon
  }
}

function _statusMessage() {
  if (_cart().statusMessage) {
    return toHTML(P({style: "color: green;"}, _cart().statusMessage));
  } else {
    return '';
  }
}

function renderMainPage(doEdit) {
  var cart = _cart();
  var domainId = domains.getRequestDomainId();
  var subscription = team_billing.getSubscriptionForCustomer(domainId);
  var pendingInvoice = team_billing.getLatestPendingInvoice(domainId)
  var usersSoFar = team_billing.getMaxUsers(domainId);
  var costSoFar = team_billing.calculateSubscriptionCost(usersSoFar, subscription && subscription.coupon);

  checkout.guessBillingNames(cart, pro_accounts.getSessionProAccount().fullName);
  if (! cart.billingReferralCode) {
    if (subscription && subscription.coupon) {
      cart.billingReferralCode = subscription.coupon;
    }
  }
  
  var summary = _billingSummary(domainId, subscription);
  if (! summary) {
    doEdit = true;
  }

  pro_admin_control.renderAdminPage('manage-billing', {
    billingForm: _billingForm,
    doEdit: doEdit,
    paymentInfo: summary,
    getFullSuperdomainHost: pro_utils.getFullSuperdomainHost,
    firstCharge: checkout.formatDate(subscription ? subscription.paidThrough : dateutils.nextMonth(new Date)),
    billingButtonName: billingButtonName,
    errorDiv: _errorDiv,
    showBackButton: (summary != undefined),
    statusMessage: _statusMessage,
    isBehind: (subscription ? subscription.paidThrough < Date.now() - 86400*1000 : false),
    amountDue: "US $"+checkout.dollars(billing.centsToDollars(pendingInvoice ? pendingInvoice.amt : costSoFar*100)),
    cart: _cart()
  });
  
  delete _cart().errorId;
  delete _cart().errorMsg;
  delete _cart().statusMessage;
}

function render_main() {
  renderMainPage(false);
}

function render_edit() {
  renderMainPage(true);
}

function _errorDiv() {
  var m = _cart().errorMsg;
  if (m) {
    return DIV({className: 'errormsg', id: 'errormsg'}, m);
  } else {
    return '';
  }
}

function _validationError(id, errorMessage) {
  var cart = _cart();
  cart.errorMsg = errorMessage;
  cart.errorId = {};
  if (id instanceof Array) {
    id.forEach(function(k) {
      cart.errorId[k] = true;
    });
  } else {
    cart.errorId[id] = true;
  }
  response.redirect('/ep/admin/billing/edit');
}

function _errorIfInvalid(id) {
  var cart = _cart();
  if (cart.errorId && cart.errorId[id]) {
    return 'error';
  } else {
    return '';
  }
}

function paypalNotifyUrl() {
  return request.scheme+"://"+pro_utils.getFullSuperdomainHost()+"/ep/store/paypalnotify";
}

function _paymentSummary(payInfo) {
  return payInfo.cardType + " ending in " + payInfo.cardNumber.substr(-4);
}

function _expiration(payInfo) {
  return payInfo.cardExpiration;
}

function _attemptAuthorization(success_f) {
  var cart = _cart();
  var domain = domains.getRequestDomainRecord();
  var domainId = domain.id;
  var domainName = domain.subDomain;
  var payInfo = checkout.generatePayInfo(cart);
  var proAccount = pro_accounts.getSessionProAccount();
  var fullName = cart.billingFirstName+" "+cart.billingLastName;
  var email = proAccount.email;
  
  // PCI rules require that we not store the CVV longer than necessary to complete the transaction
  var savedCvv = payInfo.cardCvv;
  delete payInfo.cardCvv;
  checkout.writeToEncryptedLog(fastJSON.stringify({date: String(new Date()), domain: domain, payInfo: payInfo}));
  payInfo.cardCvv = savedCvv;

  var result = billing.authorizePurchase(payInfo, paypalNotifyUrl());
  if (result.status == 'success') {
    billing.log({type: 'new-subscription',
                 name: fullName,
                 domainId: domainId,
                 domainName: domainName});
    success_f(result);
  } else if (result.status == 'pending') {
    _validationError('', "Your authorization is pending. When it clears, your account will be activated. "+
      "You may choose to pay by different means now, or wait until your authorization clears.");
  } else if (result.status == 'failure') {
    var paypalResult = result.debug;
    billing.log({'type': 'FATAL', value: "Direct purchase failed on paypal.", cart: cart, paypal: paypalResult});
    checkout.validateErrorFields(_validationError, "There seems to be an error in your billing information."+
                         " Please verify and correct your ",
                         result.errorField.userErrors);
    checkout.validateErrorFields(_validationError, "The bank declined your billing information. Please try a different ",
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

function _processNewSubscription() {
  _attemptAuthorization(function(result) {
    var domain = domains.getRequestDomainRecord();
    var domainId = domain.id;
    var domainName = domain.subDomain;

    var cart = _cart();
    var payInfo = checkout.generatePayInfo(cart);
    var proAccount = pro_accounts.getSessionProAccount();
    var fullName = cart.billingFirstName+" "+cart.billingLastName;
    var email = proAccount.email;

    inTransaction(function() {

      var subscriptionId = team_billing.createSubscription(domainId, cart.billingReferralCode);

      team_billing.setRecurringBillingInfo(
        domainId,
        fullName,
        email,
        _paymentSummary(payInfo),
        _expiration(payInfo),
        result.purchaseInfo.paypalId);      
    });

    if (globals.isProduction()) {
      sendEmail('sales@etherpad.com', 'sales@etherpad.com', "EtherPad: New paid pro account for "+fullName, {},
                "This is an automatic notification.\n\n"+fullName+" ("+email+") successfully set up "+
                "a billing profile for domain: "+domainName+".");
    }
  });
}

function _updateExistingSubscription(subscription) {
  var cart = _cart();
  
  _attemptAuthorization(function(result) {
    inTransaction(function() {
      var cart = _cart();
      var domain = domains.getRequestDomainId();
      var payInfo = checkout.generatePayInfo(cart);
      var proAccount = pro_accounts.getSessionProAccount();
      var fullName = cart.billingFirstName+" "+cart.billingLastName;
      var email = proAccount.email;

      var subscriptionId = subscription.id;

      team_billing.setRecurringBillingInfo(
        domain,
        fullName,
        email,
        _paymentSummary(payInfo),
        _expiration(payInfo),
        result.purchaseInfo.paypalId);      
    });
  });
  
  if (subscription.paidThrough < new Date) {
    // if they're behind, do the purchase!
    if (team_billing.processSubscription(subscription)) {
      cart.statusMessage = "Your payment was successful, and your account is now up to date! You will receive a receipt by email."
    } else {
      cart.statusMessage = "Your payment failed; you will receive further instructions by email.";
    }
  }
}

function _processBillingInfo() {
  var cart = _cart();
  var domain = domains.getRequestDomainId();
  
  var subscription = team_billing.getSubscriptionForCustomer(domain);
  if (! subscription) {
    _processNewSubscription();
    response.redirect('/ep/admin/billing/');
  } else {
    team_billing.updateSubscriptionCouponCode(subscription.id, cart.billingReferralCode);
    if (cart.billingCCNumber.length > 0) {
      _updateExistingSubscription(subscription);
    }
    response.redirect('/ep/admin/billing')
  }
}

function _processPaypalPurchase() {
  var domain = domains.getRequestDomainId();
  billing.log({type: "paypal-attempt", 
               domain: domain, 
               message: "Someone tried to use paypal to pay for on-demand."+
                " They got an error message. If this happens a lot, we should implement paypal."})
  java.lang.Thread.sleep(5000);
  _validationError('billingPurchaseType', "There was an error contacting PayPal. Please try another payment type.")  
}

function _processInvoicePurchase() {
  var output = [
      "Name: "+cart.billingFirstName+" "+cart.billingLastName,
      "\nAddress: ",
      cart.billingAddressLine1+(cart.billingAddressLine2.length > 0 ? "\n"+cart.billingAddressLine2 : ""),
      cart.billingCity + ", " + (cart.billingState.length > 0 ? cart.billingState : cart.billingProvince),
      cart.billingZipCode.length > 0 ? cart.billingZipCode : cart.billingPostalCode,
      cart.billingCountry,
      "\nEmail: ",
      pro_accounts.getSessionProAccount().email
    ].join("\n");
  var recipient = (globals.isProduction() ? 'sales@etherpad.com' : 'jd@appjet.com');
  sendEmail(
    recipient, 
    'sales@etherpad.com', 
    'Invoice payment request - '+pro_utils.getProRequestSubdomain(), 
    {},
    "Hi there,\n\nA pro user tried to pay by invoice. Their information follows."+
    "\n\nThanks!\n\n"+output);
  _validationError('', "Your information has been sent to our sales department; a salesperson will contact you shortly regarding your invoice request.")
}

function render_apply() {
  var cart = _cart();
  eachProperty(request.params, function(k, v) {
    if (startsWith(k, "billing")) {
      if (k == "billingCCNumber" && v.charAt(0) == 'X') { return; }
      cart[k] = toHTML(v);
    }
  });
  
  if (! request.params.backbutton) {
    var allPaymentFields = ["billingCCNumber", "billingExpirationMonth", "billingExpirationYear", "billingCSC", "billingAddressLine1", "billingAddressLine2", "billingCity", "billingState", "billingZipCode", "billingProvince", "billingPostalCode"];
    var allBlank = true;
    allPaymentFields.forEach(function(field) { if (cart[field].length > 0) { allBlank = false; }});
    if (! allBlank) {
      checkout.validateBillingCart(_validationError, cart);
    }
  } else {
    response.redirect("/ep/admin/billing/");
  }
  
  var couponCode = cart.billingReferralCode;

  if (couponCode.length != 0 && (couponCode.length != 8 || ! team_billing.getCouponValue(couponCode))) {
    _validationError('billingReferralCode', 'Invalid referral code entered. Please verify your code and try again.');
  }
  
  if (cart.billingPurchaseType == 'paypal') {
    _processPaypalPurchase();
  } else if (cart.billingPurchaseType == 'invoice') {
    _processInvoicePurchase();
  }
  
  _processBillingInfo();
}

function handlePaypalNotify() {
  // XXX: handle delayed paypal authorization
}

function render_invoices() {
  if (request.params.id) {
    var purchaseId = team_billing.getSubscriptionForCustomer(domains.getRequestDomainId()).id;
    var invoice = billing.getInvoice(request.params.id);
    if (invoice.purchase != purchaseId) {
      response.redirect(request.path);
    }
    
    var transaction;
    var adjustments = billing.getAdjustments(invoice.id);
    if (adjustments.length == 1) {
      transaction = billing.getTransaction(adjustments[0].transaction);
    }
    
    pro_admin_control.renderAdminPage('single-invoice', {
      formatDate: checkout.formatDate,
      dollars: checkout.dollars,
      centsToDollars: billing.centsToDollars,
      invoice: invoice,
      transaction: transaction
    });
  } else {
    var invoices = team_billing.getAllInvoices(domains.getRequestDomainId());
  
    pro_admin_control.renderAdminPage('billing-invoices', { 
      invoices: invoices,
      formatDate: checkout.formatDate,
      dollars: checkout.dollars,
      centsToDollars: billing.centsToDollars
    });
  }
}