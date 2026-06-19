package com.rhozly.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Garden AI read-aloud: allow the WebView to play TTS audio without a
        // tap (auto-read) and after the async tts-speak fetch (speaker button).
        // Android WebView defaults this to true, which blocks both paths and
        // makes the silent speechSynthesis fallback kick in.
        this.getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
