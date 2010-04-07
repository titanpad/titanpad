package org.mozilla.javascript;

import java.io.IOException;

/**
 *  Subclass of Rhino's Parser that saves information about the token stream
 *  and error message to allow more helpful error messages.
 *
 * @author David Greenspan for AppJet
 */

/*
  This class is written with speed in mind, to some extent.  Rhino's tokenizer
  is pretty efficient, and we wouldn't want to slow it down by, for example,
  creating a TokenInfo object on the heap for every token seen.
 */

/*APPJET*/
public class InformativeParser extends Parser {

    public static class InformativeEvaluatorException extends EvaluatorException {
	final ParseErrorInfo pei;
	
	InformativeEvaluatorException(String errorMessage,
				      String sourceName, int lineNumber,
				      String lineSource, int columnNumber,
				      ParseErrorInfo peInfo) {
	    super(errorMessage, sourceName,
		  lineNumber, lineSource, columnNumber);
	    pei = peInfo;
	}

	public ParseErrorInfo getParseErrorInfo() {
	    return pei;
	}
    }

    public static class ParseErrorInfo {
	ParseErrorInfo() {}

	String messageId = null;
	String messageArg = null;
	
	final int tokenMaxHistory = 10;
	// ring buffers
	final int[] tokenTypes = new int[tokenMaxHistory];
	final String[] tokenStrings = new String[tokenMaxHistory];
	final double[] tokenNumbers = new double[tokenMaxHistory];
	final int[] tokenLineNumbers = new int[tokenMaxHistory];
	final int[] tokenLineOffsets = new int[tokenMaxHistory];
	int nextBufPos = 0;
	int historyLength = 0;
	boolean tokenPeeking = false;
	int peekSlot;

	void reportPeekToken(int type, String str, double num, int lineno,
			     int lineOffset) {
	    if (! tokenPeeking) {
		peekSlot = nextBufPos;
		tokenTypes[nextBufPos] = type;
		tokenStrings[nextBufPos] = str;
		tokenNumbers[nextBufPos] = num;
		tokenLineNumbers[nextBufPos] = lineno;
		tokenLineOffsets[nextBufPos] = lineOffset;
		
		nextBufPos++;
		if (nextBufPos == tokenMaxHistory) nextBufPos = 0;
		if (historyLength < tokenMaxHistory) historyLength++;
		tokenPeeking = true;
	    }
	}

	void reportConsumeToken() {
	    tokenPeeking = false;
	}

	private TokenInfo backToken(int n) {
	    // 0 is most recent token added to history
	    if (n >= historyLength) return null;
	    int i = (nextBufPos - 1 - n);
	    while (i < 0) i += tokenMaxHistory;
	    return new TokenInfo(tokenTypes[i], tokenStrings[i],
				 tokenNumbers[i], tokenLineNumbers[i],
				 tokenLineOffsets[i]);
	}
	
	public String getMessageId() { return messageId; }
	public String getMessageArg() { return messageArg; }
	public TokenInfo getPeekToken() {
	    if (tokenPeeking) return backToken(0);
	    return null;
	}
	public TokenInfo getPrevToken(int n) {
	    // 1 = last non-peek token seen, 2 = before that, etc.
	    if (! tokenPeeking) n--;
	    return backToken(n);
	}
	public TokenInfo getPrevToken() {
	    return getPrevToken(1);
	}
    }

    public static class TokenInfo {
	private int type, lineno, lineOffset;
	private String str;
	private double num;
	TokenInfo(int type, String str, double num, int lineno,
		  int lineOffset) {
	    this.type = type; this.str = str; this.num = num;
	    this.lineno = lineno; this.lineOffset = lineOffset;
	}
	public int getType() { return type; }
	public int getLineNumber() { return lineno; }
	public int getLineOffset() { return lineOffset; }
	public double getNumber() { return num; }
	public String getString() { return str; }
    }
    
    ParseErrorInfo info = new ParseErrorInfo();

    void doErrorReporterError(String message, String sourceURI, int line,
			      String lineText, int lineOffset) {
	
	throw new InformativeEvaluatorException(message, sourceURI, line,
						lineText, lineOffset, info);
	
    }
    
    public InformativeParser(CompilerEnvirons compilerEnv) {
	// we override most calls to the parent's ErrorReporter anyway
	super(compilerEnv, DefaultErrorReporter.instance);
    }

    @Override int peekToken() throws IOException {
	int tt = super.peekToken();
	info.reportPeekToken(tt, ts.getString(), ts.getNumber(),
			     ts.getLineno(), ts.getOffset());
	return tt;
    }
    @Override void consumeToken() {
	super.consumeToken();
	info.reportConsumeToken();
    }

    @Override void addWarning(String messageId, String messageArg)
    {
	info.messageId = messageId;
	info.messageArg = messageArg;
	
        String message = ScriptRuntime.getMessage1(messageId, messageArg);
        if (compilerEnv.reportWarningAsError()) {
            ++syntaxErrorCount;
            doErrorReporterError(message, sourceURI, ts.getLineno(),
				 ts.getLine(), ts.getOffset());
        }
	else { /* don't report */ }
    }
    
    @Override void addError(String messageId)
    {
	info.messageId = messageId;
	
	++syntaxErrorCount;
        String message = ScriptRuntime.getMessage0(messageId);
        doErrorReporterError(message, sourceURI, ts.getLineno(),
			     ts.getLine(), ts.getOffset());
    }

    @Override void addError(String messageId, String messageArg)
    {
	info.messageId = messageId;
	info.messageArg = messageArg;
	
	++syntaxErrorCount;
        String message = ScriptRuntime.getMessage1(messageId, messageArg);
        doErrorReporterError(message, sourceURI, ts.getLineno(),
			     ts.getLine(), ts.getOffset());
    }

    @Override protected Decompiler createDecompiler(CompilerEnvirons env) {
	return new MyDecompiler();
    }
    
    public static final ErrorReporter THROW_INFORMATIVE_ERRORS
	= new ErrorReporter() {
		public void warning(String message, String sourceURI, int line,
				    String lineText, int lineOffset) {
		    DefaultErrorReporter.instance.warning
			(message, sourceURI, line, lineText, lineOffset);
		}
		public void error(String message, String sourceURI, int line,
				  String lineText, int lineOffset) {
		    DefaultErrorReporter.instance.error
			(message, sourceURI, line, lineText, lineOffset);
		}
		public EvaluatorException runtimeError(String message,
						       String sourceURI,
						       int line, String lineText,
						       int lineOffset) {
		    return DefaultErrorReporter.instance.runtimeError
			(message, sourceURI, line, lineText, lineOffset);
		}
		
	    };
    
    public static Parser makeParser(CompilerEnvirons compilerEnv,
				    ErrorReporter errorReporter) {
	if (errorReporter == THROW_INFORMATIVE_ERRORS) {
	    return new InformativeParser(compilerEnv);
	}
	else {
	    return new Parser(compilerEnv, errorReporter);
	}
    }

    private class MyDecompiler extends Decompiler {
	@Override void addRegexp(String regexp, String flags) {
	    super.addRegexp(regexp, flags);
	    String str = '/'+regexp+'/'+flags;
	    info.reportPeekToken(Token.REGEXP, str, ts.getNumber(),
				 ts.getLineno(), ts.getOffset());
	    info.reportConsumeToken();
	}
    }
}