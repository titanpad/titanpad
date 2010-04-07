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

import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");
import("etherpad.pad.activepads");
import("etherpad.control.pad.pad_control");
import("etherpad.collab.collab_server");

// NOTE: we need to talk before enabling this again, for potential security vulnerabilities.
var LOADTEST_ENABLED = false;

function onRequest() {
  if (!LOADTEST_ENABLED) {
    response.forbid();
  }
}

function render_createpad() {
  var padId = request.params.padId;
  
  padutils.accessPadLocal(padId, function(pad) {
    if (! pad.exists()) {
      pad.create(pad_control.getDefaultPadText());
    }
  });
  
  activepads.touch(padId);
  response.write("OK");
}

function render_readpad() {
  var padId = request.params.padId;
  
  padutils.accessPadLocal(padId, function(pad) {
    /* nothing */
  });
  
  activepads.touch(padId);
  response.write("OK");
}

function render_appendtopad() {
  var padId = request.params.padId;
  var text = request.params.text;

  padutils.accessPadLocal(padId, function(pad) {
    collab_server.appendPadText(pad, text);
  });
  
  activepads.touch(padId);
  response.write("OK");
}

function render_flushpad() {
  var padId = request.params.padId;
  
  padutils.accessPadLocal(padId, function(pad) {
    dbwriter.writePadNow(pad, true);
  });
  
  activepads.touch(padId);
  response.write("OK");
}

function render_setpadtext() {
  var padId = request.params.padId;
  var text = request.params.text;

  padutils.accessPadLocal(padId, function(pad) {
    collab_server.setPadText(pad, text);
  });
  
  activepads.touch(padId);
  response.write("OK");
}



