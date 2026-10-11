package io.github.adityaongit.pulse;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String ACTION_CHANGE_SERVER = "io.github.adityaongit.pulse.CHANGE_SERVER";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PulseServerPlugin.class);
        // BridgeActivity replays the launch intent through onNewIntent, so the shortcut's action is consumed here first.
        if (ACTION_CHANGE_SERVER.equals(getIntent().getAction())) {
            ServerStore.requestPicker(this);
            setIntent(new Intent(Intent.ACTION_MAIN).setClass(this, MainActivity.class));
        }
        config = ServerStore.config(this);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;
        bridge.setWebViewClient(new ShellWebViewClient(bridge));
        // Back walks the page's history like the browser; at its start the app goes to the background instead of closing.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge.getWebView();
                if (webView.canGoBack()) webView.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (ACTION_CHANGE_SERVER.equals(intent.getAction())) {
            ServerStore.requestPicker(this);
            recreate();
        }
    }
}
