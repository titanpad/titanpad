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


store = {};

$(document).ready(function() {
  if ($('#downloadpage').size() > 0) {
    $("#license_agree, #license_agree_label").click(function() {
      if ($("#license_agree").attr("checked")) {
	$("a.downloadbutton_disabled").removeClass("downloadbutton_disabled")
	  .addClass("downloadbutton")
	  .attr('href', '/ep/store/eepnet-download-nextsteps');
      } else {
	$("a.downloadbutton").removeClass("downloadbutton")
	  .addClass("downloadbutton_disabled")
	  .attr('href', 'javascript:void store.mustAgree()');
      }
    });
  }

  if ($('#eepnet_trial_signup_page').size() > 0) {
    store.eepnetTrial.init();
  }

});

store.mustAgree = function() {
  alert("You must first click 'Accept License' before downloading this software.");
};

//----------------------------------------------------------------
// trial download page
//----------------------------------------------------------------

store.eepnetTrial = {};

store.eepnetTrial.init = function() {
  $("#submit").attr("disabled", false);
  $("input.signupData").keydown(function() {
    $("#submit").attr("disabled", false);
  });
  $("input.signupData").change(function() {
    $("#submit").attr("disabled", false);
  });
};

store.eepnetTrial.handleError = function(msg) {
  $('#processingmsg').hide();
  $('#dlsignup').show();
  $("#errormsg").hide().html(msg).fadeIn("fast");
  var href = window.location.href;
  href = href.split("#")[0];
  window.location.href = (href + "#toph2");
  $('#submit').attr('disabled', false);
};

store.eepnetTrial.submit = function() {

  $("#errormsg").hide();
  $('#dlsignup').hide();
  $('#processingmsg').fadeIn('fast');
  
  // first stubmit to etherpad.com...
  var data = {};
  $(".signupData").each(function() {
    data[$(this).attr("id")] = $(this).val();
  });
  data.industry = $('#industry').val();

  $('#submit').attr('disabled', true);

  $.ajax({
    type: 'post',
    url: '/ep/store/eepnet-eval-signup',
    data: data,
    success: success,
    error: error
  });

  function success(text) {
    var responseData = eval("("+text+")");
    if (responseData.error) {
      store.eepnetTrial.handleError(responseData.error);
      return;
    }

    store.eepnetTrial.submitWebToLead(responseData);
  }

  function error(e) {
    store.eepnetTrial.handleError("Oops!  There was an error processing your request.");
  }
};

store.eepnetTrial.submitWebToLead = function(data) {
  for (k in data) {
    $('#wl_'+k).val(data[k]);
  }
  setTimeout(function() { $('#wlform').submit(); }, 50);
};


