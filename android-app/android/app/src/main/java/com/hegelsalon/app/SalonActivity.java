package com.hegelsalon.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.activity.ComponentActivity;

public class SalonActivity extends ComponentActivity {
    public static final String EXTRA_SERVER_URL = "server_url";

    private WebView webView;
    private FrameLayout webViewContainer;
    private ProgressBar progressBar;
    private TextView endpointText;
    private TextView loadingText;
    private String serverUrl;
    private ValueCallback<Uri[]> filePathCallback;

    private final ActivityResultLauncher<Intent> filePickerLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        if (filePathCallback == null) {
                            return;
                        }

                        Uri[] results = null;
                        if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                            Intent data = result.getData();
                            if (data.getClipData() != null) {
                                int itemCount = data.getClipData().getItemCount();
                                results = new Uri[itemCount];
                                for (int index = 0; index < itemCount; index += 1) {
                                    results[index] = data.getClipData().getItemAt(index).getUri();
                                }
                            } else if (data.getData() != null) {
                                results = new Uri[] { data.getData() };
                            }
                        }

                        filePathCallback.onReceiveValue(results);
                        filePathCallback = null;
                    }
            );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_salon);

        serverUrl = AppPreferences.normalizeUrl(
                getIntent().getStringExtra(EXTRA_SERVER_URL)
        );
        if (serverUrl.isEmpty()) {
            serverUrl = AppPreferences.getServerUrl(this);
        }

        endpointText = findViewById(R.id.endpoint_text);
        loadingText = findViewById(R.id.loading_text);
        progressBar = findViewById(R.id.page_progress);
        webViewContainer = findViewById(R.id.webview_container);

        findViewById(R.id.back_button).setOnClickListener(v -> finish());
        findViewById(R.id.change_endpoint_button).setOnClickListener(v -> finish());
        findViewById(R.id.reload_button).setOnClickListener(v -> {
            if (webView != null) {
                webView.reload();
            }
        });
        findViewById(R.id.external_button).setOnClickListener(v ->
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(serverUrl + "/")))
        );

        endpointText.setText(serverUrl);
        loadingText.setText(R.string.loading_engine);
        webViewContainer.postDelayed(this::attachWebView, 250);
    }

    @Deprecated
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    private void attachWebView() {
        if (webView != null) {
            return;
        }

        webView = new WebView(this);
        webView.setLayoutParams(
                new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                )
        );
        webViewContainer.addView(webView);
        configureWebView();
        webView.loadUrl(serverUrl + "/");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                progressBar.setVisibility(View.VISIBLE);
                loadingText.setText(R.string.loading_page);
                endpointText.setText(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
                loadingText.setText(R.string.loading_ready);
                endpointText.setText(url);
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    loadingText.setText(
                            getString(R.string.loading_failed, String.valueOf(error.getDescription()))
                    );
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                super.onProgressChanged(view, newProgress);
                progressBar.setProgress(newProgress);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (SalonActivity.this.filePathCallback != null) {
                    SalonActivity.this.filePathCallback.onReceiveValue(null);
                }

                SalonActivity.this.filePathCallback = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.setType("*/*");
                intent.putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        new String[] {
                                "image/*",
                                "application/pdf",
                                "application/vnd.ms-excel",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                "text/csv",
                                "text/tab-separated-values",
                                "text/plain",
                                "application/json",
                                "text/markdown"
                        }
                );

                filePickerLauncher.launch(Intent.createChooser(intent, getString(R.string.choose_file)));
                return true;
            }
        });
    }
}
