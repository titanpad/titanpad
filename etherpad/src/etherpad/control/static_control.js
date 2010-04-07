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

import("faststatic");
import("dispatch.{Dispatcher,PrefixMatcher,forward}");

import("etherpad.utils.*");
import("etherpad.globals.*");

function onRequest() {
  var staticBase = '/static';

  var opts = {cache: isProduction()};

  var serveFavicon = faststatic.singleFileServer(staticBase + '/favicon.ico', opts);
  var serveCrossDomain = faststatic.singleFileServer(staticBase + '/crossdomain.xml', opts);
  var serveStaticDir = faststatic.directoryServer(staticBase, opts);
  var serveCompressed = faststatic.compressedFileServer(opts);
  var serveJs = faststatic.directoryServer(staticBase+'/js/', opts);
  var serveCss = faststatic.directoryServer(staticBase+'/css/', opts);
  var serveSwf = faststatic.directoryServer(staticBase+'/swf/', opts);
  var serveHtml = faststatic.directoryServer(staticBase+'/html/', opts);
  var serveZip = faststatic.directoryServer(staticBase+'/zip/', opts);

  var disp = new Dispatcher();

  disp.addLocations([
    ['/favicon.ico', serveFavicon],
    ['/robots.txt', serveRobotsTxt],
    ['/crossdomain.xml', serveCrossDomain],
    [PrefixMatcher('/static/html/'), serveHtml],
    [PrefixMatcher('/static/js/'), serveJs],
    [PrefixMatcher('/static/css/'), serveCss],
    [PrefixMatcher('/static/swf/'), serveSwf],
    [PrefixMatcher('/static/zip/'), serveZip],
    [PrefixMatcher('/static/compressed/'), serveCompressed],
    [PrefixMatcher('/static/'), serveStaticDir]
  ]);

  return disp.dispatch();
}

function serveRobotsTxt(name) {
  response.neverCache();
  response.setContentType('text/plain');
  response.write('User-agent: *\n');
  if (!isProduction()) {
    response.write('Disallow: /\n');
  }
  response.stop();
  return true;
}
