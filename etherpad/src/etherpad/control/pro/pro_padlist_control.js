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
import("jsutils.*");
import("stringutils");

import("etherpad.sessions.getSession");
import("etherpad.utils.*");
import("etherpad.helpers");
import("etherpad.pad.exporthtml");
import("etherpad.pad.padutils");
import("etherpad.pro.pro_padmeta");
import("etherpad.pro.pro_pad_db");
import("etherpad.pro.domains");
import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_padlist");

jimport("java.lang.System.out.println");

function onRequest(name) {
  if (name == "all_pads.zip") {
    render_all_pads_zip_get();
    return true;
  } else {
    return false;
  }
}

function _getBaseUrl() { return "/ep/padlist/"; }

function _renderPadNav() {
  var d = DIV({id: "padlist-nav"});
  var ul = UL();
  var items = [
    ['allpads', 'all-pads', "All Pads"],
    ['mypads', 'my-pads', "My Pads"],
    ['archivedpads', 'archived-pads', "Archived Pads"]
  ];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var cn = "";
    if (request.path.split("/").slice(-1)[0] == item[1]) {
      cn = "selected";
    }
    ul.push(LI(A({id: "nav-"+item[1], href: _getBaseUrl()+item[1], className: cn}, item[2])));
  }
  ul.push(html(helpers.clearFloats()));
  d.push(ul);
  d.push(FORM({id: "newpadform", method: "get", action: "/ep/pad/newpad"},
          INPUT({type: "submit", value: "New Pad"})));
  d.push(html(helpers.clearFloats()));
  return d;
}

function _renderPage(name, data) {
  getSession().latestPadlistView = request.path + "?" + request.query;
  var r = domains.getRequestDomainRecord();
  appjet.requestCache.proTopNavSelection = 'padlist';
  data.renderPadNav = _renderPadNav;
  data.orgName = r.orgName;
  data.renderNotice = function() {
    var m = getSession().padlistMessage;
    if (m) {
      delete getSession().padlistMessage;
      return DIV({className: "padlist-notice"}, m);
    } else {
      return "";
    }
  };

  renderFramed("pro/padlist/"+name+".ejs", data);
}

function _renderListPage(padList, showingDesc, columns) {
  _renderPage("pro-padlist", {
    padList: padList,
    renderPadList: function() {
      return pro_padlist.renderPadList(padList, columns);
    },
    renderShowingDesc: function(count) {
      return DIV({id: "showing-desc"}, 
                  "Showing "+showingDesc+" ("+count+").");
    },
    isAdmin: pro_accounts.isAdminSignedIn()
  });
}

function render_main() {
  if (!getSession().latestPadlistView) {
    getSession().latestPadlistView = "/ep/padlist/all-pads";
  }
  response.redirect(getSession().latestPadlistView);
}

function render_all_pads_get() {
  _renderListPage(
    pro_pad_db.listAllDomainPads(),
    "all pads",
    ['secure', 'title', 'lastEditedDate', 'editors', 'actions']);
}

function render_all_pads_zip_get() {
  if (! pro_accounts.isAdminSignedIn()) {
    response.redirect(_getBaseUrl()+"all-pads");
  }
  var bytes = new java.io.ByteArrayOutputStream();
  var zos = new java.util.zip.ZipOutputStream(bytes);

  var pads = pro_pad_db.listAllDomainPads();
  pads.forEach(function(pad) {
    var padHtml;
    var title;
    padutils.accessPadLocal(pad.localPadId, function(p) {
      title = padutils.getProDisplayTitle(pad.localPadId, pad.title);
      padHtml = exporthtml.getPadHTML(p);
    }, "r");

    title = title.replace(/[^\w\s]/g, "-") + ".html";
    zos.putNextEntry(new java.util.zip.ZipEntry(title));
    var padBytes = (new java.lang.String(renderTemplateAsString('pad/exporthtml.ejs', {
      content: padHtml,
      pre: false
    }))).getBytes("UTF-8");
    
    zos.write(padBytes, 0, padBytes.length);
    zos.closeEntry();
  });
  zos.close();
  response.setContentType("application/zip");
  response.writeBytes(bytes.toByteArray());
}

function render_my_pads_get() {
  _renderListPage(
      pro_pad_db.listMyPads(),
      "pads created by me",
      ['secure', 'title', 'lastEditedDate', 'editors', 'actions']);
}

function render_archived_pads_get() {
  helpers.addClientVars({
    showingArchivedPads: true
  });
  _renderListPage(
      pro_pad_db.listArchivedPads(),
      "archived pads",
      ['secure', 'title', 'lastEditedDate', 'actions']);
}

function render_edited_by_get() {
  var editorId = request.params.editorId;
  var editorName = pro_accounts.getFullNameById(editorId);
  _renderListPage(
    pro_pad_db.listPadsByEditor(editorId),
    "pads edited by "+editorName,
    ['secure', 'title', 'lastEditedDate', 'editors', 'actions']);
}

function render_delete_post() {
  var localPadId = request.params.padIdToDelete;

  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    propad.markDeleted();
    getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been deleted.';
  });

  response.redirect(request.params.returnPath);
}

function render_toggle_archive_post() {
  var localPadId = request.params.padIdToToggleArchive;

  pro_padmeta.accessProPadLocal(localPadId, function(propad) {
    if (propad.isArchived()) {
      propad.unmarkArchived();
      getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been un-archived.';
    } else {
      propad.markArchived();
      getSession().padlistMessage = 'Pad "'+propad.getDisplayTitle()+'" has been archived.  You can view archived pads by clicking on the "Archived" tab at the top of the pad list.';
    }
  });

  response.redirect(request.params.returnPath);
}


