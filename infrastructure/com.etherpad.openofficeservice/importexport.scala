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

package com.etherpad.openofficeservice;

import net.appjet.common.sars.{SarsServer,SarsMessageHandler};

import java.io.{DataInputStream,DataOutputStream};
import java.io.{File,FileOutputStream,ByteArrayInputStream,ByteArrayOutputStream};

class OOSException(m: String) extends RuntimeException(m);
class UnsupportedFormatException(format: String) extends OOSException("Unsupported format: "+format);
object TemporaryFailure extends OOSException("Temporary failure");

// stub object here. Please replace if you'd like to use openoffice!
object OpenOfficeServerUtility {
  def checkServerAvailability(host: String, port: Int): Boolean = {
    return false;
  }
  def runOpenOfficeServer(path: String, host: String, port: Int, timeout: Int, wait: Boolean) {
    // nothing
  }
}

class OpenOfficeFileConverter {
  def setOpenOfficeServerDetails(host: String, port: Int) {
    // nothing
  }
  
  def convertFile(src: File, dst: File, converter: String, extension: String): Boolean = {
    return false;
  }
}

object OpenOfficeService {
  val formats = Map(
    "pdf" -> "writer_pdf_Export",
    "doc" -> "MS Word 97",
    "html" -> "HTML (StarWriter)",
    "odt" -> "writer8",
    //"html" -> "XHTML Writer File",
    "txt" -> "Text"
  );

  def createTempFile(bytes: Array[byte], suffix: String) = {
    var f = File.createTempFile("ooconvert-", if (suffix == null) { null } else if (suffix == "") { "" } else { "."+suffix });
  	if (bytes != null) {
  		val fos = new FileOutputStream(f);
  		fos.write(bytes);		
  	}
  	f;
  }

  var soffice = "soffice";
  def setExecutable(exec: String) {
    soffice = exec;
  }

  def convertFile(from: String, to: String, bytes: Array[byte]): Array[byte] = {
    if (from == to) {
      return bytes;
    }

  	val tempFile = createTempFile(bytes, from);
  	val outFile = createTempFile(null, to);

  	val openOfficeServerHost = "localhost";
  	val openOfficeServerPort = 8100;
  	if (! OpenOfficeServerUtility.checkServerAvailability(openOfficeServerHost, openOfficeServerPort)) {
  		try {
  			OpenOfficeServerUtility.runOpenOfficeServer(soffice, openOfficeServerHost, openOfficeServerPort, 20000, true);
  		} catch {
  		  case e: java.io.IOException => {
  		    e.printStackTrace();
  		    throw TemporaryFailure;
    		}
  		}
  	}
  	var converter = new OpenOfficeFileConverter();
  	converter.setOpenOfficeServerDetails(openOfficeServerHost, openOfficeServerPort);
  	var status = false;
  	try {
  		status = converter.convertFile(tempFile, outFile, formats(to), to);
  	} catch {
  	  case e => {
  	    e.printStackTrace();
  		  throw new OOSException("Unknown exception occurred: "+e.getMessage());
		  }
  	}
  	if (status == false) {
  	  throw new UnsupportedFormatException(from);
  	}
  	net.appjet.common.util.BetterFile.getFileBytes(outFile);
  }

  def main(args: Array[String]) {
    if (args.length > 0) {
      soffice = args(0);
      if (soffice.length == 0) {
        exit(1);
      }
    }
    
    // Query format:
    // from: String, to: String, count: Int, bytes: Array[byte]
    // Response format:
    // status: Int, <data>
    //   status 0 (success) - <data>: count: Int, bytes: Array[byte]
    //   status 1 (temporary failure) - <data>: <none>
    //   status 2 (permanent failure) - <data>: type: Int
    //               type - 0: unknown failure.
    //                    - 1: unsupported format
    val handler = new SarsMessageHandler {
      override def handle(b: Array[byte]): Option[Array[byte]] = {
        val is = new DataInputStream(new ByteArrayInputStream(b));
        val from = is.readUTF;
        val to = is.readUTF;
        val len = is.readInt;
        val bytes = new Array[byte](len);
        is.readFully(bytes);
        var status = 0;
        var permfailuretype = 0;
        
        println("Converting "+from+" -> "+to+" ("+len+" bytes)");
        
        val output = try {
          convertFile(from, to, bytes);
        } catch {
          case TemporaryFailure => {
            status = 1;
            null;
          }
          case e: UnsupportedFormatException => {
            status = 2;
            permfailuretype = 1;
            null;
          }
          case e => {
            status = 2;
            permfailuretype = 0;
            e.printStackTrace();
            null;
          }
        }
        
        val retBytes = new ByteArrayOutputStream();
        val ret = new DataOutputStream(retBytes);
        if (status != 0) {
          ret.writeInt(status); // error
          status match {
            case 2 => {
              ret.writeInt(permfailuretype);
            }
            case _ => { }
          }
        } else {
          ret.writeInt(0); // success
          ret.writeInt(output.length);
          ret.write(output, 0, output.length);
        }
        Some(retBytes.toByteArray());
      }
    }
    
    val server = new SarsServer("ooffice-password", handler, None, 8101);
    server.start();
    println("Server running...");
    server.join();
    println("Server quitting...");
  }
}





