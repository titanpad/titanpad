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

import("stringutils");
import("sqlbase.sqlobj");

import("etherpad.licensing");

jimport("java.util.Random");

function run() {
  var r = new Random(0);

  function testLicense(name, org, expires, editionId, userQuota) {
    function keydataString() {
      return "{name: "+name+", org: "+org+", expires: "+expires+", editionId: "+editionId+", userQuota: "+userQuota+"}";
    }
    var key = licensing.generateNewKey(name, org, expires, editionId, userQuota);
    var info = licensing.decodeLicenseInfoFromKey(key);
    if (!info) {
      println("Generated key does not decode at all: "+keydataString());
      println("   generated key: "+key);
      throw new Error("Generated key does not decode at all.  See stdout.");
    }
    function testMatch(name, x, y) {
      if (x != y) {
        println("key match error ("+name+"): ["+x+"] != ["+y+"]");
        println("   key data: "+keydataString());
        println("   generated key: "+key);
        println("   decoded key: "+info.toSource());
        throw new Error(name+" mismatch.  see stdout.");
      }
    }
    testMatch("personName", info.personName, name);
    testMatch("orgName", info.organizationName, org);
    testMatch("expires", +info.expiresDate, +expires);
    testMatch("editionName", info.editionName, licensing.getEditionName(editionId));
    testMatch("userQuota", +info.userQuota, +userQuota);
  }

  testLicense("aaron", "test", +(new Date)+1000*60*60*24*30, licensing.getEditionId('PRIVATE_NETWORK_EVALUATION'), 1001);

  for (var editionId = 0; editionId < 3; editionId++) {
    for (var unlimitedUsers = 0; unlimitedUsers <= 1; unlimitedUsers++) {
      for (var noExpiry = 0; noExpiry <= 1; noExpiry++) {
        for (var j = 0; j < 100; j++) {
          var name = stringutils.randomString(1+r.nextInt(39));
          var org = stringutils.randomString(1+r.nextInt(39));
          var expires = null;
          if (noExpiry == 0) {
            expires = +(new Date)+(1000*60*60*24*r.nextInt(100));
          }
          var userQuota = -1;
          if (unlimitedUsers == 1) {
            userQuota = r.nextInt(1e6);
          }

          testLicense(name, org, expires, editionId, userQuota);
        }
      }
    }
  }

  // test that all previously generated keys continue to decode.
  var historicalKeys = sqlobj.selectMulti('eepnet_signups', {}, {});
  historicalKeys.forEach(function(d) {
    var key = d.licenseKey;
    if (key && !licensing.isValidKey(key)) {
      throw new Error("Historical license key no longer validates: "+key);
    }
  });

}



