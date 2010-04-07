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

import("execution");
import("exceptionutils");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("etherpad.billing.billing");
import("etherpad.globals");
import("etherpad.log");
import("etherpad.pro.domains");
import("etherpad.pro.pro_quotas");
import("etherpad.store.checkout");
import("etherpad.utils.renderTemplateAsString");

jimport("java.lang.System.out.println");

function recurringBillingNotifyUrl() {
  return "";
}

function _billing() {
  if (! appjet.cache.billing) {
    appjet.cache.billing = {};
  }
  return appjet.cache.billing;
}

function _lpad(str, width, padDigit) {
  str = String(str);
  padDigit = (padDigit === undefined ? ' ' : padDigit);
  var count = width - str.length;
  var prepend = []
  for (var i = 0; i < count; ++i) {
    prepend.push(padDigit);
  }
  return prepend.join("")+str;
}

// utility functions

function _dayToDateTime(date) {
  return [date.getFullYear(), _lpad(date.getMonth()+1, 2, '0'), _lpad(date.getDate(), 2, '0')].join("-");
}

function _createInvoice(subscription) {
  var maxUsers = getMaxUsers(subscription.customer);
  var invoice = inTransaction(function() {
    var invoiceId = billing.createInvoice();
    billing.updateInvoice(
      invoiceId, 
      {purchase: subscription.id, 
       amt: billing.dollarsToCents(calculateSubscriptionCost(maxUsers, subscription.coupon)),
       users: maxUsers});
    return billing.getInvoice(invoiceId);
  });  
  if (invoice) {
    resetMaxUsers(subscription.customer)
  }
  return invoice;
}

function getExpiredSubscriptions(date) {
  return sqlobj.selectMulti('billing_purchase',
                            {type: 'subscription', 
                             status: 'active',
                             paidThrough: ['<', _dayToDateTime(date)]});  
}

function getAllSubscriptions() {
  return sqlobj.selectMulti('billing_purchase', {type: 'subscription', status: 'active'});
}

function getSubscriptionForCustomer(customerId) {
  return sqlobj.selectSingle('billing_purchase',
                             {type: 'subscription',
                              customer: customerId});
}

function getOrCreateInvoice(subscription) {
  return inTransaction(function() {
    var existingInvoice = 
      sqlobj.selectSingle('billing_invoice',
                          {purchase: subscription.id, status: 'pending'});
    if (existingInvoice) {
      return existingInvoice;
    } else {
      return _createInvoice(subscription);
    }
  });
}

function getLatestPendingInvoice(subscriptionId) {
  return sqlobj.selectMulti('billing_invoice',
                            {purchase: subscriptionId, status: 'pending'},
                            {orderBy: '-time', limit: 1})[0];  
}

function getLatestPaidInvoice(subscriptionId) {
  return sqlobj.selectMulti('billing_invoice',
                            {purchase: subscriptionId, status: 'paid'},
                            {orderBy: '-time', limit: 1})[0];
}

function pendingTransactions(customer) {
  return billing.getPendingTransactionsForCustomer(customer);
}

function checkPendingTransactions(transactions) {
  // XXX: do nothing for now.
  return transactions.length > 0;
}

function getRecurringBillingTransactionId(customerId) {
  return sqlobj.selectSingle('billing_payment_info', {customer: customerId}).transaction;
}

function getRecurringBillingInfo(customerId) {
  return sqlobj.selectSingle('billing_payment_info', {customer: customerId});
}

function clearRecurringBillingInfo(customerId) {
  return sqlobj.deleteRows('billing_payment_info', {customer: customerId});
}

function setRecurringBillingInfo(customerId, fullName, email, paymentSummary, expiration, transactionId) {
  var info = {
    fullname: fullName,
    email: email,
    paymentsummary: paymentSummary,
    expiration: expiration,
    transaction: transactionId
  }
  inTransaction(function() {
    if (sqlobj.selectSingle('billing_payment_info', {customer: customerId})) {
      sqlobj.update('billing_payment_info', {customer: customerId}, info);
    } else {
      info.customer = customerId;
      sqlobj.insert('billing_payment_info', info);
    }
  });
}

function createSubscription(customerId, couponCode) {
  domainCacheClear(customerId);
  return inTransaction(function() {
    return billing.createSubscription(customerId, 'ONDEMAND', 0, couponCode);
  });
}

