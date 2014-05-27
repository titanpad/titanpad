package net.appjet.oui;

import org.mortbay.io.EndPoint;
import org.mortbay.jetty.HttpFields;
import org.mortbay.jetty.Request;
import org.mortbay.jetty.nio.SelectChannelConnector;

import java.io.IOException;


/*
Wrap SelectChannelConnector to implement X-Forwarded-Proto parsing for Jetty 6
See http://blog.swwomm.com/2012/04/jetty-6-https-redirects.html
 */

public class ForwardingSelectChannelConnector extends SelectChannelConnector{
    private String _forwardedProtoHeader = "X-Forwarded-Proto";

    public ForwardingSelectChannelConnector() {
        super();
    }

    protected void checkForwardedHeaders(EndPoint endpoint, Request request)
            throws IOException {
        super.checkForwardedHeaders(endpoint, request);

        HttpFields httpFields = request.getConnection().getRequestFields();
        String forwardedProto = httpFields.getStringField(getForwardedProtoHeader());
        forwardedProto = getLeftMostValue(forwardedProto);

        if ("http".equals(forwardedProto) || "https".equals(forwardedProto))
            request.setScheme(forwardedProto);
    }

    public String getForwardedProtoHeader() {
        return _forwardedProtoHeader;
    }

    public void setForwardedProtoHeader(String x) {
        _forwardedProtoHeader = x;
    }
}
