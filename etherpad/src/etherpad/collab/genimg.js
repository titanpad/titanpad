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

import("sync");
import("image");
import("blob");

//jimport("java.lang.System.out.println");

function _cache() {
  sync.callsyncIfTrue(appjet.cache,
    function() { return ! appjet.cache["etherpad-genimg"]; },
    function() { appjet.cache["etherpad-genimg"] = { paths: {}}; });
  return appjet.cache["etherpad-genimg"];
}

function renderPath(path) {
  if (_cache().paths[path]) {
    //println("CACHE HIT");
  }
  else {
    //println("CACHE MISS");
    var regexResult = null;
    var img = null;
    if ((regexResult =
	 /solid\/([0-9]+)x([0-9]+)\/([0-9a-fA-F]{6})\.gif/.exec(path))) {
      var width = Number(regexResult[1]);
      var height = Number(regexResult[2]);
      var color = regexResult[3];
      img = image.solidColorImageBlob(width, height, color);
    }
    else {
      // our "broken image" image, red and partly transparent
      img = image.pixelsToImageBlob(2, 2, [0x00000000, 0xffff0000,
					   0xffff0000, 0x00000000], true, "gif");
    }
    _cache().paths[path] = img;
  }
  
  blob.serveBlob(_cache().paths[path]);
  return true;
}
