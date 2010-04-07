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
import("netutils");
import("funhtml.*");
import("stringutils.{html,sprintf,startsWith,md5}");
import("jsutils.*");
import("sqlbase.sqlbase");
import("sqlbase.sqlcommon");
import("sqlbase.sqlobj");
import("varz");
import("comet");
import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");

import("etherpad.billing.team_billing");
import("etherpad.globals.*");
import("etherpad.utils.*");
import("etherpad.licensing");
import("etherpad.sessions.getSession");
import("etherpad.sessions");
import("etherpad.statistics.statistics");
import("etherpad.log");
import("etherpad.admin.shell");
import("etherpad.usage_stats.usage_stats");
import("etherpad.control.blogcontrol");
import("etherpad.control.pro_beta_control");
import("etherpad.control.statscontrol");
import("etherpad.statistics.exceptions");
import("etherpad.store.checkout");

import("etherpad.pad.activepads");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.dbwriter");
import("etherpad.collab.collab_server");

import("etherpad.pro.pro_accounts");
import("etherpad.pro.pro_utils");
import("etherpad.pro.domains");

jimport("java.lang.System.out.println");

jimport("net.appjet.oui.cometlatencies");
jimport("net.appjet.oui.appstats");


//----------------------------------------------------------------

function _isAuthorizedAdmin() {
  if (!isProduction()) {
    return true;
  }
  return (getSession().adminAuth === true);
}

var _mainLinks = [
  ['exceptions', 'Exceptions Monitor'],
  ['usagestats/', 'Usage Stats'],
  ['padinspector', 'Pad Inspector'],
  ['dashboard', 'Dashboard'],
  ['eepnet-licenses', 'EEPNET Licenses'],
  ['config', 'appjet.config'],
  ['shell', 'Shell'],
  ['timings', 'timing data'],
  ['broadcast-message', 'Pad Broadcast'],
//  ['analytics', 'Google Analytics'],
  ['varz', 'varz'],
  ['genlicense', 'Manually generate a license key'],
  ['flows', 'Flows (warning: slow)'],
  ['diagnostics', 'Pad Connection Diagnostics'],
  ['cachebrowser', 'Cache Browser'],
  ['pne-tracker', 'PNE Tracking Stats'],
  ['reload-blog-db', 'Reload blog DB'],
  ['pro-domain-accounts', 'Pro Domain Accounts'],
  ['beta-valve', 'Beta Valve'],
  ['reset-subscription', "Reset Subscription"]
];

function onRequest(name) {
  if (name == "auth") {
    return;
  }
  if (!_isAuthorizedAdmin()) {
    getSession().cont = request.path;
    response.redirect('/ep/admin/auth');
  }

  var disp = new Dispatcher();
  disp.addLocations([
    [PrefixMatcher('/ep/admin/usagestats/'), forward(statscontrol)]
  ]);

  return disp.dispatch();
}

function _commonHead() {
  return HEAD(STYLE(
    "html {font-family:Verdana,Helvetica,sans-serif;}",
    "body {padding: 2em;}"
  ));
}

//----------------------------------------------------------------

function render_auth() {
  var cont = getSession().cont;
  if (getSession().message) {
    response.write(DIV(P(B(getSession().message))));
    delete getSession().message;
  }
  if (request.method == "GET") {
    response.write(FORM({method: "POST", action: request.path},
      P("Are you an admin?"),
      LABEL("Password:"),
      INPUT({type: "password", name: "password", value: ""}),
      INPUT({type: "submit", value: "submit"})
    ));
  }
  if (request.method == "POST") {
    var pass = request.params.password;
    if (pass === appjet.config['etherpad.adminPass']) {
      getSession().adminAuth = true;
      if (cont) {
        response.redirect(cont);
      } else {
        response.redirect("/ep/admin/main");
      }
    } else {
      getSession().message = "Bad Password.";
      response.redirect(request.path);
    }
  }
}

function render_main() {
  var div = DIV();

  div.push(A({href: "/"}, html("&laquo;"), " home"));
  div.push(H1("Admin"));

  _mainLinks.forEach(function(l) {
    div.push(DIV(A({href: l[0]}, l[1])));
  });
  if (sessions.isAnEtherpadAdmin()) {
    div.push(P(A({href: "/ep/admin/setadminmode?v=false"},
                 "Exit Admin Mode")));
  }
  else {
    div.push(P(A({href: "/ep/admin/setadminmode?v=true"},
                 "Enter Admin Mode")));
  }
  response.write(HTML(_commonHead(), BODY(div)));
}

//----------------------------------------------------------------

function render_config() {

  vars = [];
  eachProperty(appjet.config, function(k,v) {
    vars.push(k);
  });

  vars.sort();

  response.setContentType('text/plain; charset=utf-8');
  vars.forEach(function(v) {
    response.write("appjet.config."+v+" = "+appjet.config[v]+"\n");
  });
}

//----------------------------------------------------------------

function render_test() {
  response.setContentType("text/plain");
  response.write(Packages.net.appjet.common.util.ExpiringMapping + "\n");
  var m = new Packages.net.appjet.common.util.ExpiringMapping(10 * 1000);
  response.write(m.toString() + "\n");
  m.get("test");
  return;
  response.write(m.toString());
}

