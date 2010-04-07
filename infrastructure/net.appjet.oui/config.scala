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

package net.appjet.oui;

import scala.collection.mutable.HashMap;
import java.util.regex.Pattern;
import java.net.URL;
import org.mortbay.jetty.servlet.Context;
import org.mozilla.javascript.{Scriptable, ScriptableObject, Context => JSContext};

import net.appjet.common.util.BetterFile;


object config {
  val values = new HashMap[String, String];
  def stringOrElse(name: String, default: String): String = {
    val v = values.getOrElse(name, default);
    if (v != null) {
      val m = propertiesPattern.matcher(v);
      val sb = new StringBuffer();
      while (m.find()) {
	m.appendReplacement(sb, getClass.getDeclaredMethod(m.group(1), Array[Class[_]](): _*).invoke(this, Array[Class[_]](): _*).asInstanceOf[String]);
      }
      m.appendTail(sb);
      sb.toString();
    } else {
      null;
    }
  }
  def boolOrElse(name: String, default: Boolean) = values.get(name).map(_.equals("true")).getOrElse(default);
  def intOrElse(name: String, default: Int) = values.get(name).map(Integer.parseInt(_)).getOrElse(default);
  def longOrElse(name: String, default: Long) = values.get(name).map(java.lang.Long.parseLong(_)).getOrElse(default);

  @ConfigParam("Read configuration options from this file before processing any command-line flags.")
              { val argName = "file" }
  def configFile = stringOrElse("configFile", null);

  // configuation parameters
  var specialDebug = false;

  @ConfigParam("Enable additional logging output.")
  def verbose = boolOrElse("verbose", false);

  @ConfigParam("Activate \"developer\" mode.")
  def devMode = boolOrElse("devMode", false);

  @ConfigParam("Activate \"profiling\" mode.")
  def profile = boolOrElse("profile", false);

  @ConfigParam("Directory to use for storing appjet support files, logs, etc.  This directory will be created if it does not exist and must be writeable by the user who runs appjet.jar.  Defaults to current working directory.")
	      { val argName = "directory" }
  def appjetHome = stringOrElse("appjetHome", "appjet");
  
  @ConfigParam("Directory to use for storing built-in database (Apache Derby) files. Will be created if it doesn't exist. Defaults to [appjetHome]/db")
  def derbyHome = stringOrElse("derbyHome", "[appjetHome]/derbydb");

  @ConfigParam("Directory to use for storing appserver logs. Defaults to [appjetHome]/log/appserver")
              { val argName = "directory" }
  def logDir = stringOrElse("logDir", "[appjetHome]/log/appserver");
  
  @ConfigParam("Optional alternative directory to load built-in libraries from.  Used by AppJet platform hackers to develop and debug built-in libraries.  Default: use built-in libraries.")
	      { val argName = "directory" }
  def ajstdlibHome = stringOrElse("ajstdlibHome", null);

  @ConfigParam("Optional directory to specify as the \"app home\".")
              { val argName = "directory" }
  def appHome = stringOrElse("appHome", "");
  

  @ConfigParam("Search path for modules imported via \"import\". Defaults to current working directory.")
              { val argName = "dir1:dir2:..." }
  def modulePath = stringOrElse("modulePath", null);
  def moduleRoots =
    Array.concat(Array("."), if (modulePath != null) modulePath.split(":") else Array[String](), Array(ajstdlibHome));

  @ConfigParam("Where to read the static files from on the local filesystem. Don't specify this to read static files from the classpath/JAR.")
              { val argName = "directory" }
  def useVirtualFileRoot = stringOrElse("useVirtualFileRoot", null);
  
  @ConfigParam("Directory to use for storing the temporary sessions file on shutdown. Will be created if it does not exist.")
              { val argName = "directory" }
  def sessionStoreDir = stringOrElse("sessionStoreDir", "[appjetHome]/sessions");

  // performance tuning
  @ConfigParam("Create this many runners before opening up the server.")
              { val argName = "count" }
  def preloadRunners = intOrElse("preloadRunners", 0);

  @ConfigParam("Have this many JDBC connections available in the pool.")
              { val argName = "count" }
  def jdbcPoolSize = intOrElse("jdbcPoolSize", 10);
  @ConfigParam("Max count of worker threads.")
              { val argName = "num" }
  def maxThreads = intOrElse("maxThreads", 250);

  // specifying ports and such
  def extractHostAndPort(s: String): (String, Int) =
    if (s.indexOf(":") >= 0)
      (s.split(":")(0), Integer.parseInt(s.split(":")(1)))
    else
      ("", Integer.parseInt(s))

  @ConfigParam("[host:]port on which to serve the app. Default: 8080.")
              { val argName = "[host:]port" }
  def listen = stringOrElse("listen", "8080");
  @GeneratedConfigParam
  def listenHost = extractHostAndPort(listen)._1;
  @GeneratedConfigParam
  def listenPort = extractHostAndPort(listen)._2;

  @ConfigParam("[host:]port on which to serve the app using SSL. Default: none.")
              { val argName = "[host:]port" }
  def listenSecure = stringOrElse("listenSecure", "0");
  @GeneratedConfigParam
  def listenSecureHost = extractHostAndPort(listenSecure)._1;
  @GeneratedConfigParam
  def listenSecurePort = extractHostAndPort(listenSecure)._2;

