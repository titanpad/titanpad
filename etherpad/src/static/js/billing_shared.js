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

var billing = {};

billing.CC = function(shortName, prefixes, length) {
  this.type = shortName;
  this.prefixes = prefixes;
  this.length = length;
  function validateLuhn(number) {
    var digits = [];
    var sum = 0;
    for (var i = 0; i < number.length; ++i) {
      var c = Number(number.charAt(number.length-1-i));
      sum += c;
      if (i % 2 == 1) { // every second digit
        sum += c;
        if (2*c >= 10) {
          sum -= 9;
        }
      }
    }
    return (sum % 10 == 0);    
  }
  this.validatePrefix = function(number) {
    for (var i = 0; i < this.prefixes.length; ++i) {
      if (number.indexOf(String(this.prefixes[i])) == 0) {
        return true;
      }
    }
    return false;
  }
  this.validateLength = function(number) {
    return number.length == this.length;
  }
  
  this.validateNumber = function(number) {
    return this.validateLength(number) &&
      this.validatePrefix(number) &&
      validateLuhn(number);
  }
}

billing.ccTypes = [
  new billing.CC('amex', [34, 37], 15),
  new billing.CC('disc', [6011, 644, 645, 646, 647, 648, 649, 65], 16),
  new billing.CC('mc', [51, 52, 53, 54, 55], 16),
  new billing.CC('visa', [4], 16)];

billing.validateCcNumber = function(number) {
  if (! (/^\d+$/.test(number))) { 
    return false;
  }
  for (var i = 0; i < billing.ccTypes.length; ++i) {
    var ccType = billing.ccTypes[i];
    if (ccType.validatePrefix(number)) {
      return ccType.validateNumber(number);
    }
  }
  return false;
}

billing.validateCcLength = function(number) {
  for (var i = 0; i < billing.ccTypes.length; ++i) {
    var ccType = billing.ccTypes[i];
    if (ccType.validatePrefix(number)) {
      return ccType.validateLength(number);
    }
  }
  return false;
}

billing.getCcType = function(number) {
  for (var i = 0; i < billing.ccTypes.length; ++i) {
    var ccType = billing.ccTypes[i];
    if (ccType.validatePrefix(number)) {
      return ccType.type;
    }
  }
  return false;  
}