function updateSubscriptionCouponCode(subscriptionId, couponCode) {
  billing.updatePurchase(subscriptionId, {coupon: couponCode || ""});
}

function subscriptionChargeFailure(subscription, invoice, failureMessage) {
  billing.updatePurchase(subscription.id,
                         {error: failureMessage, status: 'inactive'});
  sendFailureEmail(subscription, invoice);
}

function subscriptionChargeSuccess(subscription, invoice) {
  sendReceiptEmail(subscription, invoice);
}

function errorFieldsToMessage(errorCodes) {
  var prefix = "Your payment information was rejected. Please verify your ";
  var errorList = (errorCodes.permanentErrors ? errorCodes.permanentErrors : errorCodes.userErrors);

  return prefix + 
    errorList.map(function(field) { 
      return checkout.billingCartFieldMap[field].d;
    }).join(", ")+
    "."
}

function getAllInvoices(customer) {
  var purchase = getSubscriptionForCustomer(customer);
  if (! purchase) {
    return [];
  }
  return billing.getInvoicesForPurchase(purchase.id);
}

// scheduled charges

function attemptCharge(invoice, subscription) {
  var billingInfo = getRecurringBillingInfo(subscription.customer);
  if (! billingInfo) {
    subscriptionChargeFailure(subscription, invoice, "No billing information on file.");
    return false;
  }
  
  var result = 
    billing.asyncRecurringPurchase(
      invoice.id, 
      subscription.id, 
      billingInfo.transaction,
      billingInfo.paymentsummary,
      billing.centsToDollars(invoice.amt),
      1, // 1 month only for now
      recurringBillingNotifyUrl);
  if (result.status == 'success') {
    subscriptionChargeSuccess(subscription, invoice);
    return true;
  } else {
    subscriptionChargeFailure(subscription, invoice, errorFieldsToMessage(result.errorField));
    return false;
  }
}

function processSubscription(subscription) {
  try {
    var hasPendingTransactions = inTransaction(function() {
      var transactions = pendingTransactions(subscription.customer);
      if (checkPendingTransactions(transactions)) {
        billing.log({type: 'pending-transactions-delay', subscription: subscription, transactions: transactions});
        // there are actual pending transactions. wait until tomorrow.
        return true;
      } else {
        return false;
      }
    });
    if (hasPendingTransactions) {
      return;
    }
    var invoice = getOrCreateInvoice(subscription);
    
    return attemptCharge(invoice, subscription);
  } catch (e) {
    log.logException(e);
    billing.log({message: "Thrown error", 
                 exception: exceptionutils.getStackTracePlain(e),
                 subscription: subscription});
    subscriptionChargeFailure(subscription, "Permanent failure. Please confirm your billing information.");
  } finally {
    domainCacheClear(subscription.customer);
  }
}

function processAllSubscriptions() {
  var subs = getExpiredSubscriptions(new Date);
  println("processing "+subs.length+" subscriptions.");
  subs.forEach(processSubscription);      
}

function _scheduleNextDailyUpdate() {
  // Run at 2:22am every day
  var now = +(new Date);
  var tomorrow = new Date(now + 1000*60*60*24);
  tomorrow.setHours(2);
  tomorrow.setMinutes(22);
  tomorrow.setMilliseconds(222);
  log.info("Scheduling next daily billing update for: "+tomorrow.toString());
  var delay = +tomorrow - (+(new Date));
  execution.scheduleTask('billing', "billingDailyUpdate", delay, []);
}

serverhandlers.tasks.billingDailyUpdate = function() {
  return; // do nothing, there's no more billing.
  // if (! globals.isProduction()) { return; }
  // try {
  //   processAllSubscriptions();
  // } finally {
  //   _scheduleNextDailyUpdate();
  // }
}

function onStartup() {
  execution.initTaskThreadPool("billing", 1);
  _scheduleNextDailyUpdate();
}

// pricing

function getMaxUsers(customer) {
  return pro_quotas.getAccountUsageCount(customer);
}

function resetMaxUsers(customer) {
  pro_quotas.resetAccountUsageCount(customer);
}

var COST_PER_USER = 8;

