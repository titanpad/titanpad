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

import("dateutils.*");
import("fastJSON");
import("jsutils.eachProperty");
import("netutils.urlPost");
import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("stringutils.{md5,repeat}");

import("etherpad.log.{custom=>eplog}");


jimport("java.lang.System.out.println");

function clearKeys(obj, keys) {
  var newObj = {};
  eachProperty(obj, function(k, v) {
    var isCopied = false;
    keys.forEach(function(key) {
      if (k == key.name &&
          key.valueTest(v)) {
        newObj[k] = key.valueReplace(v);
        isCopied = true;
      }
    });
    if (! isCopied) {
      if (typeof(obj[k]) == 'object') {
        newObj[k] = clearKeys(v, keys);
      } else {
        newObj[k] = v;
      }
    }
  });
  return newObj;
}

function replaceWithX(s) {
  return repeat("X", s.length);
}

function log(obj) {  
  eplog('billing', clearKeys(obj, [
    {name: "ACCT", 
     valueTest: function(s) { return /^\d{15,16}$/.test(s) }, 
     valueReplace: replaceWithX},
    {name: "CVV2", 
     valueTest: function(s) { return /^\d{3,4}$/.test(s) },
     valueReplace: replaceWithX}]));
}

var _USER = function() { return appjet.config['etherpad.paypal.user'] || "zamfir_1239051855_biz_api1.gmail.com"; }
var _PWD = function() { return appjet.config['etherpad.paypal.pwd'] || "1239051867"; }
var _SIGNATURE = function() { return appjet.config['etherpad.paypal.signature'] || "AQU0e5vuZCvSg-XJploSa.sGUDlpAwAy5fz.FhtfOQ25Qa9sFLDt7Bmp"; }
var _RECEIVER = function() { return appjet.config['etherpad.paypal.receiver'] || "zamfir_1239051855_biz@gmail.com"; }
var _paypalApiUrl = function() { return appjet.config['etherpad.paypal.apiUrl'] || "https://api-3t.sandbox.paypal.com/nvp"; }
var _paypalWebUrl = function() { return appjet.config['etherpad.paypal.webUrl'] || "https://www.sandbox.paypal.com/cgi-bin/webscr"; }
function paypalPurchaseUrl(token) {
  return (appjet.config['etherpad.paypal.purchaseUrl'] || "https://www.sandbox.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=")+token;
}

function getPurchase(id) {
  return sqlobj.selectSingle('billing_purchase', {id: id});
}

function getPurchaseForCustomer(customerId) {
  return sqlobj.selectSingle('billing_purchase', {customer: customerId});
}

function updatePurchase(id, fields) {
  sqlobj.updateSingle('billing_purchase', {id: id}, fields);
}

function getInvoicesForPurchase(purchaseId) {
  return sqlobj.selectMulti('billing_invoice', {purchase: purchaseId});
}

function getInvoice(id) {
  return sqlobj.selectSingle('billing_invoice', {id: id});
}

function createInvoice() {
  return _newInvoice();
}

function updateInvoice(id, fields) {
  sqlobj.updateSingle('billing_invoice', {id: id}, fields)
}

function getTransaction(id) {
  return sqlobj.selectSingle('billing_transaction', {id: id});
}
function getTransactionByExternalId(txnId) {
  return sqlobj.selectSingle('billing_transaction', {txnId: txnId});
}

function getTransactionsForCustomer(customerId) {
  return sqlobj.selectMulti('billing_transaction', {customer: customerId});
}

function getPendingTransactionsForCustomer(customerId) {
  return sqlobj.selectMulti('billing_transaction', {customer: customerId, status: 'pending'});
}

function _updateTransaction(id, fields) {
  return sqlobj.updateSingle('billing_transaction', {id: id}, fields);
}

function getAdjustments(invoiceId) {
  return sqlobj.selectMulti('billing_adjustment', {invoice: invoiceId});
}