function render_dashboard() {
  var body = BODY();
  body.push(A({href: '/ep/admin/'}, html("&laquo; Admin")));
  body.push(H1({style: "border-bottom: 1px solid black;"}, "Dashboard"));

  /*
  body.push(H2({style: "color: #226; font-size: 1em;"}, "License"));
  var license = licensing.getLicense();
  body.push(P(TT("       Licensed To (name): "+license.personName)));
  body.push(P(TT("       Licensed To (organization): "+license.organizationName)));
  body.push(P(TT("       Software Edition: "+license.editionName)));
  var quota = ((license.userQuota > 0) ? license.userQuota : 'unlimited');
  body.push(P(TT("       User Quota: "+quota)));
  var expires = (license.expiresDate ? (license.expiresDate.toString()) : 'never');
  body.push(P(TT("       Expires: "+expires)));
  */

  /*
  body.push(H2({style: "color: #226; font-size: 1em;"}, "Active User Quota"));

  var activeUserCount = licensing.getActiveUserCount();
  var activeUserQuota = licensing.getActiveUserQuota();
  var activeUserWindowStart = licensing.getActiveUserWindowStart();

  body.push(P(TT("       Since ", B(activeUserWindowStart.toString()), ", ",
                 "you have used ", B(activeUserCount), " of ", B(activeUserQuota),
                 " active users.")));
*/
  body.push(H2({style: "color: #226; font-size: 1em;"}, "Uptime"));
  body.push(P({style: "margin-left: 25px;"}, "Server running for "+renderServerUptime()+"."))

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Response codes"));
  body.push(renderResponseCodes());

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Comet Connections"));
  body.push(renderPadConnections());

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Comet Stats"));
  body.push(renderCometStats());

  body.push(H2({style: "color: #226; font-size: 1em;"}, "Recurring revenue, monthly"));
  body.push(renderRevenueStats());

  response.write(HTML(_commonHead(), body));
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderPadConnections() {
  var d = DIV();
  var lastCount = cometlatencies.lastCount();

  if (lastCount.isDefined()) {
    var countMap = {};
    Array.prototype.map.call(lastCount.get().elements().collect().toArray().unbox(
      java.lang.Class.forName("java.lang.Object")),
      function(x) {
        countMap[x._1()] = x._2();
      });
    var totalConnected = 0;
    var ul = UL();
    eachProperty(countMap, function(k,v) {
      ul.push(LI(k+": "+v));
      if (/^\d+$/.test(v)) {
        totalConnected += Number(v);
      }
    });
    ul.push(LI(B("Total: ", totalConnected)));
    d.push(ul);
  } else {
    d.push("Still collecting data... check back in a minute.");
  }
  return d;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderCometStats() {
  var d = DIV();
  var lastStats = cometlatencies.lastStats();
  var lastCount = cometlatencies.lastCount();


  if (lastStats.isDefined()) {
    d.push(P("Realtime transport latency percentiles (microseconds):"));
    var ul = UL();
    lastStats.map(scalaF1(function(s) {
      ['50', '90', '95', '99', 'max'].forEach(function(id) {
        var fn = id;
        if (id != "max") {
          fn = ("p"+fn);
          id = id+"%";
        }
        ul.push(LI(id, ": <", s[fn](), html("&micro;"), "s"));
      });
    }));
    d.push(ul);
  } else {
    d.push(P("Still collecting data... check back in a minutes."));
  }

 /*    ["p50", "p90", "p95", "p99", "max"].forEach(function(id) {
        ul.push(LI(B(

      return DIV(P(sprintf("50%% %d\t90%% %d\t95%% %d\t99%% %d\tmax %d",
                     s.p50(), s.p90(), s.p95(), s.p99(), s.max())),
                 P(sprintf("%d total messages", s.count())));
    }})).get();*/


  return d;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderResponseCodes() {
  var statusCodeFrequencyNames = ["minute", "hour", "day", "week"];
  var data = { };
  var statusCodes = appstats.stati();
  for (var i = 0; i < statusCodes.length; ++i) {
    var name = statusCodeFrequencyNames[i];
    var map = statusCodes[i];
    map.foreach(scalaF1(function(pair) {
      if (! (pair._1() in data)) data[pair._1()] = {};
      var scmap = data[pair._1()];
      scmap[name] = pair._2().count();
    }));
  };
   var stats = TABLE({id: "responsecodes-table", style: "margin-left: 25px;",
                     border: 1, cellspacing: 0, cellpadding: 4},
                     TR.apply(TR, statusCodeFrequencyNames.map(function(name) {
    return TH({colspan: 2}, "Last", html("&nbsp;"), name);
  })));
  var sortedStati = [];
  eachProperty(data, function(k) {
    sortedStati.push(k);
  });
  sortedStati.sort();
  sortedStati.forEach(function(k, i) { // k is status code.
    var row = TR();
    statusCodeFrequencyNames.forEach(function(name) {
      row.push(TD({style: 'width: 2em;'}, data[k][name] ? k+":" : ""));
      row.push(TD(data[k][name] ? data[k][name] : ""));
    });
    stats.push(row);
  });
  return stats;
}

// Note: This function is called by the PNE dashboard (pro_admin_control.js)!  Be careful.
function renderServerUptime() {
  var labels = ["seconds", "minutes", "hours", "days"];
  var ratios = [60, 60, 24];
  var time = appjet.uptime / 1000;
  var pos = 0;
  while (pos < ratios.length && time / ratios[pos] > 1.1) {
    time = time / ratios[pos];
    pos++;
  }
  return sprintf("%.1f %s", time, labels[pos]);
}

function renderRevenueStats() {
  var subs = team_billing.getAllSubscriptions();
  var total = 0;
  var totalUsers = 0;
  subs.forEach(function(sub) {
    var users = team_billing.getMaxUsers(sub.customer);
    var cost = team_billing.calculateSubscriptionCost(users, sub.coupon);
    if (cost > 0) {
      totalUsers += users;
      total += cost;
    }
  });
  return "US $"+checkout.dollars(total)+", from "+subs.length+" domains and "+totalUsers+" users.";
}

//----------------------------------------------------------------
// Broadcasting Messages
//----------------------------------------------------------------

function render_broadcast_message_get() {
  var body = BODY(FORM({action: request.path, method: 'post'},
                       H3('Broadcast Message to All Active Pad Clients:'),
                       TEXTAREA({name: 'msgtext', style: 'width: 100%; height: 100px;'}),
                       H3('JavaScript code to be eval()ed on client (optional, be careful!): '),
                       TEXTAREA({name: 'jscode', style: 'width: 100%; height: 100px;'}),
                       INPUT({type: 'submit', value: 'Broadcast Now'})));
  response.write(HTML(body));
}

function render_broadcast_message_post() {
  var msgText = request.params.msgtext;
  var jsCode = request.params.jscode;
  if (!(msgText || jsCode)) {
    response.write("No mesage text or jscode specified.");
    response.stop();
    return;
  }
  collab_server.broadcastServerMessage({
    type: 'NOTICE',
    text: msgText,
    js: jsCode
  });
  response.write(HTML(BODY(P("OK"), P(A({href: request.path}, "back")))));
}

function render_shell() {
  shell.handleRequest();
}

//----------------------------------------------------------------
// pad inspector
//----------------------------------------------------------------

function _getPadUrl(globalPadId) {
  var superdomain = pro_utils.getRequestSuperdomain();
  var domain;
  if (padutils.isProPadId(globalPadId)) {
    var domainId = padutils.getDomainId(globalPadId);
    domain = domains.getDomainRecord(domainId).subDomain +
      '.' + superdomain;
  }
  else {
    domain = superdomain;
  }
  var localId = padutils.globalToLocalId(globalPadId);
  return "http://"+httpHost(domain)+"/"+localId;
}

function render_padinspector_get() {
  var padId = request.params.padId;
  if (!padId) {
    response.write(FORM({action: request.path, method: 'get', style: 'border: 1px solid #ccc; background-color: #eee; padding: .2em 1em;'},
                        P("Pad Lookup:  ",
                          INPUT({name: 'padId', value: '<enter pad id>'}),
                          INPUT({type: 'submit'}))));

    // show recently active pads;  the number of them may vary;  lots of
    // activity in a pad will push others off the list
    response.write(H3("Recently Active Pads:"));
    var recentlyActiveTable = TABLE({cellspacing: 0, cellpadding: 6, border: 1,
                                    style: 'font-family: monospace;'});
    var recentPads = activepads.getActivePads();
    recentPads.forEach(function (info) {
      var time = info.timestamp; // number
      var pid = info.padId;
      model.accessPadGlobal(pid, function(pad) {
        if (pad.exists()) {
          var numRevisions = pad.getHeadRevisionNumber();
          var connected = collab_server.getNumConnections(pad);
          recentlyActiveTable.push(
            TR(TD(B(pid)),
               TD({style: 'font-style: italic;'}, timeAgo(time)),
               TD(connected+" connected"),
               TD(numRevisions+" revisions"),
               TD(A({href: qpath({padId: pid, revtext: "HEAD"})}, "HEAD")),
               TD(A({href: qpath({padId: pid})}, "inspect")),
               TD(A({href: qpath({padId: pid, snoop: 1})}, "snoop"))
              ));
        }
      }, "r");
    });
    response.write(recentlyActiveTable);
    response.stop();
  }
  if (startsWith(padId, '/')) {
    padId = padId.substr(1);
  }
  if (request.params.snoop) {
    sessions.setIsAnEtherpadAdmin(true);
    response.redirect(_getPadUrl(padId));
  }
  if (request.params.setsupportstimeslider) {
    var v = (String(request.params.setsupportstimeslider).toLowerCase() ==
             'true');
    model.accessPadGlobal(padId, function(pad) {
      pad.setSupportsTimeSlider(v);
    });
    response.write("on pad "+padId+": setSupportsTimeSlider("+v+")");
    response.stop();
  }
  model.accessPadGlobal(padId, function(pad) {
    if (! pad.exists()) {
      response.write("Pad not found: /"+padId);
    }
    else {
      var headRev = pad.getHeadRevisionNumber();
      var div = DIV({style: 'font-family: monospace;'});

      if (request.params.revtext) {
        var i;
        if (request.params.revtext == "HEAD") {
          i = headRev;
        } else {
          i = Number(request.params.revtext);
        }
        var infoObj = {};
        div.push(H2(A({href: request.path}, "PadInspector"),
                    ' > ', A({href: request.path+'?padId='+padId}, "/"+padId),
                    ' > ', "Revision ", i, "/", headRev,
                    SPAN({style: 'color: #949;'}, ' [ ', pad.getRevisionDate(i).toString(), ' ] ')));
        div.push(H3("Browse Revisions: ",
                    ((i > 0) ? A({id: 'previous', href: qpath({revtext: (i-1)})}, '<< previous') : ''),
                    '   ',
                    ((i < pad.getHeadRevisionNumber()) ? A({id: 'next', href: qpath({revtext:(i+1)})}, 'next >>') : '')),
                 DIV({style: 'padding: 1em; border: 1px solid #ccc;'},
                     pad.getRevisionText(i, infoObj)));
        if (infoObj.badLastChar) {
          div.push(P("Bad last character of text (not newline): "+infoObj.badLastChar));
        }
      } else if (request.params.dumpstorage) {
        div.push(P(collab_server.dumpStorageToString(pad)));
      } else if (request.params.showlatest) {
        div.push(P(pad.text()));
      } else {
        div.push(H2(A({href: request.path}, "PadInspector"), ' > ', "/"+padId));
        // no action
        div.push(P(A({href: qpath({revtext: 'HEAD'})}, 'HEAD='+headRev)));
        div.push(P(A({href: qpath({dumpstorage: 1})}, 'dumpstorage')));
        var supportsTimeSlider = pad.getSupportsTimeSlider();
        if (supportsTimeSlider) {
          div.push(P(A({href: qpath({setsupportstimeslider: 'false'})}, 'hide slider')));
        }
        else {
          div.push(P(A({href: qpath({setsupportstimeslider: 'true'})}, 'show slider')));
        }
      }
    }

    var script = SCRIPT({type: 'text/javascript'}, html([
      '$(document).keydown(function(e) {',
      '  var h = undefined;',
      '  if (e.keyCode == 37) { h = $("#previous").attr("href"); }',
      '  if (e.keyCode == 39) { h = $("#next").attr("href"); }',
      '  if (h) { window.location.href = h; }',
      '});'
    ].join('\n')));

    response.write(HTML(
      HEAD(SCRIPT({type: 'text/javascript', src: '/static/js/jquery-1.3.2.js?'+(+(new Date))})),
      BODY(div, script)));
  }, "r");
}

function render_analytics() {
  response.redirect("https://www.google.com/analytics/reporting/?reset=1&id=12611622");
}

//----------------------------------------------------------------
// eepnet license display
//----------------------------------------------------------------

function render_eepnet_licenses() {
  var data = sqlobj.selectMulti('eepnet_signups', {}, {orderBy: 'date'});
  var t = TABLE({border: 1, cellspacing: 0, cellpadding: 2});
  var cols = ['date','email','orgName','firstName','lastName', 'jobTitle','phone','estUsers'];
  data.forEach(function(x) {
    var tr = TR();
    cols.forEach(function(colname) {
      tr.push(TD(x[colname]));
    });
    t.push(tr);
  });
  response.write(HTML(BODY({style: 'font-family: monospace;'}, t)));
}

//----------------------------------------------------------------
// pad integrity
//----------------------------------------------------------------

/*function render_changesettest_get() {
  var nums = [0, 1, 2, 3, 0xfffffff, 0x02345678, 4];
  var str = Changeset.numberArrayToString(nums);
  var result = Changeset.numberArrayFromString(str);
  var resultArray = result[0];
  var remainingString = result[1];
  var bad = false;
  if (remainingString) {
    response.write(P("remaining string length is: "+remainingString.length));
    bad = true;
  }
  if (nums.length != resultArray.length) {
    response.write(P("length mismatch: "+nums.length+" / "+resultArray.length));
    bad = true;
  }
  response.write(P(nums[2]));
  for(var i=0;i<nums.length;i++) {
    var a = nums[i];
    var b = resultArray[i];
    if (a !== b) {
      response.write(P("mismatch at element "+i+": "+a+" / "+b));
      bad = true;
    }
  }
  if (! bad) {
    response.write("SUCCESS");
  }
}*/

/////////

function render_appendtest() {
  var padId = request.params.padId;
  var mode = request.params.mode;
  var text = request.params.text;

  model.accessPadGlobal(padId, function(pad) {
    if (mode == "append") {
      collab_server.appendPadText(pad, text);
    }
    else if (mode == "replace") {
      collab_server.setPadText(pad, text);
    }
  });
}

//function render_flushall() {
//  dbwriter.writeAllToDB(null, true);
//  response.write("OK");
//}

//function render_flushpad() {
//  var padId = request.params.padId;
//  model.accessPadGlobal(padId, function(pad) {
//    dbwriter.writePad(pad, true);
//  });
//  response.write("OK");
//}

/*function render_foo() {
  locking.doWithPadLock("CAT", function() {
    sqlbase.createJSONTable("STUFF");
    sqlbase.putJSON("STUFF", "dogs", {very:"bad"});
    response.write(sqlbase.getJSON("STUFF", "dogs")); // {very:"bad"}
    response.write(',');
    response.write(sqlbase.getJSON("STUFF", "cats")); // undefined
    response.write("<br/>");

    sqlbase.createStringArrayTable("SEQUENCES");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 0, "1");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 1, "1");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 2, "2");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 3, "3");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 4, "5");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 30, "number30");
    sqlbase.putStringArrayElement("SEQUENCES", "fibo", 29, "number29");
    sqlbase.deleteStringArrayElement("SEQUENCES", "fibo", 29);
    sqlbase.putConsecutiveStringArrayElements("SEQUENCES", "fibo", 19, [19,20,21,22]);
    var a = [];
    for(var i=0;i<31;i++) {
      a.push(sqlbase.getStringArrayElement("SEQUENCES", "fibo", i));
    }
    response.write(a.join(',')); // 1,1,2,3,5,,, ... 19,20,21,22, ... ,,,number30
  });
}*/

function render_timings() {
  var timer = Packages.net.appjet.ajstdlib.timer;
  var opnames = timer.getOpNames();

  response.write(P(A({href: '/ep/admin/timingsreset'}, "reset all")));

  var t = TABLE({border: 1, cellspacing: 0, cellpadding: 3, style: 'font-family: monospace;'});
  t.push(TR(TH("operation"),
            TH("sample_count"),
            TH("total_ms"),
            TH("avg_ms")));

  function r(x) {
    return sprintf("%09.2f", x);
  }
  var rows = [];
  for (var i = 0; i < opnames.length; i++) {
    var stats = timer.getStats(opnames[i]);
    rows.push([String(opnames[i]),
               Math.floor(stats[0]),
               stats[1],
               stats[2]]);
  }

  var si = Number(request.params.sb || 0);

  rows.sort(function(a,b) { return cmp(b[si],a[si]); });

  rows.forEach(function(row) {
    t.push(TR(TD(row[0]),
              TD(row[1]),
              TD(r(row[2])),
              TD(r(row[3]))));
  });

  response.write(t);
}

function render_timingsreset() {
  Packages.net.appjet.ajstdlib.timer.reset();
  response.redirect('/ep/admin/timings');
}

// function render_jsontest() {
//   response.setContentType('text/plain; charset=utf-8');

//   var a = [];
//   a[0] = 5;
//   a[1] = 6;
//   a[9] = 8;
//   a['foo'] = "should appear";

//   jtest(a);

//   var obj1 = {
//     a: 1,
//     b: 2,
//     q: [true,true,,,,,,false,false,,,,{},{a:{a:{a:{a:{a:{a:[[{a:{a:false}}]]}}}}}}],
//     c: "foo",
//     d: {
//       nested: { obj: 'yo' },
//       bar: "baz"
//     },
//     e: 3.6,
//     1: "numeric value",
//     2: "anohter numeric value",
//     2.46: "decimal numeric value",
//     foo: 3.212312310,
//     bar: 0.234242e-10,
//     baz: null,
//     ar: [{}, '1', [], [[[[]]]]],
//     n1: null,
//     n2: undefined,
//     n3: false,
//     n4: "null",
//     n5: "undefined"
//   };

//   jtest(obj1);

//   var obj2 = {
//     t1: 1232738532270
//   };

//   jtest(obj2);

//   // a javascript object plus numeric ids
//   var obj3 = {};
//   obj3["foo"] = "bar";
//   obj3[1] = "aaron";
//   obj3[2] = "iba";

//   jtest(obj3);

//   function jtest(x) {
//     response.write('----------------------------------------------------------------\n\n');

//     var str1 = JSON.stringify(x);
//     var str2 = fastJSON.stringify(x);

//     var str1_ = JSON.stringify(JSON.parse(str1));
//     var str2_ = fastJSON.stringify(fastJSON.parse(str2));

//     response.write([str1,str2].join('\n') + '\n\n');
//     response.write([str1_,str2_].join('\n') + '\n\n');
//   }
// }

function render_varz() {
  var varzes = varz.getSnapshot();
  response.setContentType('text/plain; charset=utf-8');
  for (var k in varzes) {
    response.write(k+': '+varzes[k]+'\n');
  }
}

function render_extest() {
  throw new Error("foo");
}


function _diagnosticRecordToHtml(obj) {
  function valToHtml(o, noborder) {
    if (typeof (o) != 'object') {
      return String(o);
    }
    var t = TABLE((noborder ? {} : {style: "border-left: 1px solid black; border-top: 1px solid black;"}));
    if (typeof (o.length) != 'number') {
      eachProperty(o, function(k, v) {
        var tr = TR();
        tr.push(TD({valign: "top", align: "right"}, B(k)));
        tr.push(TD(valToHtml(v)));
        t.push(tr);
      });
    } else {
      if (o.length == 0) return "(empty array)";
      for (var i = 0; i < o.length; ++i) {
        var tr = TR();
        tr.push(TD({valign: "top", align: "right"}, B(i)));
        tr.push(TD(valToHtml(o[i])));
        t.push(tr);
      }
    }
    return t;
  }
  return valToHtml(obj, true);
}

function render_diagnostics() {
  var start = Number(request.params.start || 0);
  var count = Number(request.params.count || 100);
  var diagnostic_entries = sqlbase.getAllJSON("PAD_DIAGNOSTIC", start, count);
  var expandArray = request.params.expand || [];

  if (typeof (expandArray) == 'string') expandArray = [expandArray];
  var expand = {};
  for (var i = 0; i < expandArray.length; ++i) {
    expand[expandArray[i]] = true;
  }

  function makeLink(text, expand, collapse, start0, count0) {
    start0 = (typeof(start0) == "number" ? start0 : start);
    count0 = count0 || count;
    collapse = collapse || [];
    expand = expand || [];

    var collapseObj = {};
    for (var i = 0; i < collapse.length; ++i) {
      collapseObj[collapse[i]] = true;
    }
    var expandString =
      expandArray.concat(expand).filter(function(x) { return ! collapseObj[x] }).map(function(x) { return "expand="+encodeURIComponent(x) }).join("&");

    var url = request.path + "?start="+start0+"&count="+count0+"&"+expandString+(expand.length == 1 ? "#"+md5(expand[0]) : "");

    return A({href: url}, text);
  }

  var t = TABLE({border: 1, cellpadding: 2, style: "font-family: monospace;"});
  diagnostic_entries.forEach(function(ent) {
    var tr = TR()
    tr.push(TD({valign: "top", align: "right"}, (new Date(Number(ent.id.split("-")[0]))).toString()));
    tr.push(TD({valign: "top", align: "right"}, ent.id));
    if (expand[ent.id]) {
      tr.push(TD(A({name: md5(ent.id)}, makeLink("(collapse)", false, [ent.id])), BR(),
                 _diagnosticRecordToHtml(ent.value)));
    } else {
      tr.push(TD(A({name: md5(ent.id)}, makeLink(_diagnosticRecordToHtml({padId: ent.value.padId, disconnectedMessage: ent.value.disconnectedMessage}), [ent.id]))));
    }
    t.push(tr);
  });

  var body = BODY();
  body.push(P("Showing entries ", start, "-", start+diagnostic_entries.length, ". ",
              (start > 0 ? makeLink("Show previous "+count+".", [], [], start-count) : ""),
              (diagnostic_entries.length == count ? makeLink("Show next "+count+".", [], [], start+count) : "")));
  body.push(t);

  response.write(HTML(body));
}

//----------------------------------------------------------------
import("etherpad.billing.billing");

function render_testbillingdirect() {
  var invoiceId = billing.createInvoice();
  var ret = billing.directPurchase(invoiceId, 0, 'EEPNET', 500, 'DISCOUNT', {
    cardType: "Visa",
    cardNumber: "4501251685453214",
    cardExpiration: "042019",
    cardCvv: "123",
    nameSalutation: "Dr.",
    nameFirst: "John",
    nameMiddle: "D",
    nameLast: "Zamfirescu",
    nameSuffix: "none",
    addressStreet: "531 Main St. Apt. 1227",
    addressStreet2: "",
    addressCity: "New York",
    addressState: "NY",
    addressCountry: "US",
    addressZip: "10044"
  }, "https://"+request.host+"/ep/about/testbillingnotify");
  if (ret.status == 'success') {
    response.write(P("Success! Invoice id: "+ret.purchaseInfo.invoiceId+" for "+ret.purchaseInfo.cost));
  } else {
    response.write(P("Failure: "+ret.toSource()))
  }
}

function render_testbillingrecurring() {
  var invoiceId = billing.createInvoice();
  var ret = billing.directPurchase(invoiceId, 0, 'EEPNET', 1, 'DISCOUNT', {
    cardType: "Visa",
    cardNumber: "4501251685453214",
    cardExpiration: "042019",
    cardCvv: "123",
    nameSalutation: "Dr.",
    nameFirst: "John",
    nameMiddle: "D",
    nameLast: "Zamfirescu",
    nameSuffix: "none",
    addressStreet: "531 Main St. Apt. 1227",
    addressStreet2: "",
    addressCity: "New York",
    addressState: "NY",
    addressCountry: "US",
    addressZip: "10044"
  }, "https://"+request.host+"/ep/about/testbillingnotify", true);
  if (ret.status == 'success') {
    var transactionId = billing.getTransaction(ret.purchaseInfo.transactionId).txnId;
    var purchaseId = ret.purchaseInfo.purchaseId;
    response.write(P("Direct billing successful. PayPal transaction id: ", transactionId));

    invoiceId = billing.createInvoice();
    ret = billing.asyncRecurringPurchase(
      invoiceId, purchaseId, transactionId, 500,
      "https://"+request.host+"/ep/about/testbillingnotify");
    if (ret.status == 'success') {
      response.write(P("Woot! Recurrent billing successful! ", ret.purchaseInfo.invoiceId, " for ", ret.purchaseInfo.cost));
    } else {
      response.write(P("Failure: "+ret.toSource()));
    }
  } else {
    response.write("Direct billing failure: "+ret.toSource());
  }
}

function render_testbillingexpress() {
  var urlPrefix = "http://"+request.host+request.path;
  var session = sessions.getSession();
  var notifyUrl = "http://"+request.host+"/ep/about/testbillingnotify";

  switch (request.params.step) {
    case '0':
      response.write(P("You'll be charged $400 for EEPNET. Click the link below to go to paypal."));
      response.write(A({href: urlPrefix+"?step=1"}, "Link"));
      break;
    case '1':
      var ret = billing.beginExpressPurchase(1, 'EEPNET', 400, 'DISCOUNT', urlPrefix+"?step=2", urlPrefix+"?step=0", notifyUrl);
      if (ret.status != 'success') {
        response.write("Error: "+ret.debug.toSource());
        response.stop();
      }
      session.purchaseInfo = ret.purchaseInfo;
      response.redirect(paypalPurchaseUrl(ret.purchaseInfo.token));
      break;
    case '2':
      var ret = billing.continueExpressPurchase(session.purchaseInfo);
      if (! ret.status == 'success') {
        response.write("Error: "+ret.debug.toSource());
        response.stop();
      }
      session.payerInfo = ret.payerInfo;

      response.write(P("You approved the transaction. Click 'confirm' to confirm."));
      response.write(A({href: urlPrefix+"?step=3"}, "Confirm"));
      break;
    case '3':
      var ret = billing.completeExpressPurchase(session.purchaseInfo, session.payerInfo, notifyUrl);
      if (ret.status == 'failure') {
        response.write("Error: "+ret.debug.toSource());
        response.stop();
      }
      if (ret.status == 'pending') {
        response.write("Your charge is pending. You will be notified by email when your payment clears. Your invoice number is "+session.purchaseInfo.invoiceId);
        response.stop();
      }

      response.write(P("Purchase completed: invoice # is "+session.purchaseInfo.invoiceId+" for "+session.purchaseInfo.cost));
      break;
    default:
      response.redirect(request.path+"?step=0");
  }
}

//----------------------------------------------------------------

function render_genlicense_get() {

  var t = TABLE({border: 1});
  function ti(id, label) {
    t.push(TR(TD({align: "right"}, LABEL({htmlFor: id}, label+":")),
              TD(INPUT({id: id, name: id, type: 'text', size: 40}))));
  }

  ti("name", "Name of Licensee");
  ti("org", "Name of Organization");
  ti("userQuota", "User Quota");

  t.push(TR(TD({align: "right"}, LABEL("Software Edtition:")),
            TD( SELECT({name: "edition"},
                       OPTION({value: licensing.getEditionId('PRIVATE_NETWORK_EVALUATION')},
                              "Private Network EVALUATION"),
                       OPTION({value: licensing.getEditionId('PRIVATE_NETWORK')},
                              "Private Network")))));

  ti("expdays", "Number of days until expiration\n(leave blank if never expires)");

  t.push(TR(TD({colspan: 2}, INPUT({type: "submit"}))));

  var f = FORM({action: request.path, method: "post"});
  f.push(t);

  response.write(HTML(BODY(f)));
}

function render_genlicense_post() {
  var name = request.params.name;
  var org = request.params.org;
  var editionId = +request.params.edition;
  var editionName = licensing.getEditionName(editionId);
  var userQuota = +request.params.userQuota;

  var expiresTime = null;
  if (request.params.expdays) {
    expiresTime = +(new Date) + 1000*60*60*24*(+request.params.expdays);
  }

  var licenseKey = licensing.generateNewKey(
    name,
    org,
    expiresTime,
    editionId,
    userQuota
  );

  // verify
  if (!licensing.isValidKey(licenseKey)) {
    throw Error("License key I just created is not valid: "+licenseKey);
  }

  // TODO: write to database??
  //

  // display
  var licenseInfo = licensing.decodeLicenseInfoFromKey(licenseKey);
  var t = TABLE({border: 1});
  function line(k, v) {
    t.push(TR(TD({align: "right"}, k+":"),
              TD(v)));
  }

  var key = licenseKey.split(":")[2];
  if ((key.length % 2) != 0) {
    key = key + "+";
  }
  var keyLine1 = key.substr(0, key.length/2);
  var keyLine2 = key.substr(key.length/2, key.length);

  line("Name", licenseInfo.personName);
  line("Organization", licenseInfo.organizationName);
  line("Key", P(keyLine1, BR(), keyLine2));
  line("Software Edition", licenseInfo.editionName);
  line("User Quota", licenseInfo.userQuota);
  line("Expires", (+licenseInfo.expiresDate > 0) ? licenseInfo.expiresDate.toString() : "(never)");

  response.write(HTML(BODY(t)));
}

//----------------------------------------------------------------

import("etherpad.metrics.metrics");

function render_flows() {
  if (request.params.imgId && getSession()[request.params.imgId]) {
    var arr = getSession()[request.params.imgId];
    metrics[arr[0]](arr[1], Array.prototype.slice.call(arr[2]));
    response.stop();
  }

  function drawHistogram(name, h) {
    var imgKey = Math.round(Math.random()*1e12);
    print(IMG({src: request.path+"?imgId="+imgKey}));
    getSession()[imgKey] = ["respondWithPieChart", name, h];
  }

  var body = BODY();
  function print() {
    for (var i = 0; i < arguments.length; ++i) {
      body.push(arguments[i]);
    }
  }

  var [startDate, endDate] = [7, 1].map(function(a) { return new Date(Date.now() - 86400*1000*a); });

  var allFlows = metrics.getFlows(startDate, endDate);

/*
  print(P("All flows:"));

  eachProperty(allFlows, function(k, flows) {
    print(P(k, html(" &raquo; ")));
    flows.forEach(function(flow) {
      print(P(flow.toString()));
    });
  });
  response.write(HTML(body));
  return;
*/

  print(P("Parsing logs from: "+startDate+" through "+endDate));

  var fs =
    [metrics.getFunnel(startDate, endDate, ['/ep/about/pricing', '/ep/about/pricing-eepnet', '/ep/store/eepnet-eval-signup'], true),
     metrics.getFunnel(startDate, endDate, ['/ep/about/pricing', '/ep/about/pricing-free'], true),
     metrics.getFunnel(startDate, endDate, ['/ep/about/pricing', '/ep/about/pricing-eepod'], true),
     metrics.getFunnel(startDate, endDate, ['/ep/about/pricing', '/ep/store/eepnet-eval-signup'], true),
     metrics.getFunnel(startDate, endDate, ['/', '(pad)']),
     metrics.getFunnel(startDate, endDate, ['/', '/ep/pad/newpad'], true),
     metrics.getFunnel(startDate, endDate, ['/ep/about/screencast', '(pad)'])];

  function vcnt(i, i2) {
    return fs[i].visitorCounts[i2];
  }
  function pct(f) {
    return ""+Math.round(f*10000)/100+"%"
  }
  function cntAndPct(i, i2) {
    if (i2 === undefined) { i2 = 1; }
    return ""+vcnt(i, i2)+" ("+pct(vcnt(i, i2)/vcnt(i, i2-1))+")";
  }
  print(P("Of ", vcnt(0, 0), " visitors to the pricing page, ",
          cntAndPct(0), " of them viewed eepnet, (", cntAndPct(0, 2), " of those downloaded), ",
          cntAndPct(1), " of them viewed free, and ",
          cntAndPct(2), " of them viewed eepod. ",
          cntAndPct(3), " of them clicked on the eval signup link straight up."
         ),
        P("Of ", vcnt(4, 0), " visitors to the home page, ",
          cntAndPct(4), " of them went to a pad page in the same flow; ",
          cntAndPct(5), " of them clicked the new pad button immediately."),
        P("Of ", vcnt(6, 0), " vistitors to the screencast page, ",
          cntAndPct(6), " of them visisted a pad page in the same flow."));

  var origins = metrics.getOrigins(startDate, endDate, true);
  print(P("Flow first origins: "));
  drawHistogram("first origins", origins.flowFirsts);

  var firstHits = metrics.getOrigins(startDate, endDate, false, true);
  var padFirstHits = 0;
  var nonPadFirstHits = 0;
  print(P("First paths hit: "));
  drawHistogram("first paths", firstHits.flowFirsts);
  firstHits.flowFirsts.filter(function(x) {
    if (x.value != '/' && ! startsWith(x.value, "/ep/")) {
      padFirstHits += x.count;
      return false;
    }
    nonPadFirstHits += x.count;
    return true;
  });
  print(P("Some pad page: "+padFirstHits),
        P("Non-pad page: "+nonPadFirstHits));

  var exitsFromHomepage = metrics.getExits(startDate, endDate, '/', true);
  print(P("Exits from homepage: "));
  drawHistogram("exits", exitsFromHomepage.histogram)

  response.write(HTML(body));
}

//----------------------------------------------------------------

import("etherpad.pad.pad_migrations");

function render_padmigrations() {
  var residue = (request.params.r || 0);
  var modulus = (request.params.m || 1);
  var name = (request.params.n || (residue+"%"+modulus));
  pad_migrations.runBackgroundMigration(residue, modulus, name);
  response.write("done");
  return true;
}

// TODO: add ability to delete entries?
// TODO: show sizes?
function render_cachebrowser() {
  var path = request.params.path;
  if (path && path.charAt(0) == ',') {
    path = path.substr(1);
  }
  var pathArg = (path || "");
  var c = appjet.cache;
  if (path) {
    path.split(",").forEach(function(part) {
      c = c[part];
    });
  }

  var d = DIV({style: 'font-family: monospace; text-decoration: none;'});

  d.push(H3("appjet.cache    -->    "+pathArg.split(",").join("    -->    ")));

  var t = TABLE({border: 1});
  keys(c).sort().forEach(function(k) {
    var v = c[k];
    if (v && (typeof(v) == 'object') && (!v.getDate)) {
      t.push(TR(TD(A({style: 'text-decoration: none;',
                      href: request.path+"?path="+pathArg+","+k}, k))));
    } else {
      t.push(TR(TD(k), TD(v)));
    }
  });

  d.push(t);
  response.write(d);
}

function render_pne_tracker_get() {
  var data = sqlobj.selectMulti('pne_tracking_data', {}, {});
  data.sort(function(x, y) { return cmp(y.date, x.date); });

  var t = TABLE();

  var headrow = TR();
  ['date', 'remote host', 'keyHash', 'name', 'value'].forEach(function(x) {
    headrow.push(TH({align: "left", style: "padding: 0 6px;"}, x));
  });
  t.push(headrow);

  data.forEach(function(d) {
    var tr = TR();

    tr.push(TD(d.date.toString().split(' ').slice(0,5).join('-')));

    if (d.remoteIp) {
      tr.push(TD(netutils.getHostnameFromIp(d.remoteIp) || d.remoteIp));
    } else {
      tr.push(TD("-"));
    }

    if (d.keyHash) {
      tr.push(TD(A({href: '/ep/admin/pne-tracker-lookup-keyhash?hash='+d.keyHash}, d.keyHash)));
    } else {
      tr.push(TD("-"));
    }

    tr.push(TD(d.name));
    tr.push(TD(d.value));

    t.push(tr);
  });

  response.write(HTML(HEAD(html("<style>td { border-bottom: 1px solid #ddd; border-right: 1px solid #ddd; padding: 0 6px; } \n tr:hover { background: #ffc; }</style>"),
    BODY({style: "font-family: monospace; font-size: 12px;"}, t))));
}

function render_pne_tracker_lookup_keyhash_get() {
  var hash = request.params.hash;
  // brute force it
  var allLicenses = sqlobj.selectMulti('eepnet_signups', {}, {});
  var record = null;
  var i = 0;
  while (i < allLicenses.length && record == null) {
    var d = allLicenses[i];
    if (md5(d.licenseKey).substr(0, 16) == hash) {
      record = d;
    }
    i++;
  }
  if (!record) {
    response.write("Not found. Perhaps this was a test download from local development, or a paid customer whose licenses we don't currently look through on this page.");
  } else {
    var kl = keys(record).sort();
    var t = TABLE();
    kl.forEach(function(k) {
      t.push(TR(TH({align: "right"}, k+":"),
                TD({style: "padding-left: 1em;"}, record[k])));
    });
    response.write(HTML(BODY(DIV({style: "font-family: monospace;"},
      DIV(H1("Trial Signup Record:")), t))));
  }
}

function render_reload_blog_db_get() {
  var d = DIV();
  if (request.params.ok) {
    d.push(DIV(P("OK")));
  }
  d.push(FORM({method: "post", action: request.path},
    INPUT({type: "submit", value: "Reload Blog DB Now"})));
  response.write(HTML(BODY(d)));
}

function render_reload_blog_db_post() {
  blogcontrol.reloadBlogDb();
  response.redirect(request.path+"?ok=1");
}

function render_pro_domain_accounts() {
  var accounts = sqlobj.selectMulti('pro_accounts', {}, {});
  var domains = sqlobj.selectMulti('pro_domains', {}, {});

  // build domain map
  var domainMap = {};
  domains.forEach(function(d) { domainMap[d.id] = d; });
  accounts.sort(function(a,b) { return cmp(b.lastLoginDate, a.lastLoginDate); });

  var b = BODY({style: "font-family: monospace;"});
  b.push(accounts.length + " pro accounts.");
  var t = TABLE({border: 1});
  t.push(TR(TH("email"),
            TH("domain"),
            TH("lastLogin")));
  accounts.forEach(function(u) {
    t.push(TR(TD(u.email),
              TD(domainMap[u.domainId].subDomain+"."+request.domain),
              TD(u.lastLoginDate)));
  });

  b.push(t);

  response.write(HTML(b));
}


function render_beta_valve_get() {
  var d = DIV(
    P("Beta Valve Status: ",
      (pro_beta_control.isValveOpen() ?
        SPAN({style: "color: green;"}, B("OPEN")) :
        SPAN({style: "color: red;"}, B("CLOSED")))),
    P(FORM({action: '/ep/admin/beta-valve-toggle', method: "post"},
      BUTTON({type: "submit"}, "Toggle"))));

  var t = TABLE({border: 1, cellspacing: 0, cellpadding: 4, style: "font-family: monospace;"});
  var signupList = sqlobj.selectMulti('pro_beta_signups', {}, {});
  signupList.sort(function(a, b) {
    return cmp(b.signupDate, a.signupDate);
  });

  d.push(HR());

  if (getSession().betaAdminMessage) {
    d.push(DIV({style: "border: 1px solid #ccc; padding: 1em; background: #eee;"},
            getSession().betaAdminMessage));
    delete getSession().betaAdminMessage;
  }

  d.push(P(signupList.length + " beta signups"));

  d.push(FORM({action: '/ep/admin/beta-invite-multisend', method: 'post'},
      P("Send ", INPUT({type: 'text', name: 'count', size: 3}), " invites."),
      INPUT({type: "submit"})));

  t.push(TR(TH("id"), TH("email"), TH("signupDate"),
            TH("activationDate"), TH("activationCode"), TH(' ')));

  signupList.forEach(function(s) {
    var tr = TR();
    tr.push(TD(s.id),
            TD(s.email),
            TD(s.signupDate),
            TD(s.isActivated ? s.activationDate : "-"),
            TD(s.activationCode));
    if (!s.activationCode) {
      tr.push(TD(FORM({action: '/ep/admin/beta-invite-send', method: 'post'},
                INPUT({type: 'hidden', name: 'id', value: s.id}),
                INPUT({type: 'submit', value: "Send Invite"}))));
    } else {
      tr.push(TD(' '));
    }
    t.push(tr);
  });
  d.push(t);
  response.write(d);
}

function render_beta_valve_toggle_post() {
  pro_beta_control.toggleValve();
  response.redirect('/ep/admin/beta-valve');
}

function render_beta_invite_send_post() {
  var id = request.params.id;
  pro_beta_control.sendInvite(id);
  response.redirect('/ep/admin/beta-valve');
}

function render_beta_invite_multisend_post() {
  var count = request.params.count;
  var signupList = sqlobj.selectMulti('pro_beta_signups', {}, {});
  signupList.sort(function(a, b) {
    return cmp(a.signupDate, b.signupDate);
  });
  var sent = 0;
  for (var i = 0; ((i < signupList.length) && (sent < count)); i++) {
    var record = signupList[i];
    if (!record.activationCode) {
      pro_beta_control.sendInvite(record.id);
      sent++;
    }
  }
  getSession().betaAdminMessage = (sent+" invites sent.");
  response.redirect('/ep/admin/beta-valve');
}

function render_usagestats() {
  response.redirect("/ep/admin/usagestats/");
}

function render_exceptions() {
  exceptions.render();
}

function render_setadminmode() {
  sessions.setIsAnEtherpadAdmin(
    String(request.params.v).toLowerCase() == "true");
  response.redirect("/ep/admin/");
}

// --------------------------------------------------------------
// billing-related
// --------------------------------------------------------------

// some of these functions are only used from selenium tests, and so have no UI.

function render_setdomainpaidthrough() {
  var domainName = request.params.domain;
  var when = new Date(Number(request.params.paidthrough));
  if (! domainName || ! when) {
    response.write("fail");
    response.stop();
  }
  var domain = domains.getDomainRecordFromSubdomain(domainName);
  var domainId = domain.id;

  var subscription = team_billing.getSubscriptionForCustomer(domainId);
  if (subscription) {
    billing.updatePurchase(subscription.id, {paidThrough: when});
    team_billing.domainCacheClear(domainId);
    response.write("OK");
  } else {
    response.write("fail");
  }
}

function render_runsubscriptions() {
  team_billing.processAllSubscriptions();
  response.write("OK");
}

function render_reset_subscription() {
  var body = BODY();
  if (request.isGet) {
    body.push(FORM({method: "POST"},
                   "Subdomain: ", INPUT({type: "text", name: "subdomain"}), BUTTON({name: "clear"}, "Go")));
  } else if (request.isPost) {
    if (! request.params.confirm) {
      var domain = domains.getDomainRecordFromSubdomain(request.params.subdomain);
      var admins = pro_accounts.listAllDomainAdmins(domain.id);
      body.push(P("Domain ", domain.subDomain, ".", request.domain, "; admins:"));
      var p = UL();
      admins.forEach(function(admin) {
        p.push(LI(admin.fullName, " <", admin.email, ">"));
      });
      body.push(p);
      var subscription = team_billing.getSubscriptionForCustomer(domain.id);
      if (subscription) {
        body.push(P("Subscription is currently ", subscription.status, ", and paid through: ", checkout.formatDate(subscription.paidThrough), "."))
        body.push(FORM({method: "POST"},
                       INPUT({type: "hidden", name: "subdomain", value: request.params.subdomain}),
                       "Are you sure? ", BUTTON({name: "confirm", value: "yes"}, "YES")));
      } else {
        body.push(P("No current subscription"));
      }
    } else {
      var domain = domains.getDomainRecordFromSubdomain(request.params.subdomain);
      sqlcommon.inTransaction(function() {
        team_billing.resetMaxUsers(domain.id);
        sqlobj.deleteRows('billing_purchase', {customer: domain.id, type: 'subscription'});
        team_billing.domainCacheClear(domain.id);
        team_billing.clearRecurringBillingInfo(domain.id);
      });
      body.push("Done!")
    }
  }
  body.push(A({href: request.path}, html("&laquo; back")));
  response.write(HTML(body));
}