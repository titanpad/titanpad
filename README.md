# WARNING - ORPHANED PROJECT

This project has been orphaned and is no longer maintained.

The [`SviMik/pad`](https://github.com/SviMik/pad) fork is seeing some activity. See also [`ether/pad#334`](https://github.com/ether/pad/issues/334).

Best wishes from all of us, and thanks for all the pads!
The TitanPad Team

---

This is the TitanPad.com Source-Code.

See README.EtherPad for the Original EtherPad open-source release README, incl.
most licensing info.

## File Import/Export Notes

  * Get cos.jar from servlets.com/cos/, needs to go into infrastructure/libs
  * Install openoffice.org openoffice.org-dev msttcorefonts
  * Set etherpad.soffice=true
  * Use etherpad/bin/start-soffice

## Environment Variables

You need to set a few envvars when building. These are:

```
export JAVA_HOME=/usr/lib/jvm/java-6-openjdk-amd64
export JAVA="$JAVA_HOME/bin/java"
export PATH="$JAVA_HOME/bin:$PATH"
export MYSQL_CONNECTOR_JAR="/usr/share/java/mysql-connector-java.jar"
export OOJARS="/usr/lib/ure/share/java/juh.jar /usr/lib/ure/share/java/jurt.jar /usr/lib/ure/share/java/ridl.jar /usr/lib/ure/share/java/unoloader.jar /usr/share/libreoffice/program/classes/unoil.jar"
```
