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

package net.appjet.bodylock;

import java.io.{StringWriter, StringReader}
import net.appjet.common.util.BetterFile;

object compressor {
  def compress(code: String): String = {
    import yuicompressor.org.mozilla.javascript.{ErrorReporter, EvaluatorException};
    object MyErrorReporter extends ErrorReporter {
      def warning(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
	if (message startsWith "Try to use a single 'var' statement per scope.") return;
	if (line < 0) System.err.println("\n[WARNING] " + message);
	else System.err.println("\n[WARNING] " + line + ':' + lineOffset + ':' + message);
      }
      def error(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
	if (line < 0) System.err.println("\n[ERROR] " + message);
	else System.err.println("\n[ERROR] " + line + ':' + lineOffset + ':' + message);
	java.lang.System.exit(1);
      }
      def runtimeError(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int): EvaluatorException = {
	error(message, sourceName, line, lineSource, lineOffset);
	return new EvaluatorException(message);
      }
    }

    val munge = true;
    val verbose = false;
    val optimize = true;
    val wrap = true;
    val compressor = new com.yahoo.platform.yui.compressor.JavaScriptCompressor(new StringReader(code), MyErrorReporter);
    val writer = new StringWriter;
    compressor.compress(writer, if (wrap) 100 else -1, munge, verbose, true, optimize);
    writer.toString;
  }

  def main(args: Array[String]) {
    for (fname <- args) {
      try {
	val src = BetterFile.getFileContents(fname);
	val obfSrc = compress(src);
	val fw = (new java.io.FileWriter(new java.io.File(fname)));
	fw.write(obfSrc, 0, obfSrc.length);
	fw.close();
      } catch {
	case e => {
	  println("Failed to compress: "+fname+". Quitting.");
	  e.printStackTrace();
	  System.exit(1);
	}
      }
    }
  }
}


// ignore these:

// import java.io._;

// def doMake {

//   lazy val isEtherPad = (args.length >= 2 && args(1) == "etherpad");
//   lazy val isNoHelma = (args.length >= 2 && args(1) == "nohelma");
    
//   def getFile(path:String): String = {
//     val builder = new StringBuilder(1000);
//     val reader = new BufferedReader(new FileReader(path));
//     val buf = new Array[Char](1024);
//     var numRead = 0;
//     while({ numRead = reader.read(buf); numRead } != -1) {
//       builder.append(buf, 0, numRead);
//     }
//     reader.close;
//     return builder.toString;
//   }

//   def putFile(str: String, path: String): Unit = {
//     val writer = new FileWriter(path);
//     writer.write(str);
//     writer.close;
//   }

//   def writeToString(func:(Writer=>Unit)): String = {
//     val writer = new StringWriter;
//     func(writer);
//     return writer.toString;
//   }

//   def compressJS(code: String, wrap: Boolean): String = {
//     import org.mozilla.javascript.{ErrorReporter, EvaluatorException};
//     object MyErrorReporter extends ErrorReporter {
//       def warning(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
// 	if (message startsWith "Try to use a single 'var' statement per scope.") return;
// 	if (line < 0) System.err.println("\n[WARNING] " + message);
// 	else System.err.println("\n[WARNING] " + line + ':' + lineOffset + ':' + message);
//       }
//       def error(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int) {
// 	if (line < 0) System.err.println("\n[ERROR] " + message);
// 	else System.err.println("\n[ERROR] " + line + ':' + lineOffset + ':' + message);
//       }
//       def runtimeError(message:String, sourceName:String, line:Int, lineSource:String, lineOffset:Int): EvaluatorException = {
// 	error(message, sourceName, line, lineSource, lineOffset);
// 	return new EvaluatorException(message);
//       }
//     }

//     val munge = true;
//     val verbose = false;
//     val optimize = true;
//     val compressor = new com.yahoo.platform.yui.compressor.JavaScriptCompressor(new StringReader(code), MyErrorReporter);
//     return writeToString(compressor.compress(_, if (wrap) 100 else -1, munge, verbose, true, !optimize));
//   }

//   def compressCSS(code: String, wrap: Boolean): String = {
//     val compressor = new com.yahoo.platform.yui.compressor.CssCompressor(new StringReader(code));
//     return writeToString(compressor.compress(_, if (wrap) 100 else -1));  
//   }

//   import java.util.regex.{Pattern, Matcher, MatchResult};

//   def stringReplace(orig: String, regex: String, groupReferences:Boolean, func:(MatchResult=>String)): String = {
//     val buf = new StringBuffer;
//     val m = Pattern.compile(regex).matcher(orig);
//     while (m.find) {
//       var str = func(m);
//       if (! groupReferences) {
// 	str = str.replace("\\", "\\\\").replace("$", "\\$");
//       }
//       m.appendReplacement(buf, str);
//     }
//     m.appendTail(buf);
//     return buf.toString;
//   }

//   def stringToExpression(str: String): String = {
//     val contents = str.replace("\\", "\\\\").replace("'", "\\'").replace("<", "\\x3c").replace("\n", "\\n").
//     replace("\r", "\\n").replace("\t", "\\t");
//     return "'"+contents+"'";
//   }