function createSubscription(customer, product, dollars, couponCode) {
  var purchaseId = _newPurchase(customer, product, dollarsToCents(dollars), couponCode);
  _purchaseActive(purchaseId);
  updatePurchase(purchaseId, {type: 'subscription', paidThrough: nextMonth(noon(new Date))});
  return purchaseId;
}

function _newPurchase(customer, product, cents, couponCode) {
  var purchaseId = sqlobj.insert('billing_purchase', {
    customer: customer,
    product: product,
    cost: cents,
    coupon: couponCode,
    status: 'inactive'
  });
  return purchaseId;  
}

function _newInvoice() {
  var invoiceId = sqlobj.insert('billing_invoice', {
    time: new Date(),
    purchase: -1,
    amt: 0,
    status: 'pending'
  });
  return invoiceId;
}

function _newTransaction(customer, cents) {
  var transactionId = sqlobj.insert('billing_transaction', {
    customer: customer,
    time: new Date(),
    amt: cents,
    status: 'new'
  });
  return transactionId;
}

function _newAdjustment(transaction, invoice, cents) {
  sqlobj.insert('billing_adjustment', {
    transaction: transaction,
    invoice: invoice,
    time: new Date(),
    amt: cents
  });  
}

function _transactionSuccess(transaction, txnId, payInfo) {
  _updateTransaction(transaction, {
    status: 'success', txnId: txnId, time: new Date(), payInfo: payInfo
  });
}

function _transactionFailure(transaction, txnId) {
  _updateTransaction(transaction, {
    status: 'failure', txnId: txnId, time: new Date()
  });
}

function _transactionPending(transaction, txnId) {
  _updateTransaction(transaction, {
    status: 'pending', txnId: txnId, time: new Date()
  });
}

function _invoicePaid(invoice) {
  updateInvoice(invoice, {status: 'paid'});
}

function _purchaseActive(purchase) {
  updatePurchase(purchase, {status: 'active'});
}

function _purchaseExtend(purchase, monthCount) {
  var expiration = getPurchase(purchase).paidThrough;
  for (var i = monthCount; i > 0; i--) {
    expiration = nextMonth(expiration);
  }
  // paying your invoice always makes you current.
  if (expiration < new Date) {
    expiration = nextMonth(new Date);
  }
  updatePurchase(purchase, {paidThrough: expiration});
}

function _doPost(url, body) {
  try {
    var ret = urlPost(url, body);
  } catch (e) {
    if (e.javaException) {
      net.appjet.oui.exceptionlog.apply(e.javaException);
    }
    return { error: e };
  }
  return { value: ret };
}

function _doPaypalNvpPost(properties0) {
  return {
    status: 'failure',
    errorMessage: "Billing has been discontinued. No new services may be purchased."
  }
  // var properties = {
  //   USER: _USER(),
  //   PWD: _PWD(),
  //   SIGNATURE: _SIGNATURE(),
  //   VERSION: "56.0"
  // }    
  // eachProperty(properties0, function(k, v) {
  //   if (v !== undefined) {
  //     properties[k] = v;      
  //   }
  // })
  // log({'type': 'api call', 'value': properties});
  // var ret = _doPost(_paypalApiUrl(), properties);
  // if (ret.error) {
  //   return {
  //     status: 'failure',
  //     exception: ret.error.javaException || ret.error,
  //     errorMessage: ret.error.message
  //   }
  // }
  // ret = ret.value;
  // var paypalResponse = {};
  // ret.content.split("&").forEach(function(x) {
  //     var parts = x.split("=");
  //     paypalResponse[decodeURIComponent(parts[0])] = 
  //       decodeURIComponent(parts[1]);
  //   })
  // 
  // var res = paypalResponse;
  // log(res)
  // if (res.ACK == "Success" || res.ACK == "SuccessWithWarning") {
  //   return {
  //     status: 'success',
  //     response: res
  //   }
  // } else {
  //   errors = [];
  //   for (var i = 0; res['L_LONGMESSAGE'+i]; ++i) {
  //     errors.push(res['L_LONGMESSAGE'+i]);
  //   }
  //   return {
  //     status: 'failure',
  //     errorMessage: errors.join(", "),
  //     errorMessages: errors,
  //     response: res
  //   }
  // }  
}

