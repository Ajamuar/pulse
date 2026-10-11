package io.github.adityaongit.pulse;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Shows the bundled error page only when the server is down (5xx), so the server's own 404 and other 4xx pages stay visible. */
class ShellWebViewClient extends BridgeWebViewClient {

    ShellWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame() && response.getStatusCode() < 500) return;
        super.onReceivedHttpError(view, request, response);
    }
}
