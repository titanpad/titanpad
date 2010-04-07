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

if (!window.etherpad) {
  etherpad = {};
}
if (!window.etherpad.pro) {
  etherpad.pro = {};
}

etherpad.pro.padlist = {};

$(document).ready(function() {

  function getTargetPadId(target) {
    var padmetaId = $(target).attr('id').split('-')[2];
    //console.log("padmetaId = "+padmetaId);
    return clientVars.localPadIds[padmetaId];
  }

  var padActionsMenu = [
    {"View Read-Only": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu.target);
          window.location.href = ("/ep/pad/view/"+localPadId+"/latest");
        },
        icon: '/static/img/pro/padlist/paper-icon.gif'
      }
    },
    $.contextMenu.separator,
    {"Archive": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu.target);
          etherpad.pro.padlist.toggleArchivePad(localPadId);
        }
      }
    },
    {"Delete": {
        onclick: function(menuItem, menu) {
          var localPadId = getTargetPadId(menu.target);
          etherpad.pro.padlist.deletePad(localPadId);
        },
        icon: '/static/img/pro/padlist/trash-icon.gif'
      }
    }
  ];

  if (clientVars.showingArchivedPads) {
    padActionsMenu[2]["Un-archive"] = padActionsMenu[2]["Archive"];
    delete padActionsMenu[2]["Archive"];
  }

  $('.gear-drop').contextMenu(padActionsMenu, {
    theme: 'gloss,gloss-cyan',
    bindTarget: 'click',
    beforeShow: function() {
      var localPadId = getTargetPadId(this.target);
      $('tr.selected').removeClass('selected');
      $('tr#pad-row-'+localPadId).addClass('selected');
      return true;
    },
    hideCallback: function() {
      var localPadId = getTargetPadId(this.target);
      $('tr#pad-row-'+localPadId).removeClass('selected');
    }
  });
});

etherpad.pro.padlist.deletePad = function(localPadId) {
  if (!confirm("Are you sure you want to delete the pad \""+clientVars.padTitles[localPadId]+"\"?")) {
    return;
  }

  var inp = $("#padIdToDelete");
  inp.val(localPadId);

  // sanity check
  if (! (inp.val() == localPadId)) {
    alert("Error: "+inp.val());
    return;
  }

  $("#delete-pad").submit();
};

etherpad.pro.padlist.toggleArchivePad = function(localPadId) {
  var inp = $("#padIdToToggleArchive");
  inp.val(localPadId);
  $("#toggle-archive-pad").submit();
};

