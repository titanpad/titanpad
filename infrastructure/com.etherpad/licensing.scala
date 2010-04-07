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

package com.etherpad;

import net.appjet.oui.{Encryptomatic, config};
import net.appjet.common.util.BetterFile;

import java.io.{FileInputStream, FileOutputStream, ByteArrayInputStream, ByteArrayOutputStream, PrintWriter}

import java.security._;
import java.security.spec._;    

object Licensing {
  val publicKey = "s0dD94jKFjlSHIumgDQ4ldcyIyna1vMHmG5tsgkP987eBTW88XeEIUTo5JtWOjPzb252GURUrr7MReTqMz6NnsOupeJMqtXgjuVxcXbK8AnckxkxhRqMiFfBW39T9NzPgq09yBdH4tKGlPZQmgaBvjFI8cXTYa7a64LrDnrzrpDhDdJsZPZI2kE7G4vBCGijuhsZpyowK8zT5y2cKqIgIdLxUnXNFtayDi0oyuX1ywfBds2OEil9fEUQOQvkcHAt6kYfPXkE2XgQZFasAv0DPeWMUEtaHTbMaQn1U6BsfmsKjHlLhM3oWEzp0wEwUWxCC39iHYjxa5QKtxm5BNvUTTqJgkoEvk7Uu08j8jhFeCFosph6igDWPmyfAPKTnETXJobO2VON83bVHlX8UfKonnalMy0Hnw2C0I7c0UE0MtMIRtJxtwU62a311Ohp1EVrY4LwKIFfqRMVWKDP0cjXDkJyjJS58rC1DRU7SfPspgfuOy5YZo9sLKztXfzAPzNbXerQ24m2AjmYLV4JQked7MnaKQ6VfyZbFBK5th9NFcJwY1bGbIHW2EsKmiKUoNjPKRJ6VMC7odUCIXQyE9J";

  val pkhash = "f7a3dd5940a3f79904b81e4d32a08e2efaa0b2ab";
  val keyVersion = 2.toByte;
  
  def thanksForStealingFromPoorHackersTryingToEkeAMeagerLivingFromThisCruelWorld =
    Encryptomatic.bytesToAscii(MessageDigest.getInstance("SHA1").digest(publicKey.getBytes())) == pkhash;
  def sha1(b: Array[Byte]): String = Encryptomatic.bytesToAscii(MessageDigest.getInstance("SHA1").digest(b));
  def sha1(s: String): String = sha1(s.getBytes("UTF-8"));

  def toBytes(i: Int): Array[Byte] = 
    Array((i >> 24).toByte,
          (i >> 16).toByte,
          (i >> 8).toByte,
          i.toByte);
  def toByte(i: Int): Array[Byte] =
    Array(i.toByte);
  def toBytes(l: Long): Array[Byte] =
    Array((l >> 56).toByte,
          (l >> 48).toByte,
          (l >> 40).toByte,
          (l >> 32).toByte,
          (l >> 24).toByte,
          (l >> 16).toByte,
          (l >> 8).toByte,
          l.toByte);

  def toInt(b0: Array[Byte]): Int = {
    val b = b0.map(_.toInt & 0x00FF);
    (b(0) << 24) | (b(1) << 16) | (b(2) << 8) | b(3);
  }
  def toInt(b: Byte): Int = b.toInt & 0x00FF;
    
  def toLong(b0: Array[Byte]): Long = {
    val b = b0.map(_.toLong & 0x000000FF);
    (b(0) << 56) | (b(1) << 48) | (b(2) << 40) | (b(3) << 32) | (b(4) << 24) | (b(5) << 16) | (b(6) << 8) | b(7);
  }

  def generateKey(personName: String, organizationName: String, expiresDate: Long, editionId: Int, userQuota: Int, majorVersion: Int, minorVersion: Int, patchVersion: Int) = {
    if (config.licenseGeneratorKey == null) {
      throw new RuntimeException("No private key available to generate license key.");
    }
    def privateKey = Encryptomatic.readPrivateKey("DSA", new FileInputStream(config.licenseGeneratorKey));
    def clean(s: String) = s.replaceAll(":", "-");
    val keyPrefix =
      List(personName, organizationName, expiresDate.toString, editionId.toString, userQuota.toString, majorVersion.toString, minorVersion.toString, patchVersion.toString).map(clean).mkString(":");
    val sig = Encryptomatic.sign(new ByteArrayInputStream(keyPrefix.getBytes("UTF-8")), privateKey)

    List(personName, organizationName).mkString(":") + ":" + 
    Encryptomatic.bytesToAscii(
      Array.concat[Byte](Array(keyVersion), // don't want BigInt dropping bytes, that'd be sad. :(
                         toBytes(expiresDate),
                         toBytes(editionId),
                         toBytes(userQuota),
                         toByte(majorVersion),
                         toByte(minorVersion),
                         toByte(patchVersion),
                         sig));
  }

