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

import("funhtml.*");
import("stringutils.startsWith");
import("sqlbase.sqlobj");
import("sqlbase.sqlcommon.inTransaction");

import("etherpad.billing.team_billing");
import("etherpad.globals.*");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.domains");
import("etherpad.sessions.getSession");
import("etherpad.store.checkout");

function _createRecordIfNecessary(domainId) {
  inTransaction(function() {
    var r = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
    if (!r) {
      var count = pro_accounts.getActiveCount(domainId);
      sqlobj.insert('pro_account_usage', {
        domainId: domainId,
        count: count,
        lastReset: (new Date),
        lastUpdated: (new Date)
      });
    }
  });
}

/**
 * Called after a successful payment has been made.
 * Effect: counts the current number of domain accounts and stores that
 * as the current account usage count.
 */
function resetAccountUsageCount(domainId) {
  _createRecordIfNecessary(domainId);
  var newCount = pro_accounts.getActiveCount(domainId);
  sqlobj.update(
    'pro_account_usage',
    {domainId: domainId}, 
    {count: newCount, lastUpdated: (new Date), lastReset: (new Date)}
  );
}

/**
 * Returns the max number of accounts that have existed simultaneously
 * since the last reset.
 */
function getAccountUsageCount(domainId) {
  _createRecordIfNecessary(domainId);
  var record = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
  return record.count;
}


/**
 * Updates the current account usage count by computing:
 *   usage_count = max(current_accounts, usage_count)
 */
function updateAccountUsageCount(domainId) {
  _createRecordIfNecessary(domainId);
  var record = sqlobj.selectSingle('pro_account_usage', {domainId: domainId});
  var currentCount = pro_accounts.getActiveCount(domainId);
  var newCount = Math.max(record.count, currentCount);
  sqlobj.update(
    'pro_account_usage', 
    {domainId: domainId},
    {count: newCount, lastUpdated: (new Date)}
  );
}

// called per request

function _generateGlobalBillingNotice(status) {
  if (status == team_billing.CURRENT) {
    return;
  }
  var notice = SPAN();
  if (status == team_billing.PAST_DUE) {
    var suspensionDate = checkout.formatDate(team_billing.getDomainSuspensionDate(domains.getRequestDomainId()));
    notice.push(
      "Warning: your account is past due and will be suspended on ",
      suspensionDate, ".");
  }
  if (status == team_billing.SUSPENDED) {
    notice.push(
      "Warning: your account is suspended because it is more than ",
      team_billing.GRACE_PERIOD_DAYS, " days past due.");
  }

  if (pro_accounts.isAdminSignedIn()) {
    notice.push("  ", A({href: "/ep/admin/billing/"}, "Manage billing"), ".");
  } else {
    getSession().billingProblem = "Payment is required for sites with more than "+PRO_FREE_ACCOUNTS+" accounts.";
    notice.push("  ", "Please ",
      A({href: "/ep/payment-required"}, "contact a site administrator"), ".");
  }
  request.cache.globalProNotice = notice;
}

function perRequestBillingCheck() {
  // Do nothing if under the free account limit.
  var activeAccounts = pro_accounts.getCachedActiveCount(domains.getRequestDomainId());
  if (activeAccounts <= PRO_FREE_ACCOUNTS) {
    return;
  }

  var status = team_billing.getDomainStatus(domains.getRequestDomainId());
  _generateGlobalBillingNotice(status);

  // now see if we need to block the request because of account
  // suspension
  if (status != team_billing.SUSPENDED) {
    return;
  }
  // These path sare still OK if a suspension is on.
  if ((startsWith(request.path, "/ep/account/") ||
       startsWith(request.path, "/ep/admin/") ||
       startsWith(request.path, "/ep/pro-help/") ||
       startsWith(request.path, "/ep/payment-required"))) {
    return;
  }

  getSession().billingProblem = "Payment is required for sites with more than "+PRO_FREE_ACCOUNTS+" accounts.";
  response.redirect('/ep/payment-required');
}