// status -> 'completion', 'bad', 'redundant', 'possible_fraud'
function handlePaypalNotification() {
  var content = (typeof(request.content) == 'string' ? request.content : undefined);
  if (! content) {
    return new BillingResult('bad', "no content");
  }
  log({'type': 'paypal-notification', 'content': content});
  var params = {};
  content.split("&").forEach(function(x) {
    var parts = x.split("=");
    params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });
  var txnId = params.txn_id;
  var properties = [];
  for(var i in params) {
    properties.push(i+" -> "+params[i]);
  }
  var debugString = properties.join(", ");
  log({'type': 'parsed-paypal-notification', 'value': debugString});
  var transaction = getTransactionByExternalId(txnId);
  log({'type': 'notification-transaction', 'value': (transaction || {})});
  if (_RECEIVER() != params.receiver_email) {
    return new BillingResult('possible_fraud', debugString);
  }
  if (params.payment_status == "Completed" && transaction &&
      (transaction.status == 'pending' || transaction.status == 'new')) {
    var ret = _doPost(_paypalWebUrl(), "cmd=_notify-validate&"+content);
    if (ret.error || ret.value.content != "VERIFIED") {
      return new BillingResult('possible_fraud', debugString);
    }
    var invoice = getInvoice(params.invoice);
    if (invoice.amt != dollarsToCents(params.mc_gross)) {
      return new BillingResult('possible_fraud', debugString);
    }
    
    sqlcommon.inTransaction(function () {
      _transactionSuccess(transaction.id, txnId, "via eCheck");
      _invoicePaid(invoice.id);
      _purchaseActive(invoice.purchase);      
    });
    var purchase = getPurchase(invoice.purchase);
    return new BillingResult('completion', debugString, null,
      new PurchaseInfo(params.custom,
                       invoice.id,
                       transaction.id,
                       params.txn_id,
                       purchase.id,
                       centsToDollars(invoice.amt),
                       purchase.couponCode,
                       purchase.time,
                       undefined));
  } else {
    return new BillingResult('redundant', debugString);
  }
}

function _expressCheckoutCustom(invoiceId, transactionId) {
  return md5("zimki_sucks"+invoiceId+transactionId);
}

function PurchaseInfo(custom, invoiceId, transactionId, paypalId, purchaseId, dollars, couponCode, time, token, description) {
  this.__defineGetter__("custom", function() { return custom });
  this.__defineGetter__("invoiceId", function() { return invoiceId });
  this.__defineGetter__("transactionId", function() { return transactionId });
  this.__defineGetter__("paypalId", function() { return paypalId });
  this.__defineGetter__("purchaseId", function() { return purchaseId });
  this.__defineGetter__("cost", function() { return dollars });
  this.__defineGetter__("couponCode", function() { return couponCode });
  this.__defineGetter__("time", function() { return time });
  this.__defineGetter__("token", function() { return token });
  this.__defineGetter__("description", function() { return description });
}

function PayerInfo(paypalResult) {
  this.__defineGetter__("payerId", function() { return paypalResult.response.PAYERID });
  this.__defineGetter__("email", function() { return paypalResult.response.EMAIL });
  this.__defineGetter__("businessName", function() { return paypalResult.response.BUSINESS });
  this.__defineGetter__("nameSalutation", function() { return paypalResult.response.SALUTATION });
  this.__defineGetter__("nameFirst", function() { return paypalResult.response.FIRSTNAME });
  this.__defineGetter__("nameMiddle", function() { return paypalResult.response.MIDDLENAME });
  this.__defineGetter__("nameLast", function() { return paypalResult.response.LASTNAME });  
}

