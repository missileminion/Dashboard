// Paste the OAuth client ID here. Never put a client secret in this app.
window.CONFIG = {
  CLIENT_ID: "PASTE-YOUR-CLIENT-ID.apps.googleusercontent.com",
  SCOPES: [
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
  ].join(" ")
};
