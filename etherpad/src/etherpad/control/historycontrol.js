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

import("fastJSON");
import("etherpad.utils.render404");
import("etherpad.pad.model");
import("etherpad.collab.collab_server");
import("etherpad.collab.ace.easysync2.*");
import("jsutils.eachProperty");

function _urlCache() {
  if (!appjet.cache.historyUrlCache) {
    appjet.cache.historyUrlCache = {};
  }
  return appjet.cache.historyUrlCache;
}

function _replyWithJSONAndCache(obj) {
  obj.apiversion = _VERSION;
  var output = fastJSON.stringify(obj);
  _urlCache()[request.path] = output;
  response.write(output);
  response.stop();  
}

function _replyWithJSON(obj) {
  obj.apiversion = _VERSION;
  response.write(fastJSON.stringify(obj));
  response.stop();
}

function _error(msg, num) {
  _replyWithJSON({error: String(msg), errornum: num});
}

var _VERSION = 1;

var _ERROR_REVISION_NUMBER_TOO_LARGE = 14;

function _do_text(padId, r) {
  if (! padId) render404();
  model.accessPadGlobal(padId, function(pad) {
    if (! pad.exists()) {
      render404();
    }
    if (r > pad.getHeadRevisionNumber()) {
      _error("Revision number too large", _ERROR_REVISION_NUMBER_TOO_LARGE);
    }
    var text = pad.getInternalRevisionText(r);
    text = _censorText(text);
    _replyWithJSONAndCache({ text: text });
  });
}

function _do_stat(padId) {
  var obj = {};
  if (! padId) {
    obj.exists = false;
  }
  else {
    model.accessPadGlobal(padId, function(pad) {
      if (! pad.exists()) {
        obj.exists = false;
      }
      else {
        obj.exists = true;
        obj.latestRev = pad.getHeadRevisionNumber();
      }
    });
  }
  _replyWithJSON(obj);
}

function _censorText(text) {
  // may not change length of text
  return text.replace(/(http:\/\/etherpad.com\/)(\w+)/g, function(url, u1, u2) {
    return u1 + u2.replace(/\w/g, '-');
  });
}

function _do_changes(padId, first, last) {
  if (! padId) render404();
  
  var charPool = [];
  var changeList = [];

  function charPoolText(txt) {
    charPool.push(txt);
    return _encodeVarInt(txt.length);
  }
  
  model.accessPadGlobal(padId, function(pad) {

    if (first > pad.getHeadRevisionNumber() || last > pad.getHeadRevisionNumber()) {
      _error("Revision number too large", _ERROR_REVISION_NUMBER_TOO_LARGE);      
    }
    
    var curAText = Changeset.makeAText("\n");
    if (first > 0) {
      curAText = pad.getInternalRevisionAText(first - 1);
    }
    curAText.text = _censorText(curAText.text);
    var lastTimestamp = null;
    for(var r=first;r<=last;r++) {
      var binRev = [];
      var timestamp = +pad.getRevisionDate(r);
      binRev.push(_encodeTimeStamp(timestamp, lastTimestamp));
      lastTimestamp = timestamp;
      binRev.push(_encodeVarInt(1)); // fake author
      
      var c = pad.getRevisionChangeset(r);
      var splices = Changeset.toSplices(c);
      splices.forEach(function (splice) {
        var startChar = splice[0];
        var endChar = splice[1];
        var newText = splice[2];
        oldText = curAText.text.substring(startChar, endChar);
        
        if (oldText.length == 0) {
          binRev.push('+');
          binRev.push(_encodeVarInt(startChar));
          binRev.push(charPoolText(newText));
        }
        else if (newText.length == 0) {
          binRev.push('-');
          binRev.push(_encodeVarInt(startChar));
          binRev.push(charPoolText(oldText));
        }
        else {
          binRev.push('*');
          binRev.push(_encodeVarInt(startChar));
          binRev.push(charPoolText(oldText));
          binRev.push(charPoolText(newText));
        }
      });
      changeList.push(binRev.join(''));

      curAText = Changeset.applyToAText(c, curAText, pad.pool());
    }
    
    _replyWithJSONAndCache({charPool: charPool.join(''), changes: changeList.join(',')});
    
  });
}

function render_history(padOpaqueRef, rest) {
  if (_urlCache()[request.path]) {
    response.write(_urlCache()[request.path]);
    response.stop();
    return true;
  }
  var padId;
  if (padOpaqueRef == "CSi1xgbFXl" || padOpaqueRef == "13sentences") {
    // made-up, hard-coded opaque ref, should be a table for these
    padId = "jbg5HwzUX8";
  }
  else if (padOpaqueRef == "dO1j7Zf34z" || padOpaqueRef == "foundervisa") {
    // made-up, hard-coded opaque ref, should be a table for these
    padId = "3hS7kQyDXG";
  }
  else {
    padId = null;
  }
  var regexResult;
  if ((regexResult = /^stat$/.exec(rest))) {
    _do_stat(padId);
  }
  else if ((regexResult = /^text\/(\d+)$/.exec(rest))) {
    var r = Number(regexResult[1]);
    _do_text(padId, r);
  }
  else if ((regexResult = /^changes\/(\d+)-(\d+)$/.exec(rest))) {
    _do_changes(padId, Number(regexResult[1]), Number(regexResult[2]));
  }
  else {
    return false;
  }
}

function _encodeVarInt(num) {
  var n = +num;
  if (isNaN(n)) {
    throw new Error("Can't encode non-number "+num);
  }
  var chars = [];
  var done = false;
  while (! done) {
    if (n < 32) done = true;
    var nd = (n % 32);
    if (chars.length > 0) {
      // non-first, will become non-last digit
      nd = (nd | 32);
    }
    chars.push(_BASE64_DIGITS[nd]);
    n = Math.floor(n / 32)
  }
  return chars.reverse().join('');
}
var _BASE64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._";

function _encodeTimeStamp(tMillis, baseMillis) {
  var t = Math.floor(tMillis/1000);
  var base = Math.floor(baseMillis/1000);
  var absolute = ["+", t];
  var resultPair = absolute;
  if (((typeof base) == "number") && base <= t) {
    var relative = ["", t - base];
    if (relative[1] < absolute[1]) {
      resultPair = relative;
    }
  }
  return resultPair[0] + _encodeVarInt(resultPair[1]);
}