function BillingResult(status, debug, errorField, purchaseInfo, payerInfo) {
  this.__defineGetter__("status", function() { return status });
  this.__defineGetter__("debug", function() { return debug });
  this.__defineGetter__("errorField", function() { return errorField });
  this.__defineGetter__("purchaseInfo", function() { return purchaseInfo });
  this.__defineGetter__("payerInfo", function() { return payerInfo });
}

function dollarsToCents(dollars) {
  return Math.round(Number(dollars)*100);
}

function centsToDollars(cents) {
  return Math.round(Number(cents)) / 100;
}

function verifyDollars(dollars) {
  return Math.round(Number(dollars)*100)/100;
}

function beginExpressPurchase(invoiceId, customerId, productId, dollars, couponCode, successUrl, failureUrl, notifyUrl, authorizeOnly) {
  var cents = dollarsToCents(dollars);
  var time = new Date();
  var purchaseId;
  var transactionid;
  if (! authorizeOnly) {
    try {
      sqlcommon.inTransaction(function() {
        purchaseId = _newPurchase(customerId, productId, cents, couponCode);
        updateInvoice(invoiceId, {purchase: purchaseId, amt: cents});
        transactionId = _newTransaction(customerId, cents);
        _newAdjustment(transactionId, invoiceId, cents);
      });
    } catch (e) {
      if (e instanceof BillingResult) { return e; }
      throw e;
    }    
  }
  
  var paypalResult = 
    _setExpressCheckout(invoiceId, transactionId, cents,
                        successUrl, failureUrl, notifyUrl, authorizeOnly);
  
  if (paypalResult.status == 'success') {
    var token = paypalResult.response.TOKEN;
    return new BillingResult('success', paypalResult, null, new PurchaseInfo(
      _expressCheckoutCustom(invoiceId, transactionId),
      invoiceId,
      transactionId,
      undefined,
      purchaseId,
      verifyDollars(dollars),
      couponCode,
      time,
      token));
  } else {
    return new BillingResult('failure', paypalResult);
  }
}

function _setExpressCheckout(invoiceId, transactionId, cents, successUrl, failureUrl, notifyUrl, authorizeOnly) {
  var properties = {
    INVNUM: invoiceId,
    
    METHOD: 'SetExpressCheckout',
    CUSTOM: 
      _expressCheckoutCustom(invoiceId, transactionId),
    MAXAMT: centsToDollars(cents),
    RETURNURL: successUrl,
    CANCELURL: failureUrl,
    NOTIFYURL: notifyUrl,
    NOSHIPPING: 1,
    PAYMENTACTION: (authorizeOnly ? 'Authorization' : 'Sale'),
    
    AMT: centsToDollars(cents)
  }
  
  return _doPaypalNvpPost(properties);
}

function continueExpressPurchase(purchaseInfo, authorizeOnly) {
  var paypalResult = _getExpressCheckoutDetails(purchaseInfo.token, authorizeOnly)
  if (paypalResult.status == 'success') {
    if (! authorizeOnly) {
      if (paypalResult.response.INVNUM != purchaseInfo.invoiceId) {
        return new BillingResult('failure', "invoice id mismatch");
      }      
    }
    if (paypalResult.response.CUSTOM !=
        _expressCheckoutCustom(purchaseInfo.invoiceId, purchaseInfo.transactionId)) {
      return new BillingResult('failure', "custom mismatch");
    }
    return new BillingResult('success', paypalResult, null, null, new PayerInfo(paypalResult));
  } else {
    return new BillingResult('failure', paypalResult);
  }
}

function _getExpressCheckoutDetails(token, authorizeOnly) {
  var properties = {
    METHOD: 'GetExpresscheckoutDetails',
    TOKEN: token,
  }
  
  return _doPaypalNvpPost(properties);
}