function getCouponValue(couponCode) {
  if (couponCode && couponCode.length == 8) {
    return sqlobj.selectSingle('checkout_pro_referral', {id: couponCode});
  }
}

function calculateSubscriptionCost(users, couponId) {
  if (users <= globals.PRO_FREE_ACCOUNTS) {
    return 0;
  }
  var coupon = getCouponValue(couponId);
  var pctDiscount = (coupon ? coupon.pctDiscount : 0);
  var freeUsers = (coupon ? coupon.freeUsers : 0);
  
  var cost = (users - freeUsers) * COST_PER_USER;
  cost = cost * (100-pctDiscount)/100;
  
  return Math.max(0, cost);
}

// currentDomainsCache

function _cache() {
  if (! appjet.cache.currentDomainsCache) {
    appjet.cache.currentDomainsCache = {};
  }
  return appjet.cache.currentDomainsCache;
}

function domainCacheClear(domain) {
  delete _cache()[domain];
}

function _domainCacheGetOrUpdate(domain, f) {
  if (domain in _cache()) {
    return _cache()[domain];
  }
  
  _cache()[domain] = f();
  return _cache()[domain];
}

// external API helpers 

function _getPaidThroughDate(domainId) {
  return _domainCacheGetOrUpdate(domainId, function() {
    var subscription = getSubscriptionForCustomer(domainId);
    if (! subscription) {
      return null;
    } else {
      return subscription.paidThrough;
    }
  });  
}

// external API

var GRACE_PERIOD_DAYS = 10;

var CURRENT = 0;
var PAST_DUE = 1;
var SUSPENDED = 2;
var NO_BILLING_INFO = 3;

function getDomainStatus(domainId) {
  var paidThrough = _getPaidThroughDate(domainId);
  
  if (paidThrough == null) {
    return NO_BILLING_INFO;
  }
  if (paidThrough.getTime() > new Date(Date.now()-86400*1000)) {
    return CURRENT;
  }
  // less than GRACE_PERIOD_DAYS have passed since paidThrough date
  if (paidThrough.getTime() > Date.now() - GRACE_PERIOD_DAYS*86400*1000) {
    return PAST_DUE;
  }
  return SUSPENDED;
}

function getDomainDueDate(domainId) {
  return _getPaidThroughDate(domainId);
}

function getDomainSuspensionDate(domainId) {
  return new Date(_getPaidThroughDate(domainId).getTime() + GRACE_PERIOD_DAYS*86400*1000);
}

// emails

function sendReceiptEmail(subscription, invoice) {
  var paymentInfo = getRecurringBillingInfo(subscription.customer);
  var coupon = getCouponValue(subscription.coupon);
  var emailText = renderTemplateAsString('email/pro_payment_receipt.ejs', {
    fullName: paymentInfo.fullname,
    paymentSummary: paymentInfo.paymentsummary,
    expiration: checkout.formatExpiration(paymentInfo.expiration),
    invoiceNumber: invoice.id,
    numUsers: invoice.users,
    cost: billing.centsToDollars(invoice.amt),
    dollars: checkout.dollars,
    coupon: coupon,
    globals: globals
  });
  var address = paymentInfo.email;
  checkout.salesEmail(address, "sales@etherpad.com", "EtherPad: Receipt for "+paymentInfo.fullname,
                      {}, emailText);
}

function sendFailureEmail(subscription, invoice, failureMessage) {
  var domain = subscription.customer;
  var subDomain = domains.getDomainRecord(domain).subDomain;
  var paymentInfo = getRecurringBillingInfo(subscription.customer);
  var emailText = renderTemplateAsString('email/pro_payment_failure.ejs', {
    fullName: paymentInfo.fullname,
    billingError: failureMessage,
    balance: "US $"+checkout.dollars(billing.centsToDollars(invoice.amt)),
    suspensionDate: checkout.formatDate(new Date(subscription.paidThrough.getTime()+GRACE_PERIOD_DAYS*86400*1000)),
    billingAdminLink: "https://"+subDomain+".etherpad.com/ep/admin/billing/"
  });
  var address = paymentInfo.email;
  checkout.salesEmail(address, "sales@etherpad.com", "EtherPad: Payment Failure for "+paymentInfo.fullname,
                      {}, emailText);
}