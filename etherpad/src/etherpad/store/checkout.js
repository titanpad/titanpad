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
import("jsutils.*");
import("sqlbase.sqlobj");
import("stringutils");
import("sync");

import("etherpad.globals");
import("etherpad.globals.*");
import("etherpad.licensing");
import("etherpad.utils.*");

import("static.js.billing_shared.{billing=>billingJS}");

function dollars(x, nocommas) {
  if (! x) { return "0.00"; }
  var s = String(x);
  var dollars = s.split('.')[0];
  var pennies = s.split('.')[1];

  if (!dollars) {
    dollars = "0";
  }

  if (!nocommas && dollars.length > 3) {
    var newDollars = [];
    newDollars.push(dollars[dollars.length-1]);
    
    for (var i = 1; i < dollars.length; ++i) {
      if (i % 3 == 0) {
        newDollars.push(",");
      } 
      newDollars.push(dollars[dollars.length-1-i]);
    }
    dollars = newDollars.reverse().join('');
  }

  if (!pennies) {
    pennies = "00";
  }

  if (pennies.length == 1) {
    pennies = pennies + "0";
  }

  if (pennies.length > 2) {
    pennies = pennies.substr(0,2);
  }

  return [dollars,pennies].join('.');
}

function obfuscateCC(x) {
  if (x.length == 16 || x.length == 15) {
    return stringutils.repeat("X", x.length-4) + x.substr(-4);
  } else {
    return x;
  }
}


// validation functions

function isOnlyDigits(s) {
  return /^[0-9]+$/.test(s);
}

function isOnlyLettersAndSpaces(s) {
  return /^[a-zA-Z ]+$/.test(s);
}

function isLength(s, minLen, maxLen) {
  if (maxLen === undefined) {
    return (typeof(s) == 'string' && s.length == minLen);
  } else {
    return (typeof(s) == 'string' && s.length >= minLen && s.length <= maxLen);
  }
}

function errorMissing(validationError, name, description) {
  validationError(name, "Please enter a "+description+".");
}

function errorTooSomething(validationError, name, description, max, tooWhat, betterAdjective) {
  validationError(name, "Your "+description+" is too " + tooWhat + "; please provide a "+description+
                         " that is "+max+" characters or "+betterAdjective);  
}

function validateString(validationError, s, name, description, mustExist, maxLength, minLength) {
  if (mustExist && ! s) {
    errorMissing(validationError, name, description);
  }
  if (s && s.length > maxLength) {
    errorTooSomething(validationError, name, description, maxLength, "long", "shorter");
  }
  if (minLength > 0 && s.length < minLength) {
    errorTooSomething(validationError, name, description, minLength, "short", "longer");
  }
}

function validateZip(validationError, s) {
  if (! s) {
    errorMissing(validationError, 'billingZipCode', "ZIP code");
  }
  if (! (/^\d{5}(-\d{4})?$/.test(s))) {
    validationError('billingZipCode', "Please enter a valid ZIP code");
  }
}

function validateBillingCart(validationError, cart) {
  var p = cart;
  
  if (! isOnlyLettersAndSpaces(p.billingFirstName)) {
    validationError("billingFirstName", "Name fields may only contain alphanumeric characters.");
  }

  if (! isOnlyLettersAndSpaces(p.billingLastName)) {
    validationError("billingLastName", "Name fields may only contain alphanumeric characters.");
  }
  
  var validPurchaseTypes = arrayToSet(['creditcard', 'invoice', 'paypal']);  
  if (! p.billingPurchaseType in validPurchaseTypes) {
    validationError("billingPurchaseType", "Please select a valid purchase type.")
  }
  
  switch (p.billingPurchaseType) {
    case 'creditcard':
      if (! billingJS.validateCcNumber(p.billingCCNumber)) {
        validationError("billingCCNumber", "Your card number doesn't appear to be valid.");
      }
      if (! isOnlyDigits(p.billingExpirationMonth) || 
          ! isLength(p.billingExpirationMonth, 1, 2)) {
        validationError("billingMeta", "Invalid expiration month.");
      }
      if (! isOnlyDigits(p.billingExpirationYear) ||
          ! isLength(p.billingExpirationYear, 1, 2)) {
        validationError("billingMeta", "Invalid expiration year.");
      }
      if (Number("20"+p.billingExpirationYear) <= (new Date()).getFullYear() &&
          Number(p.billingExpirationMonth) < (new Date()).getMonth()+1) {
        validationError("billingMeta", "Invalid expiration date.");
      }
      var ccType = billingJS.getCcType(p.billingCCNumber);
      if (! isOnlyDigits(p.billingCSC) || 
          ! isLength(p.billingCSC, (ccType == 'amex' ? 4 : 3))) {
        validationError("billingMeta", "Invalid CSC.");
      }
      // falling through here!
    case 'invoice':
      validateString(validationError, p.billingCountry, "billingCountry", "country name", true, 2);
      validateString(validationError, p.billingAddressLine1, "billingAddressLine1", "billing address", true, 100);
      validateString(validationError, p.billingAddressLine2, "billingAddressLine2", "billing address", false, 100);
      validateString(validationError, p.billingCity, "billingCity", "city name", true, 40);
      if (p.billingCountry == "US") {
        validateString(validationError, p.billingState, "billingState", "state name", true, 2);
        validateZip(validationError, p.billingZipCode);
      } else {
        validateString(validationError, p.billingProvince, "billingProvince", "province name", true, 40, 1);
        validateString(validationError, p.billingPostalCode, "billingPostalCode", "postal code", true, 20, 5);
      }
  }
}