function completeExpressPurchase(purchaseInfo, payerInfo, notifyUrl, authorizeOnly) {
  var paypalResult = _doExpressCheckoutPayment(purchaseInfo, payerInfo, notifyUrl, authorizeOnly);
  
  if (paypalResult.status == 'success') {
    if (paypalResult.response.PAYMENTSTATUS == 'Completed') {
      if (! authorizeOnly) {
        sqlcommon.inTransaction(function() {
          _transactionSuccess(purchaseInfo.transactionId, 
                              paypalResult.response.TRANSACTIONID, "via PayPal");
          _invoicePaid(purchaseInfo.invoiceId);
          _purchaseActive(purchaseInfo.purchaseId);
        });        
      }
      return new BillingResult('success', paypalResult);
    } else if (paypalResult.response.PAYMENTSTATUS == 'Pending') {
      if (! authorizeOnly) {
        sqlcommon.inTransaction(function() {
          _transactionPending(purchaseInfo.transactionId,
                              paypalResult.response.TRANSACTIONID);        
        });        
      }
      return new BillingResult('pending', paypalResult);
    }
  } else {
    if (! authorizeOnly) {
      sqlcommon.inTransaction(function() {
        _transactionFailure(purchaseInfo.transactionId,
                            (paypalResult.response ?
                             paypalResult.response.TRANSACTIONID || "" :
                             ""));
      });
    }
    return new BillingResult('failure', paypalResult);
  }
}

function _doExpressCheckoutPayment(purchaseInfo, payerInfo, notifyUrl, authorizeOnly) {
  var properties = {
    METHOD: 'DoExpressCheckoutPayment',
    TOKEN: purchaseInfo.token,
    PAYMENTACTION: (authorizeOnly ? 'Authorization' : 'Sale'),
    
    NOTIFYURL: notifyUrl,
    
    PAYERID: payerInfo.payerId,
    
    AMT: verifyDollars(purchaseInfo.cost), // dollars
    INVNUM: purchaseInfo.invoiceId,
    CUSTOM:
      _expressCheckoutCustom(purchaseInfo.invoiceId, purchaseInfo.transactionId)
  }
  
  return _doPaypalNvpPost(properties);
}

// which field has error? and, is it not user-correctable?
var _directErrorCodes = {
  '10502': ['cardExpiration'],
  '10504': ['cardCvv'],
  '10505': ['addressStreet', true],
  '10508': ['cardExpiration'], 
  '10510': ['cardType'],
  '10512': ['nameFirst'],
  '10513': ['nameLast'],
  '10519': ['cardNumber'],
  '10521': ['cardNumber'],
  '10527': ['cardNumber'],
  '10534': ['cardNumber', true],
  '10535': ['cardNumber'],
  '10536': ['invoiceId', true],
  '10537': ['addressCountry', true],
  '10540': ['addressStreet', true],
  '10541': ['cardNumber', true],
  '10554': ['address', true],
  '10555': ['address', true],
  '10556': ['address', true],
  '10561': ['address'],
  '10562': ['cardExpiration'],
  '10563': ['cardExpiration'],
  '10565': ['addressCountry'],
  '10566': ['cardType'],
  '10571': ['cardCvv'],
  '10701': ['address'],
  '10702': ['addressStreet'],
  '10703': ['addressStreet2'],
  '10704': ['addressCity'],
  '10705': ['addressState'],
  '10706': ['addressZip'],
  '10707': ['addressCountry'],
  '10708': ['address'],
  '10709': ['addressStreet'],
  '10710': ['addressCity'],
  '10711': ['addressState'],
  '10712': ['addressZip'],
  '10713': ['addressCountry'],
  '10714': ['address'],
  '10715': ['addressState'],
  '10716': ['addressZip'],
  '10717': ['addressZip'],
  '10718': ['addressCity,addressState'],
  '10748': ['cardCvv'],
  '10752': ['card'],
  '10756': ['address,card'],
  '10759': ['cardNumber'],
  '10762': ['cardCvv'],
  '11611': function(response) {
    var avsCode = response.AVSCODE;
    var cvv2Match = response.CVV2MATCH;
    var errorFields = [];
    switch (avsCode) {
      case 'N': case 'C': case 'A': case 'B':
      case 'R': case 'S': case 'U': case 'G':
      case 'I': case 'E':
        errorFields.push('address');
    }
    switch (cvv2Match) {
      case 'N':
        errorFields.push('cardCvv');
    }
    return [errorFields.join(",")];
  },
  '15004': ['cardCvv'],
  '15005': ['cardNumber'],
  '15006': ['cardNumber'],
  '15007': ['cardNumber']
}