  @ConfigParam("[host:]port:port on which to listen for monitoring. Default: none.")
              { val argName = "[host:]primaryPort:secondaryPort" }
  def listenMonitoring = stringOrElse("listenMonitoring", "0:0");
  def extractHostAndPortPort(s: String): (String, Int, Int) = {
    val spl = s.split(":", 3);
    if (spl.length > 2)
      (spl(0), Integer.parseInt(spl(1)), Integer.parseInt(spl(2)))
    else
      ("", Integer.parseInt(spl(0)), Integer.parseInt(spl(1)));
  }
  @GeneratedConfigParam
  def listenMonitoringHost = extractHostAndPortPort(listenMonitoring)._1;
  @GeneratedConfigParam
  def listenMonitoringPrimaryPort = extractHostAndPortPort(listenMonitoring)._2;
  @GeneratedConfigParam
  def listenMonitoringSecondaryPort = extractHostAndPortPort(listenMonitoring)._3;

  @ConfigParam("[host:]port on which to listen for RPCs (via SARS). Default: none.")
              { val argName = "[host:]port" }
  def listenSars = stringOrElse("listenSars", "0");
  @GeneratedConfigParam
  def listenSarsHost = extractHostAndPort(listenSars)._1;
  @GeneratedConfigParam
  def listenSarsPort = extractHostAndPort(listenSars)._2;

  // Licensing
  @ConfigParam("Private key for generating license keys.")
              { val argName = "pathToKey" }
  def licenseGeneratorKey = stringOrElse("licenseGeneratorKey", null);

  // SARS
  @ConfigParam("SARS auth key. Default: \"appjet\".")
	      { val argName = "authkey" }
  def sarsAuthKey = stringOrElse("sarsAuthKey", "appjet");

  // SSL
  @ConfigParam("[SSL] Keystore location. Default: appjetHome/sslkeystore.")
              { val argName = "keystore" }
  def sslKeyStore = stringOrElse("sslKeyStore", appjetHome+"/sslkeystore");
  def sslKeyStore_isSet = values.contains("sslKeyStore");
  @ConfigParam("[SSL] Key password. Default: same as store password.")
              { val argName = "password" }
  def sslKeyPassword = stringOrElse("sslKeyPassword", "[sslStorePassword]");
  @ConfigParam("[SSL] Store password. Default: 'appjet'.")
              { val argName = "password" }
  def sslStorePassword = stringOrElse("sslStorePassword", "appjet");

  // email
  @ConfigParam("host:port of mail server to use for sending email. Default: localhost:25.")
	      { val argName = "host:port" }
  def smtpServer = stringOrElse("smtpServer", "localhost:25");
  def smtpServerHost = extractHostAndPort(smtpServer)._1;
  def smtpServerPort = extractHostAndPort(smtpServer)._2;
  @ConfigParam("username for authentication to mail server. Default: no authentication.")
              { val argName = "username" }
  def smtpUser = stringOrElse("smtpUser", "");
  @ConfigParam("password for authentication to mail server. Default: no authentication.")
              { val argName = "password" } 
  def smtpPass = stringOrElse("smtpPass", "");

  // comet
  @ConfigParam("prefix for all comet requests. Required to use Comet system.")
	      { val argName = "path" }
  def transportPrefix = stringOrElse("transportPrefix", null);
  @ConfigParam("Use a subdomain for all comet requests.")
  def transportUseWildcardSubdomains = boolOrElse("transportUseWildcardSubdomains", false);
  @ConfigParam("Don't use short polling, ever.")
  def disableShortPolling = boolOrElse("disableShortPolling", false);

  // helpers
  val allProperties = 
    for (m <- getClass.getDeclaredMethods() if (m.getAnnotation(classOf[ConfigParam]) != null || m.getAnnotation(classOf[GeneratedConfigParam]) != null)) 
      yield m;
  val configParamNames =
    for (m <- allProperties if m.getAnnotation(classOf[ConfigParam]) != null) yield m.getName
  lazy val allPropertiesMap = 
    Map((for (m <- allProperties) yield ((m.getName, () => m.invoke(this)))): _*);
  val propertiesPattern = Pattern.compile("\\[("+allProperties.map(x => "(?:"+x.getName()+")").mkString("|")+")\\]");
  
  override def toString() = 
    (allProperties.map(m => m.getName()+" -> "+m.invoke(this)) ++ 
     values.keys.toList.filter(! allPropertiesMap.contains(_)).map(k => k+" -> "+values(k))).mkString("[Config ", ", ", "]");
  def print {
    for (m <- allProperties) {
      println(m.getName() + " -> " + m.invoke(this));
    }
    for ((k, v) <- values if (! allPropertiesMap.contains(k))) {
      println(k + " -> " + v);
    }
  }
  def configObject(globalScope: Scriptable) =
    new ScriptableAdapter {
      val keys = (Set.empty[Object] ++ allProperties.map(m => m.getName) ++ values.keySet).toList.toArray;
      override def get(n: String, start: Scriptable) =
	allPropertiesMap.getOrElse(n, () => values.getOrElse(n, JSContext.getUndefinedValue()))();
      override def put(n: String, start: Scriptable, value: Object) =
	values(n) = value.toString();
      override def getIds() = keys;
      override def getPrototype() = ScriptableObject.getObjectPrototype(globalScope);
      override def has(n: String, start: Scriptable) =
	allPropertiesMap.contains(n) || values.contains(n);
      override def getDefaultValue(hint: Class[_]) = config.toString();
    }
}

object global {
  var context: Context = null;
}