function _cardType(number) {
  var cardType = billingJS.getCcType(number);
  switch (cardType) {
    case 'visa':
      return "Visa";
    case 'amex':
      return "Amex";
    case 'disc':
      return "Discover";
    case 'mc':
      return "MasterCard";
  }  
}

function generatePayInfo(cart) {
  var isUs = cart.billingCountry == "US";

  var payInfo = {
    cardType: _cardType(cart.billingCCNumber),
    cardNumber: cart.billingCCNumber,
    cardExpiration: ""+cart.billingExpirationMonth+"20"+cart.billingExpirationYear,
    cardCvv: cart.billingCSC,

    nameSalutation: "",
    nameFirst: cart.billingFirstName,
    nameMiddle: "",
    nameLast: cart.billingLastName,
    nameSuffix: "",

    addressStreet: cart.billingAddressLine1,
    addressStreet2: cart.billingAddressLine2,
    addressCity: cart.billingCity,
    addressState: (isUs ? cart.billingState : cart.billingProvince),
    addressZip: (isUs ? cart.billingZipCode : cart.billingPostalCode),
    addressCountry: cart.billingCountry
  }

  return payInfo;
}

var billingCartFieldMap = {
  cardType: {f: ["billingCCNumber"], d: "credit card number"},
  cardNumber: { f: ["billingCCNumber"], d: "credit card number"},
  cardExpiration: { f: ["billingMeta", "billingMeta"], d: "expiration date" },
  cardCvv: { f: ["billingMeta"], d: "card security code" },
  card: { f: ["billingCCNumber", "billingMeta"], d: "credit card"},
  nameFirst: { f: ["billingFirstName"], d: "first name" },
  nameLast: {f: ["billingLastName"], d: "last name" },
  addressStreet: { f: ["billingAddressLine1"], d: "billing address" },
  addressStreet2: { f: ["billingAddressLine2"], d: "billing address" },
  addressCity: { f: ["billingCity"], d: "city" },
  addressState: { f: ["billingState", "billingProvince"], d: "state or province" },
  addressCountry: { f: ["billingCountry"], d: "country" },
  addressZip: { f: ["billingZipCode", "billingPostalCode"], d: "ZIP or postal code" },
  address: { f: ["billingAddressLine1", "billingAddressLine2", "billingCity", "billingState", "billingCountry", "billingZipCode"], d: "address" }
}

function validateErrorFields(validationError, errorPrefix, fieldList) {
  if (fieldList.length > 0) {
    var errorMsg;
    var errorFields;
    errorMsg = errorPrefix + 
               fieldList.map(function(field) { return billingCartFieldMap[field].d }).join(", ") +
               ".";
    errorFields = [];
    fieldList.forEach(function(field) {
      errorFields = errorFields.concat(billingCartFieldMap[field].f);
    });
    validationError(errorFields, errorMsg);
  }    
}

function guessBillingNames(cart, name) {
  if (! cart.billingFirstName && ! cart.billingLastName) {
    var nameParts = name.split(/\s+/);
    if (nameParts.length == 1) {
      cart.billingFirstName = nameParts[0];
    } else {
      cart.billingLastName = nameParts[nameParts.length-1];
      cart.billingFirstName = nameParts.slice(0, nameParts.length-1).join(' ');
    }    
  }
}

function writeToEncryptedLog(s) {
  if (! appjet.config["etherpad.billingEncryptedLog"]) {
    // no need to log, this probably isn't the live server.
    return;
  }
  var e = net.appjet.oui.Encryptomatic;
  sync.callsyncIfTrue(appjet.cache, 
    function() { return ! appjet.cache.billingEncryptedLog },
    function() {
      appjet.cache.billingEncryptedLog = {
        writer: new java.io.FileWriter(appjet.config["etherpad.billingEncryptedLog"], true),
        key: e.readPublicKey("RSA", new java.io.FileInputStream(appjet.config["etherpad.billingPublicKey"]))
      }
    });
  var l = appjet.cache.billingEncryptedLog;
  sync.callsync(l, function() {
    l.writer.write(e.bytesToAscii(e.encrypt(
      new java.io.ByteArrayInputStream((new java.lang.String(s)).getBytes("UTF-8")),
      l.key))+"\n");
    l.writer.flush();    
  })
}

function formatExpiration(expiration) {
  return dateutils.shortMonths[Number(expiration.substr(0, 2))-1]+" "+expiration.substr(2);
}

function formatDate(date) {
  return dateutils.months[date.getMonth()]+" "+date.getDate()+", "+date.getFullYear();
}

function salesEmail(to, from, subject, headers, body) {
  sendEmail(to, from, subject, headers, body);
  if (globals.isProduction()) {
    sendEmail("sales@etherpad.com", from, subject, headers, body);
  }
}