function authorizePurchase(payinfo, notifyUrl) {
  return directPurchase(undefined, undefined, undefined, 1, undefined, payinfo, notifyUrl, true);
}

function directPurchase(invoiceId, customerId, productId, dollars, couponCode, payinfo, notifyUrl, authorizeOnly) {
  var time = new Date();
  var cents = dollarsToCents(dollars);
  
  var purchaseId, transactionId;
  
  if (! authorizeOnly) {
    try {
      sqlcommon.inTransaction(function() {
        purchaseId = _newPurchase(customerId, productId, cents, couponCode);
        updateInvoice(invoiceId, {purchase: purchaseId, amt: cents});
        transactionId = _newTransaction(customerId, cents);
        _newAdjustment(transactionId, invoiceId, cents);
      });
    } catch (e) {
      if (e instanceof BillingResult) { return e; }
      if (e.javaException || e.rhinoException) {
        throw e.javaException || e.rhinoException;
      }
      throw e;
    }    
  }
  
  var paypalResult = _doDirectPurchase(invoiceId, cents, payinfo, notifyUrl, authorizeOnly);
  
  if (paypalResult.status == 'success') {
    if (! authorizeOnly) {
      sqlcommon.inTransaction(function() {
        _transactionSuccess(transactionId, 
                            paypalResult.response.TRANSACTIONID,
                            payinfo.cardType+" ending in "+payinfo.cardNumber.substr(-4));
        _invoicePaid(invoiceId);
        _purchaseActive(purchaseId);      
      });      
    }
    return new BillingResult('success', paypalResult, null, new PurchaseInfo(
      undefined,
      invoiceId,
      transactionId,
      paypalResult.response.TRANSACTIONID,
      purchaseId,
      verifyDollars(dollars),
      couponCode,
      time,
      undefined));
  } else {
    if (! authorizeOnly) {
      sqlcommon.inTransaction(function() {
        _transactionFailure(transactionId, 
                            (paypalResult.response ?
                             paypalResult.response.TRANSACTIONID || "":
                             ""));      
      });      
    }
    return new BillingResult('failure', paypalResult, _getErrorCodes(paypalResult.response));
  }
}

function _getErrorCodes(paypalResponse) {
  var errorCodes = {userErrors: [], permanentErrors: []};
  if (! paypalResponse) {
    return undefined;
  }
  for (var i = 0; paypalResponse['L_ERRORCODE'+i]; ++i) {
    var code = paypalResponse['L_ERRORCODE'+i];
    var errorField = _directErrorCodes[code];
    if (typeof(errorField) == 'function') {
      errorField = errorField(paypalResponse);
    }
    if (errorField && errorField[1]) {
      Array.prototype.push.apply(errorCodes.permanentErrors, errorField[0].split(","));
    } else if (errorField) {
      Array.prototype.push.apply(errorCodes.userErrors, errorField[0].split(","));
    }
  }
  return errorCodes;
}

