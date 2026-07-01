package com.wordmajiang.app;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView webView = getBridge().getWebView();
    webView.setBackgroundColor(Color.parseColor("#1a1a1a"));
    webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
  }
}