  def decodeKey(key: String) = try {
    val Array(personName0, organizationName0, sigAndInfo) = key.split(":");
    val sigAndInfoBytes = Encryptomatic.asciiToBytes(sigAndInfo);
    val thisKeyVersion = toInt(sigAndInfoBytes(0));
    val expiresDate0 = toLong(sigAndInfoBytes.slice(1, 9));
    val editionId0 = toInt(sigAndInfoBytes.slice(9, 13));
    val userQuota0 = toInt(sigAndInfoBytes.slice(13, 17));
    val (majorVersion0, minorVersion0, patchVersion0) =
      if (thisKeyVersion >= 2) {
        (toInt(sigAndInfoBytes(17)), toInt(sigAndInfoBytes(18)), toInt(sigAndInfoBytes(19)));
      } else {
        (0, 0, 0);
      }
    val sig = sigAndInfoBytes.drop(if (thisKeyVersion >= 2) 20 else 17);
    val keyPrefix = {
      var a = Seq(personName0, organizationName0, expiresDate0.toString, editionId0.toString, userQuota0.toString);
      if (thisKeyVersion >= 2) {
        a = a ++ Seq(majorVersion0.toString, minorVersion0.toString, patchVersion0.toString);
      }
      a.mkString(":");
    }
    if (! Encryptomatic.verify(new ByteArrayInputStream(keyPrefix.getBytes("UTF-8")),
                               Encryptomatic.readPublicKey("DSA", 
                                 new ByteArrayInputStream(publicKey.getBytes())), sig)) {
      null;
    } else {
      new {
        def personName = personName0;
        def organizationName = organizationName0;
        def expiresDate = expiresDate0;
        def editionId = editionId0;
        def userQuota = userQuota0;
        def majorVersion = majorVersion0;
        def minorVersion = minorVersion0;
        def patchVersion = patchVersion0;
      }
    }
  } catch {
    case e => null;
  }

  def main(args: Array[String]) {
    args(0) match {
      case "genkeypair" => {
        println("Generating keypair...");
        Encryptomatic.writeKeyPair(Encryptomatic.generateKeyPair("DSA"), args(1), args(2));
        println("Done.");
      }
      case "genmainkey" => {
        println("Generating key for etherpad.com...");
        config.values("licenseGeneratorKey") = args(1);
        val out = new PrintWriter(new FileOutputStream(args(2)));
        out.print(generateKey("etherpad", "AppJet", -1, 0, -1, 0, 0, 0))
        out.close();
        println("Done.");
      }
      case "test" => {
        println("Testing key generation.");
        config.values("licenseGeneratorKey") = args(1);
        val key = generateKey("Foo Bar", "Baz, Inc.", System.currentTimeMillis() + 86400*1000, 0, 100, 1, 2, 3);
        println("Key is: "+key);
        val obj = decodeKey(key);
        println(List(obj.personName, obj.organizationName, obj.expiresDate, obj.editionId, obj.userQuota, obj.majorVersion, obj.minorVersion, obj.patchVersion).mkString(", "));
      }
      case "parsekey" => {
        println("Testing key decode.");
        val obj = decodeKey(args(1));
        println("Key: "+List(obj.personName, obj.organizationName, obj.expiresDate, obj.editionId, obj.userQuota, obj.majorVersion, obj.minorVersion, obj.patchVersion).mkString(", "));
      }
      case "testascii" => {
        val one = 17;
        val two = -1L;
        val three = (Math.random*Math.pow(10, (Math.random*10).toInt)).toInt;
        println(List(one, two, three).mkString(", "));
        println(List(toInt(toBytes(one)), toLong(toBytes(two)), toInt(toBytes(three))).mkString(", "));
        val bytes = Encryptomatic.asciiToBytes(Encryptomatic.bytesToAscii(Array.concat[Byte](Array(1.toByte), toBytes(one), toBytes(two), toBytes(three))));
        println("I can has bytes: "+bytes.length);
        println(List(toInt(bytes.slice(1, 5)), toLong(bytes.slice(5, 13)), toInt(bytes.slice(13, 17))).mkString(", "));
      }
    }
  }
}