function _doDirectPurchase(invoiceId, cents, payinfo, notifyUrl, authorizeOnly) {
  var properties = {
    INVNUM: invoiceId,
    
    METHOD: 'DoDirectPayment',
    PAYMENTACTION: (authorizeOnly ? 'Authorization' : 'Sale'),
    IPADDRESS: request.clientAddr,
    NOTIFYURL: notifyUrl,
    
    CREDITCARDTYPE: payinfo.cardType,
    ACCT: payinfo.cardNumber,
    EXPDATE: payinfo.cardExpiration,
    CVV2: payinfo.cardCvv,
    
    SALUTATION: payinfo.nameSalutation,
    FIRSTNAME: payinfo.nameFirst,
    MIDDLENAME: payinfo.nameMiddle,
    LASTNAME: payinfo.nameLast,
    SUFFIX: payinfo.nameSuffix,
    
    STREET: payinfo.addressStreet,
    STREET2: payinfo.addressStreet2,
    CITY: payinfo.addressCity,
    STATE: payinfo.addressState,
    COUNTRYCODE: payinfo.addressCountry,
    ZIP: payinfo.addressZip,
    
    AMT: centsToDollars(cents)
  }
  
  return _doPaypalNvpPost(properties);
}

// function directAuthorization(payInfo, dollars, notifyUrl) {
//   var paypalResult = _doDirectPurchase(undefined, dollarsToCents(dollars), payInfo, notifyUrl, true);
//   if (paypalResult.status == 'success') {
//     return new BillingResult('success', paypalResult, null, new PurchaseInfo(
//       undefined,
//       undefined,
//       paypalResult.response.TRANSACTIONID,
//       undefined,
//       verifyDollars(dollars),
//       undefined,
//       undefined,
//       undefined));
//   } else {
//     return new BillingResult('failure', paypalResult, _getErrorCodes(paypalResult.response));
//   }
// }

function asyncRecurringPurchase(invoiceId, purchaseId, oldTransactionId, paymentInfo, dollars, monthCount, notifyUrl) {
  var time = new Date();
  var cents = dollarsToCents(dollars);
  
  var purchase, transactionId;
  
  try {
    sqlcommon.inTransaction(function() {
      // purchaseId = _newPurchase(customerId, productId, cents, couponCode);
      purchase = getPurchase(purchaseId);
      updateInvoice(invoiceId, {purchase: purchaseId, amt: cents});
      transactionId = _newTransaction(purchase.customer, cents);
      _newAdjustment(transactionId, invoiceId, cents);
    });
  } catch (e) {
    if (e instanceof BillingResult) { return e; }
    if (e.rhinoException) {
      throw e.rhinoException;
    }
    throw e;
  }
  
  // do transaction using previous transaction as template
  var paypalResult;
  if (cents == 0) {
    // can't actually charge nothing, so fake it.
    paypalResult = { status: 'success', response: { TRANSACTIONID: null }}
  } else {
    paypalResult = _doReferenceTransaction(invoiceId, cents, oldTransactionId, notifyUrl);
  }
  
  if (paypalResult.status == 'success') {
    sqlcommon.inTransaction(function() {
      _transactionSuccess(transactionId, 
                          paypalResult.response.TRANSACTIONID,
                          paymentInfo);
      _invoicePaid(invoiceId);
      _purchaseActive(purchaseId);
      _purchaseExtend(purchaseId, monthCount);
    });
    return new BillingResult('success', paypalResult, null, new PurchaseInfo(
      undefined,
      invoiceId,
      transactionId,
      paypalResult.response.TRANSACTIONID,
      purchaseId,
      verifyDollars(dollars),
      undefined,
      time,
      undefined));
  } else {
    sqlcommon.inTransaction(function() {
      _transactionFailure(transactionId, 
                          (paypalResult.response ?
                           paypalResult.response.TRANSACTIONID || "":
                           ""));      
    });
    return new BillingResult('failure', paypalResult, _getErrorCodes(paypalResult.response));
  }
}

function _doReferenceTransaction(invoiceId, cents, transactionId, notifyUrl) {
  var properties = {
    METHOD: 'DoReferenceTransaction',
    PAYMENTACTION: 'Sale',
    
    REFERENCEID: transactionId,
    AMT: centsToDollars(cents),
    INVNUM: invoiceId
  }
  
  return _doPaypalNvpPost(properties);
}