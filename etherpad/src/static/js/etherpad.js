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

$(document).ready(function() {
  etherpad.deobfuscateEmails();

  if ($('#betasignuppage').size() > 0) {
    etherpad.betaSignupPageInit();
  }

  if ($('#productpage').size() > 0) {
    etherpad.productPageInit();
  }

  if ($('.pricingpage').size() > 0) {
    etherpad.pricingPageInit();
  }
});

etherpad = {};

//----------------------------------------------------------------
// general utils
//----------------------------------------------------------------

etherpad.validEmail = function(x) {
  return (x.length > 0 &&
	  x.match(/^[\w\.\_\+\-]+\@[\w\_\-]+\.[\w\_\-\.]+$/));
};

//----------------------------------------------------------------
// obfuscating emails
//----------------------------------------------------------------

etherpad.deobfuscateEmails = function() {
  $("a.obfuscemail").each(function() {
    $(this).html($(this).html().replace('e***rp*d','etherpad'));
    this.href = this.href.replace('e***rp*d','etherpad');
  });
};

//----------------------------------------------------------------
// Signing up for pricing info
//----------------------------------------------------------------

etherpad.pricingPageInit = function() {
  $('#submitbutton').click(etherpad.pricingSubmit);
};

etherpad.pricingSubmit = function(edition) {
  var allData = {};
  $('#pricingcontact input.ti').each(function() {
    allData[$(this).attr('id')] = $(this).val();
  });
  allData.industry = $('#industry').val();

  $('form button').hide();
  $('#spinner').show();
  $('form input').attr('disabled', true);
  
  $.ajax({
    type: 'post',
    url: $('#pricingcontact').attr('action'),
    data: allData,
    success: success,
    error: error
  });

  function success(responseText) {
    $('#spinner').hide();
    if (responseText == "OK") {
      $('#errorbox').hide();
      $('#confirmbox').fadeIn('fast');
    } else {
      $('#confirmbox').hide();
      $('#errorbox').hide().html(responseText).fadeIn('fast');
      $('form button').show();
      $('form input').removeAttr('disabled');
    }
  }
  function error() {
    $('#spinner').hide();
    $('#errorbox').hide().html("Server error.").fadeIn('fast');
    $('form button').show();
    $('form input').removeAttr('disabled');
  }

  return false;
}


//----------------------------------------------------------------
// Product page (client-side nagivation with JS)
//----------------------------------------------------------------

etherpad.productPageInit = function() {
  $("#productpage #tour").addClass("javascripton");
  etherpad.productPageNavigateTo(window.location.hash.substring(1));

  $("#productpage a.tournav").click(etherpad.tourNavClick);
}

etherpad.tourNavClick = function() { // to be called as a click event handler
  var href = $(this).attr('href');
  var thorpLoc = href.indexOf('#');
  if (thorpLoc >= 0) {
    etherpad.productPageNavigateTo(href.substring(thorpLoc+1), true);
  }
}

etherpad.productPageNavigateTo = function(hash, shouldAnimate) {
  function setNavLink(rightOrLeft, text, linkhash) {
    var navcells = $('#productpage .tourbar .'+rightOrLeft);
    if (! text) {
      navcells.html('&nbsp;');
    }
    else {
      navcells.
	html('<a class="tournav" href="'+clientVars.pageURL+'#'+(linkhash||'')+'">'+text+'</a>').
	find('a.tournav').click(etherpad.tourNavClick);
    }
  }
  function switchCardsIfNecessary(fromCard, toCard, andThen/*(didAnimate)*/) {
    if (! $('#productpage #tour').hasClass("show"+toCard)) {
      var afterAnimate = function() {
	$("#productpage #"+fromCard).get(0).style.display = "";
	$('#productpage #tour').removeClass("show"+fromCard).addClass("show"+toCard);
	if (andThen) andThen(shouldAnimate);
      }
      if (shouldAnimate) {
	$("#productpage #"+fromCard).fadeOut("fast", afterAnimate);
      }
      else {
	afterAnimate();
      }
    }
    else {
      andThen(false);
    }
  }
  function switchProseIfNecessary(toNum, useAnimation, andThen) {
    var visibleProse = $("#productpage .tourprose:visible");
    var alreadyVisible = ($("#productpage #tour"+toNum+"prose:visible").size() > 0);
    function assignVisibilities() {
      $("#productpage .tourprose").each(function() {
	if (this.id == "tour"+toNum+"prose") {
	  this.style.display = 'block';
	}
	else {
	  this.style.display = 'none';
	}
      });
    }
    
    if ((! useAnimation) || visibleProse.size() == 0 || alreadyVisible) {
      assignVisibilities();
      andThen();
    }
    else {
      function afterAnimate() {
	assignVisibilities();
	andThen();	
      }
      if (visibleProse.size() > 0 && visibleProse.get(0).id != "tour"+toNum+"prose") {
	visibleProse.fadeOut("fast", afterAnimate);
      }
      else {
	afterAnimate();
      }
    }
  }
  function getProseTitle(n) {
    if (n == 0) return clientVars.screenshotTitle;
    var atag = $("#productpage #tourleftnav .tour"+n+" a");
    if (atag.size() > 0) return atag.text();
    return '';
  }
  
  var regexResult;
  if ((regexResult = /^uses([1-9][0-9]*)$/.exec(hash))) {
    var tourNum = +regexResult[1];
    switchCardsIfNecessary("pageshot", "usecases", function(didAnimate) {
      switchProseIfNecessary(tourNum, shouldAnimate && !didAnimate, function() {
	/*var n = tourNum;
	setNavLink("left", "&laquo; "+getProseTitle(n-1), (n == 1 ? "" : "uses"+(n-1)));
	var nextTitle = getProseTitle(n+1);
	if (! nextTitle) setNavLink("right", "");
	else setNavLink("right", nextTitle+" &raquo;", "uses"+(n+1));*/
	/*setNavLink("left", "&laquo; "+getProseTitle(0), "");
	setNavLink("right", "");*/
	setNavLink("right", "&laquo; "+getProseTitle(0), "");
	$('#tourtop td.left').html("Use Cases");
	$("#productpage #tourleftnav li").removeClass("selected");
	$("#productpage #tourleftnav li.tour"+tourNum).addClass("selected");	
      });
    });
  }
  else {
    switchCardsIfNecessary("usecases", "pageshot", function() {
      $('#tourtop td.left').html(getProseTitle(0));
      setNavLink("right", clientVars.screenshotNextLink, "uses1");
    });
  }  
}