//   val srcDir = "www";
//   val destDir = "build";
//   var code = getFile(srcDir+"/ace2_outer.js");

//   val useCompression = true; //if (isEtherPad) false else true;

//   code = stringReplace(code, "\\$\\$INCLUDE_([A-Z_]+)\\([\"']([^\"']+)[\"']\\)", false, (m:MatchResult) => {
//     val includeType = m.group(1);
//     val path = m.group(2);
//     includeType match {
//       case "JS" => {
// 	var subcode = getFile(srcDir+"/"+path);
// 	subcode = subcode.replaceAll("var DEBUG=true;//\\$\\$[^\n\r]*", "var DEBUG=false;");
// 	if (useCompression) subcode = compressJS(subcode, false);
// 	"('<script type=\"text/javascript\">//<!--\\n'+" + stringToExpression(subcode) +
// 	  "+'//-->\\n</script>')";
//       }
//       case "CSS" => {
// 	var subcode = getFile(srcDir+"/"+path);
// 	if (useCompression) subcode = compressCSS(subcode, false);
// 	"('<style type=\"text/css\">'+" + stringToExpression(subcode) + "+'</style>')";
//       }
//       case "JS_Q" => {
// 	var subcode = getFile(srcDir+"/"+path);
// 	subcode = subcode.replaceAll("var DEBUG=true;//\\$\\$[^\n\r]*", "var DEBUG=false;");
// 	if (useCompression) subcode = compressJS(subcode, false);
// 	"('(\\'<script type=\"text/javascript\">//<!--\\\\n\\'+'+" +
// 	  stringToExpression(stringToExpression(subcode)) +
// 	    "+'+\\'//-->\\\\n\\\\x3c/script>\\')')";
//       }
//       case "CSS_Q" => {
// 	var subcode = getFile(srcDir+"/"+path);
// 	if (useCompression) subcode = compressCSS(subcode, false);
// 	"('(\\'<style type=\"text/css\">\\'+'+" + stringToExpression(stringToExpression(subcode)) +
// 	  "+'+\\'\\\\x3c/style>\\')')";
//       }
//       case ("JS_DEV" | "CSS_DEV") => "''";
//       case ("JS_Q_DEV" | "CSS_Q_DEV") => "'\\'\\''";
//       case _ => "$$INCLUDE_"+includeType+"(\"../www/"+path+"\")";
//     }
//   });

//   if (useCompression) code = compressJS(code, true);

//   putFile(code, destDir+"/ace2bare.js");

//   var wrapper = getFile(srcDir+"/ace2_wrapper.js");
//   if (useCompression) wrapper = compressJS(wrapper, true);
//   putFile(wrapper+"\n"+code, destDir+"/ace2.js");

//   var index = getFile(srcDir+"/index.html");
//   index = index.replaceAll("<!--\\s*DEBUG\\s*-->\\s*([\\s\\S]+?)\\s*<!--\\s*/DEBUG\\s*-->", "");
//   index = index.replaceAll("<!--\\s*PROD:\\s*([\\s\\S]+?)\\s*-->", "$1");
//   putFile(index, destDir+"/index.html");

//   putFile(getFile(srcDir+"/testcode.js"), destDir+"/testcode.js");

//   def copyFile(fromFile: String, toFile: String) {
//     if (0 != Runtime.getRuntime.exec("cp "+fromFile+" "+toFile).waitFor) {
//       printf("copy failed (%s -> %s).\n", fromFile, toFile);
//     }      
//   }

//   if (isEtherPad) {
//     copyFile("build/ace2.js", "../../../etherpad/src/static/js/ace.js");
//     val easysync = getFile(srcDir+"/easy_sync.js");
//     putFile(easysync, "../../../etherpad/src/etherpad/collab/easysync.js");
//   }
//   else if (! isNoHelma) {
//     copyFile("build/ace2.js", "../helma_apps/appjet/protectedStatic/js/ace.js");	     
//   }
// }

// def remakeLoop {
  
//   def getStamp: Long = {
//     return new java.io.File("www").listFiles.
//     filter(! _.getName.endsWith("~")).
//     filter(! _.getName.endsWith("#")).
//     filter(! _.getName.startsWith(".")).map(_.lastModified).
//     reduceLeft(Math.max(_:Long,_:Long));
//   }
  
//   var madeStamp:Long = 0;
//   var errorStamp:Long = 0;
//   while (true) {
//     Thread.sleep(500);
//     val s = getStamp;
//     if (s > madeStamp && s != errorStamp) {
//       Thread.sleep(1000);
//       if (getStamp == s) {
// 	madeStamp = s;
// 	print("Remaking...  ");
// 	try {
// 	  doMake;
// 	  println("OK");
// 	}
// 	catch { case e => {
// 	  println("ERROR");
// 	  errorStamp = s;
// 	} }
//       }
//     }
//   }

// }

// if (args.length >= 1 && args(0) == "auto") {
//   remakeLoop;
// }
// else {
//   doMake;
// }
