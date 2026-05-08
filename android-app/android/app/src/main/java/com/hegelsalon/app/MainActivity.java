package com.hegelsalon.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import androidx.activity.ComponentActivity;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends ComponentActivity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private EditText serverUrlInput;
    private TextView statusText;
    private Button testButton;
    private Button openButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        serverUrlInput = findViewById(R.id.server_url_input);
        statusText = findViewById(R.id.status_text);
        testButton = findViewById(R.id.test_connection_button);
        openButton = findViewById(R.id.open_salon_button);

        serverUrlInput.setText(AppPreferences.getServerUrl(this));

        findViewById(R.id.use_emulator_button).setOnClickListener(v -> {
            serverUrlInput.setText(AppPreferences.DEFAULT_EMULATOR_URL);
            setStatus(getString(R.string.status_emulator_url), false);
        });

        findViewById(R.id.use_local_button).setOnClickListener(v -> {
            serverUrlInput.setText(AppPreferences.DEFAULT_LOCAL_URL);
            setStatus(getString(R.string.status_local_url), false);
        });

        testButton.setOnClickListener(v -> runConnectionTest(false));
        openButton.setOnClickListener(v -> runConnectionTest(true));
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void runConnectionTest(boolean openAfterSuccess) {
        String normalizedUrl = AppPreferences.normalizeUrl(serverUrlInput.getText().toString());
        if (normalizedUrl.isEmpty()) {
            setStatus(getString(R.string.status_invalid_url), true);
            return;
        }

        setLoadingState(true);
        setStatus(
                openAfterSuccess
                        ? getString(R.string.status_opening)
                        : getString(R.string.status_testing),
                false
        );

        executor.execute(() -> {
            try {
                probeServer(normalizedUrl);
                AppPreferences.setServerUrl(this, normalizedUrl);
                mainHandler.post(() -> {
                    setLoadingState(false);
                    setStatus(getString(R.string.status_success), false);
                    if (openAfterSuccess) {
                        Intent intent = new Intent(this, SalonActivity.class);
                        intent.putExtra(SalonActivity.EXTRA_SERVER_URL, normalizedUrl);
                        startActivity(intent);
                    }
                });
            } catch (IOException error) {
                mainHandler.post(() -> {
                    setLoadingState(false);
                    setStatus(getString(R.string.status_failed, error.getMessage()), true);
                });
            }
        });
    }

    private void setLoadingState(boolean loading) {
        testButton.setEnabled(!loading);
        openButton.setEnabled(!loading);
    }

    private void setStatus(String message, boolean isError) {
        statusText.setText(message);
        statusText.setTextColor(getColor(isError ? R.color.hegel_danger : R.color.hegel_muted_text));
    }

    private void probeServer(String baseUrl) throws IOException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + "/assets/hegel-cutout-web.png?ts=" + System.currentTimeMillis());
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestMethod("GET");
            connection.connect();

            int status = connection.getResponseCode();
            if (status < 200 || status >= 400) {
                throw new IOException(getString(R.string.status_http_code, status));
            }
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
