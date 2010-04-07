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
import("sqlbase.sqlobj");
import("stringutils");

import("etherpad.globals");
import("etherpad.globals.*");
import("etherpad.licensing");
import("etherpad.utils.*");
import("etherpad.store.checkout.*");

var COST_PER_USER = 99;
var SUPPORT_COST_PCT = 20;
var SUPPORT_MIN_COST = 50;

function getPurchaseByEmail(email) {
  return sqlobj.selectSingle('checkout_purchase', {email: email});
}

function hasEmailAlreadyPurchased(email) {
  var purchase = getPurchaseByEmail(email);
  return purchase && purchase.licenseKey ? true : false;
}

function mailLostLicense(email) {
  var purchase = getPurchaseByEmail(email);
  if (purchase && purchase.licenseKey) {
    sendLicenseEmail({
      email: email,
      ownerName: purchase.owner,
      orgName: purchase.organization,
      licenseKey: purchase.licenseKey
    });
  }
}

function _updatePurchaseWithKey(id, key) {
  sqlobj.updateSingle('checkout_purchase', {id: id}, {licenseKey: key});
}

function updatePurchaseWithReceipt(id, text) {
  sqlobj.updateSingle('checkout_purchase', {id: id}, {receiptEmail: text});
}

function getPurchaseByInvoiceId(id) {
  sqlobj.selectSingle('checkout_purchase', {invoiceId: id});
}

function generateLicenseKey(cart) {
  var licenseKey = licensing.generateNewKey(cart.ownerName, cart.orgName, null, 2, cart.userCount);
  cart.licenseKey = licenseKey;
  _updatePurchaseWithKey(cart.customerId, cart.licenseKey);
  return licenseKey;
}

function receiptEmailText(cart) {
  return renderTemplateAsString('email/eepnet_purchase_receipt.ejs', {
    cart: cart, 
    dollars: dollars,
    obfuscateCC: obfuscateCC
  });
}

function licenseEmailText(userName, licenseKey) {
  return renderTemplateAsString('email/eepnet_license_info.ejs', {
      userName: userName,
      licenseKey: licenseKey,
      isEvaluation: false
    });
}

function sendReceiptEmail(cart) {
  var receipt = cart.receiptEmail || receiptEmailText(cart);
  
  salesEmail(cart.email, "sales@etherpad.com",
             "EtherPad: Receipt for "+cart.ownerName+" ("+cart.orgName+")",
             {}, receipt);
}

function sendLicenseEmail(cart) {
  var licenseEmail = licenseEmailText(cart.ownerName, cart.licenseKey);
  
  salesEmail(cart.email, "sales@etherpad.com",
             "EtherPad: License Key for "+cart.ownerName+" ("+cart.orgName+")",
             {}, licenseEmail);
}